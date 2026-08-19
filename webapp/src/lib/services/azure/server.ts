// Server-only Azure integration. Everything in this module runs inside the SSR
// server function boundary, so @tanstack/react-start strips it (and the Managed
// Identity token calls, process.env access and Azure endpoints) from the browser
// bundle. The client reaches these only through the exported server functions.

import { createServerFn } from "@tanstack/react-start";

import type { CopilotAnswer, GeospatialLayer, ThresholdRule } from "@/lib/domain/types";

// Data-plane audiences for Managed Identity tokens.
const GEOCATALOG_RESOURCE = "https://geocatalog.spatio.azure.com";
const COGNITIVE_RESOURCE = "https://cognitiveservices.azure.com";
const STORAGE_RESOURCE = "https://storage.azure.com";
const DEFAULT_GEOCATALOG_API_VERSION = "2026-04-15";

// Public Microsoft Planetary Computer (open catalog) — used only as a source of
// public sample imagery to pre-seed an empty tenant GeoCatalog. No auth needed to
// search; asset hrefs are public blob URLs.
const PUBLIC_PC_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1";

function geoCatalogApiUrl(baseUrl: string, path: string): string {
  const url = new URL(path, `${baseUrl.replace(/\/$/, "")}/`);
  url.searchParams.set(
    "api-version",
    process.env["GEOCATALOG_API_VERSION"] || DEFAULT_GEOCATALOG_API_VERSION,
  );
  return url.toString();
}

/**
 * Acquire a Managed Identity access token for a resource. On Azure App Service
 * (and Container Apps) the platform injects IDENTITY_ENDPOINT / IDENTITY_HEADER;
 * we fall back to the IMDS endpoint for VMs. No SDK, no secrets — the identity is
 * the site's system-assigned managed identity, granted data-plane roles in
 * main.bicep.
 */
async function getManagedIdentityToken(resource: string): Promise<string | null> {
  const endpoint = process.env["IDENTITY_ENDPOINT"];
  const header = process.env["IDENTITY_HEADER"];
  try {
    if (endpoint && header) {
      const url = `${endpoint}?resource=${encodeURIComponent(resource)}&api-version=2019-08-01`;
      const res = await fetch(url, { headers: { "X-IDENTITY-HEADER": header } });
      if (!res.ok) return null;
      const json = (await res.json()) as { access_token?: string };
      return json.access_token ?? null;
    }
    const imds = `http://169.254.169.254/metadata/identity/oauth2/token?resource=${encodeURIComponent(resource)}&api-version=2018-02-01`;
    const res = await fetch(imds, { headers: { Metadata: "true" } });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Browse the tenant's GeoCatalog STAC collections and present them as operator-
 * facing geospatial layers. Returns [] when the catalog is empty or unreachable
 * — never synthetic layers.
 */
export const listStacLayers = createServerFn({ method: "GET" }).handler(
  async (): Promise<GeospatialLayer[]> => {
    const geoCatalogUrl = process.env["GEOCATALOG_URI"];
    if (!geoCatalogUrl) return [];

    const token = await getManagedIdentityToken(GEOCATALOG_RESOURCE);
    if (!token) return [];

    try {
      const res = await fetch(geoCatalogApiUrl(geoCatalogUrl, "stac/collections"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const body = (await res.json()) as {
        collections?: Array<{ id: string; title?: string; description?: string }>;
      };
      return (body.collections ?? []).map((c) => ({
        id: c.id,
        name: c.title || c.id,
        description: c.description || "STAC collection",
        updatedLabel: "From your GeoCatalog",
        defaultOn: false,
      }));
    } catch {
      return [];
    }
  },
);

/**
 * Grounded operations assistant backed by Azure OpenAI (Foundry). When the
 * endpoint is not configured it returns an honest "not configured" answer rather
 * than a canned demo response.
 */
export const askFoundryCopilot = createServerFn({ method: "POST" })
  .validator((data: { question: string }) => data)
  .handler(async ({ data }): Promise<CopilotAnswer> => {
    const endpoint = process.env["FOUNDRY_ENDPOINT"];
    const deployment = process.env["FOUNDRY_DEPLOYMENT"];
    if (!endpoint || !deployment) {
      return {
        text: "The AI assistant is not configured for this deployment. Set FOUNDRY_ENDPOINT and FOUNDRY_DEPLOYMENT to enable grounded answers from your Azure OpenAI (Foundry) resource.",
        citations: [],
        highlightAssetIds: [],
      };
    }

    const token = await getManagedIdentityToken(COGNITIVE_RESOURCE);
    if (!token) {
      return {
        text: "Could not acquire a managed-identity token for the AI resource. Confirm the App Service identity has the Cognitive Services OpenAI User role.",
        citations: [],
        highlightAssetIds: [],
      };
    }

    try {
      const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=2024-06-01`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You are an operations assistant for weather and asset risk in energy infrastructure. Answer concisely and only from the tenant's data.",
            },
            { role: "user", content: data.question },
          ],
          temperature: 0.2,
        }),
      });
      if (!res.ok) {
        return {
          text: `The assistant request failed (${res.status}).`,
          citations: [],
          highlightAssetIds: [],
        };
      }
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = body.choices?.[0]?.message?.content?.trim();
      return { text: text || "No answer was returned.", citations: [], highlightAssetIds: [] };
    } catch {
      return {
        text: "The assistant is currently unavailable.",
        citations: [],
        highlightAssetIds: [],
      };
    }
  });

// ---------------------------------------------------------------------------
// Data onboarding: upload to storage + pre-seed the GeoCatalog.
// These power the in-app "add data" flow so a fresh deployment is self-contained
// (no portal or CLI needed). Every call uses the App Service managed identity and
// the data-plane roles granted in main.bicep — no keys, no SAS in the browser.
// ---------------------------------------------------------------------------

export type DataPlaneStatus = {
  /** GeoCatalog data-plane URL is wired (real tenant deployment). */
  geoCatalogConfigured: boolean;
  /** Sample-data storage container is wired for uploads. */
  uploadConfigured: boolean;
};

/** Report which onboarding capabilities the current deployment has wired. */
export const getDataPlaneStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<DataPlaneStatus> => ({
    geoCatalogConfigured: Boolean(process.env["GEOCATALOG_URI"]),
    uploadConfigured: Boolean(process.env["SAMPLE_CONTAINER_URL"]),
  }),
);

export type UploadResult = { ok: boolean; message: string; blobUrl?: string };

/**
 * Upload a file to the tenant's sample-assets container using the App Service
 * managed identity (Storage Blob Data Contributor, granted in main.bicep). The
 * browser sends base64 through the server-function boundary; no account key or
 * SAS ever reaches the client.
 */
export const uploadAsset = createServerFn({ method: "POST" })
  .validator((data: { name: string; contentBase64: string; contentType?: string }) => data)
  .handler(async ({ data }): Promise<UploadResult> => {
    const containerUrl = process.env["SAMPLE_CONTAINER_URL"];
    if (!containerUrl) {
      return {
        ok: false,
        message: "Storage is not configured for this deployment (SAMPLE_CONTAINER_URL is unset).",
      };
    }
    const token = await getManagedIdentityToken(STORAGE_RESOURCE);
    if (!token) {
      return {
        ok: false,
        message:
          "Could not acquire a managed-identity token for storage. Confirm the App Service identity has Storage Blob Data Contributor.",
      };
    }
    // Flatten to a safe blob name — no paths, no odd characters.
    const safeName = (data.name.split(/[\\/]/).pop() || "upload.bin").replace(/[^\w.-]/g, "_");
    const bytes = Buffer.from(data.contentBase64, "base64");
    if (bytes.length === 0) return { ok: false, message: "The file is empty." };
    const blobUrl = `${containerUrl.replace(/\/$/, "")}/${encodeURIComponent(safeName)}`;
    try {
      const res = await fetch(blobUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-ms-blob-type": "BlockBlob",
          "x-ms-version": "2021-08-06",
          "Content-Type": data.contentType || "application/octet-stream",
        },
        body: bytes,
      });
      if (!res.ok) {
        return { ok: false, message: `Upload failed (${res.status} ${res.statusText}).` };
      }
      return { ok: true, message: `Uploaded ${safeName}.`, blobUrl };
    } catch {
      return { ok: false, message: "Upload failed: could not reach the storage account." };
    }
  });

export type SeedResult = { ok: boolean; message: string; collectionId?: string; ingested?: number };

/**
 * Pre-seed the tenant GeoCatalog with a small public sample so a fresh
 * deployment isn't empty: pull a few low-cloud Sentinel-2 scenes over the Gulf
 * of Mexico from the open Planetary Computer, create a collection in the tenant
 * catalog, and ingest the items via the STAC transaction API (GeoCatalog
 * Administrator, granted in main.bicep). Public imagery only — never customer data.
 */
export const seedPublicSample = createServerFn({ method: "POST" }).handler(
  async (): Promise<SeedResult> => {
    const geoCatalogUrl = process.env["GEOCATALOG_URI"];
    if (!geoCatalogUrl) {
      return {
        ok: false,
        message: "GeoCatalog is not configured for this deployment (GEOCATALOG_URI is unset).",
      };
    }
    const token = await getManagedIdentityToken(GEOCATALOG_RESOURCE);
    if (!token) {
      return {
        ok: false,
        message:
          "Could not acquire a managed-identity token for the GeoCatalog. Confirm the App Service identity has GeoCatalog Administrator.",
      };
    }
    const base = geoCatalogUrl.replace(/\/$/, "");
    const collectionId = "sample-sentinel-2-gom";
    const authJson = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // 1. Query the public catalog for a few recent, low-cloud scenes.
    let items: Array<Record<string, unknown>> = [];
    try {
      const searchRes = await fetch(`${PUBLIC_PC_STAC}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collections: ["sentinel-2-l2a"],
          bbox: [-95, 27, -89, 30.5],
          limit: 3,
          query: { "eo:cloud_cover": { lt: 15 } },
        }),
      });
      if (!searchRes.ok) {
        return {
          ok: false,
          message: `Could not query the public Planetary Computer (${searchRes.status}).`,
        };
      }
      const fc = (await searchRes.json()) as { features?: Array<Record<string, unknown>> };
      items = fc.features ?? [];
    } catch {
      return {
        ok: false,
        message: "Could not reach the public Planetary Computer to fetch sample imagery.",
      };
    }
    if (items.length === 0) {
      return { ok: false, message: "No public sample scenes were returned for the sample area." };
    }

    // 2. Create the collection in the tenant catalog (ignore 409 if it exists).
    const collection = {
      type: "Collection",
      id: collectionId,
      stac_version: "1.0.0",
      title: "Sample: Sentinel-2 over the Gulf of Mexico",
      description:
        "Public Sentinel-2 L2A sample imagery from the open Planetary Computer, pre-seeded so the catalog is not empty. Replace with your own collections.",
      license: "proprietary",
      extent: {
        spatial: { bbox: [[-95, 27, -89, 30.5]] },
        temporal: { interval: [[null, null]] },
      },
      links: [],
    };
    try {
      const cRes = await fetch(geoCatalogApiUrl(base, "stac/collections"), {
        method: "POST",
        headers: authJson,
        body: JSON.stringify(collection),
      });
      if (!cRes.ok && cRes.status !== 409) {
        const detail = await cRes.text();
        return {
          ok: false,
          message: `Could not create the sample collection (${cRes.status}). ${detail.slice(0, 200)}`,
        };
      }
    } catch {
      return {
        ok: false,
        message: "Could not reach the GeoCatalog to create the sample collection.",
      };
    }

    // 3. Ingest the items, re-homing them onto the new collection.
    let ingested = 0;
    for (const item of items) {
      item["collection"] = collectionId;
      delete item["links"];
      try {
        const iRes = await fetch(geoCatalogApiUrl(base, `stac/collections/${collectionId}/items`), {
          method: "POST",
          headers: authJson,
          body: JSON.stringify(item),
        });
        if (iRes.ok || iRes.status === 409) ingested++;
      } catch {
        // Skip an item that fails to ingest; report the count we managed.
      }
    }
    if (ingested === 0) {
      return {
        ok: false,
        message: "The sample collection was created but no items could be ingested.",
      };
    }
    return {
      ok: true,
      message: `Seeded ${ingested} sample scene${ingested === 1 ? "" : "s"} into "${collectionId}".`,
      collectionId,
      ingested,
    };
  },
);

// ---------------------------------------------------------------------------
// Threshold-rule persistence.
// Operator-tuned thresholds are stored as a single JSON blob in the deployment's
// storage container (same managed-identity path as uploadAsset). This survives
// restarts so a customer's tuned limits are durable. When storage is not wired
// (local dev) load returns null and the app falls back to the built-in defaults.
// ---------------------------------------------------------------------------

const THRESHOLD_BLOB_NAME = "app-config.threshold-rules.json";

function thresholdBlobUrl(containerUrl: string): string {
  return `${containerUrl.replace(/\/$/, "")}/${THRESHOLD_BLOB_NAME}`;
}

/** Load persisted threshold rules, or null when none are stored / storage unwired. */
export const loadThresholdRules = createServerFn({ method: "GET" }).handler(
  async (): Promise<ThresholdRule[] | null> => {
    const containerUrl = process.env["SAMPLE_CONTAINER_URL"];
    if (!containerUrl) return null;
    const token = await getManagedIdentityToken(STORAGE_RESOURCE);
    if (!token) return null;
    try {
      const res = await fetch(thresholdBlobUrl(containerUrl), {
        headers: { Authorization: `Bearer ${token}`, "x-ms-version": "2021-08-06" },
      });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      const rules = (await res.json()) as ThresholdRule[];
      return Array.isArray(rules) ? rules : null;
    } catch {
      return null;
    }
  },
);

export type SaveRulesResult = { ok: boolean; persisted: boolean; message: string };

/**
 * Persist the full threshold-rule set to storage. Returns persisted:false (not an
 * error) when storage is unwired, so the caller keeps working in-memory locally.
 */
export const saveThresholdRules = createServerFn({ method: "POST" })
  .validator((data: { rules: ThresholdRule[] }) => data)
  .handler(async ({ data }): Promise<SaveRulesResult> => {
    const containerUrl = process.env["SAMPLE_CONTAINER_URL"];
    if (!containerUrl) {
      return {
        ok: true,
        persisted: false,
        message: "Storage not configured; rules kept in memory for this session.",
      };
    }
    const token = await getManagedIdentityToken(STORAGE_RESOURCE);
    if (!token) {
      return {
        ok: false,
        persisted: false,
        message: "Could not acquire a managed-identity token for storage.",
      };
    }
    const body = Buffer.from(JSON.stringify(data.rules), "utf8");
    try {
      const res = await fetch(thresholdBlobUrl(containerUrl), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "x-ms-blob-type": "BlockBlob",
          "x-ms-version": "2021-08-06",
          "Content-Type": "application/json",
        },
        body,
      });
      if (!res.ok) {
        return {
          ok: false,
          persisted: false,
          message: `Could not save thresholds (${res.status}).`,
        };
      }
      return { ok: true, persisted: true, message: "Thresholds saved." };
    } catch {
      return {
        ok: false,
        persisted: false,
        message: "Could not reach storage to save thresholds.",
      };
    }
  });
