import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, Database, FileSpreadsheet, Globe, Layers, Plug, Server } from "lucide-react";

import { AppShell, PageHeader } from "@/components/ops/AppShell";
import { assetsQuery } from "@/lib/hooks/use-ops-data";
import { ASSET_TYPE_LABEL, STATUS_LABEL, coords } from "@/lib/format";


const CONNECTORS = [
  { id: "csv", name: "CSV upload", detail: "Point-asset registers with latitude and longitude columns", icon: FileSpreadsheet, status: "Available" },
  { id: "geojson", name: "GeoJSON", detail: "Point, line and polygon geometry for corridors and lease blocks", icon: Globe, status: "Available" },
  { id: "shapefile", name: "Shapefile", detail: "Zipped ESRI shapefiles from survey and GIS teams", icon: Layers, status: "Available" },
  { id: "arcgis", name: "ArcGIS feature service", detail: "Live feature layers from the corporate GIS", icon: Globe, status: "Configure" },
  { id: "blob", name: "Cloud storage container", detail: "Scheduled ingest from your governed data landing zone", icon: Database, status: "Configure" },
  { id: "fabric", name: "Enterprise data platform", detail: "Governed asset master from your analytics platform", icon: Server, status: "Configure" },
  { id: "rest", name: "REST API", detail: "Pull from maintenance, SCADA or asset-management systems", icon: Plug, status: "Configure" },
];

const SCHEMA = [
  ["id", "string", "Unique asset identifier", "Required"],
  ["name", "string", "Operator-facing asset name", "Required"],
  ["type", "enum", "platform, pipeline, well, refinery, lng_terminal, storage, port", "Required"],
  ["latitude", "number", "Decimal degrees", "Required for point assets"],
  ["longitude", "number", "Decimal degrees", "Required for point assets"],
  ["geometry", "geojson", "Line or polygon geometry for corridors and areas", "Optional"],
  ["operator", "string", "Operating company", "Optional"],
  ["region", "string", "Operating region", "Optional"],
  ["business_unit", "string", "Reporting business unit", "Optional"],
  ["operating_status", "enum", "producing, reduced, shut_in, evacuating, standby", "Optional"],
  ["criticality", "enum", "standard, important, business_critical", "Drives risk weighting"],
  ["metadata", "object", "Design wind speed, capacity, personnel on board, etc.", "Optional"],
];

export function AssetsPage() {
  const assets = useQuery(assetsQuery).data ?? [];
  const [q, setQ] = useState("");

  const rows = useMemo(
    () => assets.filter((a) => `${a.name} ${a.id} ${a.operator} ${a.region}`.toLowerCase().includes(q.toLowerCase())).slice(0, 100),
    [assets, q],
  );

  return (
    <AppShell>
      <PageHeader
        title="Asset Management"
        description="Connect your infrastructure estate. The sample dataset is isolated and can be disabled once your own sources are connected."
      />
      <div className="space-y-4 p-4">
        <div className="panel">
          <div className="border-b px-4 py-2.5 label-xs">Data sources</div>
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
            {CONNECTORS.map((c) => (
              <div key={c.id} className="bg-card p-4">
                <div className="flex items-center gap-2">
                  <c.icon className="size-4 text-primary" />
                  <span className="text-xs font-medium">{c.name}</span>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{c.detail}</p>
                <button className="mt-3 rounded-sm border px-2 py-1 text-[11px] hover:bg-accent">{c.status}</button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="panel">
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              <span className="label-xs">Current asset register</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                className="ml-auto w-56 rounded-sm border bg-card px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card text-left text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">ID</th>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Location</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="num px-4 py-2 text-muted-foreground">{a.id}</td>
                      <td className="px-4 py-2 font-medium">{a.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{ASSET_TYPE_LABEL[a.type]}</td>
                      <td className="num px-4 py-2 text-muted-foreground">{coords(a.lat, a.lon)}</td>
                      <td className="px-4 py-2">{STATUS_LABEL[a.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">
              Showing {rows.length} of {assets.length} assets from the sample dataset.
            </div>
          </div>

          <div className="space-y-4">
            <div className="panel">
              <div className="border-b px-4 py-2.5 label-xs">Asset schema</div>
              <table className="w-full text-[11px]">
                <tbody>
                  {SCHEMA.map(([field, type, desc, req]) => (
                    <tr key={field} className="border-t align-top">
                      <td className="num px-4 py-2 font-medium">{field}</td>
                      <td className="px-2 py-2 text-muted-foreground">{type}</td>
                      <td className="px-2 py-2 text-muted-foreground">{desc}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{req}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel p-4">
              <div className="label-xs mb-2">Sample data isolation</div>
              <ul className="space-y-1.5 text-[11px] text-muted-foreground">
                {[
                  "Sample assets are served by a dedicated sample provider",
                  "Risk scoring, alerts and the assistant read the same interfaces as production sources",
                  "Disabling the sample dataset leaves no residual references in the application",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <Check className="mt-0.5 size-3 shrink-0 text-primary" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
