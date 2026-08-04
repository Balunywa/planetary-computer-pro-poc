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

@description('Administrator username for the workstation VM.')
param adminUsername string = 'azureuser'

@description('Administrator password for the workstation VM (used for RDP over the Azure Bastion tunnel). Leave empty when not deploying the workstation.')
@secure()
param adminPassword string = ''

@description('Size of the workstation VM.')
param vmSize string = 'Standard_D4s_v3'

@description('Base URL (raw) that hosts setup.ps1 and ingest_sample.py. Point this at your fork if you change the scripts.')
param artifactsBaseUrl string = 'https://raw.githubusercontent.com/Balunywa/planetary-computer-pro-poc/main/deploy/azure'

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

// Storage Blob Data Reader — lets the ingestion managed identity read blobs for ingestion.
var storageBlobDataReaderRoleId = '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'

var networkNeeded = deployWorkstation

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
        name: 'ArtifactsBaseUrl'
        value: artifactsBaseUrl
      }
      {
        name: 'SampleContainerUrl'
        value: deploySampleStorage ? '${sampleStorage.properties.primaryEndpoints.blob}${sampleContainerName}' : ''
      }
      {
        name: 'IngestIdentityObjectId'
        value: deploySampleStorage ? ingestIdentity.properties.principalId : ''
      }
    ]
    timeoutInSeconds: 1200
  }
}

// ------------------------------------------------------------------------------------
// Outputs
// ------------------------------------------------------------------------------------

output geoCatalogName string = effectiveGeoCatalogName
output geoCatalogResourceId string = geoCatalog.id
@description('Open the GeoCatalog in the portal and copy the GeoCatalog URI from the Overview blade; use it as GEOCATALOG_URL for the ingest script and Explorer.')
output geoCatalogPortalHint string = 'Portal → ${effectiveGeoCatalogName} → Overview → GeoCatalog URI'
output workstationName string = deployWorkstation ? workstationName : 'not-deployed'
output bastionName string = networkNeeded ? bastionName : 'not-deployed'
output sampleStorageAccount string = deploySampleStorage ? sampleStorageName : 'not-deployed'
output sampleContainer string = deploySampleStorage ? sampleContainerName : 'not-deployed'
output sampleContainerUrl string = deploySampleStorage ? '${sampleStorage.properties.primaryEndpoints.blob}${sampleContainerName}' : 'not-deployed'
output ingestIdentityClientId string = deploySampleStorage ? ingestIdentity.properties.clientId : 'not-deployed'
output ingestIdentityObjectId string = deploySampleStorage ? ingestIdentity.properties.principalId : 'not-deployed'
