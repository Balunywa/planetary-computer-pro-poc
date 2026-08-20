import { n as createServerFn, r as TSS_SERVER_FUNCTION } from "./server-CerJU9nu.js";
//#region node_modules/@tanstack/start-server-core/dist/esm/createServerRpc.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
//#endregion
//#region src/lib/services/azure/server.ts?tss-serverfn-split
var GEOCATALOG_RESOURCE = "https://geocatalog.spatio.azure.com";
var COGNITIVE_RESOURCE = "https://cognitiveservices.azure.com";
var STORAGE_RESOURCE = "https://storage.azure.com";
var DEFAULT_GEOCATALOG_API_VERSION = "2026-04-15";
var PUBLIC_PC_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1";
function geoCatalogApiUrl(baseUrl, path) {
	const url = new URL(path, `${baseUrl.replace(/\/$/, "")}/`);
	url.searchParams.set("api-version", process.env["GEOCATALOG_API_VERSION"] || DEFAULT_GEOCATALOG_API_VERSION);
	return url.toString();
}
/**
* Acquire a Managed Identity access token for a resource. On Azure App Service
* (and Container Apps) the platform injects IDENTITY_ENDPOINT / IDENTITY_HEADER;
* we fall back to the IMDS endpoint for VMs. No SDK, no secrets — the identity is
* the site's system-assigned managed identity, granted data-plane roles in
* main.bicep.
*/
async function getManagedIdentityToken(resource) {
	const endpoint = process.env["IDENTITY_ENDPOINT"];
	const header = process.env["IDENTITY_HEADER"];
	try {
		if (endpoint && header) {
			const url = `${endpoint}?resource=${encodeURIComponent(resource)}&api-version=2019-08-01`;
			const res = await fetch(url, { headers: { "X-IDENTITY-HEADER": header } });
			if (!res.ok) return null;
			return (await res.json()).access_token ?? null;
		}
		const imds = `http://169.254.169.254/metadata/identity/oauth2/token?resource=${encodeURIComponent(resource)}&api-version=2018-02-01`;
		const res = await fetch(imds, { headers: { Metadata: "true" } });
		if (!res.ok) return null;
		return (await res.json()).access_token ?? null;
	} catch {
		return null;
	}
}
/**
* Browse the tenant's GeoCatalog STAC collections and present them as operator-
* facing geospatial layers. Returns [] when the catalog is empty or unreachable
* — never synthetic layers.
*/
var listStacLayers_createServerFn_handler = createServerRpc({
	id: "03cddc5147d0e9816c3e8ab7d85699f7b4f7bbd518bd559f75f6defaa4f3e893",
	name: "listStacLayers",
	filename: "src/lib/services/azure/server.ts"
}, (opts) => listStacLayers.__executeServer(opts));
var listStacLayers = createServerFn({ method: "GET" }).handler(listStacLayers_createServerFn_handler, async () => {
	const geoCatalogUrl = process.env["GEOCATALOG_URI"];
	if (!geoCatalogUrl) return [];
	const token = await getManagedIdentityToken(GEOCATALOG_RESOURCE);
	if (!token) return [];
	try {
		const res = await fetch(geoCatalogApiUrl(geoCatalogUrl, "stac/collections"), { headers: { Authorization: `Bearer ${token}` } });
		if (!res.ok) return [];
		const body = await res.json();
		return Promise.all((body.collections ?? []).map(async (c) => {
			const itemsRes = await fetch(geoCatalogApiUrl(geoCatalogUrl, `stac/collections/${c.id}/items`), { headers: { Authorization: `Bearer ${token}` } });
			const features = (itemsRes.ok ? await itemsRes.json() : {
				type: "FeatureCollection",
				features: []
			}).features ?? [];
			return {
				id: c.id,
				name: c.title || c.id,
				description: c.description || "STAC collection",
				updatedLabel: `${features.length} item${features.length === 1 ? "" : "s"} from GeoCatalog`,
				defaultOn: features.length > 0,
				itemCount: features.length,
				data: {
					type: "FeatureCollection",
					features
				}
			};
		}));
	} catch {
		return [];
	}
});
var askFoundryCopilot_createServerFn_handler = createServerRpc({
	id: "b53cf893a408a20290cf0a85d5bddcbc104de59093038d2a89b7db0e386648be",
	name: "askFoundryCopilot",
	filename: "src/lib/services/azure/server.ts"
}, (opts) => askFoundryCopilot.__executeServer(opts));
var askFoundryCopilot = createServerFn({ method: "POST" }).validator((data) => data).handler(askFoundryCopilot_createServerFn_handler, async ({ data }) => {
	const endpoint = process.env["FOUNDRY_ENDPOINT"];
	const deployment = process.env["FOUNDRY_DEPLOYMENT"];
	if (!endpoint || !deployment) return {
		text: "The AI assistant is not configured for this deployment. Set FOUNDRY_ENDPOINT and FOUNDRY_DEPLOYMENT to enable grounded answers from your Azure OpenAI (Foundry) resource.",
		citations: [],
		highlightAssetIds: []
	};
	const token = await getManagedIdentityToken(COGNITIVE_RESOURCE);
	if (!token) return {
		text: "Could not acquire a managed-identity token for the AI resource. Confirm the App Service identity has the Cognitive Services OpenAI User role.",
		citations: [],
		highlightAssetIds: []
	};
	try {
		const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=2024-06-01`;
		const res = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify({
				messages: [{
					role: "system",
					content: "You are an operations assistant for weather and asset risk in energy infrastructure. Answer concisely and only from the tenant's data."
				}, {
					role: "user",
					content: data.question
				}],
				temperature: .2
			})
		});
		if (!res.ok) return {
			text: `The assistant request failed (${res.status}).`,
			citations: [],
			highlightAssetIds: []
		};
		return {
			text: (await res.json()).choices?.[0]?.message?.content?.trim() || "No answer was returned.",
			citations: [],
			highlightAssetIds: []
		};
	} catch {
		return {
			text: "The assistant is currently unavailable.",
			citations: [],
			highlightAssetIds: []
		};
	}
});
var getDataPlaneStatus_createServerFn_handler = createServerRpc({
	id: "3cd368cd0507e1d911d995db2ca3a86e6f4b382df40a8b320afea97bbee49eab",
	name: "getDataPlaneStatus",
	filename: "src/lib/services/azure/server.ts"
}, (opts) => getDataPlaneStatus.__executeServer(opts));
var getDataPlaneStatus = createServerFn({ method: "GET" }).handler(getDataPlaneStatus_createServerFn_handler, async () => ({
	geoCatalogConfigured: Boolean(process.env["GEOCATALOG_URI"]),
	uploadConfigured: Boolean(process.env["SAMPLE_CONTAINER_URL"]),
	auroraEndpointConfigured: Boolean(process.env["AURORA_ENDPOINT"]),
	auroraAdapterConnected: false
}));
var uploadAsset_createServerFn_handler = createServerRpc({
	id: "967f82a7bd2088d05660e3e561a1566764e9ea6f4f71d736f68ed1ef1ebdbb9f",
	name: "uploadAsset",
	filename: "src/lib/services/azure/server.ts"
}, (opts) => uploadAsset.__executeServer(opts));
var uploadAsset = createServerFn({ method: "POST" }).validator((data) => data).handler(uploadAsset_createServerFn_handler, async ({ data }) => {
	const containerUrl = process.env["SAMPLE_CONTAINER_URL"];
	if (!containerUrl) return {
		ok: false,
		message: "Storage is not configured for this deployment (SAMPLE_CONTAINER_URL is unset)."
	};
	const token = await getManagedIdentityToken(STORAGE_RESOURCE);
	if (!token) return {
		ok: false,
		message: "Could not acquire a managed-identity token for storage. Confirm the App Service identity has Storage Blob Data Contributor."
	};
	const safeName = (data.name.split(/[\\/]/).pop() || "upload.bin").replace(/[^\w.-]/g, "_");
	const bytes = Buffer.from(data.contentBase64, "base64");
	if (bytes.length === 0) return {
		ok: false,
		message: "The file is empty."
	};
	const blobUrl = `${containerUrl.replace(/\/$/, "")}/${encodeURIComponent(safeName)}`;
	try {
		const res = await fetch(blobUrl, {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${token}`,
				"x-ms-blob-type": "BlockBlob",
				"x-ms-version": "2021-08-06",
				"Content-Type": data.contentType || "application/octet-stream"
			},
			body: bytes
		});
		if (!res.ok) return {
			ok: false,
			message: `Upload failed (${res.status} ${res.statusText}).`
		};
		return {
			ok: true,
			message: `Uploaded ${safeName}.`,
			blobUrl
		};
	} catch {
		return {
			ok: false,
			message: "Upload failed: could not reach the storage account."
		};
	}
});
var ASSET_TYPES = /* @__PURE__ */ new Set([
	"offshore_platform",
	"pipeline",
	"well",
	"refinery",
	"lng_terminal",
	"storage",
	"port"
]);
var OPERATING_STATUSES = /* @__PURE__ */ new Set([
	"producing",
	"reduced",
	"shut_in",
	"evacuating",
	"standby"
]);
function normalizeType(v) {
	const s = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
	if (s === "platform") return "offshore_platform";
	return ASSET_TYPES.has(s) ? s : "well";
}
function normalizeStatus(v) {
	const s = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
	return OPERATING_STATUSES.has(s) ? s : "producing";
}
function normalizeCriticality(v) {
	const s = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
	return s === "business_critical" || s === "important" ? s : "standard";
}
/** Minimal RFC-4180-style CSV line splitter (handles double-quoted fields). */
function splitCsvLine(line) {
	const out = [];
	let cur = "";
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (quoted) {
			if (c === "\"") {
				if (line[i + 1] === "\"") {
					cur += "\"";
					i++;
				} else quoted = false;
			} else cur += c;
		} else if (c === "\"") quoted = true;
		else if (c === ",") {
			out.push(cur);
			cur = "";
		} else cur += c;
	}
	out.push(cur);
	return out.map((s) => s.trim());
}
function parseCsvAssets(text) {
	const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
	if (lines.length < 2) return [];
	const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
	const pick = (row, ...names) => {
		for (const n of names) {
			const i = header.indexOf(n);
			if (i >= 0 && row[i] !== void 0 && row[i] !== "") return row[i];
		}
		return "";
	};
	const out = [];
	for (let i = 1; i < lines.length; i++) {
		const row = splitCsvLine(lines[i]);
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
			metadata: {}
		});
	}
	return out;
}
function centroid(ring) {
	let x = 0;
	let y = 0;
	let n = 0;
	for (const p of ring) if (Array.isArray(p) && p.length >= 2) {
		x += Number(p[0]);
		y += Number(p[1]);
		n++;
	}
	return n ? [x / n, y / n] : [NaN, NaN];
}
function parseGeoJsonAssets(text) {
	let doc;
	try {
		doc = JSON.parse(text);
	} catch {
		return [];
	}
	const root = doc;
	if (root && "stac_version" in root) return [];
	const features = root?.type === "FeatureCollection" ? root.features ?? [] : root?.type === "Feature" ? [doc] : [];
	const out = [];
	for (const raw of features) {
		if (raw && typeof raw === "object" && ("stac_version" in raw || "assets" in raw)) continue;
		const f = raw;
		const p = f?.properties ?? {};
		const g = f?.geometry ?? {};
		const id = String(p["id"] ?? "").trim();
		if (!id) continue;
		let lat = NaN;
		let lon = NaN;
		let geometry;
		if (g.type === "Point" && Array.isArray(g.coordinates)) {
			lon = Number(g.coordinates[0]);
			lat = Number(g.coordinates[1]);
		} else if (g.type === "LineString" && Array.isArray(g.coordinates)) {
			geometry = g.coordinates;
			[lon, lat] = centroid(g.coordinates);
		} else if (g.type === "Polygon" && Array.isArray(g.coordinates)) [lon, lat] = centroid(g.coordinates[0] ?? []);
		if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
		const type = normalizeType(String(p["type"] ?? ""));
		const asset = {
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
			metadata: p["metadata"] && typeof p["metadata"] === "object" ? p["metadata"] : {}
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
var listUploadedAssets_createServerFn_handler = createServerRpc({
	id: "359d8c3a63904b0daddf1be68920c4d80b8517d7286f0d3b8a5717b58121d831",
	name: "listUploadedAssets",
	filename: "src/lib/services/azure/server.ts"
}, (opts) => listUploadedAssets.__executeServer(opts));
var listUploadedAssets = createServerFn({ method: "GET" }).handler(listUploadedAssets_createServerFn_handler, async () => {
	const containerUrl = process.env["SAMPLE_CONTAINER_URL"];
	if (!containerUrl) return [];
	const token = await getManagedIdentityToken(STORAGE_RESOURCE);
	if (!token) return [];
	const base = containerUrl.replace(/\/$/, "");
	const authHeaders = {
		Authorization: `Bearer ${token}`,
		"x-ms-version": "2021-08-06"
	};
	try {
		const listRes = await fetch(`${base}?restype=container&comp=list`, { headers: authHeaders });
		if (!listRes.ok) return [];
		const xml = await listRes.text();
		const dataFiles = Array.from(xml.matchAll(/<Name>([^<]+)<\/Name>/g)).map((m) => m[1]).filter((n) => /\.(csv|geojson|json)$/i.test(n) && !/(^|\/)app-config\./i.test(n));
		const byId = /* @__PURE__ */ new Map();
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
});
var seedPublicSample_createServerFn_handler = createServerRpc({
	id: "40dc928b3bac3d2d9ca0c34bea9881550ac5c1ecde1550bf5b2e0f4ef3b613c3",
	name: "seedPublicSample",
	filename: "src/lib/services/azure/server.ts"
}, (opts) => seedPublicSample.__executeServer(opts));
var seedPublicSample = createServerFn({ method: "POST" }).handler(seedPublicSample_createServerFn_handler, async () => {
	const geoCatalogUrl = process.env["GEOCATALOG_URI"];
	if (!geoCatalogUrl) return {
		ok: false,
		message: "GeoCatalog is not configured for this deployment (GEOCATALOG_URI is unset)."
	};
	const token = await getManagedIdentityToken(GEOCATALOG_RESOURCE);
	if (!token) return {
		ok: false,
		message: "Could not acquire a managed-identity token for the GeoCatalog. Confirm the App Service identity has GeoCatalog Administrator."
	};
	const base = geoCatalogUrl.replace(/\/$/, "");
	const collectionId = "sample-sentinel-2-gom";
	const authJson = {
		Authorization: `Bearer ${token}`,
		"Content-Type": "application/json"
	};
	let items = [];
	try {
		const searchRes = await fetch(`${PUBLIC_PC_STAC}/search`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				collections: ["sentinel-2-l2a"],
				bbox: [
					-95,
					27,
					-89,
					30.5
				],
				limit: 3,
				query: { "eo:cloud_cover": { lt: 15 } }
			})
		});
		if (!searchRes.ok) return {
			ok: false,
			message: `Could not query the public Planetary Computer (${searchRes.status}).`
		};
		items = (await searchRes.json()).features ?? [];
	} catch {
		return {
			ok: false,
			message: "Could not reach the public Planetary Computer to fetch sample imagery."
		};
	}
	if (items.length === 0) return {
		ok: false,
		message: "No public sample scenes were returned for the sample area."
	};
	let assetSasToken;
	try {
		const sasRes = await fetch("https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a");
		if (!sasRes.ok) return {
			ok: false,
			message: `Could not acquire access to the public sample assets (${sasRes.status}).`
		};
		const sas = await sasRes.json();
		if (!sas.token) return {
			ok: false,
			message: "The public sample asset token response was empty."
		};
		assetSasToken = sas.token;
	} catch {
		return {
			ok: false,
			message: "Could not acquire access to the public sample assets."
		};
	}
	const collection = {
		type: "Collection",
		id: collectionId,
		stac_version: "1.0.0",
		title: "Sample: Sentinel-2 over the Gulf of Mexico",
		description: "Public Sentinel-2 L2A sample imagery from the open Planetary Computer, pre-seeded so the catalog is not empty. Replace with your own collections.",
		license: "proprietary",
		extent: {
			spatial: { bbox: [[
				-95,
				27,
				-89,
				30.5
			]] },
			temporal: { interval: [[null, null]] }
		},
		links: []
	};
	try {
		const cRes = await fetch(geoCatalogApiUrl(base, "stac/collections"), {
			method: "POST",
			headers: authJson,
			body: JSON.stringify(collection)
		});
		if (!cRes.ok && cRes.status !== 409) {
			const detail = await cRes.text();
			return {
				ok: false,
				message: `Could not create the sample collection (${cRes.status}). ${detail.slice(0, 200)}`
			};
		}
	} catch {
		return {
			ok: false,
			message: "Could not reach the GeoCatalog to create the sample collection."
		};
	}
	let ingested = 0;
	let lastIngestionError = "";
	for (const item of items) {
		item["collection"] = collectionId;
		item["links"] = [{
			rel: "collection",
			type: "application/json",
			href: geoCatalogApiUrl(base, `stac/collections/${collectionId}`)
		}];
		const assets = item["assets"];
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
				body: JSON.stringify(item)
			});
			if (iRes.ok || iRes.status === 409) ingested++;
			else lastIngestionError = (await iRes.text()).slice(0, 200);
		} catch {
			lastIngestionError = "Could not reach the GeoCatalog item-ingestion endpoint.";
		}
	}
	if (ingested === 0) return {
		ok: false,
		message: `The sample collection was created but no items could be ingested. ${lastIngestionError}`.trim()
	};
	return {
		ok: true,
		message: `Seeded ${ingested} sample scene${ingested === 1 ? "" : "s"} into "${collectionId}".`,
		collectionId,
		ingested
	};
});
var THRESHOLD_BLOB_NAME = "app-config.threshold-rules.json";
function thresholdBlobUrl(containerUrl) {
	return `${containerUrl.replace(/\/$/, "")}/${THRESHOLD_BLOB_NAME}`;
}
/** Load persisted threshold rules, or null when none are stored / storage unwired. */
var loadThresholdRules_createServerFn_handler = createServerRpc({
	id: "85f14038bbfb21b031f1b3511a747df79f23f2b2b16b291f222dc854899293b4",
	name: "loadThresholdRules",
	filename: "src/lib/services/azure/server.ts"
}, (opts) => loadThresholdRules.__executeServer(opts));
var loadThresholdRules = createServerFn({ method: "GET" }).handler(loadThresholdRules_createServerFn_handler, async () => {
	const containerUrl = process.env["SAMPLE_CONTAINER_URL"];
	if (!containerUrl) return null;
	const token = await getManagedIdentityToken(STORAGE_RESOURCE);
	if (!token) return null;
	try {
		const res = await fetch(thresholdBlobUrl(containerUrl), { headers: {
			Authorization: `Bearer ${token}`,
			"x-ms-version": "2021-08-06"
		} });
		if (res.status === 404) return null;
		if (!res.ok) return null;
		const rules = await res.json();
		return Array.isArray(rules) ? rules : null;
	} catch {
		return null;
	}
});
var saveThresholdRules_createServerFn_handler = createServerRpc({
	id: "7ada2eeee52807a7a2ff5e8eabf9a7f9643edfdc7c6c9f82763ac1313c0c85df",
	name: "saveThresholdRules",
	filename: "src/lib/services/azure/server.ts"
}, (opts) => saveThresholdRules.__executeServer(opts));
var saveThresholdRules = createServerFn({ method: "POST" }).validator((data) => data).handler(saveThresholdRules_createServerFn_handler, async ({ data }) => {
	const containerUrl = process.env["SAMPLE_CONTAINER_URL"];
	if (!containerUrl) return {
		ok: true,
		persisted: false,
		message: "Storage not configured; rules kept in memory for this session."
	};
	const token = await getManagedIdentityToken(STORAGE_RESOURCE);
	if (!token) return {
		ok: false,
		persisted: false,
		message: "Could not acquire a managed-identity token for storage."
	};
	const body = Buffer.from(JSON.stringify(data.rules), "utf8");
	try {
		const res = await fetch(thresholdBlobUrl(containerUrl), {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${token}`,
				"x-ms-blob-type": "BlockBlob",
				"x-ms-version": "2021-08-06",
				"Content-Type": "application/json"
			},
			body
		});
		if (!res.ok) return {
			ok: false,
			persisted: false,
			message: `Could not save thresholds (${res.status}).`
		};
		return {
			ok: true,
			persisted: true,
			message: "Thresholds saved."
		};
	} catch {
		return {
			ok: false,
			persisted: false,
			message: "Could not reach storage to save thresholds."
		};
	}
});
//#endregion
export { askFoundryCopilot_createServerFn_handler, getDataPlaneStatus_createServerFn_handler, listStacLayers_createServerFn_handler, listUploadedAssets_createServerFn_handler, loadThresholdRules_createServerFn_handler, saveThresholdRules_createServerFn_handler, seedPublicSample_createServerFn_handler, uploadAsset_createServerFn_handler };
