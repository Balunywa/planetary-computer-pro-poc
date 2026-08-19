import { createFileRoute, Link } from "@tanstack/react-router";

import { Card, Section, SiteChrome, SiteHero } from "@/components/site/SiteChrome";

const TITLE = "Azure Reference Architecture | Weather & Asset Risk";
const DESC =
  "Adapter-based Azure architecture: Planetary Computer Pro for geospatial data, Azure Maps for basemaps, AI Foundry for grounded summaries, and Aurora/ECMWF weather models.";

export const Route = createFileRoute("/architecture")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArchitecturePage,
});

const DIAGRAM = `  Data plane                         Application plane            Identity
  ─────────────────────────────      ───────────────────────      ─────────────
  NHC / NOAA advisories        ┐
  ECMWF + Aurora forecasts     ├──►  Weather adapter        ┐
  Planetary Computer Pro       ┘                            │
                                                            ├──►  Risk engine
  Asset register (tenant DB)   ────► Asset adapter          │     (explainable
  Thresholds & posture         ────► Posture / threshold    ┘      scoring)
                                                                       │
  Azure Maps / vector tiles    ────► Basemap adapter  ───────────┐     │
  Azure AI Foundry             ────► Copilot adapter  ───────────┤     │
                                                                 ▼     ▼
                                                        Operations console
                                                        (/app, tenant data)
                                                                 ▲
                                          Microsoft Entra ID ─────┘
                                          (SSO, app roles, conditional access)`;

function ArchitecturePage() {
  return (
    <SiteChrome>
      <SiteHero
        eyebrow="Architecture"
        title="Azure-native, adapter-first, deployable into your own subscription."
        lede="Every external dependency sits behind a provider interface. The demo runs on synthetic providers; a tenant deployment swaps them for Planetary Computer Pro, Azure Maps, AI Foundry and your asset register without touching the console."
      />

      <Section title="Reference topology">
        <pre className="overflow-x-auto rounded-sm border bg-card p-5 text-[11px] leading-relaxed text-muted-foreground">
{DIAGRAM}
        </pre>
      </Section>

      <Section title="Adapters" description="Swap targets are configuration, not code changes.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card title="Geospatial — Planetary Computer Pro">Hosted STAC catalogue for satellite, precipitation and inundation rasters, served as map layers and zonal statistics.</Card>
          <Card title="Basemap — Azure Maps">Dark vector basemap with coastlines, administrative borders and labels. Falls back to open tiles until a key is bound.</Card>
          <Card title="Weather — Aurora / ECMWF">Deterministic and ensemble tropical forecasts, wind radii and cycle-over-cycle deltas.</Card>
          <Card title="AI — Azure AI Foundry">Grounded operational summaries and the assistant, constrained to the tenant's own asset and risk objects.</Card>
        </div>
      </Section>

      <Section
        title="Deployment shape"
        description="The console is a single containerised web app plus a Postgres-compatible tenant store, deployed per customer."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Card title="Tenant isolation">Every row carries a tenant identifier sourced from the Entra directory; row-level security enforces the boundary.</Card>
          <Card title="Private networking">Data plane calls stay inside the tenant's virtual network; no asset data leaves the subscription.</Card>
          <Card title="Observability">Structured risk-scoring traces so any published score can be reconstructed after the event.</Card>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/demo/deployment" className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            View adapter status in the demo
          </Link>
          <Link to="/security" className="rounded-sm border px-4 py-2 text-sm hover:bg-accent">
            Security posture
          </Link>
        </div>
      </Section>
    </SiteChrome>
  );
}
