$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$envPath = Join-Path $root '.env'
$credentials = @{}
foreach ($line in [IO.File]::ReadAllLines($envPath)) {
    if ($line -match '^([^#=]+)=(.*)$') { $credentials[$matches[1].Trim()] = $matches[2].Trim().Trim('"').Trim("'") }
}
$clientId = $credentials['DEALROOM_CLIENT_ID']
$body = @{ client_id=$clientId; client_secret=$credentials['DEALROOM_CLIENT_SECRET']; audience='https://api.beta.dealroom.app'; grant_type='client_credentials' } | ConvertTo-Json
$token = (Invoke-RestMethod -Method Post -Uri 'https://accounts.dealroom.co/oauth/token' -ContentType 'application/json' -Body $body).access_token
$headers = @{ Authorization="Bearer $token"; 'X-Client-Id'=$clientId; 'User-Agent'='dealroom-hackathon/1.0' }
$filter = 'and(date[gte]:2025-04,date[lte]:2026-09,hq_location[eq]:76,is_exit[eq]:true)'
$baseUri = 'https://api.beta.dealroom.app/data/transactions?limit=2000&include_total=true&currency=USD&filter=' + [Uri]::EscapeDataString($filter)
$all = [Collections.Generic.List[object]]::new()
$offset = 0
$expected = $null
do {
    $response = $null
    for ($attempt=1; $attempt -le 6; $attempt++) {
        try { $response = Invoke-RestMethod -Method Get -Uri "$baseUri&offset=$offset" -Headers $headers; break }
        catch {
            $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
            if ($status -eq 401) {
                $token = (Invoke-RestMethod -Method Post -Uri 'https://accounts.dealroom.co/oauth/token' -ContentType 'application/json' -Body $body).access_token
                $headers.Authorization = "Bearer $token"
            } elseif (($status -eq 429 -or $status -ge 500 -or $status -eq 0) -and $attempt -lt 6) {
                Start-Sleep -Seconds ([Math]::Min(30, [Math]::Pow(2,$attempt)))
            } else { throw }
        }
    }
    if (-not $response) { throw 'Exit query failed after retry.' }
    if ($null -eq $expected) { $expected = [int]$response.page.total }
    foreach ($row in $response.data) { $all.Add($row) }
    $offset += @($response.data).Count
    Write-Host "Retrieved $offset of $expected exit records"
} while ($offset -lt $expected -and @($response.data).Count -gt 0)
if ($all.Count -ne $expected) { throw "Incomplete exit extract: received $($all.Count) of $expected." }

$target = Join-Path $root 'real-data\transactions-normalized.json'
$fixture = Join-Path $root 'demo\real-fixture.local.js'
$payload = Get-Content -Raw -LiteralPath $target | ConvertFrom-Json
$byId = @{}
foreach ($company in $payload.companies) { $byId[[string]$company.id] = $company }
$matched = [Collections.Generic.HashSet[string]]::new()
foreach ($row in $all) {
    $id = [string]$row.company.uuid
    if (-not $id -or -not $byId.ContainsKey($id)) { continue }
    $byId[$id].exit = @{ year=[int]$row.year; type=[string]$row.round_type }
    [void]$matched.Add($id)
}
$payload.coverage | Add-Member -NotePropertyName exits -NotePropertyValue $all.Count -Force
$payload.coverage | Add-Member -NotePropertyName cohortCompaniesWithExitRecords -NotePropertyValue $matched.Count -Force
$payload.asOf = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss K')
$json = $payload | ConvertTo-Json -Depth 40 -Compress
$newline = [Environment]::NewLine
Set-Content -LiteralPath $target -Value ($json + $newline) -Encoding utf8
Set-Content -LiteralPath $fixture -Value ("window.REAL_FIXTURE=" + $json + ';' + $newline) -Encoding utf8
Write-Host "Matched $($matched.Count) cohort companies to $($all.Count) Dealroom exit-flagged transactions."
