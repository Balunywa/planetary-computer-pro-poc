// StormLens runtime configuration.
// This file is overwritten at deploy time (by setup.ps1 on the workstation, and/or by the
// Static Web Apps deployment) with the real GeoCatalog URL and Entra app-registration IDs.
// It is intentionally NOT a build artifact so the same static files run locally and on SWA.
window.STORMLENS_CONFIG = {
  // The GeoCatalog data-plane URL (its real catalogUri, incl. the platform hash).
  geoCatalogUrl: "",
  // GeoCatalog STAC API version.
  apiVersion: "2025-04-30-preview",
  // Microsoft Entra ID app registration used for MSAL sign-in from the browser (SPA).
  entra: {
    tenantId: "",
    clientId: ""
  },
  // Optional: the collection the Explorer selects by default.
  defaultCollectionId: "sentinel-2-l2a-sample"
};
