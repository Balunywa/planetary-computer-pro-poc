# ============================================================================
#  StormLens Deploy Wizard - a tiny localhost web app that provisions the
#  StormLens / Planetary Computer Pro accelerator into your Azure subscription
#  and streams live progress. A friendly front end over the same ARM template
#  behind the "Deploy to Azure" button (azuredeploy.json).
#
#  It runs a built-in .NET HttpListener (no Node, no extra installs) that:
#    - serves wizard.html
#    - exposes /api/* endpoints (account, regions, prereqs, deploy, logs, ...)
#    - runs `az deployment group create` in a background job and tails its log
#
#  Nothing leaves this machine except the Azure CLI calls the deploy makes.
# ============================================================================
#Requires -Version 5.1
[CmdletBinding()]
param(
    [int]    $Port = 7333,
    [string] $TemplateUri = 'https://raw.githubusercontent.com/Balunywa/planetary-computer-pro-poc/main/deploy/azure/azuredeploy.json',
    [string] $WizardHtml = ''
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ---- resolve the wizard UI (local file next to this script, else GitHub raw) --------
if (-not $WizardHtml) {
    $local = Join-Path $PSScriptRoot 'wizard.html'
    if (Test-Path $local) { $WizardHtml = $local }
}
$RawBase = 'https://raw.githubusercontent.com/Balunywa/planetary-computer-pro-poc/main/deploy/azure/webapp/wizard'

# ---- shared run state --------------------------------------------------------------
$script:Job = $null
$script:LogFile = Join-Path $env:TEMP ('stormlens-deploy-{0}.log' -f (Get-Date -Format 'yyyyMMddHHmmss'))
$script:DeployName = ''
$script:ResourceGroup = ''
$script:Subscription = ''

function Write-DeployLog([string]$msg) {
    $ts = (Get-Date -Format 'HH:mm:ss')
    Add-Content -LiteralPath $script:LogFile -Value ("[{0}] {1}" -f $ts, $msg) -Encoding UTF8
}

# ---- helpers ----------------------------------------------------------------------
function Invoke-Az {
    param([string[]] $Args)
    # Return stdout as string; never throw (callers inspect output/exit code).
    $out = & az @Args 2>&1
    return ($out | Out-String)
}

function ConvertFrom-JsonSafe([string]$text) {
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    try { return $text | ConvertFrom-Json } catch { return $null }
}

# ---- API handlers -----------------------------------------------------------------
function Get-Account {
    $show = ConvertFrom-JsonSafe (Invoke-Az @('account', 'show', '-o', 'json'))
    if (-not $show) { return @{ loggedIn = $false } }
    $list = ConvertFrom-JsonSafe (Invoke-Az @('account', 'list', '-o', 'json'))
    $subs = @()
    foreach ($s in @($list)) {
        if ($null -eq $s) { continue }
        $subs += @{ id = $s.id; name = $s.name; tenantId = $s.tenantId; isDefault = [bool]$s.isDefault }
    }
    return @{ loggedIn = $true; user = $show.user.name; subscriptions = $subs }
}

function Get-Prereqs([string]$sub) {
    $checks = @()
    # az CLI present
    $azv = Invoke-Az @('version', '-o', 'json')
    if (ConvertFrom-JsonSafe $azv) { $checks += @{ name = 'Azure CLI'; status = 'ok'; detail = 'az is installed' } }
    else { $checks += @{ name = 'Azure CLI'; status = 'fail'; detail = 'az not found - install the Azure CLI' } }
    # signed in
    $acct = ConvertFrom-JsonSafe (Invoke-Az @('account', 'show', '-o', 'json'))
    if ($acct) { $checks += @{ name = 'Azure sign-in'; status = 'ok'; detail = $acct.user.name } }
    else { $checks += @{ name = 'Azure sign-in'; status = 'fail'; detail = 'Run az login' } }
    # subscription selected
    if ($sub) {
        Invoke-Az @('account', 'set', '--subscription', $sub) | Out-Null
        $checks += @{ name = 'Subscription'; status = 'ok'; detail = $sub }
    }
    else { $checks += @{ name = 'Subscription'; status = 'warn'; detail = 'No subscription chosen' } }
    # resource provider registration (best-effort, informational)
    foreach ($rp in @('Microsoft.Orbital', 'Microsoft.Web', 'Microsoft.CognitiveServices')) {
        $state = (Invoke-Az @('provider', 'show', '-n', $rp, '--query', 'registrationState', '-o', 'tsv')).Trim()
        if ($state -eq 'Registered') { $checks += @{ name = "Provider $rp"; status = 'ok'; detail = 'Registered' } }
        elseif ($state) { $checks += @{ name = "Provider $rp"; status = 'warn'; detail = "$state - will auto-register on deploy" } }
        else { $checks += @{ name = "Provider $rp"; status = 'warn'; detail = 'Could not query - will auto-register on deploy' } }
    }
    $worst = 'ok'
    if ($checks.status -contains 'warn') { $worst = 'warn' }
    if ($checks.status -contains 'fail') { $worst = 'fail' }
    return @{ checks = $checks; worst = $worst }
}

function Start-Deploy($cfg) {
    if ($script:Job -and $script:Job.State -eq 'Running') { return @{ error = 'A deployment is already running.' } }
    $sub = [string]$cfg.subscriptionId
    $rg = [string]$cfg.resourceGroup
    $loc = [string]$cfg.location
    if (-not $sub -or -not $rg -or -not $loc) { return @{ error = 'subscription, resource group, and location are required.' } }

    # Build a parameters file (keeps the admin password off the command line / logs).
    $params = @{
        location             = @{ value = $loc }
        deployWorkstation    = @{ value = [bool]$cfg.deployWorkstation }
        deploySampleStorage  = @{ value = [bool]$cfg.deploySampleStorage }
        seedSampleData       = @{ value = [bool]$cfg.seedSampleData }
        deployWebApp         = @{ value = [bool]$cfg.deployWebApp }
        deployAiAgent        = @{ value = [bool]$cfg.deployAiAgent }
        deployAuroraModel    = @{ value = [bool]$cfg.deployAuroraModel }
        staticWebAppLocation = @{ value = [string]$cfg.staticWebAppLocation }
    }
    if ($cfg.geoCatalogName) { $params['geoCatalogName'] = @{ value = [string]$cfg.geoCatalogName } }
    if ($cfg.adminPassword) { $params['adminPassword'] = @{ value = [string]$cfg.adminPassword } }
    $paramWrap = @{ '$schema' = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'; contentVersion = '1.0.0.0'; parameters = $params }
    $paramFile = Join-Path $env:TEMP ('stormlens-params-{0}.json' -f (Get-Random))
    $paramWrap | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $paramFile -Encoding UTF8

    $deployName = 'stormlens-' + (Get-Date -Format 'yyyyMMddHHmmss')
    $script:DeployName = $deployName
    $script:ResourceGroup = $rg
    $script:Subscription = $sub
    Set-Content -LiteralPath $script:LogFile -Value '' -Encoding UTF8

    Write-DeployLog "PHASE signin  Using subscription $sub"
    Invoke-Az @('account', 'set', '--subscription', $sub) | Out-Null

    # Run the deployment in a background job so the HTTP listener stays responsive.
    $script:Job = Start-Job -ScriptBlock {
        param($sub, $rg, $loc, $templateUri, $paramFile, $deployName, $logFile)
        function Lg([string]$m) { Add-Content -LiteralPath $logFile -Value ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) -Encoding UTF8 }
        try {
            az account set --subscription $sub 2>&1 | Out-Null
            Lg "PHASE resourcegroup  Creating resource group '$rg' in $loc"
            az group create -n $rg -l $loc -o none 2>&1 | ForEach-Object { Lg $_ }
            if ($LASTEXITCODE -ne 0) { Lg "Could not create or access resource group '$rg' (see the error above)."; Lg 'DEPLOY FAILED'; return }

            Lg "PHASE submit  Submitting deployment '$deployName'"
            az deployment group create -g $rg -n $deployName --template-uri $templateUri --parameters "@$paramFile" --no-wait -o none 2>&1 | ForEach-Object { Lg $_ }
            if ($LASTEXITCODE -ne 0) { Lg 'Deployment submission was rejected (see the validation error above).'; Lg 'DEPLOY FAILED'; return }

            Lg "PHASE provision  Provisioning resources (this can take 20-40 min for the workstation + GeoCatalog)..."
            $seen = @{}
            $deadline = (Get-Date).AddMinutes(90)
            while ($true) {
                Start-Sleep -Seconds 8
                $stateJson = az deployment group show -g $rg -n $deployName --query 'properties.provisioningState' -o tsv 2>$null
                $ops = az deployment operation group list -g $rg -n $deployName -o json 2>$null | ConvertFrom-Json
                foreach ($o in @($ops)) {
                    $t = $o.properties.targetResource.resourceType
                    $st = $o.properties.provisioningState
                    if (-not $t) { continue }
                    $key = "$t|$st"
                    if ($st -in @('Succeeded', 'Failed') -and -not $seen.ContainsKey($key)) {
                        $seen[$key] = $true
                        Lg ("{0}  {1}" -f $st, $t)
                    }
                }
                if ($stateJson -in @('Succeeded', 'Failed', 'Canceled')) {
                    Lg "PHASE provision  Deployment $stateJson"
                    if ($stateJson -eq 'Succeeded') {
                        $out = az deployment group show -g $rg -n $deployName --query 'properties.outputs' -o json 2>$null
                        Lg "OUTPUTS $out"
                        Lg 'DEPLOY COMPLETE'
                    }
                    else {
                        Lg 'DEPLOY FAILED'
                    }
                    break
                }
                if ((Get-Date) -gt $deadline) {
                    Lg 'Timed out after 90 min waiting for the deployment. Check the Azure portal for final status.'
                    Lg 'DEPLOY FAILED'
                    break
                }
            }
        }
        finally {
            # The parameters file holds the admin password in plain text; never leave it on disk.
            Remove-Item -LiteralPath $paramFile -Force -ErrorAction SilentlyContinue
        }
    } -ArgumentList $sub, $rg, $loc, $TemplateUri, $paramFile, $deployName, $script:LogFile

    return @{ ok = $true; deployName = $deployName }
}

function Get-Logs([int]$offset) {
    $lines = @()
    if (Test-Path $script:LogFile) {
        $all = @(Get-Content -LiteralPath $script:LogFile -Encoding UTF8)
        if ($offset -lt $all.Count) { $lines = $all[$offset..($all.Count - 1)] }
        $offset = $all.Count
    }
    $running = ($script:Job -and $script:Job.State -eq 'Running')
    return @{ lines = $lines; next = $offset; running = [bool]$running }
}

function Get-Outputs {
    if (-not $script:DeployName -or -not $script:ResourceGroup) { return @{} }
    $out = ConvertFrom-JsonSafe (Invoke-Az @('deployment', 'group', 'show', '-g', $script:ResourceGroup, '-n', $script:DeployName, '--query', 'properties.outputs', '-o', 'json'))
    $result = @{ resourceGroup = $script:ResourceGroup; subscription = $script:Subscription }
    if ($out) {
        if ($out.webAppUrl) { $result['webAppUrl'] = $out.webAppUrl.value }
        if ($out.geoCatalogUri) { $result['geoCatalogUri'] = $out.geoCatalogUri.value }
    }
    return $result
}

function Stop-Deploy {
    if ($script:Job -and $script:Job.State -eq 'Running') { Stop-Job $script:Job -ErrorAction SilentlyContinue }
    if ($script:DeployName -and $script:ResourceGroup) {
        Invoke-Az @('deployment', 'group', 'cancel', '-g', $script:ResourceGroup, '-n', $script:DeployName) | Out-Null
    }
    Write-DeployLog 'Deployment cancel requested.'
    return @{ ok = $true }
}

# ---- HTTP plumbing ----------------------------------------------------------------
function Send-Json($ctx, $obj, [int]$code = 200) {
    $json = ($obj | ConvertTo-Json -Depth 8 -Compress)
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $ctx.Response.StatusCode = $code
    $ctx.Response.ContentType = 'application/json'
    $ctx.Response.Headers['Cache-Control'] = 'no-store'
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Send-Html($ctx) {
    if ($WizardHtml -and (Test-Path $WizardHtml)) {
        $bytes = [IO.File]::ReadAllBytes($WizardHtml)
    }
    else {
        $html = (Invoke-WebRequest -UseBasicParsing "$RawBase/wizard.html").Content
        $bytes = [Text.Encoding]::UTF8.GetBytes($html)
    }
    $ctx.Response.ContentType = 'text/html; charset=utf-8'
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Read-Body($ctx) {
    $reader = New-Object IO.StreamReader($ctx.Request.InputStream, $ctx.Request.ContentEncoding)
    $text = $reader.ReadToEnd(); $reader.Close()
    return ConvertFrom-JsonSafe $text
}

$prefix = "http://localhost:$Port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
try { $listener.Start() }
catch {
    Write-Host "  Could not bind $prefix (is port $Port in use?): $($_.Exception.Message)" -ForegroundColor Red
    Read-Host '  Press Enter to close'; exit 1
}

Write-Host ''
Write-Host '  StormLens - deploy wizard' -ForegroundColor Cyan
Write-Host "  Open $prefix (opening your browser now). Ctrl+C to stop." -ForegroundColor Gray
Write-Host ''
Start-Process $prefix

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        try {
            $path = $ctx.Request.Url.AbsolutePath
            $method = $ctx.Request.HttpMethod
            switch -Regex ($path) {
                '^/$' { Send-Html $ctx; break }
                '^/api/account$' { Send-Json $ctx (Get-Account); break }
                '^/api/login$' { Start-Process 'az' -ArgumentList 'login' -WindowStyle Minimized; Send-Json $ctx @{ ok = $true }; break }
                '^/api/regions$' { Send-Json $ctx @{ regions = @('eastus', 'northcentralus', 'westeurope', 'canadacentral', 'uksouth') }; break }
                '^/api/prereqs$' {
                    $sub = $ctx.Request.QueryString['sub']
                    Send-Json $ctx (Get-Prereqs $sub); break
                }
                '^/api/deploy$' {
                    if ($method -ne 'POST') { Send-Json $ctx @{ error = 'POST only' } 405; break }
                    $cfg = Read-Body $ctx
                    Send-Json $ctx (Start-Deploy $cfg); break
                }
                '^/api/logs$' {
                    $offset = 0; [void][int]::TryParse($ctx.Request.QueryString['offset'], [ref]$offset)
                    Send-Json $ctx (Get-Logs $offset); break
                }
                '^/api/outputs$' { Send-Json $ctx (Get-Outputs); break }
                '^/api/status$' { Send-Json $ctx @{ running = [bool]($script:Job -and $script:Job.State -eq 'Running') }; break }
                '^/api/cancel$' { Send-Json $ctx (Stop-Deploy); break }
                default { $ctx.Response.StatusCode = 404 }
            }
        }
        catch {
            try { Send-Json $ctx @{ error = $_.Exception.Message } 500 } catch {}
        }
        finally { $ctx.Response.Close() }
    }
}
finally {
    $listener.Stop(); $listener.Close()
    if ($script:Job) { Remove-Job $script:Job -Force -ErrorAction SilentlyContinue }
}
