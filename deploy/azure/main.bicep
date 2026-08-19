// =====================================================================================
// Microsoft Planetary Computer Pro — Rapid POC
// Provisions a GeoCatalog and (optionally) a web app (Azure App Service, Node), sample-
// data storage, an Azure OpenAI (Foundry) agent, and the Aurora weather model so you can
// prove the end-to-end ingest → configure → visualize flow.
// =====================================================================================

targetScope = 'resourceGroup'

// The Microsoft Graph Bicep extension lets this template create the Entra app
// registration the web app signs in with, using the credentials of whoever runs
// the deployment. See bicepconfig.json for the extension version pin.
extension microsoftGraphV1

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

@description('Deploy a sample-data storage account and a user-assigned managed identity for the managed-identity ingestion path (bring-your-own-data scenario).')
param deploySampleStorage bool = true

@description('Deploy the web app on an Azure App Service (Linux, Node). The site is created configured for Node; application code is published separately (CI/CD or `az webapp up`) and its managed identity is granted the GeoCatalog / storage / Foundry data-plane roles.')
param deployWebApp bool = true

@description('App Service plan SKU for the web app (e.g. F1, B1, P0v3, P1v3).')
param appServiceSku string = 'B1'

@description('Microsoft Entra SPA app registration (client) ID the web app uses for MSAL sign-in. This is a public identifier, not a secret. Leave blank to have the deployment register the app automatically (see autoRegisterEntraApp).')
param entraClientId string = ''

@description('Microsoft Entra tenant (directory) ID for sign-in. This is a public identifier, not a secret. Leave blank to use the tenant the deployment runs in.')
param entraTenantId string = ''

@description('Automatically register the Microsoft Entra SPA app the web app signs in with, wiring its client ID into the site. Requires the person running the deployment to have rights to create app registrations (Application Administrator or Application.ReadWrite.All). Turn off to supply entraClientId yourself.')
param autoRegisterEntraApp bool = true

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
var appServicePlanName = '${namePrefix}-plan-${amlSuffix}'
var webAppName = 'pcpro-web-${amlSuffix}'
// Default App Service hostname. Used for the Entra SPA redirect URIs so the app
// registration does not depend on the web app resource (avoids a dependency
// cycle with the app settings that consume the registration's client ID).
var webAppHost = '${webAppName}.azurewebsites.net'
// Decide whether the template registers the Entra app itself.
var registerEntraApp = deployWebApp && autoRegisterEntraApp
// The client/tenant the web app actually signs in with: the auto-registered app
// when enabled, otherwise the values supplied as parameters.
var effectiveEntraClientId = registerEntraApp ? entraApp.appId : entraClientId
var effectiveEntraTenantId = empty(entraTenantId) ? tenant().tenantId : entraTenantId
var sampleStorageName = toLower('pcpro${uniqueString(resourceGroup().id)}')
var ingestIdentityName = '${namePrefix}-ingest-identity'
var sampleContainerName = 'sample-assets'
// Container the Aurora storm-impact notebook uploads its weather model outputs to
// (matches UPLOAD_CONTAINER_NAME in the app .env).
var modelOutputsContainerName = 'model-outputs'

// Storage Blob Data Reader — lets the ingestion managed identity read blobs for ingestion.
var storageBlobDataReaderRoleId = '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'

// Storage Blob Data Contributor — lets the web app's managed identity WRITE Aurora
// weather model outputs to the sample storage account (the storm-impact workflow uploads
// its forecast artifacts to the model-outputs container).
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

// GeoCatalog Administrator — GeoCatalog data-plane role (read/write/delete collections,
// items, and configuration). Granted to the web app's managed identity so the backend
// API routes can create collections and ingest items.
var geoCatalogAdminRoleId = 'c9c97b9c-105d-4bb5-a2a7-7d15666c2484'

// Azure OpenAI (Foundry) agent.
var openAiName = toLower('pcpro-oai-${uniqueString(resourceGroup().id)}')
// Cognitive Services OpenAI User — key-less inference access.
var cognitiveServicesOpenAiUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'

// Aurora managed-compute (Azure ML / Foundry) workspace + GPU endpoint.
var amlSuffix = take(uniqueString(resourceGroup().id), 8)
var amlWorkspaceName = 'pcpro-aml-${amlSuffix}'
var amlStorageName = toLower('pcproaml${take(uniqueString(resourceGroup().id), 12)}')
var amlKeyVaultName = 'pcpro-kv-${amlSuffix}'
var amlApplicationInsightsName = 'pcpro-ai-${amlSuffix}'
var auroraEndpointName = 'aurora-${amlSuffix}'
var auroraDeploymentName = 'aurora'
// The GPU model deployment only runs when a model asset ID is supplied (it needs GPU
// quota + accepted marketplace terms); otherwise just the workspace + endpoint deploy.
var deployAuroraDeployment = deployAuroraModel && !empty(auroraModelAssetId)

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

// Grant the web app's managed identity WRITE access to the sample storage account so the
// backend API routes can upload Aurora weather-model outputs to the model-outputs
// container using managed identity (no account keys).
resource appBlobContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deploySampleStorage && deployWebApp) {
  name: guid(sampleStorage.id, webAppName, storageBlobDataContributorRoleId)
  scope: sampleStorage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: deployWebApp ? webApp.identity.principalId : ''
    principalType: 'ServicePrincipal'
  }
}

// Grant the web app's managed identity the GeoCatalog Administrator data-plane role so the
// backend API routes can create collections and ingest items on behalf of the app.
resource appGeoCatalogAdminRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployWebApp) {
  name: guid(geoCatalog.id, webAppName, geoCatalogAdminRoleId)
  scope: geoCatalog
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', geoCatalogAdminRoleId)
    principalId: deployWebApp ? webApp.identity.principalId : ''
    principalType: 'ServicePrincipal'
  }
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

// Grant the web app's managed identity key-less access to Azure OpenAI (Foundry).
resource openAiWebAppRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployAiAgent && deployWebApp) {
  name: guid(openAi.id, webAppName, cognitiveServicesOpenAiUserRoleId)
  scope: openAi
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAiUserRoleId)
    principalId: deployWebApp ? webApp.identity.principalId : ''
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

resource amlApplicationInsights 'Microsoft.Insights/components@2020-02-02' = if (deployAuroraModel) {
  name: amlApplicationInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
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
    applicationInsights: amlApplicationInsights.id
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
// Microsoft Entra app registration for MSAL sign-in.
// Created with the Microsoft Graph Bicep extension, which runs as the identity that
// launches the deployment — so anyone with rights to register apps (Application
// Administrator / Application.ReadWrite.All) gets a working sign-in with no manual
// portal step. It is a single-tenant SPA whose only redirect URIs are the web app's
// default hostname; MSAL requests just openid/profile/email (delegated, no admin
// consent). The client ID flows into the ENTRA_CLIENT_ID app setting below.
// ------------------------------------------------------------------------------------
resource entraApp 'Microsoft.Graph/applications@v1.0' = if (registerEntraApp) {
  uniqueName: 'pcpro-web-${amlSuffix}'
  displayName: 'Planetary Computer Pro Ops (${amlSuffix})'
  signInAudience: 'AzureADMyOrg'
  spa: {
    redirectUris: [
      'https://${webAppHost}/auth/callback'
    ]
  }
  web: {
    logoutUrl: 'https://${webAppHost}/'
  }
}

// Service principal (enterprise app) in this tenant so users can consent and sign in.
resource entraAppSp 'Microsoft.Graph/servicePrincipals@v1.0' = if (registerEntraApp) {
  appId: entraApp.appId
}

// ------------------------------------------------------------------------------------
// Web app: Azure App Service (Linux, Node) hosting the Planetary Computer Pro web app.
// The site is created configured for Node 22; application code is published separately
// (CI/CD or `az webapp up`), which Oryx builds (npm install + npm run build) and starts
// with `node server.mjs`. The site's system-assigned managed identity is granted the
// GeoCatalog / storage / Foundry data-plane roles above so the backend API routes call
// your Azure services with managed identity (no keys).
// ------------------------------------------------------------------------------------
resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = if (deployWebApp) {
  name: appServicePlanName
  location: location
  kind: 'linux'
  sku: {
    name: appServiceSku
  }
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = if (deployWebApp) {
  name: webAppName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'node server.mjs'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      appSettings: [
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'true'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22'
        }
        {
          name: 'GEOCATALOG_URI'
          value: geoCatalog.properties.catalogUri
        }
        {
          name: 'GEOCATALOG_API_VERSION'
          value: '2025-04-30-preview'
        }
        {
          name: 'ENTRA_TENANT_ID'
          value: effectiveEntraTenantId
        }
        {
          name: 'ENTRA_CLIENT_ID'
          value: effectiveEntraClientId
        }
        {
          name: 'FOUNDRY_ENDPOINT'
          value: deployAiAgent ? openAi.properties.endpoint : ''
        }
        {
          name: 'FOUNDRY_DEPLOYMENT'
          value: deployAiAgent ? openAiDeploymentName : ''
        }
        {
          name: 'AURORA_ENDPOINT'
          value: deployAuroraModel ? auroraEndpoint.properties.scoringUri : ''
        }
        {
          name: 'SAMPLE_CONTAINER_URL'
          value: deploySampleStorage ? '${sampleStorage.properties.primaryEndpoints.blob}${sampleContainerName}' : ''
        }
        {
          name: 'UPLOAD_CONTAINER_URL'
          value: deploySampleStorage ? '${sampleStorage.properties.primaryEndpoints.blob}${modelOutputsContainerName}' : ''
        }
        {
          name: 'UPLOAD_CONTAINER_NAME'
          value: modelOutputsContainerName
        }
      ]
    }
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
output webAppName string = deployWebApp ? webAppName : 'not-deployed'
@description('Public URL of the web app. Deploy application code with `az webapp up` (or CI/CD) from the webapp/ folder; Oryx runs npm install + npm run build and starts `node server.mjs`.')
output webAppUrl string = deployWebApp ? 'https://${webApp.properties.defaultHostName}' : 'not-deployed'
@description('Entra client (application) ID the web app signs in with — either the auto-registered app or the entraClientId parameter.')
output entraClientId string = deployWebApp ? effectiveEntraClientId : 'not-deployed'
@description('Entra tenant (directory) ID the web app signs in with.')
output entraTenantId string = effectiveEntraTenantId
@description('Whether the deployment registered the Entra app automatically. When false, set entraClientId (and grant the SPA redirect URI below) yourself.')
output entraAppAutoRegistered bool = registerEntraApp
@description('SPA redirect URI the Entra app must trust. Auto-registered when entraAppAutoRegistered is true; add it manually otherwise.')
output entraRedirectUri string = deployWebApp ? 'https://${webAppHost}/auth/callback' : 'not-deployed'
