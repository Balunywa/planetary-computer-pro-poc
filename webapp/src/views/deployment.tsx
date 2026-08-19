import { useQuery } from "@tanstack/react-query";
import { Boxes, Check, Database, ExternalLink, Shield, Sparkles } from "lucide-react";

import { AppShell, PageHeader } from "@/components/ops/AppShell";
import { OpsLink, useOpsBase } from "@/components/ops/ops-nav";
import { layersQuery } from "@/lib/hooks/use-ops-data";
import { getServiceConfig } from "@/lib/services/azure-config";
import { getDataPlaneStatus } from "@/lib/services/azure/server";

// Honest, read-only deployment status. Infrastructure is provisioned by the
// Bicep/ARM template ("Deploy to Azure"), not from the app — so this page reports
// what is actually wired to this deployment rather than pretending to configure it.

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const ROLES: [string, string][] = [
  ["Viewer", "Read-only access to dashboards, map and alerts"],
  ["Operator", "Acknowledge and resolve alerts, adjust thresholds for owned assets"],
  ["Analyst", "Configure risk weightings, forecast providers and reporting"],
  ["Administrator", "Manage tenancy, data connections, roles and deployment settings"],
];

const SECURITY: string[] = [
  "Microsoft Entra sign-in with your directory's MFA and conditional access",
  "Managed identity for service-to-service access — no keys in the app or source",
  "Data-plane roles (GeoCatalog, Storage, AI) assigned to the app identity at deploy time",
  "Non-secret configuration published at runtime; secrets never reach the browser",
];

export function DeploymentPage() {
  const base = useOpsBase();
  const cfg = getServiceConfig();
  const status = useQuery({
    queryKey: [base, "data-plane-status"],
    queryFn: () => getDataPlaneStatus(),
    staleTime: 5 * 60 * 1000,
  });
  const layers = useQuery(layersQuery(base));

  const geoCatalogWired = Boolean(cfg.geoCatalogUrl);
  const foundryWired = Boolean(cfg.foundryEndpoint);
  const uploadWired = status.data?.uploadConfigured ?? false;

  const services: { name: string; detail: string; wired: boolean; endpoint?: string }[] = [
    {
      name: "Geospatial catalog (Planetary Computer Pro)",
      detail: "STAC collections and imagery for the operating region",
      wired: geoCatalogWired,
      endpoint: cfg.geoCatalogUrl ? hostOf(cfg.geoCatalogUrl) : undefined,
    },
    {
      name: "AI operations assistant (Azure OpenAI)",
      detail: cfg.foundryDeployment ? `Deployment: ${cfg.foundryDeployment}` : "Grounded natural-language answers",
      wired: foundryWired,
      endpoint: cfg.foundryEndpoint ? hostOf(cfg.foundryEndpoint) : undefined,
    },
    {
      name: "Data storage & upload",
      detail: "Blob container for uploaded assets and catalog ingestion sources",
      wired: uploadWired,
    },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Deployment"
        description="Infrastructure is provisioned by the deployment template using your Azure credentials. This page reports what is wired to this deployment — it does not provision resources."
      />
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="panel">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="label-xs">Connected Azure services</span>
              {status.isLoading && <span className="text-[11px] text-muted-foreground">Checking…</span>}
            </div>
            <ul className="divide-y">
              {services.map((s) => (
                <li key={s.name} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">{s.detail}</div>
                    {s.endpoint && (
                      <div className="num mt-0.5 truncate text-[10px] text-muted-foreground/80">{s.endpoint}</div>
                    )}
                  </div>
                  <span
                    className={`mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[10px] font-medium ${
                      s.wired
                        ? "border-risk-normal/50 bg-risk-normal/10 text-risk-normal"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    <span className={`size-1.5 rounded-full ${s.wired ? "bg-risk-normal" : "bg-muted-foreground/50"}`} />
                    {s.wired ? "Connected" : "Not configured"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-4">
            <div className="label-xs mb-2 flex items-center gap-1.5">
              <Database className="size-3.5 text-primary" /> Catalog contents
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              This deployment currently exposes{" "}
              <span className="num font-medium text-foreground">{layers.data?.length ?? 0}</span> geospatial{" "}
              {layers.data?.length === 1 ? "collection" : "collections"}. Assets are ingested from your GIS or
              uploaded — nothing is pre-populated.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <OpsLink
                to="/assets"
                className="inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/15"
              >
                <Database className="size-3.5" /> Add data
              </OpsLink>
              <OpsLink
                to="/"
                className="inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] hover:bg-accent"
              >
                <Sparkles className="size-3.5" /> Load a public sample
              </OpsLink>
            </div>
          </div>

          <div className="panel p-4">
            <div className="label-xs mb-2 flex items-center gap-1.5">
              <Boxes className="size-3.5 text-primary" /> Service adapters
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Assets, weather, events, risk, geospatial, alerts and the assistant are served through stable
              interfaces backed by the tenant's Azure resources. Each returns an honest empty result until the
              corresponding data is ingested — the app never falls back to synthetic sample data.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-4">
            <div className="label-xs mb-2 flex items-center gap-1.5">
              <Shield className="size-3.5 text-primary" /> Security posture
            </div>
            <ul className="space-y-1.5 text-[11px] text-muted-foreground">
              {SECURITY.map((t) => (
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
            <div className="label-xs mb-2">Provisioning</div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Resources are created by the deployment template (Bicep/ARM) under your subscription, with the
              app's managed identity granted the data-plane roles above. To change what is deployed, redeploy the
              template — application code ships unchanged.
            </p>
            <a
              href="https://learn.microsoft.com/azure/planetary-computer/"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline"
            >
              Planetary Computer Pro documentation <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

