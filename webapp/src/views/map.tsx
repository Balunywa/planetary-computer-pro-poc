import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { AppShell } from "@/components/ops/AppShell";
import { OpsMap } from "@/components/ops/OpsMap";
import { AssetDetailPanel } from "@/components/ops/AssetDetailPanel";
import { RiskBadge } from "@/components/ops/RiskBadge";
import { layersQuery, useOpsSnapshot } from "@/lib/hooks/use-ops-data";
import { ASSET_TYPE_LABEL, RISK_ORDER } from "@/lib/format";
import type { AssetType, RiskLevel } from "@/lib/domain/types";


export function MapPage() {
  const { assets, riskMap, event } = useOpsSnapshot(120);
  const layerDefs = useQuery(layersQuery);
  const [layers, setLayers] = useState<Record<string, boolean>>({
    assets: true,
    track: true,
    wind: true,
    uncertainty: true,
    previous: false,
    rain: false,
    flood: false,
    satellite: false,
    history: false,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState<AssetType | "all">("all");
  const [level, setLevel] = useState<RiskLevel | "all">("all");
  const [unit, setUnit] = useState("all");
  const [operator, setOperator] = useState("all");

  const units = useMemo(() => Array.from(new Set(assets.map((a) => a.businessUnit))), [assets]);
  const operators = useMemo(() => Array.from(new Set(assets.map((a) => a.operator))), [assets]);

  const filtered = useMemo(
    () =>
      assets.filter((a) => {
        const risk = riskMap.get(a.id);
        if (q && !`${a.name} ${a.id} ${a.region} ${a.operator}`.toLowerCase().includes(q.toLowerCase())) return false;
        if (type !== "all" && a.type !== type) return false;
        if (unit !== "all" && a.businessUnit !== unit) return false;
        if (operator !== "all" && a.operator !== operator) return false;
        if (level !== "all" && risk?.level !== level) return false;
        return true;
      }),
    [assets, q, type, unit, operator, level, riskMap],
  );

  const selectedAsset = assets.find((a) => a.id === selected) ?? null;
  const ranked = [...filtered].sort((a, b) => (riskMap.get(b.id)?.score ?? 0) - (riskMap.get(a.id)?.score ?? 0));

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-3.5rem)] min-h-0">
        <div className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r bg-panel md:flex">
          {event?.cycleShift && (
            <div className="border-b p-3">
              <div className="label-xs mb-1.5">Change since last cycle</div>
              <div className="num text-xs">
                <span className="text-foreground">{event.cycleShift.shiftMi} mi</span>{" "}
                <span className="text-muted-foreground">{event.cycleShift.shiftDirection}</span>
              </div>
              <div className="num mt-1 text-[11px] text-muted-foreground">
                Intensity {event.cycleShift.intensityDeltaMph >= 0 ? "+" : ""}
                {event.cycleShift.intensityDeltaMph} mph · cone{" "}
                {event.cycleShift.coneDeltaMi >= 0 ? "+" : ""}
                {event.cycleShift.coneDeltaMi} mi
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {event.cycleShift.summary}
              </p>
              <div className="num mt-1.5 text-[10px] text-muted-foreground/80">
                {event.cycleShift.previousCycle} → {event.cycleShift.currentCycle}
              </div>
            </div>
          )}
          <div className="border-b p-3">
            <div className="label-xs mb-2">Map layers</div>
            <ul className="space-y-2">
              {(layerDefs.data ?? []).map((l) => (
                <li key={l.id}>
                  <label className="flex cursor-pointer items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[var(--color-primary)]"
                      checked={!!layers[l.id]}
                      onChange={(e) => setLayers((s) => ({ ...s, [l.id]: e.target.checked }))}
                    />
                    <span>
                      <span className="font-medium">{l.name}</span>
                      <span className="block text-[11px] text-muted-foreground">{l.description}</span>
                      <span className="block text-[10px] text-muted-foreground/80">{l.updatedLabel}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2 border-b p-3">
            <div className="label-xs">Filters</div>
            <div className="relative">
              <Search className="absolute top-2 left-2 size-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search assets"
                className="w-full rounded-sm border bg-card py-1.5 pr-2 pl-7 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Select value={type} onChange={(v) => setType(v as AssetType | "all")} label="Asset type">
              <option value="all">All types</option>
              {Object.entries(ASSET_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select value={level} onChange={(v) => setLevel(v as RiskLevel | "all")} label="Risk level">
              <option value="all">All risk levels</option>
              {RISK_ORDER.map((l) => (
                <option key={l} value={l} className="capitalize">
                  {l}
                </option>
              ))}
            </Select>
            <Select value={unit} onChange={setUnit} label="Business unit">
              <option value="all">All business units</option>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
            <Select value={operator} onChange={setOperator} label="Operator">
              <option value="all">All operators</option>
              {operators.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="px-3 py-2 label-xs">{ranked.length} assets in view</div>
            <ul>
              {ranked.slice(0, 60).map((a) => {
                const r = riskMap.get(a.id);
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => setSelected(a.id)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-accent ${
                        selected === a.id ? "bg-accent" : ""
                      }`}
                    >
                      <span className="truncate">{a.name}</span>
                      {r && <RiskBadge level={r.level} score={r.score} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="relative min-w-0 flex-1">
          {event && (
            <OpsMap
              className="h-full w-full"
              assets={filtered}
              risks={riskMap}
              event={event}
              layers={layers}
              selectedId={selected}
              onSelect={setSelected}
            />
          )}
        </div>

        {selectedAsset && (
          <div className="w-full max-w-sm shrink-0 border-l">
            <AssetDetailPanel
              asset={selectedAsset}
              risk={riskMap.get(selectedAsset.id)}
              event={event}
              allAssets={assets}
              onClose={() => setSelected(null)}
              onSelect={setSelected}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-sm border bg-card px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
      >
        {children}
      </select>
    </label>
  );
}
