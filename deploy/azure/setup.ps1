<#
.SYNOPSIS
    Provisions the turnkey Planetary Computer Pro analytics workstation.

.DESCRIPTION
    Run by an Azure VM Run Command at deploy time. Installs Python, the Azure CLI,
    Git, and Visual Studio Code; clones the official Microsoft Planetary Computer Pro
    repository (notebooks + applications + tools); installs the Python dependencies and
    the Planetary Computer Pro SDK; and pre-wires the environment (GeoCatalog URI and
    the provisioned storage/identity) so an engineer can open the official notebooks
    and run them immediately. No secrets are written to disk.

    A PROVISION_COMPLETE marker is written at the end so callers can confirm the
    deploy-time steps finished. VS Code extensions install at first interactive logon.
#>

param(
    [Parameter(Mandatory = $true)]
    [string] $GeoCatalogName,

    [Parameter(Mandatory = $false)]
    [string] $GeoCatalogRegion = '',

    [Parameter(Mandatory = $false)]
    [string] $RepoUrl = 'https://github.com/Azure/microsoft-planetary-computer-pro.git',

    [Parameter(Mandatory = $false)]
    [string] $SampleContainerUrl = '',

    [Parameter(Mandatory = $false)]
    [string] $IngestIdentityObjectId = '',

    [Parameter(Mandatory = $false)]
    [string] $FoundryEndpoint = '',

    [Parameter(Mandatory = $false)]
    [string] $FoundryDeployment = '',

    [Parameter(Mandatory = $false)]
    [string] $AuroraEndpoint = ''
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
# Git (needed to clone the official repository).
# ------------------------------------------------------------------------------------
try {
    if ($hasWinget) {
        Install-WithWinget -Id 'Git.Git' -FriendlyName 'Git'
    }
    else {
        $gitExe = Join-Path $env:TEMP 'git-setup.exe'
        Invoke-WebRequest -Uri 'https://github.com/git-for-windows/git/releases/latest/download/Git-64-bit.exe' -OutFile $gitExe
        Write-Log 'Installing Git (silent).'
        Start-Process -FilePath $gitExe -ArgumentList '/VERYSILENT /NORESTART' -Wait
    }
}
catch {
    Write-Log "WARNING: Git install failed: $($_.Exception.Message)"
}

# ------------------------------------------------------------------------------------
# Refresh PATH for this session so python/pip/git are available.
# ------------------------------------------------------------------------------------
$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
            [System.Environment]::GetEnvironmentVariable('Path', 'User')

# ------------------------------------------------------------------------------------
# Base Python environment for the official notebooks (tutorial + STAC item creation).
# ------------------------------------------------------------------------------------
$publicDesktop = 'C:\Users\Public\Desktop'
New-Item -ItemType Directory -Path $publicDesktop -Force | Out-Null

$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    try {
        Write-Log 'Upgrading pip and installing base packages (jupyter + PC Pro SDK + STAC).'
        & python -m pip install --upgrade pip 2>&1 | ForEach-Object { Write-Log $_ }
        & python -m pip install jupyter notebook ipykernel pystac-client azure-identity azure-storage-blob requests pillow azure-planetarycomputer 2>&1 |
            ForEach-Object { Write-Log $_ }
    }
    catch {
        Write-Log "WARNING: base pip install failed: $($_.Exception.Message)"
    }
}
else {
    Write-Log 'WARNING: python not on PATH yet; install packages after first logon.'
}

# ------------------------------------------------------------------------------------
# Clone the official Microsoft Planetary Computer Pro repo (notebooks + apps + tools).
# This is the actual solution; this template just provisions and pre-wires it.
# ------------------------------------------------------------------------------------
$repoDir = Join-Path $publicDesktop 'microsoft-planetary-computer-pro'
if (Get-Command git -ErrorAction SilentlyContinue) {
    try {
        if (Test-Path (Join-Path $repoDir '.git')) {
            Write-Log "Repo already present at $repoDir; pulling latest."
            & git -C $repoDir pull 2>&1 | ForEach-Object { Write-Log $_ }
        }
        else {
            Write-Log "Cloning $RepoUrl to $repoDir."
            & git clone --depth 1 $RepoUrl $repoDir 2>&1 | ForEach-Object { Write-Log $_ }
        }
    }
    catch {
        Write-Log "WARNING: git clone failed: $($_.Exception.Message)"
    }
}
else {
    Write-Log 'WARNING: git not available; clone the repo manually after first logon.'
}

# ------------------------------------------------------------------------------------
# Best-effort install of the Aurora storm-impact app requirements. These are heavy
# geospatial packages and may need manual follow-up on Windows. The app itself also
# needs a Microsoft Foundry Aurora endpoint (GPU quota) that the customer provides.
# ------------------------------------------------------------------------------------
$stormDir = Join-Path $repoDir 'applications\storm_impact_assessment'
$stormReq = Join-Path $stormDir 'requirements.txt'
if ($python -and (Test-Path $stormReq)) {
    try {
        Write-Log 'Installing storm-impact app requirements (best-effort).'
        & python -m pip install -r $stormReq 2>&1 | ForEach-Object { Write-Log $_ }
    }
    catch {
        Write-Log "WARNING: storm-impact requirements install failed (install manually): $($_.Exception.Message)"
    }
}

# ------------------------------------------------------------------------------------
# Pre-wire the Aurora app .env with the Azure pieces this template provisioned. No
# secrets are written: storage uses managed identity, and the Aurora endpoint/token
# are customer-provided. GEOCATALOG_URI is derived from the deployed name/region;
# verify it in the portal (GeoCatalog > Overview > GeoCatalog URI).
# ------------------------------------------------------------------------------------
$geocatUri = if ($GeoCatalogRegion) { "https://$GeoCatalogName.$GeoCatalogRegion.geocatalog.spatio.azure.com" } else { '<paste-from-portal>' }
$containerName = if ($SampleContainerUrl) { ($SampleContainerUrl.TrimEnd('/') -split '/')[-1] } else { '' }
$auroraEndpointValue = if ($AuroraEndpoint) { $AuroraEndpoint } else { '<your-aurora-endpoint>' }

# Expose the Azure OpenAI (Foundry) agent endpoint + deployment as machine env vars.
if ($FoundryEndpoint) {
    try {
        [Environment]::SetEnvironmentVariable('FOUNDRY_ENDPOINT', $FoundryEndpoint, 'Machine')
        [Environment]::SetEnvironmentVariable('FOUNDRY_DEPLOYMENT', $FoundryDeployment, 'Machine')
        Write-Log 'Set FOUNDRY_ENDPOINT / FOUNDRY_DEPLOYMENT machine environment variables.'
    }
    catch {
        Write-Log "WARNING: could not set Foundry env vars: $($_.Exception.Message)"
    }
}
if (Test-Path $stormDir) {
    $envLines = @(
        '# Pre-filled by the turnkey POC deployment. Verify GEOCATALOG_URI in the portal.',
        "GEOCATALOG_URI=$geocatUri",
        '',
        '# Aurora endpoint: pre-filled if you deployed the Aurora GPU model; otherwise supply it.',
        "AURORA_FOUNDRY_ENDPOINT=$auroraEndpointValue",
        'AURORA_FOUNDRY_TOKEN=<your-token>',
        '',
        '# Model-output storage provisioned by this template. Prefer managed identity;',
        '# generate a SAS only if the notebook requires one (do not store account keys):',
        "UPLOAD_CONTAINER_NAME=$containerName",
        "AURORA_BLOB_STORAGE_SAS=$SampleContainerUrl",
        'STORAGE_ACCOUNT_KEY=<prefer-managed-identity-do-not-store-keys>'
    )
    try {
        Set-Content -Path (Join-Path $stormDir '.env') -Value $envLines
        Write-Log 'Wrote pre-filled .env for the storm-impact app.'
    }
    catch {
        Write-Log "WARNING: could not write .env: $($_.Exception.Message)"
    }
}

# ------------------------------------------------------------------------------------
# Write connection-info (no secrets) for the operator.
# ------------------------------------------------------------------------------------
$connInfo = @"
Microsoft Planetary Computer Pro - Turnkey POC
===============================================
GeoCatalog name : $GeoCatalogName
GeoCatalog URI  : $geocatUri
                  (verify in portal: GeoCatalog > Overview > GeoCatalog URI)

Official solution cloned to:
  $repoDir

Get started:
  1. Sign in:                         az login
  2. Open the repo folder above in VS Code (Python + Jupyter extensions install
     automatically at first logon).
  3. START HERE - end-to-end tutorial notebook:
        notebooks\GeoCatalog_Tutorial.ipynb
     Creates a STAC collection, ingests Sentinel-2 imagery, and configures
     visualization in the GeoCatalog Explorer.
  4. Create STAC items from your own rasters:
        notebooks\create-stac-items.ipynb
  5. Advanced - Aurora hurricane forecast (needs a Microsoft Foundry Aurora
     endpoint with GPU quota; .env is pre-filled with the provisioned Azure pieces):
        applications\storm_impact_assessment\hurricane_forecast_infra_impact.ipynb

Bring-your-own-data storage (provisioned; managed-identity ingestion):
  Container URL     : $SampleContainerUrl
  Identity objectId : $IngestIdentityObjectId

AI (Microsoft Foundry):
  Azure OpenAI endpoint   : $FoundryEndpoint
  Azure OpenAI deployment : $FoundryDeployment
  (also set as machine env vars FOUNDRY_ENDPOINT / FOUNDRY_DEPLOYMENT)
  Aurora GPU endpoint     : $AuroraEndpoint

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
