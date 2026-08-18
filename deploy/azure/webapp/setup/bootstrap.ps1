# ============================================================================
#  StormLens local setup — pulls the static site, wires your GeoCatalog URL,
#  and serves it at http://localhost:<port> on any Windows machine or VM.
#
#  Zero dependencies: no Node, no Python, no git. It uses a built-in .NET
#  HttpListener to serve the files, so nothing is installed on the machine.
#
#  Run directly:
#    powershell -ExecutionPolicy Bypass -File bootstrap.ps1
#  or with values pre-filled:
#    powershell -ExecutionPolicy Bypass -File bootstrap.ps1 -GeoCatalogUrl https://<catalog> -Port 8080
# ============================================================================
#Requires -Version 5.1
[CmdletBinding()]
param(
    [string] $GeoCatalogUrl = '',
    [string] $TenantId = '',
    [string] $ClientId = '',
    [int]    $Port = 8080,
    [string] $InstallDir = (Join-Path $env:LOCALAPPDATA 'StormLens\webapp'),
    [string] $RepoRaw = 'https://raw.githubusercontent.com/Balunywa/planetary-computer-pro-poc/main/deploy/azure/webapp'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ''
Write-Host '  StormLens — local setup' -ForegroundColor Cyan
Write-Host '  Weather intelligence for energy' -ForegroundColor DarkCyan
Write-Host ''

# --- 1. Download the static site into a per-user folder -----------------------------
$files = @(
    'index.html', 'weather.html', 'explorer.html', 'architecture.html', 'get-started.html',
    'staticwebapp.config.json', 'assets/styles.css', 'assets/app-config.js', 'assets/explorer.js'
)
New-Item -ItemType Directory -Path (Join-Path $InstallDir 'assets') -Force | Out-Null
Write-Host "  Downloading StormLens to $InstallDir ..." -ForegroundColor Gray
foreach ($rel in $files) {
    $dest = Join-Path $InstallDir ($rel -replace '/', '\')
    try {
        Invoke-WebRequest -UseBasicParsing "$RepoRaw/$rel" -OutFile $dest
    }
    catch {
        Write-Host "  WARNING: could not download '$rel': $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# --- 2. Wire the runtime config (no secrets written) --------------------------------
if (-not $GeoCatalogUrl) {
    $GeoCatalogUrl = Read-Host '  Enter your GeoCatalog URL (or press Enter to set it later in app-config.js)'
}
$cfgPath = Join-Path $InstallDir 'assets\app-config.js'
if (Test-Path $cfgPath) {
    $cfg = Get-Content -Raw $cfgPath
    if ($GeoCatalogUrl) { $cfg = $cfg.Replace('geoCatalogUrl: ""', ('geoCatalogUrl: "' + $GeoCatalogUrl.TrimEnd('/') + '"')) }
    if ($TenantId)      { $cfg = $cfg.Replace('tenantId: ""', ('tenantId: "' + $TenantId + '"')) }
    if ($ClientId)      { $cfg = $cfg.Replace('clientId: ""', ('clientId: "' + $ClientId + '"')) }
    Set-Content -Path $cfgPath -Value $cfg -Encoding UTF8
}

# --- 3. Serve the folder with a built-in static file server -------------------------
# http://localhost:<port>/ does not require admin rights (unlike + or *).
$prefix = "http://localhost:$Port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
try {
    $listener.Start()
}
catch {
    Write-Host "  Could not bind $prefix (is port $Port in use?): $($_.Exception.Message)" -ForegroundColor Red
    Read-Host '  Press Enter to close'
    exit 1
}

$mime = @{
    '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css'; '.js' = 'application/javascript';
    '.json' = 'application/json'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml';
    '.ico' = 'image/x-icon'; '.woff2' = 'font/woff2'; '.map' = 'application/json'
}

Write-Host ''
Write-Host "  StormLens is running at $prefix" -ForegroundColor Green
Write-Host '  Leave this window open. Press Ctrl+C to stop.' -ForegroundColor Gray
Write-Host ''
Start-Process $prefix

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        try {
            $rel = [Uri]::UnescapeDataString($ctx.Request.Url.LocalPath).TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
            # Prevent path traversal: resolve and confirm the target stays inside InstallDir.
            $full = Join-Path $InstallDir ($rel -replace '/', '\')
            $rootFull = [System.IO.Path]::GetFullPath($InstallDir)
            $targetFull = [System.IO.Path]::GetFullPath($full)
            if (-not $targetFull.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
                $ctx.Response.StatusCode = 403
            }
            elseif (Test-Path $targetFull -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($targetFull)
                $ext = [System.IO.Path]::GetExtension($targetFull).ToLowerInvariant()
                $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
                $ctx.Response.Headers['X-Content-Type-Options'] = 'nosniff'
                $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
            else {
                $ctx.Response.StatusCode = 404
            }
        }
        catch {
            $ctx.Response.StatusCode = 500
        }
        finally {
            $ctx.Response.Close()
        }
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
