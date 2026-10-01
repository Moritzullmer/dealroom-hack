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
function Invoke-DealroomGet([string]$Uri) {
    for ($attempt=1; $attempt -le 6; $attempt++) {
        try { return Invoke-RestMethod -Method Get -Uri $Uri -Headers $headers }
        catch {
            $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
            if ($status -eq 401) {
                $script:token = (Invoke-RestMethod -Method Post -Uri 'https://accounts.dealroom.co/oauth/token' -ContentType 'application/json' -Body $body).access_token
                $script:headers.Authorization = "Bearer $script:token"
                continue
            }
            if ($status -eq 429 -or $status -ge 500 -or $status -eq 0) {
                $retryAfter = 0
                if ($_.Exception.Response) { $retryAfter = [int]$_.Exception.Response.Headers['Retry-After'] }
                $delay = if ($retryAfter -gt 0) { $retryAfter } else { [Math]::Min(60, 5 * $attempt) }
                Start-Sleep -Seconds $delay
                continue
            }
            throw
        }
    }
    throw "Dealroom request failed after retries: $Uri"
}
$target = Join-Path $root 'real-data\transactions-normalized.json'
$fixture = Join-Path $root 'demo\real-fixture.local.js'
$payload = Get-Content -Raw -LiteralPath $target | ConvertFrom-Json
$roundInvestorIds = @($payload.gps | ForEach-Object { [string]$_.id })
if (-not $roundInvestorIds.Count) { throw 'No round investors are available for LP relationship discovery.' }
$roleFilter = 'id[in_any]:' + ($roundInvestorIds -join '|')
$roleUri = 'https://api.beta.dealroom.app/data/investors?limit=500&include_total=true&filter=' + [Uri]::EscapeDataString($roleFilter)
$directory = (Invoke-DealroomGet $roleUri).data
$lpCandidates = @($directory | Where-Object { $_.roles -contains 'limited_partner' })
$roundInvestorSet = [Collections.Generic.HashSet[string]]::new([string[]]$roundInvestorIds)
$knownLinks = [Collections.Generic.List[object]]::new()
$candidateIndex = 0
foreach ($lp in $lpCandidates) {
    $uri = "https://api.beta.dealroom.app/data/investors/$($lp.uuid)/lp-funds?limit=500&include_total=true"
    $result = Invoke-DealroomGet $uri
    $related = @($result.data | ForEach-Object { $_.investor } | Where-Object { $_ -and $roundInvestorSet.Contains([string]$_.uuid) })
    $linkedIds = @($related | ForEach-Object { [string]$_.uuid } | Select-Object -Unique)
    if ($linkedIds.Count) {
        $knownLinks.Add([ordered]@{ id=[string]$lp.uuid; name=[string]$lp.name; type=(@($lp.types | ForEach-Object name) -join ', '); gps=$linkedIds })
    }
    $candidateIndex++
    Write-Host "Checked LP candidate $candidateIndex of $($lpCandidates.Count)"
}
$payload.lps = @($knownLinks)
$fiLinkedLpCount = @($knownLinks | Where-Object {
    $linked = $_.gps
    @($payload.companies | Where-Object { $_.group -eq 'fi' -and @($_.gps | Where-Object { $linked -contains $_ }).Count -gt 0 }).Count -gt 0
}).Count
$graphInvestorEdges = 0
foreach ($company in $payload.graphCompanies) { $graphInvestorEdges += @($company.gps).Count }
$payload.lpCoverage = "Dealroom limited_partner roles among $($roundInvestorIds.Count) graph round-investor entities were checked. $($knownLinks.Count) had a known manager link within the displayed graph, and $fiLinkedLpCount of these link to a Financial Inclusion company in this extract. This is a partial candidate set; links do not identify specific fund vehicles or vintages."
$payload.coverage | Add-Member -NotePropertyName lpCandidatesChecked -NotePropertyValue $lpCandidates.Count -Force
$payload.coverage | Add-Member -NotePropertyName lpsWithGraphLinks -NotePropertyValue $knownLinks.Count -Force
$payload.coverage | Add-Member -NotePropertyName lpsWithFiCompanyLinks -NotePropertyValue $fiLinkedLpCount -Force
$payload.coverage | Add-Member -NotePropertyName graphInvestorCompanyEdges -NotePropertyValue $graphInvestorEdges -Force
$json = $payload | ConvertTo-Json -Depth 40 -Compress
$newline = [Environment]::NewLine
Set-Content -LiteralPath $target -Value ($json + $newline) -Encoding utf8
Set-Content -LiteralPath $fixture -Value ("window.REAL_FIXTURE=" + $json + ';' + $newline) -Encoding utf8
Write-Host "Checked $($lpCandidates.Count) LP-role candidates; found $($knownLinks.Count) with an observed investor link in the graph."
