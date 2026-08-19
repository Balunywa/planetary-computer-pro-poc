import { useMemo } from "react";

import { useOpsSnapshot } from "@/lib/hooks/use-ops-data";
import { ASSET_TYPE_LABEL, RISK_LABEL, riskColorVar } from "@/lib/format";
import { POSTURE_GATES } from "@/lib/services/posture";

function useTopRisk() {
  const { assets, risks } = useOpsSnapshot(72);
  return useMemo(() => {
    const r = [...risks].sort((a, b) => b.score - a.score)[0];
    if (!r) return null;
    return { risk: r, asset: assets.find((a) => a.id === r.assetId) };
  }, [risks, assets]);
}

/**
 * Landing proof panel. Runs the real scoring engine on the highest-exposure
 * asset in the sample estate and shows the factor decomposition, so the score
 * is auditable from the marketing page rather than asserted.
 */
export function ScoreProof() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <AssetScorePanel />
      <DecisionGatesPanel />
    </div>
  );
}

export function AssetScorePanel() {
  const top = useTopRisk();

  if (!top) {
    return <div className="bg-muted h-64 animate-pulse rounded-sm" />;
  }

  const { risk, asset } = top;
  const maxPoints = Math.max(...risk.factors.map((f) => Math.abs(f.points)), 1);
  const eta = risk.hoursToImpact;

  return (
    <div className="rounded-sm border bg-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-5 py-4">
        <h3 className="text-sm font-semibold tracking-tight">{asset?.name ?? risk.assetId}</h3>
        <span className="text-[11px] text-muted-foreground">
          {asset ? ASSET_TYPE_LABEL[asset.type] : ""}
        </span>
        <div className="ml-auto flex items-baseline gap-2">
          <span
            className="text-[10px] tracking-wide uppercase"
            style={{ color: riskColorVar(risk.level) }}
          >
            {RISK_LABEL[risk.level]}
          </span>
          <span
            className="num text-2xl font-semibold"
            style={{ color: riskColorVar(risk.level) }}
          >
            {Math.round(risk.score)}
          </span>
        </div>
      </div>

      <ul className="divide-y">
        {risk.factors.map((f) => (
          <li key={f.label} className="px-5 py-3">
            <div className="flex items-baseline gap-3">
              <span className="text-xs font-medium">{f.label}</span>
              <span className="num ml-auto text-xs font-medium">
                {f.points >= 0 ? "+" : ""}
                {Math.round(f.points)}
              </span>
            </div>
            <div className="bg-muted mt-1.5 h-1 w-full overflow-hidden rounded-full">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(Math.abs(f.points) / maxPoints) * 100}%`,
                  background: riskColorVar(risk.level),
                }}
              />
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{f.detail}</p>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 divide-x border-t sm:grid-cols-4">
        <Cell label="Distance" value={`${Math.round(risk.distanceMi)} mi`} />
        <Cell label="Peak wind" value={`${Math.round(risk.forecastWindMph)} mph`} />
        <Cell label="Rainfall" value={`${risk.rainfallIn.toFixed(1)} in`} />
        <Cell label="Impact" value={eta === null ? "—" : `T-${eta}h`} />
      </div>
    </div>
  );
}

export function DecisionGatesPanel() {
  const top = useTopRisk();

  if (!top) {
    return <div className="bg-muted h-64 animate-pulse rounded-sm" />;
  }

  const eta = top.risk.hoursToImpact;

  return (
    <div className="rounded-sm border bg-card">
      <div className="border-b px-5 py-4">
        <h3 className="text-sm font-semibold tracking-tight">Decision gates</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          The same lead-time board the incident management team runs, driven by the score above.
        </p>
      </div>
      <ol className="divide-y">
        {POSTURE_GATES.map((gate) => {
          const due = eta === null ? null : eta - gate.leadHours;
          const state = due === null ? "idle" : due <= 0 ? "complete" : due <= 12 ? "active" : "pending";
          return (
            <li key={gate.id} className="flex gap-3 px-5 py-3">
              <span
                className="mt-1 size-1.5 shrink-0 rounded-full"
                style={{
                  background:
                    state === "complete"
                      ? "var(--risk-critical)"
                      : state === "active"
                        ? "var(--risk-high)"
                        : "var(--color-border)",
                }}
              />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="num text-[11px] text-muted-foreground">{gate.id}</span>
                  <span className="text-xs font-medium">{gate.label}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {gate.description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <div className="num text-sm font-semibold">{value}</div>
      <div className="mt-0.5 text-[10px] tracking-wide text-muted-foreground uppercase">{label}</div>
    </div>
  );
}