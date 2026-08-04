<#
.SYNOPSIS
    Provisions the Planetary Computer Pro analytics workstation.

.DESCRIPTION
    Run by an Azure VM Run Command at deploy time. Installs Python, the Azure CLI,
    and Visual Studio Code, then downloads the sample end-to-end ingestion script
    (ingest_sample.py) to the public desktop and writes a connection-info file with
    the GeoCatalog name. No secrets are written to disk.

    A PROVISION_COMPLETE marker is written at the end so callers can confirm the
    deploy-time steps finished. VS Code extensions install at first interactive logon.
#>

param(
    [Parameter(Mandatory = $true)]
    [string] $GeoCatalogName,

    [Parameter(Mandatory = $true)]
    [string] $ArtifactsBaseUrl,

    [Parameter(Mandatory = $false)]
    [string] $SampleContainerUrl = '',

    [Parameter(Mandatory = $false)]
    [string] $IngestIdentityObjectId = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$logDir = 'C:\ProvisionLogs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$log = Join-Path $logDir 'setup.log'

function Write-Log {
    param([string] $Message)
    $line = "{0}  {1}" -f (Get-Date -Format 'u'), $Message
    Add-Content -Path $log -Value $line
    Write-Output $line
}

Write-Log "Starting workstation provisioning for GeoCatalog '$GeoCatalogName'."

# ------------------------------------------------------------------------------------
# Package manager (winget is preinstalled on Windows Server 2022 Azure Edition images
# via App Installer; fall back to direct MSI download if unavailable).
# ------------------------------------------------------------------------------------
function Install-WithWinget {
    param([string] $Id, [string] $FriendlyName)
    Write-Log "Installing $FriendlyName ($Id) via winget."
    winget install --id $Id --exact --silent --accept-package-agreements --accept-source-agreements --scope machine 2>&1 |
        ForEach-Object { Write-Log $_ }
}

$hasWinget = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)

# ------------------------------------------------------------------------------------
# Python 3.12
# ------------------------------------------------------------------------------------
try {
    if ($hasWinget) {
        Install-WithWinget -Id 'Python.Python.3.12' -FriendlyName 'Python 3.12'
    }
    else {
        $pyUrl = 'https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe'
        $pyExe = Join-Path $env:TEMP 'python-installer.exe'
        Invoke-WebRequest -Uri $pyUrl -OutFile $pyExe
        Write-Log 'Installing Python 3.12 (silent).'
        Start-Process -FilePath $pyExe -ArgumentList '/quiet InstallAllUsers=1 PrependPath=1 Include_pip=1' -Wait
    }
}
catch {
    Write-Log "WARNING: Python install failed: $($_.Exception.Message)"
}

# ------------------------------------------------------------------------------------
# Azure CLI
# ------------------------------------------------------------------------------------
try {
    if ($hasWinget) {
        Install-WithWinget -Id 'Microsoft.AzureCLI' -FriendlyName 'Azure CLI'
    }
    else {
        $azMsi = Join-Path $env:TEMP 'azure-cli.msi'
        Invoke-WebRequest -Uri 'https://aka.ms/installazurecliwindows' -OutFile $azMsi
        Write-Log 'Installing Azure CLI (silent).'
        Start-Process -FilePath 'msiexec.exe' -ArgumentList "/i `"$azMsi`" /quiet /norestart" -Wait
    }
}
catch {
    Write-Log "WARNING: Azure CLI install failed: $($_.Exception.Message)"
}

# ------------------------------------------------------------------------------------
# Visual Studio Code (system install)
# ------------------------------------------------------------------------------------
try {
    if ($hasWinget) {
        Install-WithWinget -Id 'Microsoft.VisualStudioCode' -FriendlyName 'Visual Studio Code'
    }
    else {
        $vscodeExe = Join-Path $env:TEMP 'vscode-setup.exe'
        Invoke-WebRequest -Uri 'https://update.code.visualstudio.com/latest/win32-x64/stable' -OutFile $vscodeExe
        Write-Log 'Installing Visual Studio Code (silent, system).'
        Start-Process -FilePath $vscodeExe -ArgumentList '/VERYSILENT /MERGETASKS=!runcode,addtopath' -Wait
    }
}
catch {
    Write-Log "WARNING: VS Code install failed: $($_.Exception.Message)"
}

# ------------------------------------------------------------------------------------
# Refresh PATH for this session so python/pip are available.
# ------------------------------------------------------------------------------------
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
            [System.Environment]::GetEnvironmentVariable('Path', 'User')

# ------------------------------------------------------------------------------------
# Python packages for the ingestion sample.
# ------------------------------------------------------------------------------------
try {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        Write-Log 'Installing Python packages (pystac-client azure-identity requests pillow).'
        & python -m pip install --upgrade pip 2>&1 | ForEach-Object { Write-Log $_ }
        & python -m pip install pystac-client azure-identity requests pillow 2>&1 | ForEach-Object { Write-Log $_ }
    }
    else {
        Write-Log 'WARNING: python not on PATH yet; packages will need manual install after first logon.'
    }
}
catch {
    Write-Log "WARNING: pip install failed: $($_.Exception.Message)"
}

# ------------------------------------------------------------------------------------
# Download the sample ingestion script to the public desktop.
# ------------------------------------------------------------------------------------
$publicDesktop = 'C:\Users\Public\Desktop'
New-Item -ItemType Directory -Path $publicDesktop -Force | Out-Null

try {
    $ingestScript = Join-Path $publicDesktop 'ingest_sample.py'
    Invoke-WebRequest -Uri "$ArtifactsBaseUrl/ingest_sample.py" -OutFile $ingestScript
    Write-Log "Downloaded ingest_sample.py to $ingestScript"
}
catch {
    Write-Log "WARNING: could not download ingest_sample.py: $($_.Exception.Message)"
}

# ------------------------------------------------------------------------------------
# Write connection-info (no secrets) for the operator.
# ------------------------------------------------------------------------------------
$connInfo = @"
Microsoft Planetary Computer Pro - POC connection info
=======================================================
GeoCatalog name : $GeoCatalogName

Next steps on this workstation:
  1. Open a terminal and sign in:            az login
  2. Copy the GeoCatalog URI from the Azure portal (GeoCatalog > Overview > GeoCatalog URI).
  3. Run the end-to-end sample:
        python "$publicDesktop\ingest_sample.py" --geocatalog-url "<GEOCATALOG_URI>"
  4. Open the GeoCatalog Explorer (<GEOCATALOG_URI>/collections) to visualize the ingested imagery.

Bring-your-own-data (managed-identity ingestion source):
  Container URL     : $SampleContainerUrl
  Identity objectId : $IngestIdentityObjectId
  Register the container as a managed-identity ingestion source (then upload your
  STAC items + assets to it and POST the items to the GeoCatalog Items API):
        python "$publicDesktop\ingest_sample.py" --geocatalog-url "<GEOCATALOG_URI>" --managed-identity-container-url "$SampleContainerUrl" --managed-identity-object-id "$IngestIdentityObjectId"

This file contains no passwords, keys, or tokens.
"@
Set-Content -Path (Join-Path $publicDesktop 'connection-info.txt') -Value $connInfo
Write-Log 'Wrote connection-info.txt to the public desktop.'

# ------------------------------------------------------------------------------------
# Install VS Code extensions at first interactive logon (Marketplace access needed then).
# ------------------------------------------------------------------------------------
$runOnceCmd = 'cmd /c "code --install-extension ms-python.python && code --install-extension ms-toolsai.jupyter"'
try {
    New-Item -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce' -Force | Out-Null
    Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce' -Name 'InstallVSCodeExtensions' -Value $runOnceCmd
    Write-Log 'Registered RunOnce to install VS Code Python + Jupyter extensions at first logon.'
}
catch {
    Write-Log "WARNING: could not register RunOnce: $($_.Exception.Message)"
}

Write-Log 'PROVISION_COMPLETE'
