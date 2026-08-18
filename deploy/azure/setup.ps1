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
    [string] $GeoCatalogUri = '',

    [Parameter(Mandatory = $false)]
    [string] $RepoUrl = 'https://github.com/Azure/microsoft-planetary-computer-pro.git',

    [Parameter(Mandatory = $false)]
    [string] $SampleContainerUrl = '',

    [Parameter(Mandatory = $false)]
    [string] $UploadContainerUrl = '',

    [Parameter(Mandatory = $false)]
    [string] $IngestIdentityObjectId = '',

    [Parameter(Mandatory = $false)]
    [string] $FoundryEndpoint = '',

    [Parameter(Mandatory = $false)]
    [string] $FoundryDeployment = '',

    [Parameter(Mandatory = $false)]
    [string] $AuroraEndpoint = '',

    [Parameter(Mandatory = $false)]
    [string] $SeedSampleData = 'false',

    [Parameter(Mandatory = $false)]
    [string] $DeployWebApp = 'false',

    [Parameter(Mandatory = $false)]
    [string] $WebAppBaseUrl = '',

    [Parameter(Mandatory = $false)]
    [string] $WebAppUrl = '',

    [Parameter(Mandatory = $false)]
    [string] $SwaDeploymentToken = ''
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
# are customer-provided.
#
# GEOCATALOG_URI is the resource's REAL catalogUri (the read-only
# geoCatalog.properties.catalogUri property, which includes the platform-assigned
# domain hash, e.g. https://<name>.<hash>.<region>.geocatalog.spatio.azure.com). It is
# injected by the deployment straight from the resource - never constructed/guessed - so
# it matches the portal's GeoCatalog > Overview > GeoCatalog URI exactly.
# ------------------------------------------------------------------------------------
$geocatUri = if ($GeoCatalogUri) { $GeoCatalogUri.TrimEnd('/') } else { '<paste-from-portal: GeoCatalog > Overview > GeoCatalog URI>' }
$uploadUrl = if ($UploadContainerUrl) { $UploadContainerUrl.TrimEnd('/') } else { $SampleContainerUrl }
$containerName = if ($uploadUrl) { ($uploadUrl.TrimEnd('/') -split '/')[-1] } else { 'model-outputs' }
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
        '# Pre-filled by the turnkey POC deployment. GEOCATALOG_URI is the resource''s real',
        '# catalogUri (includes the platform domain hash); it matches the portal exactly.',
        "GEOCATALOG_URI=$geocatUri",
        '',
        '# Aurora endpoint: pre-filled if you deployed the Aurora GPU model; otherwise supply it.',
        "AURORA_FOUNDRY_ENDPOINT=$auroraEndpointValue",
        'AURORA_FOUNDRY_TOKEN=<your-token>',
        '',
        '# Model-output storage provisioned by this template. The workstation''s managed',
        '# identity was granted Storage Blob Data Contributor on this account, so the',
        '# notebook can upload weather model outputs WITHOUT a SAS or account key.',
        "UPLOAD_CONTAINER_NAME=$containerName",
        "AURORA_BLOB_STORAGE_SAS=$uploadUrl",
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
# Optional headless seeding: create a sample STAC collection and ingest a few Sentinel-2
# scenes so the GeoCatalog Explorer already shows imagery on first open. Authenticates
# with the workstation's system-assigned managed identity (granted GeoCatalog
# Administrator by the template). Mirrors notebooks/GeoCatalog_Tutorial.ipynb. This is
# best-effort: any failure is logged but never fails provisioning.
# ------------------------------------------------------------------------------------
$seedCollectionId = 'sentinel-2-l2a-sample'
$seededOn = ($SeedSampleData -match '^(true|1|yes)$')
if ($seededOn -and $GeoCatalogUri -and $python) {
    $seedScript = Join-Path $repoDir 'seed_geocatalog.py'
    $seedBody = @'
import json
import string
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

try:
    from azure.identity import DefaultAzureCredential, ManagedIdentityCredential
    from pystac_client import Client
except Exception as exc:  # pragma: no cover
    print(f"Seeding dependencies missing ({exc}); skipping.")
    sys.exit(0)

geocatalog_url = (sys.argv[1] if len(sys.argv) > 1 else "").rstrip("/")
if not geocatalog_url:
    print("No GeoCatalog URL provided; skipping seed.")
    sys.exit(0)

API_VERSION = "2025-04-30-preview"
PARAMS = {"api-version": API_VERSION}
MPC_APP_ID = "https://geocatalog.spatio.azure.com"
PC_COLLECTION = "sentinel-2-l2a"
COLLECTION_ID = "sentinel-2-l2a-sample"
# AOI over Port Fourchon / the Louisiana Gulf coast - a major U.S. oil & gas hub and a
# hurricane-exposed area - so the smoke-test imagery is relevant to the weather scenario.
BBOX_AOI = [-90.30, 28.95, -90.05, 29.20]
# Wider window + a cloud-cover filter (below) to improve the odds of a clear Gulf scene.
DATE_RANGE = "2024-01-01/2024-05-31"
MAX_CLOUD_COVER = 30
MAX_ITEMS = 3

# Authenticate with the VM's system-assigned managed identity.
try:
    credential = ManagedIdentityCredential()
    credential.get_token(f"{MPC_APP_ID}/.default")
except Exception:
    credential = DefaultAzureCredential(exclude_interactive_browser_credential=True)

_tok = {"value": None, "exp": 0.0}


def bearer():
    now = time.time()
    if not _tok["value"] or _tok["exp"] < now + 300:
        token = credential.get_token(f"{MPC_APP_ID}/.default")
        _tok["value"] = token.token
        _tok["exp"] = token.expires_on
    return {"Authorization": f"Bearer {_tok['value']}"}


def show_error(resp):
    try:
        print(json.dumps(resp.json(), indent=2)[:2000])
    except Exception:
        print(resp.text[:2000])


collections_endpoint = f"{geocatalog_url}/stac/collections"

# Wait for RBAC / data-plane access to propagate.
for attempt in range(15):
    try:
        probe = requests.get(collections_endpoint, headers=bearer(), params=PARAMS, timeout=60)
        if probe.status_code in (200, 404):
            break
        if probe.status_code in (401, 403):
            print(f"Waiting for GeoCatalog data-plane access (attempt {attempt + 1})...")
            time.sleep(20)
            continue
        break
    except Exception as exc:
        print(f"Connectivity retry {attempt + 1}: {exc}")
        time.sleep(20)

# Fetch the public Sentinel-2 collection definition (also used for the asset container).
pc_def = requests.get(
    f"https://planetarycomputer.microsoft.com/api/stac/v1/collections/{PC_COLLECTION}",
    timeout=60,
).json()
pc_storage_account = pc_def.get("msft:storage_account")
pc_storage_container = pc_def.get("msft:container")
asset_container = f"https://{pc_storage_account}.blob.core.windows.net/{pc_storage_container}"

# Create the collection if it does not already exist (idempotent re-runs).
existing = requests.get(
    f"{geocatalog_url}/stac/collections/{COLLECTION_ID}", headers=bearer(), params=PARAMS, timeout=60
)
if existing.status_code == 200:
    print(f"Collection '{COLLECTION_ID}' already exists; ensuring config and items.")
else:
    stac_collection = dict(pc_def)
    stac_collection["id"] = COLLECTION_ID
    stac_collection["title"] = "Sentinel-2 L2A (sample)"
    stac_collection.pop("msft:storage_account", None)
    stac_collection.pop("msft:container", None)
    stac_collection.pop("assets", None)
    created = requests.post(
        collections_endpoint, json=stac_collection, headers=bearer(), params=PARAMS, timeout=120
    )
    if created.status_code not in (200, 201):
        print("Failed to create collection:")
        show_error(created)
        sys.exit(0)
    print(f"Created collection '{COLLECTION_ID}'.")

# Register (or refresh) the Planetary Computer ingestion source.
ingestion_sources_endpoint = f"{geocatalog_url}/inma/ingestion-sources"


def find_ingestion_source(container_url):
    resp = requests.get(ingestion_sources_endpoint, headers=bearer(), params=PARAMS, timeout=60)
    if resp.status_code != 200:
        return None
    for source in resp.json().get("value", []):
        detail = requests.get(
            f"{ingestion_sources_endpoint}/{source['id']}", headers=bearer(), params=PARAMS, timeout=60
        )
        if detail.status_code == 200 and detail.json().get("connectionInfo", {}).get("containerUrl") == container_url:
            return detail.json()
    return None


pc_token = requests.get(
    f"https://planetarycomputer.microsoft.com/api/sas/v1/token/{PC_COLLECTION}", timeout=60
).json()
source = find_ingestion_source(asset_container)
need_source = True
if source:
    try:
        expiry = datetime.fromisoformat(source["connectionInfo"]["expiration"].split(".")[0]).replace(
            tzinfo=timezone.utc
        )
        if expiry > datetime.now(tz=timezone.utc) + timedelta(minutes=30):
            need_source = False
        else:
            requests.delete(
                f"{ingestion_sources_endpoint}/{source['id']}", headers=bearer(), params=PARAMS, timeout=60
            )
    except Exception:
        need_source = True
if need_source:
    registered = requests.post(
        ingestion_sources_endpoint,
        json={"kind": "SasToken", "connectionInfo": {"containerUrl": asset_container, "sasToken": pc_token["token"]}},
        headers=bearer(),
        params=PARAMS,
        timeout=60,
    )
    if registered.status_code not in (200, 201):
        print("Failed to register ingestion source:")
        show_error(registered)
    else:
        print("Registered Planetary Computer ingestion source.")

# Search the Planetary Computer and ingest a few items.
items_endpoint = f"{geocatalog_url}/stac/collections/{COLLECTION_ID}/items"
operation_ids = []
try:
    catalog = Client.open("https://planetarycomputer.microsoft.com/api/stac/v1")
    search = catalog.search(
        collections=[PC_COLLECTION],
        bbox=BBOX_AOI,
        datetime=DATE_RANGE,
        query={"eo:cloud_cover": {"lt": MAX_CLOUD_COVER}},
    )
    # Prefer the least-cloudy scenes so the Gulf coast actually renders.
    all_items = list(search.item_collection())
    all_items.sort(key=lambda it: it.properties.get("eo:cloud_cover", 100))
    items = all_items[:MAX_ITEMS]
except Exception as exc:
    print(f"Planetary Computer search failed: {exc}")
    items = []

for item in items:
    item_json = item.to_dict()
    item_json["collection"] = COLLECTION_ID
    for asset_key in ("rendered_preview", "preview", "tilejson"):
        item_json.get("assets", {}).pop(asset_key, None)
    resp = requests.post(items_endpoint, json=item_json, headers=bearer(), params=PARAMS, timeout=120)
    if resp.status_code in (200, 201, 202):
        try:
            operation_ids.append(resp.json()["id"])
        except Exception:
            pass
        print(f"Queued item {item_json['id']} for ingestion.")
    else:
        print(f"Item {item_json['id']} ingestion request failed:")
        show_error(resp)

# Apply render options and a mosaic definition so the collection is viewable.
try:
    render_json = requests.get(
        f"https://planetarycomputer.microsoft.com/api/data/v1/mosaic/info?collection={PC_COLLECTION}", timeout=60
    ).json()
    render_endpoint = f"{geocatalog_url}/stac/collections/{COLLECTION_ID}/configurations/render-options"
    for render_option in render_json.get("renderOptions", []):
        render_option["id"] = (
            render_option["name"].translate(str.maketrans("", "", string.punctuation)).lower().replace(" ", "-")[:30]
        )
        requests.post(render_endpoint, json=render_option, headers=bearer(), params=PARAMS, timeout=60)
    print("Applied render options.")
except Exception as exc:
    print(f"Render configuration failed: {exc}")

try:
    mosaics_endpoint = f"{geocatalog_url}/stac/collections/{COLLECTION_ID}/configurations/mosaics"
    requests.post(
        mosaics_endpoint,
        json={
            "id": "mos1",
            "name": "Most recent available",
            "description": "Most recent available imagery in this collection",
            "cql": [],
        },
        headers=bearer(),
        params=PARAMS,
        timeout=60,
    )
    print("Applied mosaic definition.")
except Exception as exc:
    print(f"Mosaic configuration failed: {exc}")

# Poll ingestion operations (bounded, so provisioning does not hang).
operations_endpoint = f"{geocatalog_url}/inma/operations"
deadline = time.time() + 720
while operation_ids and time.time() < deadline:
    running = finished = failed = 0
    for operation_id in operation_ids:
        try:
            resp = requests.get(
                f"{operations_endpoint}/{operation_id}", headers=bearer(), params=PARAMS, timeout=60
            )
            status = resp.json().get("status", "Running")
        except Exception:
            status = "Running"
        if status in ("Running", "Pending"):
            running += 1
        elif status == "Failed":
            failed += 1
        else:
            finished += 1
    print(f"Ingestion status: finished={finished} running={running} failed={failed}")
    if running == 0:
        break
    time.sleep(15)

print(f"Seeding complete. Collection '{COLLECTION_ID}' is configured; open the Explorer to view it.")
'@
    try {
        Set-Content -Path $seedScript -Value $seedBody -Encoding UTF8
        Write-Log 'Seeding GeoCatalog with sample Sentinel-2 data (headless, managed identity)...'
        & python $seedScript "$geocatUri" 2>&1 | ForEach-Object { Write-Log $_ }
        Write-Log 'GeoCatalog seeding step finished.'
    }
    catch {
        Write-Log "WARNING: GeoCatalog seeding failed (run the tutorial notebook manually): $($_.Exception.Message)"
    }
}
else {
    Write-Log "Skipping GeoCatalog seeding (SeedSampleData=$SeedSampleData)."
}

# ------------------------------------------------------------------------------------
# StormLens web app: download the static site, inject the real GeoCatalog URL, serve it
# locally on the workstation, and (if a Static Web Apps deployment token was passed as a
# protected parameter) publish it to Azure Static Web Apps. All best-effort.
# ------------------------------------------------------------------------------------
$webAppOn = ($DeployWebApp -match '^(true|1|yes)$')
$stormLensDir = 'C:\StormLens\webapp'
if ($webAppOn -and $WebAppBaseUrl) {
    try {
        Write-Log 'Setting up the StormLens web app...'
        New-Item -ItemType Directory -Path (Join-Path $stormLensDir 'assets') -Force | Out-Null
        $webFiles = @(
            'index.html', 'weather.html', 'explorer.html', 'architecture.html', 'get-started.html',
            'staticwebapp.config.json', 'StormLens-Setup.cmd', 'StormLens-Deploy.cmd',
            'assets/styles.css', 'assets/app-config.js', 'assets/explorer.js',
            'setup/bootstrap.ps1', 'wizard/wizard.html', 'wizard/deploy-wizard.ps1'
        )
        $base = $WebAppBaseUrl.TrimEnd('/')
        foreach ($rel in $webFiles) {
            $dest = Join-Path $stormLensDir ($rel -replace '/', '\')
            New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
            try {
                Invoke-WebRequest -Uri "$base/$rel" -OutFile $dest -UseBasicParsing
            }
            catch {
                Write-Log "WARNING: could not download web file '$rel': $($_.Exception.Message)"
            }
        }

        # Inject the real GeoCatalog URL into the runtime config (no secrets written).
        # Literal replace (not regex) so URL characters are never treated as substitutions;
        # only inject when we actually have a real URI, otherwise leave it blank.
        $cfgPath = Join-Path $stormLensDir 'assets\app-config.js'
        if ((Test-Path $cfgPath) -and $GeoCatalogUri) {
            $cfg = Get-Content -Raw $cfgPath
            $cfg = $cfg.Replace('geoCatalogUrl: ""', ('geoCatalogUrl: "' + $geocatUri + '"'))
            Set-Content -Path $cfgPath -Value $cfg -Encoding UTF8
            Write-Log 'Injected GeoCatalog URL into StormLens app-config.js.'
        }

        # Desktop launcher to serve the site locally.
        $serveCmd = @"
@echo off
echo Starting StormLens at http://localhost:8080 ...
start "" http://localhost:8080
cd /d "$stormLensDir"
python -m http.server 8080
"@
        Set-Content -Path (Join-Path $publicDesktop '2 - StormLens (local).cmd') -Value $serveCmd -Encoding ascii
        Write-Log 'Wrote local StormLens launcher to the public desktop.'
    }
    catch {
        Write-Log "WARNING: StormLens local setup failed: $($_.Exception.Message)"
    }

    # Publish to Azure Static Web Apps using the deployment token (best-effort).
    if ($SwaDeploymentToken) {
        try {
            Write-Log 'Publishing StormLens to Azure Static Web Apps...'
            if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
                Write-Log 'Installing Node.js LTS for the SWA CLI...'
                if ($hasWinget) {
                    Install-WithWinget -Id 'OpenJS.NodeJS.LTS' -FriendlyName 'Node.js LTS'
                }
                else {
                    $nodeMsi = Join-Path $env:TEMP 'node-lts.msi'
                    Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.17.0/node-v20.17.0-x64.msi' -OutFile $nodeMsi
                    Start-Process -FilePath 'msiexec.exe' -ArgumentList "/i `"$nodeMsi`" /quiet /norestart" -Wait
                }
                $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                            [System.Environment]::GetEnvironmentVariable('Path', 'User')
            }
            if (Get-Command npx -ErrorAction SilentlyContinue) {
                # Run via npx so we don't depend on the global npm bin being on PATH this session.
                & npx --yes @azure/static-web-apps-cli deploy "$stormLensDir" --deployment-token $SwaDeploymentToken --env production 2>&1 |
                    ForEach-Object { Write-Log $_ }
                Write-Log "StormLens published to $WebAppUrl"
            }
            else {
                Write-Log 'WARNING: Node/npx not available after install; deploy StormLens manually with the SWA CLI.'
            }
        }
        catch {
            Write-Log "WARNING: SWA publish failed (deploy manually with the SWA CLI): $($_.Exception.Message)"
        }
    }
}

# ------------------------------------------------------------------------------------
# StormLens sign-in: create a Microsoft Entra app registration (SPA) for the Live
# Explorer's MSAL sign-in, wire its redirect URIs + delegated GeoCatalog permission, and
# inject the clientId/tenantId into app-config.js. Best-effort and fully non-fatal: it
# only succeeds if the workstation identity (or a signed-in deployer) has directory rights
# to create app registrations. Otherwise it logs a note and leaves the IDs blank for the
# operator to fill in manually.
# ------------------------------------------------------------------------------------
$entraConfigured = $false
$explorerClientId = ''
$explorerTenantId = ''
if ($webAppOn) {
    try {
        if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw 'Azure CLI not available.' }
        Write-Log 'Creating the Microsoft Entra app registration for StormLens sign-in...'

        # Authenticate az with the workstation managed identity (best-effort).
        & az login --identity --allow-no-subscriptions 2>&1 | ForEach-Object { Write-Log $_ }
        $explorerTenantId = (& az account show --query tenantId -o tsv 2>$null)

        # SPA redirect URIs: local launcher + the Static Web App (if one was deployed).
        $redirects = @('http://localhost:8080/explorer.html')
        if ($WebAppUrl) { $redirects += ($WebAppUrl.TrimEnd('/') + '/explorer.html') }

        # Create the app registration, or reuse one with the same name (idempotent re-runs).
        $appName = "StormLens-Explorer-$GeoCatalogName"
        $explorerClientId = (& az ad app list --display-name $appName --query "[0].appId" -o tsv 2>$null)
        if ($explorerClientId) {
            Write-Log "Reusing existing app registration $explorerClientId."
        }
        else {
            $explorerClientId = (& az ad app create --display-name $appName --sign-in-audience AzureADMyOrg --query appId -o tsv 2>$null)
            if ($explorerClientId) { Write-Log "Created app registration $explorerClientId." }
        }

        if ($explorerClientId) {
            # Set the SPA platform redirect URIs via Microsoft Graph (no --spa flag on az).
            $spaBody = (@{ spa = @{ redirectUris = $redirects } } | ConvertTo-Json -Compress -Depth 5)
            $spaBodyFile = Join-Path $env:TEMP 'stormlens-spa.json'
            Set-Content -Path $spaBodyFile -Value $spaBody -Encoding utf8
            & az rest --method PATCH `
                --url "https://graph.microsoft.com/v1.0/applications(appId='$explorerClientId')" `
                --headers 'Content-Type=application/json' --body "@$spaBodyFile" 2>&1 | ForEach-Object { Write-Log $_ }
            Remove-Item $spaBodyFile -ErrorAction SilentlyContinue

            # Add the delegated GeoCatalog permission (user_impersonation) and try to consent.
            try {
                $resourceSp = (& az ad sp show --id 'https://geocatalog.spatio.azure.com' -o json 2>$null) | ConvertFrom-Json
                if ($resourceSp -and $resourceSp.appId) {
                    $imp = $resourceSp.oauth2PermissionScopes | Where-Object { $_.value -eq 'user_impersonation' } | Select-Object -First 1
                    if ($imp) {
                        & az ad app permission add --id $explorerClientId --api $resourceSp.appId `
                            --api-permissions "$($imp.id)=Scope" 2>&1 | ForEach-Object { Write-Log $_ }
                        # Admin consent needs privileged rights; best-effort, users can consent at sign-in.
                        & az ad app permission admin-consent --id $explorerClientId 2>&1 | ForEach-Object { Write-Log $_ }
                    }
                }
                else {
                    Write-Log 'NOTE: GeoCatalog service principal not found in this tenant; users will consent to the data-plane scope at first sign-in.'
                }
            }
            catch {
                Write-Log "NOTE: could not pre-wire the GeoCatalog permission (users can consent at sign-in): $($_.Exception.Message)"
            }

            # Inject clientId/tenantId into the runtime config (literal replace; no secrets).
            $cfgPath = Join-Path $stormLensDir 'assets\app-config.js'
            if ((Test-Path $cfgPath) -and $explorerClientId -and $explorerTenantId) {
                $cfg = Get-Content -Raw $cfgPath
                $cfg = $cfg.Replace('clientId: ""', ('clientId: "' + $explorerClientId + '"'))
                $cfg = $cfg.Replace('tenantId: ""', ('tenantId: "' + $explorerTenantId + '"'))
                Set-Content -Path $cfgPath -Value $cfg -Encoding UTF8
                $entraConfigured = $true
                Write-Log 'Injected Entra clientId/tenantId into StormLens app-config.js.'

                # Re-publish to Static Web Apps so the live site picks up the sign-in config.
                if ($SwaDeploymentToken -and (Get-Command npx -ErrorAction SilentlyContinue)) {
                    & npx --yes @azure/static-web-apps-cli deploy "$stormLensDir" `
                        --deployment-token $SwaDeploymentToken --env production 2>&1 | ForEach-Object { Write-Log $_ }
                }
            }
        }
        else {
            Write-Log 'WARNING: could not create the Entra app registration (the workstation identity likely lacks Application.ReadWrite.All). Set clientId/tenantId manually in app-config.js.'
        }
    }
    catch {
        Write-Log "WARNING: Entra app-registration step failed (set clientId/tenantId manually in app-config.js): $($_.Exception.Message)"
    }
}

# ------------------------------------------------------------------------------------
# Write connection-info (no secrets) for the operator.
# ------------------------------------------------------------------------------------
if ($seededOn) {
    $seedNote = @"
NOTE - a sample collection '$seedCollectionId' was pre-loaded at deploy time (Sentinel-2
       imagery over the Louisiana Gulf coast / Port Fourchon oil & gas hub + render/mosaic
       config), so the Explorer should already show data on first open. If it looks empty,
       ingestion may still be finishing - re-check in a few minutes (see
       C:\ProvisionLogs\setup.log). Run the tutorial notebook to build your own.
"@
}
else {
    $seedNote = @"
NOTE - the GeoCatalog starts EMPTY. You will not see any collections or imagery in the
       Explorer until you run the tutorial notebook (step 1): it creates a STAC
       collection, ingests the sample Sentinel-2 imagery, and applies a render
       configuration. A collection only becomes viewable in the Explorer after a render
       configuration exists (the "Launch in Explorer" button stays greyed out until then).
"@
}
$connInfo = @"
Microsoft Planetary Computer Pro - Turnkey POC
===============================================
GeoCatalog name : $GeoCatalogName
GeoCatalog URI  : $geocatUri
                  (the resource's real catalogUri, including the platform domain hash;
                   matches GeoCatalog > Overview > GeoCatalog URI in the portal)

Official solution cloned to:
  $repoDir

Get started (nothing to copy - just double-click):
  >> Double-click the desktop shortcut:  "1 - Start Here (open in VS Code)"
     It signs you in to Azure (az login) if needed and opens the repo already
     loaded in VS Code, with START-HERE.md showing the guided steps.

  (VS Code also opens automatically the first time you sign in to this VM.)

  Prefer to do it by hand? The same steps live in START-HERE.md at the repo root:
        $repoDir\START-HERE.md
  Notebooks (open from the VS Code Explorer - no path typing needed):
    1. applications\storm_impact_assessment\hurricane_forecast_infra_impact.ipynb
                                              (START HERE - weather: Aurora hurricane
                                               forecast + energy-infrastructure impact;
                                               needs a Foundry Aurora GPU endpoint)
    2. notebooks\GeoCatalog_Tutorial.ipynb    (how the ingest -> render config ->
                                               visualize pipeline works)
    3. notebooks\create-stac-items.ipynb      (STAC items from your own rasters)

$seedNote

Bring-your-own-data storage (provisioned; managed-identity ingestion):
  Sample assets container   : $SampleContainerUrl
  Weather model-outputs URL : $uploadUrl
  Identity objectId         : $IngestIdentityObjectId
  (the workstation identity has Storage Blob Data Contributor on this account, so the
   storm-impact notebook uploads model outputs with managed identity - no keys/SAS.)

AI (Microsoft Foundry):
  Azure OpenAI endpoint   : $FoundryEndpoint
  Azure OpenAI deployment : $FoundryDeployment
  (also set as machine env vars FOUNDRY_ENDPOINT / FOUNDRY_DEPLOYMENT)
  Aurora GPU endpoint     : $AuroraEndpoint

StormLens web app (branded showcase + live map explorer over the GeoCatalog):
  Azure Static Web Apps URL : $WebAppUrl
  Run locally               : double-click "2 - StormLens (local).cmd" (serves
                              http://localhost:8080 from $stormLensDir)
  Sign-in ($(if ($entraConfigured) { 'auto-configured' } else { 'action needed' }))     : $(if ($entraConfigured) {
      "Entra app '$('StormLens-Explorer-' + $GeoCatalogName)' (clientId $explorerClientId)
                              was created and written into app-config.js. If the first sign-in
                              shows a consent error, have an admin grant consent to the
                              GeoCatalog (user_impersonation) delegated permission."
    } else {
      "the Entra app registration could not be created automatically. Create a
                              Microsoft Entra app (SPA, redirect URIs
                              http://localhost:8080/explorer.html and <SWA-URL>/explorer.html,
                              delegated GeoCatalog access) and paste its clientId/tenantId into
                              $stormLensDir\assets\app-config.js (the GeoCatalog URL is already
                              injected)."
    })

This file contains no passwords, keys, or tokens.
"@
Set-Content -Path (Join-Path $publicDesktop 'connection-info.txt') -Value $connInfo
Write-Log 'Wrote connection-info.txt to the public desktop.'

# ------------------------------------------------------------------------------------
# First-run experience: make VS Code open the repo pre-loaded with a guided START-HERE
# page, so the operator never has to hunt for a folder or copy commands. We write:
#   - START-HERE.md              (guided steps, rendered in VS Code; the "README")
#   - .vscode/settings + tasks   (default interpreter + one-click "az login" task)
#   - a .code-workspace on the desktop that opens the repo folder
#   - "Start Here.cmd" + a desktop shortcut that runs az login (if needed) then opens it
#   - a first-run.cmd wired to RunOnce so VS Code auto-opens at first logon
# ------------------------------------------------------------------------------------
$workspaceFile = Join-Path $publicDesktop 'Planetary Computer Pro.code-workspace'
$startHereMd   = Join-Path $repoDir 'START-HERE.md'
$startHereCmd  = Join-Path $publicDesktop 'Start Here.cmd'
$firstRunCmd   = Join-Path $publicDesktop 'first-run.cmd'

# Locate the machine-wide VS Code install (used for the shortcut icon).
$codeExe = @(
    (Join-Path $env:ProgramFiles 'Microsoft VS Code\Code.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft VS Code\Code.exe')
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

# --- START-HERE.md (guided page shown inside VS Code) --------------------------------
if ($seededOn) {
    $mdSeedNote = @'
> **Pipeline already verified:** a small sample collection `sentinel-2-l2a-sample` over the
> **Louisiana Gulf coast (Port Fourchon oil & gas hub)** was pre-loaded at deploy time, so the
> GeoCatalog Explorer already shows data on first open — proof that ingest → render → visualize
> works before you run the weather workflow. If it looks empty, ingestion may still be finishing
> — re-check in a few minutes.
'@
}
else {
    $mdSeedNote = @'
> The GeoCatalog starts **empty** — the Explorer shows nothing (and "Launch in
> Explorer" stays greyed out) until this notebook creates a collection and a render
> configuration. That is expected.
'@
}
if (Test-Path $repoDir) {
    $startHereBody = @'
# Start here — Microsoft Planetary Computer Pro (Weather POC)

This workstation is set up for the **weather** scenario: predicting a tropical
storm's path with the **Aurora** AI weather model and assessing its impact on
**energy / oil & gas infrastructure**. Everything is already installed and
pre-wired — you do **not** need to clone anything or copy connection strings.

## 1. Sign in to Azure (one time)
Run the built-in task: **Terminal → Run Task… → "Azure: Sign in (az login)"**
(or type `az login` in a terminal). If you opened this from the **"Start Here"**
desktop shortcut, you were already signed in — skip this step.

## 2. Run the weather workflow — START HERE
Open **[applications/storm_impact_assessment/hurricane_forecast_infra_impact.ipynb](applications/storm_impact_assessment/hurricane_forecast_infra_impact.ipynb)**
and run the cells top to bottom. It:
- selects a storm (IBTrACS; Hurricane Helene 2024 is pre-selected),
- pulls **ECMWF** weather data via Planetary Computer Pro,
- runs **Aurora** hurricane-track inference on a Microsoft Foundry GPU endpoint,
- writes the model outputs to your **model-outputs** storage container (managed
  identity — no keys), and ingests results into the GeoCatalog,
- and maps the storm track against **power / energy infrastructure** (OpenStreetMap).

Its `.env` is already pre-filled with the Azure pieces this deployment created
(GeoCatalog URI, upload container). You only add a Microsoft Foundry **Aurora GPU
endpoint + token** (`AURORA_FOUNDRY_ENDPOINT` / `AURORA_FOUNDRY_TOKEN`) if you did
not deploy the Aurora model with this template.

__SEED_NOTE__

## 3. How the ingest → render → visualize pipeline works
Open **[notebooks/GeoCatalog_Tutorial.ipynb](notebooks/GeoCatalog_Tutorial.ipynb)** for a
minimal end-to-end example (collection → ingest → render/mosaic → Explorer). This is the
same pipeline the weather workflow uses to publish its results.

## 4. Bring your own rasters
Open **[notebooks/create-stac-items.ipynb](notebooks/create-stac-items.ipynb)** to turn
your own GeoTIFFs into STAC items and ingest them.

## 5. Explore in StormLens (branded web app)
Instead of the raw catalog portal, use the **StormLens** web app — a branded showcase plus a
live map explorer over your GeoCatalog. Run it locally by double-clicking the desktop
launcher **"2 - StormLens (local).cmd"** (serves `http://localhost:8080`), or open the
**Azure Static Web Apps** URL from `connection-info.txt`. The Live Explorer signs in with
your Microsoft Entra identity; the deployment tries to **auto-create the app registration**
and fill in `clientId`/`tenantId` for you. If sign-in reports a config or consent error, see
the StormLens section of `connection-info.txt` (you may need an admin to grant consent, or to
set the IDs manually in `C:\StormLens\webapp\assets\app-config.js`).

---

**Your GeoCatalog URI** (already set in the app `.env`, no need to paste): `__GEOCAT_URI__`
**GeoCatalog name:** `__GEOCAT_NAME__`

Troubleshooting: if a folder or notebook looks missing, provisioning may still be
finishing — check `C:\ProvisionLogs\setup.log` for `PROVISION_COMPLETE`.
'@
    $startHereBody = $startHereBody.Replace('__GEOCAT_URI__', $geocatUri).Replace('__GEOCAT_NAME__', $GeoCatalogName).Replace('__SEED_NOTE__', $mdSeedNote.TrimEnd())
    try {
        Set-Content -Path $startHereMd -Value $startHereBody -Encoding UTF8
        Write-Log 'Wrote START-HERE.md to the repo root.'
    }
    catch { Write-Log "WARNING: could not write START-HERE.md: $($_.Exception.Message)" }

    # --- .vscode: default interpreter + one-click az login task ----------------------
    $vscodeDir = Join-Path $repoDir '.vscode'
    New-Item -ItemType Directory -Path $vscodeDir -Force | Out-Null
    try {
        @{
            'workbench.startupEditor'      = 'none'
            'python.defaultInterpreterPath' = 'python'
        } | ConvertTo-Json | Set-Content -Path (Join-Path $vscodeDir 'settings.json') -Encoding UTF8

        @{
            version = '2.0.0'
            tasks   = @(
                @{
                    label          = 'Azure: Sign in (az login)'
                    type           = 'shell'
                    command        = 'az login'
                    problemMatcher = @()
                    presentation   = @{ reveal = 'always'; panel = 'shared' }
                }
            )
        } | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $vscodeDir 'tasks.json') -Encoding UTF8
        Write-Log 'Wrote .vscode settings.json and tasks.json.'
    }
    catch { Write-Log "WARNING: could not write .vscode files: $($_.Exception.Message)" }
}

# --- .code-workspace that opens the repo folder --------------------------------------
try {
    @{
        folders  = @( @{ path = 'microsoft-planetary-computer-pro' } )
        settings = @{ 'workbench.startupEditor' = 'none' }
    } | ConvertTo-Json -Depth 5 | Set-Content -Path $workspaceFile -Encoding UTF8
    Write-Log 'Wrote Planetary Computer Pro.code-workspace to the public desktop.'
}
catch { Write-Log "WARNING: could not write .code-workspace: $($_.Exception.Message)" }

# --- Start Here.cmd: az login (if needed) then open the workspace --------------------
$startHereCmdBody = @'
@echo off
setlocal
set "WS=%PUBLIC%\Desktop\Planetary Computer Pro.code-workspace"
set "MD=%PUBLIC%\Desktop\microsoft-planetary-computer-pro\START-HERE.md"
where az >nul 2>nul && ( az account show >nul 2>nul || az login )
where code >nul 2>nul && ( code "%WS%" "%MD%" ) || ( start "" "%WS%" )
endlocal
'@
# first-run.cmd: install the VS Code extensions, then auto-open (used by RunOnce).
$firstRunCmdBody = @'
@echo off
code --install-extension ms-python.python
code --install-extension ms-toolsai.jupyter
code "%PUBLIC%\Desktop\Planetary Computer Pro.code-workspace" "%PUBLIC%\Desktop\microsoft-planetary-computer-pro\START-HERE.md"
'@
try {
    Set-Content -Path $startHereCmd -Value $startHereCmdBody -Encoding ASCII
    Set-Content -Path $firstRunCmd  -Value $firstRunCmdBody  -Encoding ASCII
    Write-Log 'Wrote Start Here.cmd and first-run.cmd.'
}
catch { Write-Log "WARNING: could not write launcher .cmd files: $($_.Exception.Message)" }

# --- Desktop shortcut pointing at Start Here.cmd -------------------------------------
try {
    $wsh = New-Object -ComObject WScript.Shell
    $lnk = $wsh.CreateShortcut((Join-Path $publicDesktop '1 - Start Here (open in VS Code).lnk'))
    $lnk.TargetPath       = $startHereCmd
    $lnk.WorkingDirectory = $publicDesktop
    $lnk.Description       = 'Sign in to Azure and open the Planetary Computer Pro repo in VS Code'
    if ($codeExe) { $lnk.IconLocation = "$codeExe,0" }
    $lnk.Save()
    Write-Log 'Created the "Start Here" desktop shortcut.'
}
catch { Write-Log "WARNING: could not create desktop shortcut: $($_.Exception.Message)" }

# ------------------------------------------------------------------------------------
# Install VS Code extensions AND auto-open the workspace at first interactive logon
# (Marketplace + interactive desktop are available then). Runs exactly once.
# ------------------------------------------------------------------------------------
$runOnceCmd = 'cmd /c "' + $firstRunCmd + '"'
try {
    New-Item -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce' -Force | Out-Null
    Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce' -Name 'PCProFirstRun' -Value $runOnceCmd
    Write-Log 'Registered RunOnce to install VS Code extensions and auto-open the workspace at first logon.'
}
catch {
    Write-Log "WARNING: could not register RunOnce: $($_.Exception.Message)"
}

Write-Log 'PROVISION_COMPLETE'

