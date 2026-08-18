// =====================================================================================
// Microsoft Planetary Computer Pro — Rapid POC
// Provisions a GeoCatalog and (optionally) an analytics workstation and sample-data
// storage so you can prove the end-to-end ingest → configure → visualize flow.
//
// Mirrors the component-selectable, Bastion-isolated pattern of oracle-to-postgres-poc.
// =====================================================================================

targetScope = 'resourceGroup'

// ------------------------------------------------------------------------------------
// Parameters
// ------------------------------------------------------------------------------------

@description('Azure region for all resources. Planetary Computer Pro GeoCatalog is available only in the regions listed here (Preview).')
@allowed([
  'eastus'
  'northcentralus'
  'westeurope'
  'canadacentral'
  'uksouth'
])
param location string = 'westeurope'

@description('Name of the Planetary Computer Pro GeoCatalog resource. Lowercase letters and numbers, 3-24 characters. Leave blank to auto-generate a unique name.')
@maxLength(24)
param geoCatalogName string = ''

@description('GeoCatalog service tier.')
@allowed([
  'Basic'
])
param geoCatalogTier string = 'Basic'

@description('Deploy the analytics workstation (Windows VM + VS Code + Python + Azure CLI) reached privately over Azure Bastion. It runs the sample ingestion script.')
param deployWorkstation bool = true

@description('Deploy a sample-data storage account and a user-assigned managed identity for the managed-identity ingestion path (bring-your-own-data scenario).')
param deploySampleStorage bool = true

@description('At deploy time, headlessly create a sample STAC collection and ingest a few Sentinel-2 scenes into the GeoCatalog (using the workstation identity) so the Explorer already shows imagery on first open. Requires the workstation.')
param seedSampleData bool = true

@description('Deploy the StormLens web app (a branded showcase + live map explorer over the GeoCatalog) to Azure Static Web Apps, and also serve it locally on the workstation.')
param deployWebApp bool = true

@description('Administrator username for the workstation VM.')
param adminUsername string = 'azureuser'

@description('Administrator password for the workstation VM (used for RDP over the Azure Bastion tunnel). Leave empty when not deploying the workstation.')
@secure()
param adminPassword string = ''

@description('Size of the workstation VM.')
param vmSize string = 'Standard_D4s_v3'

@description('Base URL (raw) that hosts setup.ps1. Point this at your fork if you change the provisioning script.')
param artifactsBaseUrl string = 'https://raw.githubusercontent.com/Balunywa/planetary-computer-pro-poc/main/deploy/azure'

@description('Git repository the workstation clones — the official Microsoft Planetary Computer Pro samples/notebooks/apps/tools. Point this at a fork if desired.')
param officialRepoUrl string = 'https://github.com/Azure/microsoft-planetary-computer-pro.git'

@description('Deploy an Azure OpenAI (Microsoft Foundry) account + model deployment for agentic / reasoning GeoAI scenarios against the GeoCatalog.')
param deployAiAgent bool = true

@description('Name of the Azure OpenAI (Foundry) model deployment.')
param openAiDeploymentName string = 'gpt-5-mini'

@description('Azure OpenAI model name.')
param openAiModelName string = 'gpt-5-mini'

@description('Azure OpenAI model version.')
param openAiModelVersion string = '2025-08-07'

@description('Azure OpenAI deployment SKU.')
param openAiSkuName string = 'GlobalStandard'

@description('Azure OpenAI deployment capacity, in thousands of tokens per minute (TPM).')
param openAiCapacity int = 10

@description('Deploy the Microsoft Aurora weather foundation model on a GPU-backed Foundry managed-compute endpoint. Requires GPU (A100) quota, an Azure Marketplace subscription, and acceptance of the model terms.')
param deployAuroraModel bool = false

@description('GPU VM size for the Aurora managed-compute deployment. Aurora requires an A100-class SKU; you must have quota for it in the selected region.')
param auroraInstanceType string = 'Standard_NC24ads_A100_v4'

@description('Registry model asset ID for the Aurora managed-compute deployment. The official Microsoft storm-impact app uses azureml://registries/azureml/models/Aurora/versions/4. Leave blank to provision the Foundry workspace + endpoint only and deploy the model from the portal (the GPU deployment needs quota + accepted terms).')
param auroraModelAssetId string = ''

// ------------------------------------------------------------------------------------
// Variables
// ------------------------------------------------------------------------------------

var namePrefix = 'pcpro'
// When no name is supplied (e.g. left blank in the portal form) generate a unique one
// here in the template — uniqueString() is an ARM function and is not available in
// createUiDefinition.json, so name generation must live in the template.
var effectiveGeoCatalogName = empty(geoCatalogName) ? toLower('pcpro${uniqueString(resourceGroup().id)}') : geoCatalogName
var vnetName = '${namePrefix}-vnet'
var nsgName = '${namePrefix}-workstation-nsg'
var bastionName = '${namePrefix}-bastion'
var bastionPipName = '${namePrefix}-bastion-pip'
var workstationName = '${namePrefix}-workstation'
var workstationNicName = '${namePrefix}-workstation-nic'
var sampleStorageName = toLower('pcpro${uniqueString(resourceGroup().id)}')
var ingestIdentityName = '${namePrefix}-ingest-identity'
var sampleContainerName = 'sample-assets'
// Container the Aurora storm-impact notebook uploads its weather model outputs to
// (matches UPLOAD_CONTAINER_NAME in the app .env).
var modelOutputsContainerName = 'model-outputs'

// Storage Blob Data Reader — lets the ingestion managed identity read blobs for ingestion.
var storageBlobDataReaderRoleId = '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'

// Storage Blob Data Contributor — lets the workstation identity WRITE Aurora weather
// model outputs to the sample storage account (the storm-impact notebook uploads its
// forecast artifacts to the model-outputs container).
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

// GeoCatalog Administrator — GeoCatalog data-plane role (read/write/delete collections,
// items, and configuration). Granted to the workstation identity so it can seed sample
// data headlessly at deploy time.
var geoCatalogAdminRoleId = 'c9c97b9c-105d-4bb5-a2a7-7d15666c2484'

var networkNeeded = deployWorkstation

// Azure OpenAI (Foundry) agent.
var openAiName = toLower('pcpro-oai-${uniqueString(resourceGroup().id)}')
// Cognitive Services OpenAI User — key-less inference access.
var cognitiveServicesOpenAiUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'

// Aurora managed-compute (Azure ML / Foundry) workspace + GPU endpoint.
var amlSuffix = take(uniqueString(resourceGroup().id), 8)
var amlWorkspaceName = 'pcpro-aml-${amlSuffix}'
var amlStorageName = toLower('pcproaml${take(uniqueString(resourceGroup().id), 12)}')
var amlKeyVaultName = 'pcpro-kv-${amlSuffix}'
var auroraEndpointName = 'aurora-${amlSuffix}'
var auroraDeploymentName = 'aurora'
// The GPU model deployment only runs when a model asset ID is supplied (it needs GPU
// quota + accepted marketplace terms); otherwise just the workspace + endpoint deploy.
var deployAuroraDeployment = deployAuroraModel && !empty(auroraModelAssetId)

// StormLens web app on Azure Static Web Apps.
var staticWebAppName = 'pcpro-stormlens-${amlSuffix}'
// Where setup.ps1 downloads the StormLens static files from (this POC repo's webapp folder).
var webAppBaseUrl = '${artifactsBaseUrl}/webapp'

// ------------------------------------------------------------------------------------
// Core resource: the Planetary Computer Pro GeoCatalog
// ------------------------------------------------------------------------------------

resource geoCatalog 'Microsoft.Orbital/geoCatalogs@2026-04-15' = {
  name: effectiveGeoCatalogName
  location: location
  // Associate the ingestion managed identity so the managed-identity ingestion path
  // (bring-your-own-data) works without a manual portal step.
  identity: deploySampleStorage ? {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${ingestIdentity.id}': {}
    }
  } : null
  properties: {
    tier: geoCatalogTier
  }
}

// ------------------------------------------------------------------------------------
// Optional: sample-data storage + user-assigned managed identity (BYO-data ingestion)
// ------------------------------------------------------------------------------------

resource ingestIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = if (deploySampleStorage) {
  name: ingestIdentityName
  location: location
}

resource sampleStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = if (deploySampleStorage) {
  name: sampleStorageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource sampleBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = if (deploySampleStorage) {
  parent: sampleStorage
  name: 'default'
}

resource sampleContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = if (deploySampleStorage) {
  parent: sampleBlobService
  name: sampleContainerName
  properties: {
    publicAccess: 'None'
  }
}

// Destination container for the Aurora weather-forecast model outputs produced by the
// storm-impact notebook.
resource modelOutputsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = if (deploySampleStorage) {
  parent: sampleBlobService
  name: modelOutputsContainerName
  properties: {
    publicAccess: 'None'
  }
}

// Grant the ingestion identity read access to the sample container so a GeoCatalog
// managed-identity ingestion source can read the assets.
resource blobReaderAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deploySampleStorage) {
  name: guid(sampleStorage.id, ingestIdentityName, storageBlobDataReaderRoleId)
  scope: sampleStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataReaderRoleId)
    principalId: deploySampleStorage ? ingestIdentity.properties.principalId : ''
    principalType: 'ServicePrincipal'
  }
}

// Grant the workstation's system-assigned identity WRITE access to the sample storage
// account so the Aurora storm-impact notebook can upload its weather model outputs to the
// model-outputs container using managed identity (no account keys).
resource workstationBlobContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deploySampleStorage && deployWorkstation) {
  name: guid(sampleStorage.id, workstationName, storageBlobDataContributorRoleId)
  scope: sampleStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: deployWorkstation ? workstation.identity.principalId : ''
    principalType: 'ServicePrincipal'
  }
}

// Grant the workstation's system-assigned identity the GeoCatalog Administrator data-plane
// role so setup.ps1 can create a collection and ingest sample imagery headlessly.
resource geoCatalogSeederRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployWorkstation && seedSampleData) {
  name: guid(geoCatalog.id, workstationName, geoCatalogAdminRoleId)
  scope: geoCatalog
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', geoCatalogAdminRoleId)
    principalId: deployWorkstation ? workstation.identity.principalId : ''
    principalType: 'ServicePrincipal'
  }
}

// ------------------------------------------------------------------------------------
// Optional: network-isolated analytics workstation (RDP only, via Azure Bastion)
// ------------------------------------------------------------------------------------

resource nsg 'Microsoft.Network/networkSecurityGroups@2023-11-01' = if (networkNeeded) {
  name: nsgName
  location: location
  properties: {
    // No inbound rules: the workstation is reachable only through Azure Bastion.
    securityRules: []
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = if (networkNeeded) {
  name: vnetName
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.20.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'workstation-subnet'
        properties: {
          addressPrefix: '10.20.1.0/24'
          networkSecurityGroup: {
            id: nsg.id
          }
        }
      }
      {
        name: 'AzureBastionSubnet'
        properties: {
          addressPrefix: '10.20.2.0/26'
        }
      }
    ]
  }
}

resource bastionPip 'Microsoft.Network/publicIPAddresses@2023-11-01' = if (networkNeeded) {
  name: bastionPipName
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource bastion 'Microsoft.Network/bastionHosts@2023-11-01' = if (networkNeeded) {
  name: bastionName
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    enableTunneling: true
    ipConfigurations: [
      {
        name: 'bastion-ipconfig'
        properties: {
          subnet: {
            id: networkNeeded ? '${vnet.id}/subnets/AzureBastionSubnet' : ''
          }
          publicIPAddress: {
            id: bastionPip.id
          }
        }
      }
    ]
  }
}

resource workstationNic 'Microsoft.Network/networkInterfaces@2023-11-01' = if (deployWorkstation) {
  name: workstationNicName
  location: location
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          privateIPAllocationMethod: 'Dynamic'
          subnet: {
            id: networkNeeded ? '${vnet.id}/subnets/workstation-subnet' : ''
          }
        }
      }
    ]
  }
}

resource workstation 'Microsoft.Compute/virtualMachines@2023-09-01' = if (deployWorkstation) {
  name: workstationName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    hardwareProfile: {
      vmSize: vmSize
    }
    osProfile: {
      computerName: 'pcpro-ws'
      adminUsername: adminUsername
      adminPassword: adminPassword
    }
    storageProfile: {
      imageReference: {
        publisher: 'MicrosoftWindowsServer'
        offer: 'WindowsServer'
        sku: '2022-datacenter-azure-edition'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: 'Premium_LRS'
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: workstationNic.id
        }
      ]
    }
  }
}

// Provision the workstation software (VS Code + Python + Azure CLI + sample script).
resource workstationSetup 'Microsoft.Compute/virtualMachines/runCommands@2023-09-01' = if (deployWorkstation) {
  parent: workstation
  name: 'provision-workstation'
  location: location
  properties: {
    source: {
      scriptUri: '${artifactsBaseUrl}/setup.ps1'
    }
    parameters: [
      {
        name: 'GeoCatalogName'
        value: effectiveGeoCatalogName
      }
      {
        name: 'GeoCatalogRegion'
        value: location
      }
      {
        name: 'GeoCatalogUri'
        value: geoCatalog.properties.catalogUri
      }
      {
        name: 'RepoUrl'
        value: officialRepoUrl
      }
      {
        name: 'SampleContainerUrl'
        value: deploySampleStorage ? '${sampleStorage.properties.primaryEndpoints.blob}${sampleContainerName}' : ''
      }
      {
        name: 'UploadContainerUrl'
        value: deploySampleStorage ? '${sampleStorage.properties.primaryEndpoints.blob}${modelOutputsContainerName}' : ''
      }
      {
        name: 'IngestIdentityObjectId'
        value: deploySampleStorage ? ingestIdentity.properties.principalId : ''
      }
      {
        name: 'FoundryEndpoint'
        value: deployAiAgent ? openAi.properties.endpoint : ''
      }
      {
        name: 'FoundryDeployment'
        value: deployAiAgent ? openAiDeploymentName : ''
      }
      {
        name: 'AuroraEndpoint'
        value: deployAuroraModel ? auroraEndpoint.properties.scoringUri : ''
      }
      {
        name: 'SeedSampleData'
        value: string(deployWorkstation && seedSampleData)
      }
      {
        name: 'DeployWebApp'
        value: string(deployWebApp)
      }
      {
        name: 'WebAppBaseUrl'
        value: deployWebApp ? webAppBaseUrl : ''
      }
      {
        name: 'WebAppUrl'
        value: deployWebApp ? 'https://${staticWebApp.properties.defaultHostname}' : ''
      }
    ]
    protectedParameters: [
      {
        name: 'SwaDeploymentToken'
        value: deployWebApp ? staticWebApp.listSecrets().properties.apiKey : ''
      }
    ]
    timeoutInSeconds: 3600
  }
  dependsOn: [
    geoCatalogSeederRole
    workstationBlobContributorRole
  ]
}

// ------------------------------------------------------------------------------------
// Optional: Azure OpenAI (Microsoft Foundry) — agentic / reasoning GeoAI scenarios
// ------------------------------------------------------------------------------------

resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' = if (deployAiAgent) {
  name: openAiName
  location: location
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: openAiName
    publicNetworkAccess: 'Enabled'
  }
}

resource openAiDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = if (deployAiAgent) {
  parent: openAi
  name: openAiDeploymentName
  sku: {
    name: openAiSkuName
    capacity: openAiCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: openAiModelName
      version: openAiModelVersion
    }
    versionUpgradeOption: 'NoAutoUpgrade'
  }
}

// Grant the workstation's managed identity key-less access to Azure OpenAI.
resource openAiWorkstationRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployAiAgent && deployWorkstation) {
  name: guid(openAi.id, workstationName, cognitiveServicesOpenAiUserRoleId)
  scope: openAi
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAiUserRoleId)
    principalId: deployWorkstation ? workstation.identity.principalId : ''
    principalType: 'ServicePrincipal'
  }
}

// Grant the interactive deployer the same role so they can call Foundry with their sign-in.
resource openAiDeployerRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployAiAgent) {
  name: guid(openAi.id, deployer().objectId, cognitiveServicesOpenAiUserRoleId)
  scope: openAi
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAiUserRoleId)
    principalId: deployer().objectId
  }
}

// ------------------------------------------------------------------------------------
// Optional: Microsoft Aurora weather model on a Foundry (Azure ML) managed-compute GPU
// endpoint. The workspace + endpoint always deploy with this component; the GPU model
// deployment only runs when an Aurora model asset ID is supplied (it needs GPU quota +
// accepted marketplace terms).
// ------------------------------------------------------------------------------------

resource amlStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = if (deployAuroraModel) {
  name: amlStorageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource amlKeyVault 'Microsoft.KeyVault/vaults@2023-07-01' = if (deployAuroraModel) {
  name: amlKeyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    accessPolicies: []
  }
}

resource amlWorkspace 'Microsoft.MachineLearningServices/workspaces@2023-10-01' = if (deployAuroraModel) {
  name: amlWorkspaceName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    friendlyName: amlWorkspaceName
    storageAccount: amlStorage.id
    keyVault: amlKeyVault.id
  }
}

resource auroraEndpoint 'Microsoft.MachineLearningServices/workspaces/onlineEndpoints@2023-10-01' = if (deployAuroraModel) {
  parent: amlWorkspace
  name: auroraEndpointName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    authMode: 'Key'
  }
}

resource auroraDeployment 'Microsoft.MachineLearningServices/workspaces/onlineEndpoints/deployments@2023-10-01' = if (deployAuroraDeployment) {
  parent: auroraEndpoint
  name: auroraDeploymentName
  location: location
  sku: {
    name: 'Default'
    capacity: 1
  }
  properties: {
    endpointComputeType: 'Managed'
    model: auroraModelAssetId
    instanceType: auroraInstanceType
  }
}

// ------------------------------------------------------------------------------------
// Optional: StormLens web app on Azure Static Web Apps. The resource is created empty;
// setup.ps1 publishes the static files with the deployment token (passed as a protected
// run-command parameter) so the workstation never needs RBAC on this resource.
// ------------------------------------------------------------------------------------
resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = if (deployWebApp) {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Enabled'
  }
}

// ------------------------------------------------------------------------------------
// Outputs
// ------------------------------------------------------------------------------------
output geoCatalogResourceId string = geoCatalog.id
@description('The GeoCatalog URI (catalogUri), including the platform-assigned domain hash. Use as GEOCATALOG_URL for the ingest script and Explorer.')
output geoCatalogUri string = geoCatalog.properties.catalogUri
@description('Open the GeoCatalog in the portal and copy the GeoCatalog URI from the Overview blade; use it as GEOCATALOG_URL for the ingest script and Explorer.')
output geoCatalogPortalHint string = 'Portal → ${effectiveGeoCatalogName} → Overview → GeoCatalog URI'
output workstationName string = deployWorkstation ? workstationName : 'not-deployed'
output bastionName string = networkNeeded ? bastionName : 'not-deployed'
output sampleStorageAccount string = deploySampleStorage ? sampleStorageName : 'not-deployed'
output sampleContainer string = deploySampleStorage ? sampleContainerName : 'not-deployed'
output sampleContainerUrl string = deploySampleStorage ? '${sampleStorage.properties.primaryEndpoints.blob}${sampleContainerName}' : 'not-deployed'
output aiAgentEndpoint string = deployAiAgent ? openAi.properties.endpoint : 'not-deployed'
output aiAgentDeployment string = deployAiAgent ? openAiDeploymentName : 'not-deployed'
output auroraWorkspace string = deployAuroraModel ? amlWorkspaceName : 'not-deployed'
output auroraEndpoint string = deployAuroraModel ? auroraEndpointName : 'not-deployed'
output auroraModelDeployed bool = deployAuroraDeployment
output ingestIdentityClientId string = deploySampleStorage ? ingestIdentity.properties.clientId : 'not-deployed'
output ingestIdentityObjectId string = deploySampleStorage ? ingestIdentity.properties.principalId : 'not-deployed'
output webAppUrl string = deployWebApp ? 'https://${staticWebApp.properties.defaultHostname}' : 'not-deployed'
