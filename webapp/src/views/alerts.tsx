import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { OpsLink } from "@/components/ops/ops-nav";
import { AppShell, PageHeader } from "@/components/ops/AppShell";
import { alertsQuery, assetsQuery, thresholdRulesQuery, useOpsSnapshot } from "@/lib/hooks/use-ops-data";
import { METRIC_LABEL, METRIC_UNIT, evaluateRules } from "@/lib/services/thresholds";
import { services } from "@/lib/services";
import { relativeTime, riskColorVar, utcStamp } from "@/lib/format";
import type { AlertSeverity, OpsAlert } from "@/lib/domain/types";


const SEVERITY_TONE: Record<AlertSeverity, "critical" | "high" | "monitor" | "normal"> = {
  critical: "critical",
  warning: "high",
  advisory: "monitor",
  info: "normal",
};

export function AlertsPage() {
  const qc = useQueryClient();
  const baseAlerts = useQuery(alertsQuery).data ?? [];
  const assets = useQuery(assetsQuery).data ?? [];
  const rules = useQuery(thresholdRulesQuery).data ?? [];
  const { risks } = useOpsSnapshot(120);
  const [localStatus, setLocalStatus] = useState<Record<string, OpsAlert["status"]>>({});

  // Threshold breaches become first-class alerts, so the feed reflects the
  // limits operators configured rather than a fixed list.
  const derived: OpsAlert[] = useMemo(() => {
    const nameOf = (id: string) => assets.find((a) => a.id === id)?.name ?? id;
    // Cap each rule to its most urgent facilities so one breached limit across
    // 40 wells doesn't bury every other alert in the feed.
    const perRule = new Map<string, number>();
    return evaluateRules(rules, assets, risks)
      .sort((a, b) => (a.hoursToImpact ?? 999) - (b.hoursToImpact ?? 999))
      .filter((b) => {
        const n = perRule.get(b.ruleId) ?? 0;
        if (n >= 4) return false;
        perRule.set(b.ruleId, n + 1);
        return true;
      })
      .map((b) => {
        const id = `${b.ruleId}-${b.assetId}`;
        return {
          id,
          title: `${nameOf(b.assetId)} — ${b.ruleName}`,
          detail: `${METRIC_LABEL[b.metric]} ${b.observed}${METRIC_UNIT[b.metric]} against a configured limit of ${b.comparator === "gte" ? "≥" : "≤"} ${b.threshold}${METRIC_UNIT[b.metric]}${b.hoursToImpact !== null ? `, onset in ${b.hoursToImpact} h` : ""}. ${b.action}`,
          severity: b.severity,
          assetId: b.assetId,
          eventId: "AL072026",
          status: localStatus[id] ?? "open",
          owner: b.owner,
          createdAtIso: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
        } satisfies OpsAlert;
      });
  }, [rules, assets, risks, localStatus]);

  const alerts = useMemo(() => [...derived, ...baseAlerts], [derived, baseAlerts]);
  const [severity, setSeverity] = useState<AlertSeverity | "all">("all");
  const [status, setStatus] = useState<OpsAlert["status"] | "all">("all");

  const rows = alerts
    .filter((a) => (severity === "all" ? true : a.severity === severity))
    .filter((a) => (status === "all" ? true : a.status === status));

  async function setAlertStatus(id: string, next: OpsAlert["status"]) {
    if (id.startsWith("THR-")) {
      setLocalStatus((s) => ({ ...s, [id]: next }));
      return;
    }
    await services.alerts.setStatus(id, next);
    await qc.invalidateQueries({ queryKey: ["alerts"] });
  }

  const counts = (["critical", "warning", "advisory", "info"] as AlertSeverity[]).map((s) => ({
    s,
    n: alerts.filter((a) => a.severity === s && a.status !== "resolved").length,
  }));

  return (
    <AppShell>
      <PageHeader
        title="Alerts"
        description="Threshold breaches, corridor entries and forecast updates routed to the accountable operations owner."
        actions={
          <OpsLink
            to="/thresholds"
            className="rounded-sm border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Configure thresholds
          </OpsLink>
        }
      />
      <div className="space-y-4 p-4">
        <div className="panel grid grid-cols-2 divide-x sm:grid-cols-4">
          {counts.map((c) => (
            <button
              key={c.s}
              onClick={() => setSeverity(severity === c.s ? "all" : c.s)}
              className={`px-4 py-3 text-left hover:bg-accent/50 ${severity === c.s ? "bg-accent/60" : ""}`}
            >
              <div className="label-xs" style={{ color: riskColorVar(SEVERITY_TONE[c.s]) }}>
                {c.s}
              </div>
              <div className="num mt-1 text-xl font-semibold">{c.n}</div>
            </button>
          ))}
        </div>

        <div className="panel">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as OpsAlert["status"] | "all")}
              className="rounded-sm border bg-card px-2 py-1.5 text-xs"
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
            <span className="ml-auto text-[11px] text-muted-foreground">{rows.length} alerts</span>
          </div>
          <ul className="divide-y">
            {rows.map((a) => {
              const asset = assets.find((x) => x.id === a.assetId);
              return (
                <li key={a.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: riskColorVar(SEVERITY_TONE[a.severity]) }}
                  />
                  <div className="min-w-[240px] flex-1">
                    <div className="text-xs font-medium">{a.title}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{a.detail}</div>
                    <div className="num mt-1 text-[10px] text-muted-foreground">
                      {a.id} · {asset ? asset.name : "Estate-wide"} · owner {a.owner} · {utcStamp(a.createdAtIso)} (
                      {relativeTime(a.createdAtIso)})
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-sm border px-2 py-1 text-[10px] tracking-wider uppercase">{a.status}</span>
                    {a.status === "open" && (
                      <button
                        onClick={() => setAlertStatus(a.id, "acknowledged")}
                        className="rounded-sm border px-2 py-1 text-[11px] hover:bg-accent"
                      >
                        Acknowledge
                      </button>
                    )}
                    {a.status !== "resolved" && (
                      <button
                        onClick={() => setAlertStatus(a.id, "resolved")}
                        className="rounded-sm border px-2 py-1 text-[11px] hover:bg-accent"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
