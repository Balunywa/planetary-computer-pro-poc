// Server-only Azure integration. Everything in this module runs inside the SSR
// server function boundary, so @tanstack/react-start strips it (and the Managed
// Identity token calls, process.env access and Azure endpoints) from the browser
// bundle. The client reaches these only through the exported server functions.

import { createServerFn } from "@tanstack/react-start";

import type {
  Asset,
  AssetType,
  CopilotAnswer,
  GeospatialLayer,
  OperatingStatus,
  ThresholdRule,
} from "@/lib/domain/types";

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
      return Promise.all(
        (body.collections ?? []).map(async (c) => {
          const itemsRes = await fetch(
            geoCatalogApiUrl(geoCatalogUrl, `stac/collections/${c.id}/items`),
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const data = itemsRes.ok
            ? ((await itemsRes.json()) as {
                type: "FeatureCollection";
                features?: Array<Record<string, unknown>>;
              })
            : { type: "FeatureCollection" as const, features: [] };
          const features = data.features ?? [];
          return {
            id: c.id,
            name: c.title || c.id,
            description: c.description || "STAC collection",
            updatedLabel: `${features.length} item${features.length === 1 ? "" : "s"} from GeoCatalog`,
            defaultOn: features.length > 0,
            itemCount: features.length,
            data: { type: "FeatureCollection" as const, features },
          };
        }),
      );
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
  /** An Azure ML Aurora scoring endpoint was supplied by the deployment template. */
  auroraEndpointConfigured: boolean;
  /** The deployment template created an Aurora model deployment on the endpoint. */
  auroraModelDeployed: boolean;
  /** The server-side Aurora response-to-WeatherEvent adapter is implemented. */
  auroraAdapterConnected: boolean;
};

/** Report which onboarding capabilities the current deployment has wired. */
export const getDataPlaneStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<DataPlaneStatus> => ({
    geoCatalogConfigured: Boolean(process.env["GEOCATALOG_URI"]),
    uploadConfigured: Boolean(process.env["SAMPLE_CONTAINER_URL"]),
    auroraEndpointConfigured: Boolean(process.env["AURORA_ENDPOINT"]),
    auroraModelDeployed: process.env["AURORA_MODEL_DEPLOYED"] === "true",
    auroraAdapterConnected: false,
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

// ---------------------------------------------------------------------------
// Asset-register ingestion: read the CSV / GeoJSON files an operator uploaded to
// the sample-assets container and parse them into the domain Asset shape, so the
// map, risk engine and tables populate from the operator's OWN data. Returns []
// when storage is unwired or empty — never synthetic assets.
// ---------------------------------------------------------------------------

const ASSET_TYPES = new Set<AssetType>([
  "offshore_platform",
  "pipeline",
  "well",
  "refinery",
  "lng_terminal",
  "storage",
  "port",
]);
const OPERATING_STATUSES = new Set<OperatingStatus>([
  "producing",
  "reduced",
  "shut_in",
  "evacuating",
  "standby",
]);

function normalizeType(v: string): AssetType {
  const s = v
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (s === "platform") return "offshore_platform";
  return ASSET_TYPES.has(s as AssetType) ? (s as AssetType) : "well";
}
function normalizeStatus(v: string): OperatingStatus {
  const s = v
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return OPERATING_STATUSES.has(s as OperatingStatus) ? (s as OperatingStatus) : "producing";
}
function normalizeCriticality(v: string): Asset["criticality"] {
  const s = v
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return s === "business_critical" || s === "important" ? s : "standard";
}

/** Minimal RFC-4180-style CSV line splitter (handles double-quoted fields). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsvAssets(text: string): Asset[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const pick = (row: string[], ...names: string[]): string => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0 && row[i] !== undefined && row[i] !== "") return row[i]!;
    }
    return "";
  };
  const out: Asset[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvLine(lines[i]!);
    const id = pick(row, "id");
    const lat = Number(pick(row, "latitude", "lat"));
    const lon = Number(pick(row, "longitude", "lon", "long"));
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      id,
      name: pick(row, "name") || id,
      type: normalizeType(pick(row, "type")),
      lat,
      lon,
      operator: pick(row, "operator"),
      region: pick(row, "region"),
      businessUnit: pick(row, "business_unit", "businessunit"),
      status: normalizeStatus(pick(row, "operating_status", "status")),
      criticality: normalizeCriticality(pick(row, "criticality")),
      metadata: {},
    });
  }
  return out;
}

function centroid(ring: number[][]): [number, number] {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const p of ring) {
    if (Array.isArray(p) && p.length >= 2) {
      x += Number(p[0]);
      y += Number(p[1]);
      n++;
    }
  }
  return n ? [x / n, y / n] : [NaN, NaN];
}

function parseGeoJsonAssets(text: string): Asset[] {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return [];
  }
  const root = doc as { type?: string; features?: unknown[]; stac_version?: unknown };
  // A STAC document (Item/Collection/Catalog) is GeoJSON-shaped but is imagery
  // metadata, not an asset register — never ingest it as an asset.
  if (root && "stac_version" in root) return [];
  const features: unknown[] =
    root?.type === "FeatureCollection"
      ? (root.features ?? [])
      : root?.type === "Feature"
        ? [doc]
        : [];
  const out: Asset[] = [];
  for (const raw of features) {
    // Skip STAC items that may have been dropped into the same container.
    if (raw && typeof raw === "object" && ("stac_version" in raw || "assets" in raw)) continue;
    const f = raw as {
      properties?: Record<string, unknown>;
      geometry?: { type?: string; coordinates?: unknown };
    };
    const p = f?.properties ?? {};
    const g = f?.geometry ?? {};
    const id = String(p["id"] ?? "").trim();
    if (!id) continue;
    let lat = NaN;
    let lon = NaN;
    let geometry: Array<[number, number]> | undefined;
    if (g.type === "Point" && Array.isArray(g.coordinates)) {
      lon = Number((g.coordinates as number[])[0]);
      lat = Number((g.coordinates as number[])[1]);
    } else if (g.type === "LineString" && Array.isArray(g.coordinates)) {
      geometry = g.coordinates as Array<[number, number]>;
      [lon, lat] = centroid(g.coordinates as number[][]);
    } else if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
      [lon, lat] = centroid(((g.coordinates as number[][][])[0] ?? []) as number[][]);
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const type = normalizeType(String(p["type"] ?? ""));
    const asset: Asset = {
      id,
      name: String(p["name"] ?? id),
      type,
      lat,
      lon,
      operator: String(p["operator"] ?? ""),
      region: String(p["region"] ?? ""),
      businessUnit: String(p["business_unit"] ?? p["businessUnit"] ?? ""),
      status: normalizeStatus(String(p["operating_status"] ?? p["status"] ?? "")),
      criticality: normalizeCriticality(String(p["criticality"] ?? "")),
      metadata:
        p["metadata"] && typeof p["metadata"] === "object"
          ? (p["metadata"] as Record<string, string | number>)
          : {},
    };
    if (geometry && type === "pipeline") asset.geometry = geometry;
    out.push(asset);
  }
  return out;
}

/**
 * List every CSV / GeoJSON the operator uploaded to the sample-assets container
 * and parse them into the domain Asset shape. This is what turns an upload into a
 * populated map + risk score. Later files (and later rows) win on duplicate id.
 */
export const listUploadedAssets = createServerFn({ method: "GET" }).handler(
  async (): Promise<Asset[]> => {
    const containerUrl = process.env["SAMPLE_CONTAINER_URL"];
    if (!containerUrl) return [];
    const token = await getManagedIdentityToken(STORAGE_RESOURCE);
    if (!token) return [];
    const base = containerUrl.replace(/\/$/, "");
    const authHeaders = { Authorization: `Bearer ${token}`, "x-ms-version": "2021-08-06" };
    try {
      const listRes = await fetch(`${base}?restype=container&comp=list`, { headers: authHeaders });
      if (!listRes.ok) return [];
      const xml = await listRes.text();
      const names = Array.from(xml.matchAll(/<Name>([^<]+)<\/Name>/g)).map((m) => m[1]!);
      const dataFiles = names.filter(
        // Only asset files — skip the app-config blobs (e.g. threshold rules) that
        // also live in this container.
        (n) => /\.(csv|geojson|json)$/i.test(n) && !/(^|\/)app-config\./i.test(n),
      );
      const byId = new Map<string, Asset>();
      for (const name of dataFiles) {
        const blobPath = name.split("/").map(encodeURIComponent).join("/");
        const res = await fetch(`${base}/${blobPath}`, { headers: authHeaders });
        if (!res.ok) continue;
        const body = await res.text();
        const parsed = /\.csv$/i.test(name) ? parseCsvAssets(body) : parseGeoJsonAssets(body);
        for (const a of parsed) byId.set(a.id, a);
      }
      return Array.from(byId.values());
    } catch {
      return [];
    }
  },
);

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

    let assetSasToken: string;
    try {
      const sasRes = await fetch(
        "https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a",
      );
      if (!sasRes.ok) {
        return {
          ok: false,
          message: `Could not acquire access to the public sample assets (${sasRes.status}).`,
        };
      }
      const sas = (await sasRes.json()) as { token?: string };
      if (!sas.token) {
        return { ok: false, message: "The public sample asset token response was empty." };
      }
      assetSasToken = sas.token;
    } catch {
      return { ok: false, message: "Could not acquire access to the public sample assets." };
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
    let lastIngestionError = "";
    for (const item of items) {
      item["collection"] = collectionId;
      item["links"] = [
        {
          rel: "collection",
          type: "application/json",
          href: geoCatalogApiUrl(base, `stac/collections/${collectionId}`),
        },
      ];
      const assets = item["assets"] as Record<string, { href?: string }> | undefined;
      if (assets) {
        delete assets["rendered_preview"];
        delete assets["preview"];
        delete assets["tilejson"];
        for (const asset of Object.values(assets)) {
          if (!asset.href?.includes(".blob.core.windows.net/")) continue;
          const assetUrl = new URL(asset.href);
          assetUrl.search = assetSasToken;
          asset.href = assetUrl.toString();
        }
      }
      try {
        const iRes = await fetch(geoCatalogApiUrl(base, `stac/collections/${collectionId}/items`), {
          method: "POST",
          headers: authJson,
          body: JSON.stringify(item),
        });
        if (iRes.ok || iRes.status === 409) {
          ingested++;
        } else {
          lastIngestionError = (await iRes.text()).slice(0, 200);
        }
      } catch {
        lastIngestionError = "Could not reach the GeoCatalog item-ingestion endpoint.";
      }
    }
    if (ingested === 0) {
      return {
        ok: false,
        message:
          `The sample collection was created but no items could be ingested. ${lastIngestionError}`.trim(),
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
