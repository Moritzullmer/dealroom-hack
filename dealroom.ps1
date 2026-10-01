param()

$ErrorActionPreference = 'Stop'
$envPath = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Credentials file not found: $envPath"
}

$credentials = @{}
foreach ($line in [IO.File]::ReadAllLines($envPath)) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $separator = $trimmed.IndexOf('=')
    if ($separator -lt 1) { continue }
    $key = $trimmed.Substring(0, $separator).Trim()
    $value = $trimmed.Substring($separator + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    $credentials[$key] = $value
}

$clientId = $credentials['DEALROOM_CLIENT_ID']
$clientSecret = $credentials['DEALROOM_CLIENT_SECRET']
if (-not $clientId -or -not $clientSecret) {
    throw 'The .env file must define DEALROOM_CLIENT_ID and DEALROOM_CLIENT_SECRET.'
}

$tokenBody = @{
    client_id     = $clientId
    client_secret = $clientSecret
    audience      = 'https://api.beta.dealroom.app'
    grant_type    = 'client_credentials'
} | ConvertTo-Json

$tokenResponse = Invoke-RestMethod -Method Post `
    -Uri 'https://accounts.dealroom.co/oauth/token' `
    -ContentType 'application/json' `
    -Body $tokenBody
$accessToken = $tokenResponse.access_token
if (-not $accessToken) { throw 'The token response did not include an access token.' }

$filter = 'and(classification[in_any]:vc_backed,launch_date[gte]:2020)'
$encodedFilter = [Uri]::EscapeDataString($filter)
$uri = "https://api.beta.dealroom.app/data/companies?sort=-latest_valuation&limit=10&include_total=true&filter=$encodedFilter"
$headers = @{
    Authorization = "Bearer $accessToken"
    'X-Client-Id' = $clientId
    'User-Agent' = 'dealroom-hackathon/1.0'
}

try {
    $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
} catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) {
        $tokenResponse = Invoke-RestMethod -Method Post `
            -Uri 'https://accounts.dealroom.co/oauth/token' `
            -ContentType 'application/json' `
            -Body $tokenBody
        $headers.Authorization = "Bearer $($tokenResponse.access_token)"
        $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
    } else {
        throw
    }
}

$rows = if ($response.data) { @($response.data) } elseif ($response.items) { @($response.items) } else { @($response) }
$rows | Select-Object `
    @{ Name = 'name'; Expression = { $_.name } },
    @{ Name = 'hq_country'; Expression = {
        $hqLocation = @($_.locations | Where-Object { $_.role -eq 'hq' } | Select-Object -First 1)
        if ($hqLocation.Count -gt 0) { $hqLocation[0].country.name }
    } },
    @{ Name = 'launch_year'; Expression = {
        $launchDate = [string]$_.launch_date
        if ($launchDate -match '^\d{4}') { $launchDate.Substring(0, 4) } else { $launchDate }
    } },
    @{ Name = 'valuation_usd'; Expression = { $_.valuation.value } } |
    Format-Table -AutoSize
