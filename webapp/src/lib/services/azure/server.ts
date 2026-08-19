// Server-only Azure integration. Everything in this module runs inside the SSR
// server function boundary, so @tanstack/react-start strips it (and the Managed
// Identity token calls, process.env access and Azure endpoints) from the browser
// bundle. The client reaches these only through the exported server functions.

import { createServerFn } from "@tanstack/react-start";

import type { CopilotAnswer, GeospatialLayer } from "@/lib/domain/types";

// Data-plane audiences for Managed Identity tokens.
const GEOCATALOG_RESOURCE = "https://geocatalog.spatio.azure.com";
const COGNITIVE_RESOURCE = "https://cognitiveservices.azure.com";

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
      const res = await fetch(`${geoCatalogUrl.replace(/\/$/, "")}/stac/collections`, {
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
        return { text: `The assistant request failed (${res.status}).`, citations: [], highlightAssetIds: [] };
      }
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = body.choices?.[0]?.message?.content?.trim();
      return { text: text || "No answer was returned.", citations: [], highlightAssetIds: [] };
    } catch {
      return { text: "The assistant is currently unavailable.", citations: [], highlightAssetIds: [] };
    }
  });
