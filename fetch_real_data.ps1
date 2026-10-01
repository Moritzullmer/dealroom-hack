param()

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$envPath = Join-Path $root '.env'
if (-not (Test-Path -LiteralPath $envPath)) { throw "Missing $envPath" }

$credentials = @{}
foreach ($line in [IO.File]::ReadAllLines($envPath)) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $separator = $trimmed.IndexOf('=')
    if ($separator -lt 1) { continue }
    $key = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim().Trim('"').Trim("'")
    $credentials[$key] = $value
}
$clientId = $credentials['DEALROOM_CLIENT_ID']
$clientSecret = $credentials['DEALROOM_CLIENT_SECRET']
if (-not $clientId -or -not $clientSecret) { throw '.env must define DEALROOM_CLIENT_ID and DEALROOM_CLIENT_SECRET.' }

$tokenBody = @{ client_id=$clientId; client_secret=$clientSecret; audience='https://api.beta.dealroom.app'; grant_type='client_credentials' } | ConvertTo-Json
$token = (Invoke-RestMethod -Method Post -Uri 'https://accounts.dealroom.co/oauth/token' -ContentType 'application/json' -Body $tokenBody).access_token
if (-not $token) { throw 'OAuth response did not include an access token.' }
$headers = @{ Authorization="Bearer $token"; 'X-Client-Id'=$clientId; 'User-Agent'='dealroom-hackathon/1.0' }

function Invoke-Dealroom([string]$Uri) {
    for ($attempt = 1; $attempt -le 6; $attempt++) {
        try { return Invoke-RestMethod -Method Get -Uri $Uri -Headers $headers }
        catch {
            $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
            if ($status -eq 401) {
                $script:token = (Invoke-RestMethod -Method Post -Uri 'https://accounts.dealroom.co/oauth/token' -ContentType 'application/json' -Body $tokenBody).access_token
                $script:headers.Authorization = "Bearer $script:token"
                continue
            }
            if (($status -eq 429 -or $status -ge 500 -or $status -eq 0) -and $attempt -lt 6) {
                $delay = [Math]::Min(30, [Math]::Pow(2, $attempt))
                Start-Sleep -Seconds $delay
                continue
            }
            throw
        }
    }
    throw "Dealroom request failed after retries: $Uri"
}

# One complete Europe-region VC-round extract contains all three overlapping cohorts.
$filter = 'and(date[gte]:2025-04,date[lte]:2026-09,hq_location[eq]:76,is_vc_round[eq]:true)'
$encoded = [Uri]::EscapeDataString($filter)
$baseUri = "https://api.beta.dealroom.app/data/transactions?limit=2000&include_total=true&currency=USD&filter=$encoded"
$all = [Collections.Generic.List[object]]::new()
$offset = 0
$expected = $null
do {
    $response = Invoke-Dealroom "$baseUri&offset=$offset"
    if ($null -eq $expected) { $expected = [int]$response.page.total }
    foreach ($row in $response.data) { $all.Add($row) }
    $offset += @($response.data).Count
    Write-Host "Retrieved $offset of $expected rounds"
} while ($offset -lt $expected -and @($response.data).Count -gt 0)
if ($all.Count -ne $expected) { throw "Incomplete extract: received $($all.Count) of $expected transactions." }

$companies = @{}
$investors = @{}
foreach ($round in $all) {
    $co = $round.company
    if (-not $co.uuid) { continue }
    if (-not $companies.ContainsKey($co.uuid)) {
        $hq = @($co.locations | Where-Object { $_.role -eq 'hq' } | Select-Object -First 1)
        $sectorIds = @($co.taxonomy | Where-Object { $_.type -eq 'sector' } | ForEach-Object { [int]$_.id })
        $industryIds = @($co.taxonomy | Where-Object { $_.type -eq 'industry' } | ForEach-Object { [int]$_.id })
        $group = if ($sectorIds -contains 2282901) { 'fi' } elseif ($industryIds -contains 126403) { 'fintech' } else { 'venture' }
        $companies[$co.uuid] = [ordered]@{
            id=$co.uuid; name=$co.name; group=$group
            product=([string]$co.tagline); country=$(if ($hq.Count) { $hq[0].country.name } else { $null })
            sectorIds=$sectorIds; industryIds=$industryIds; gps=@(); rounds=[Collections.Generic.List[object]]::new()
            exit=$null; valuation=$null
        }
    }
    $company = $companies[$co.uuid]
    $amount = if ($null -ne $round.amount) { [double]$round.amount / 1000000 } else { $null }
    $valuation = if ($null -ne $round.valuation) { [double]$round.valuation / 1000000 } else { $null }
    $company.rounds.Add([ordered]@{
        year=[int]$round.year; month=[int]$round.month; amount=$amount; valuation=$valuation
        roundType=$round.round_type; verified=[bool]$round.is_verified; exit=[bool]$round.is_exit
    })
    if ($round.is_exit) { $company.exit = [ordered]@{year=[int]$round.year; type=([string]$round.round_type)} }
    if ($null -ne $valuation) { $company.valuation = $valuation }
    foreach ($entry in @($round.investors)) {
        if (-not $entry.investor.uuid) { continue }
        $investorId = [string]$entry.investor.uuid
        if (-not $investors.ContainsKey($investorId)) { $investors[$investorId] = [ordered]@{ id=$investorId; name=$entry.investor.name; type=$entry.investor.subtype } }
        if ($company.gps -notcontains $investorId) { $company.gps += $investorId }
    }
}

$companyRows = @($companies.Values | ForEach-Object {
    $_.rounds = @($_.rounds | Sort-Object year,month)
    $_.gps = @($_.gps | Sort-Object -Unique)
    $_
})
$companyRows = @($companyRows | Sort-Object name)
$graphIds = [Collections.Generic.HashSet[string]]::new()
# Keep the graph legible while preserving the complete underlying cohort for metrics.
foreach ($groupName in @('fi','fintech','venture')) {
    $groupRows = @($companyRows | Where-Object { $_.group -eq $groupName })
    $limit = if ($groupName -eq 'fi') { 18 } else { 12 }
    $chosen = @($groupRows | Select-Object -First $limit)
    foreach ($row in $chosen) { [void]$graphIds.Add([string]$row.id) }
}
$graphCompanies = @($companyRows | Where-Object { $graphIds.Contains([string]$_.id) })
$usedInvestors = [Collections.Generic.HashSet[string]]::new()
foreach ($company in $graphCompanies) { foreach ($id in $company.gps) { [void]$usedInvestors.Add([string]$id) } }
$gps = @($investors.Values | Where-Object { $usedInvestors.Contains([string]$_.id) } | Sort-Object name)

$payload = [ordered]@{
    realData=$true; asOf=(Get-Date).ToString('yyyy-MM-dd HH:mm:ss K'); window='2025-04 to 2026-09'; currency='USD'
    geography='Dealroom Europe region (HQ), region ID 76'; theme=[ordered]@{id='theme-fi';label='Financial Inclusion'}
    taxonomy=[ordered]@{financialInclusionSector=2282901; fintechIndustry=126403}
    companies=$companyRows; graphCompanies=$graphCompanies; gps=$gps; lps=@()
    coverage=[ordered]@{transactions=$all.Count; uniqueCompanies=$companyRows.Count; graphCompanies=$graphCompanies.Count; classifiedFi=(@($companyRows|Where-Object group -eq 'fi')).Count; classifiedFintech=(@($companyRows|Where-Object group -eq 'fintech')).Count; investorCompanyEdges=(($graphCompanies|ForEach-Object gps|Select-Object -Unique).Count)}
    lpCoverage='LP-to-GP fund commitments were not included in this transaction extract; no LP exposure is inferred.'
}
$json = $payload | ConvertTo-Json -Depth 40 -Compress
$targetDir = Join-Path $root 'real-data'
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Set-Content -LiteralPath (Join-Path $targetDir 'transactions-normalized.json') -Value $json -Encoding utf8
Set-Content -LiteralPath (Join-Path $root 'demo\real-fixture.local.js') -Value "window.REAL_FIXTURE=$json;`n" -Encoding utf8
Write-Host "Saved local snapshot: $($all.Count) transactions; $($companyRows.Count) unique companies; $((@($companyRows|Where-Object group -eq 'fi')).Count) FI; $((@($companyRows|Where-Object group -eq 'fintech')).Count) fintech."
& (Join-Path $root 'fetch_real_exits.ps1')
& (Join-Path $root 'fetch_real_lp_links.ps1')
