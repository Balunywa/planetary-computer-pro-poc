
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { OpsMap } from "@/components/ops/OpsMap";
import { useOpsSnapshot } from "@/lib/hooks/use-ops-data";
import { ASSET_TYPE_LABEL, RISK_LABEL, riskColorVar } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Landing hero console. Renders the same live operational surface the product
 * ships with (real basemap, storm track, cone, wind radii, scored assets) so the
 * marketing page proves the product instead of describing it.
 */
const MAX_HOUR = 120;

export function LandingConsole({ className }: { className?: string }) {
  const { assets, risks, riskMap, event, metrics, isLoading } = useOpsSnapshot(72);
  const [selected, setSelected] = useState<string | null>(null);

  // Advance the forecast cursor so the hero shows the storm actually tracking
  // across the estate rather than a frozen snapshot.
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovering, setHovering] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const running = playing && !hovering;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      // Hold a beat at the end of the window so the loop reads as a cycle.
      setHour((h) => (h >= MAX_HOUR ? 0 : Math.min(MAX_HOUR, h + 3)));
    }, 700);
    return () => window.clearInterval(id);
  }, [running]);

  const scrubTo = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHour(Math.round((ratio * MAX_HOUR) / 3) * 3);
  }, []);

  const ranked = useMemo(
    () =>
      [...risks]
        .sort((a, b) => b.score - a.score)
        .slice(0, 7)
        .map((r) => ({ risk: r, asset: assets.find((a) => a.id === r.assetId) })),
    [risks, assets],
  );

  return (
    <div className={cn("panel overflow-hidden", className)}>
      <div className="flex items-center gap-3 border-b px-3 py-2">
        <span className="relative flex size-1.5">
          <span className="bg-risk-critical absolute inline-flex size-full animate-ping rounded-full opacity-70" />
          <span className="bg-risk-critical relative inline-flex size-1.5 rounded-full" />
        </span>
        <span className="label-xs">Live console</span>
        <span className="text-[11px] text-muted-foreground">
          {event
            ? `${event.name} · Cat ${event.currentCategory} · ${event.currentWindMph} mph · ${event.cycleId ?? event.modelSource}`
            : "Loading estate…"}
        </span>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="hover:bg-accent/60 ml-auto rounded-sm px-1.5 py-0.5 text-[10px] tracking-wide text-muted-foreground uppercase"
        >
          {running ? "Pause" : "Play"}
        </button>
        <span className="num text-[10px] text-muted-foreground">T+{hour} h</span>
      </div>

      <div className="bg-ocean-deep relative h-[300px] sm:h-[360px] lg:h-[420px]">
        {event && !isLoading ? (
          <OpsMap
            className="h-full w-full"
            assets={assets}
            risks={riskMap}
            event={event}
            layers={{ assets: true, track: true, wind: true, uncertainty: true }}
            hour={hour}
            selectedId={selected}
            onSelect={setSelected}
          />
        ) : (
          <div className="grid h-full place-items-center">
            <span className="label-xs text-muted-foreground">Loading operational layers…</span>
          </div>
        )}
      </div>

      <div
        className="border-t px-3 py-2"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <div
          ref={trackRef}
          role="slider"
          aria-label="Forecast hour"
          aria-valuemin={0}
          aria-valuemax={MAX_HOUR}
          aria-valuenow={hour}
          tabIndex={0}
          className="group relative h-4 cursor-ew-resize select-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            scrubTo(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) scrubTo(e.clientX);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHour((h) => Math.max(0, h - 3));
            if (e.key === "ArrowRight") setHour((h) => Math.min(MAX_HOUR, h + 3));
          }}
        >
          <div className="bg-muted absolute top-1/2 h-[3px] w-full -translate-y-1/2 rounded-full" />
          <div
            className="bg-primary absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
            style={{ width: `${(hour / MAX_HOUR) * 100}%` }}
          />
          {[0, 24, 48, 72, 96, 120].map((t) => (
            <span
              key={t}
              className="bg-border absolute top-1/2 h-2 w-px -translate-y-1/2"
              style={{ left: `${(t / MAX_HOUR) * 100}%` }}
            />
          ))}
          <span
            className="border-background bg-primary absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border"
            style={{ left: `${(hour / MAX_HOUR) * 100}%` }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[9px] tracking-wide text-muted-foreground uppercase">
          <span>Now</span>
          <span>{hovering ? "Scrub the forecast" : "120 h forecast window"}</span>
          <span className="num">T+120</span>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x border-t sm:grid-cols-4">
        <Metric label="Assets monitored" value={metrics.monitored} />
        <Metric label="Exposed" value={metrics.exposed} tone="var(--risk-elevated)" />
        <Metric label="Inside cone" value={metrics.insideCone} tone="var(--risk-high)" />
        <Metric
          label="First impact"
          value={metrics.firstImpactHours === null ? "—" : `T-${metrics.firstImpactHours}h`}
          tone="var(--risk-critical)"
        />
      </div>

      <div className="border-t">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="label-xs">Highest exposure, ranked</span>
          <span className="text-[10px] text-muted-foreground">score / hours to impact</span>
        </div>
        <ul className="divide-y border-t">
          {ranked.map(({ risk, asset }) => (
            <li
              key={risk.assetId}
              className="hover:bg-accent/40 flex cursor-default items-center gap-3 px-3 py-1.5 text-[12px]"
              onMouseEnter={() => setSelected(risk.assetId)}
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: riskColorVar(risk.level) }}
              />
              <span className="min-w-0 flex-1 truncate">{asset?.name ?? risk.assetId}</span>
              <span className="hidden w-28 shrink-0 truncate text-[11px] text-muted-foreground sm:block">
                {asset ? ASSET_TYPE_LABEL[asset.type] : ""}
              </span>
              <span
                className="w-16 shrink-0 text-right text-[10px] tracking-wide uppercase"
                style={{ color: riskColorVar(risk.level) }}
              >
                {RISK_LABEL[risk.level]}
              </span>
              <span className="num w-9 shrink-0 text-right font-medium">{Math.round(risk.score)}</span>
              <span className="num w-12 shrink-0 text-right text-muted-foreground">
                {risk.hoursToImpact === null ? "—" : `T-${risk.hoursToImpact}h`}
              </span>
            </li>
          ))}
          {ranked.length === 0
            ? Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="px-3 py-1.5">
                  <div className="bg-muted h-3 w-full animate-pulse rounded-sm" />
                </li>
              ))
            : null}
        </ul>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="px-3 py-2.5">
      <div className="num text-xl font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <div className="label-xs mt-0.5 truncate">{label}</div>
    </div>
  );
}
