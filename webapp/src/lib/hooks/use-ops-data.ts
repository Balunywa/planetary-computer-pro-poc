import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { Asset, AssetRisk, WeatherEvent } from "@/lib/domain/types";
import { services } from "@/lib/services";

export const assetsQuery = queryOptions({
  queryKey: ["assets"],
  queryFn: () => services.assets.listAssets(),
  staleTime: 5 * 60 * 1000,
});

export const eventsQuery = queryOptions({
  queryKey: ["events"],
  queryFn: () => services.weather.listEvents(),
  staleTime: 60 * 1000,
});

export const layersQuery = queryOptions({
  queryKey: ["layers"],
  queryFn: () => services.geospatial.listLayers(),
  staleTime: 10 * 60 * 1000,
});

export const alertsQuery = queryOptions({
  queryKey: ["alerts"],
  queryFn: () => services.alerts.listAlerts(),
  staleTime: 30 * 1000,
});

export const postureQuery = queryOptions({
  queryKey: ["posture"],
  queryFn: () => services.posture.listPostures(),
  staleTime: 30 * 1000,
});

export const thresholdRulesQuery = queryOptions({
  queryKey: ["threshold-rules"],
  queryFn: () => services.thresholds.listRules(),
  staleTime: 5 * 60 * 1000,
});

export function risksQuery(horizonHours: number) {
  return queryOptions({
    queryKey: ["risks", horizonHours],
    queryFn: () => services.risk.scoreEstate(horizonHours),
    staleTime: 60 * 1000,
  });
}

export interface OpsSnapshot {
  assets: Asset[];
  risks: AssetRisk[];
  riskMap: Map<string, AssetRisk>;
  event: WeatherEvent | undefined;
  isLoading: boolean;
  metrics: {
    monitored: number;
    exposed: number;
    insideCone: number;
    high: number;
    critical: number;
    firstImpactHours: number | null;
  };
}

export function useOpsSnapshot(horizonHours = 72): OpsSnapshot {
  const assets = useQuery(assetsQuery);
  const events = useQuery(eventsQuery);
  const risks = useQuery(risksQuery(horizonHours));

  return useMemo(() => {
    const a = assets.data ?? [];
    const r = risks.data ?? [];
    const riskMap = new Map(r.map((x) => [x.assetId, x]));
    const exposed = r.filter((x) => x.level !== "normal" && x.level !== "monitor");
    const impacts = r
      .filter((x) => x.hoursToImpact !== null && x.level !== "normal")
      .map((x) => x.hoursToImpact!)
      .sort((x, y) => x - y);
    return {
      assets: a,
      risks: r,
      riskMap,
      event: events.data?.[0],
      isLoading: assets.isLoading || risks.isLoading || events.isLoading,
      metrics: {
        monitored: a.length,
        exposed: exposed.length,
        insideCone: r.filter((x) => x.insideCone).length,
        high: r.filter((x) => x.level === "high").length,
        critical: r.filter((x) => x.level === "critical").length,
        firstImpactHours: impacts[0] ?? null,
      },
    };
  }, [assets.data, assets.isLoading, risks.data, risks.isLoading, events.data, events.isLoading]);
}
