import { useState } from "react";
import { Check, Shield, Activity, Boxes } from "lucide-react";

import { AppShell, PageHeader } from "@/components/ops/AppShell";


const COMPONENTS = [
  { id: "geospatial", name: "Geospatial catalog & imagery", detail: "Satellite imagery, terrain and reference layers for the operating region", on: true },
  { id: "forecast", name: "Weather forecasting", detail: "Modular forecast providers; swap or blend models without UI changes", on: true },
  { id: "copilot", name: "AI operations assistant", detail: "Grounded natural-language answers and operational summaries", on: true },
  { id: "sample", name: "Sample synthetic dataset", detail: "Synthetic oil & gas estate so the app is usable on day one", on: true },
  { id: "ingest", name: "Customer asset ingestion", detail: "Scheduled ingest from your GIS, storage and asset-master systems", on: true },
  { id: "private", name: "Private networking", detail: "Private endpoints and virtual network integration; no public data plane", on: false },
  { id: "monitoring", name: "Monitoring & diagnostics", detail: "Application telemetry, logs and operational dashboards", on: true },
];

const PACKS = [
  "Severe Weather Operations",
  "Pipeline Flood Risk",
  "Wildfire & Right-of-Way Monitoring",
  "Refinery Weather Risk",
  "LNG Terminal Operations",
  "Methane Monitoring",
  "Environmental Monitoring",
  "Remote Asset Intelligence",
  "Earth Observation",
  "Exploration Geospatial Intelligence",
];

const ROLES = [
  ["Viewer", "Read-only access to dashboards, map and alerts"],
  ["Operator", "Acknowledge and resolve alerts, adjust thresholds for owned assets"],
  ["Analyst", "Configure risk weightings, forecast providers and reporting"],
  ["Administrator", "Manage tenancy, data connections, roles and deployment settings"],
];

export function DeploymentPage() {
  const [components, setComponents] = useState(() => Object.fromEntries(COMPONENTS.map((c) => [c.id, c.on])));
  const [region, setRegion] = useState("South Central US");
  const [packs, setPacks] = useState<string[]>([PACKS[0]!]);

  return (
    <AppShell>
      <PageHeader
        title="Deployment"
        description="Infrastructure configuration is kept separate from application code so deployment automation can be added or extended without touching the product."
      />
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="panel p-4">
            <div className="label-xs mb-3">1 · Target environment</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">
                <span className="label-xs block">Subscription</span>
                <select className="mt-1 w-full rounded-sm border bg-card px-2 py-1.5 text-xs">
                  <option>Energy Operations — Production</option>
                  <option>Energy Operations — Non-production</option>
                </select>
              </label>
              <label className="text-xs">
                <span className="label-xs block">Region</span>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="mt-1 w-full rounded-sm border bg-card px-2 py-1.5 text-xs"
                >
                  {["South Central US", "East US 2", "West Europe", "UK South", "UAE North"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="panel">
            <div className="border-b px-4 py-2.5 label-xs">2 · Components</div>
            <ul className="divide-y">
              {COMPONENTS.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div>
                    <div className="text-xs font-medium">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">{c.detail}</div>
                  </div>
                  <button
                    onClick={() => setComponents((s) => ({ ...s, [c.id]: !s[c.id] }))}
                    className={`h-5 w-9 shrink-0 rounded-full border transition-colors ${
                      components[c.id] ? "bg-primary" : "bg-muted"
                    }`}
                    aria-label={c.name}
                  >
                    <span
                      className={`block size-4 rounded-full bg-background transition-transform ${
                        components[c.id] ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-4">
            <div className="label-xs mb-3">3 · Solution packs</div>
            <div className="flex flex-wrap gap-2">
              {PACKS.map((p, i) => {
                const on = packs.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => setPacks((s) => (on ? s.filter((x) => x !== p) : [...s, p]))}
                    className={`rounded-sm border px-2.5 py-1.5 text-[11px] ${on ? "border-primary/50 bg-primary/10 text-primary" : "hover:bg-accent"}`}
                  >
                    {p}
                    {i > 0 && !on && <span className="ml-1.5 text-muted-foreground">preview</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Packs reuse the same platform shell, identity model, asset schema, data connectors, map and AI layer.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button className="rounded-sm bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">
              Review & deploy
            </button>
            <span className="text-[11px] text-muted-foreground">
              Generates an infrastructure plan; application code is deployed unchanged.
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-4">
            <div className="label-xs mb-2 flex items-center gap-1.5">
              <Shield className="size-3.5 text-primary" /> Security posture
            </div>
            <ul className="space-y-1.5 text-[11px] text-muted-foreground">
              {[
                "Enterprise identity with single sign-on and conditional access",
                "Managed identity for service-to-service access",
                "Secrets held in a managed vault; none in source control",
                "Private endpoints and virtual network integration available",
                "Environment-based configuration for every deployment stage",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="mt-0.5 size-3 shrink-0 text-primary" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <div className="border-b px-4 py-2.5 label-xs">Roles</div>
            <ul className="divide-y">
              {ROLES.map(([r, d]) => (
                <li key={r} className="px-4 py-2.5">
                  <div className="text-xs font-medium">{r}</div>
                  <div className="text-[11px] text-muted-foreground">{d}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-4">
            <div className="label-xs mb-2 flex items-center gap-1.5">
              <Activity className="size-3.5 text-primary" /> Operational health
            </div>
            <ul className="space-y-2 text-[11px]">
              {[
                ["Forecast ingest", "Healthy · last cycle 4 min ago"],
                ["Asset synchronization", "Healthy · 186 assets, 6 min ago"],
                ["Risk engine", "Healthy · full estate rescored 4 min ago"],
                ["Assistant service", "Healthy · median response 1.2 s"],
              ].map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <span>{k}</span>
                  <span className="text-muted-foreground">{v}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-4">
            <div className="label-xs mb-2 flex items-center gap-1.5">
              <Boxes className="size-3.5 text-primary" /> Service adapters
            </div>
            <p className="text-[11px] text-muted-foreground">
              Assets, weather, events, risk, geospatial, alerts and assistant are served through stable interfaces. Sample
              providers ship by default and are replaced one at a time with live integrations — no UI rewrite.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
