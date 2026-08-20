// Azure-backed providers. These implement the same interfaces as the mock
// providers, so no UI code changes. Real data comes from the tenant's Azure
// resources via the server functions in ./server; anything the customer has not
// ingested yet returns an honest empty result — never the synthetic sample estate.

import type {
  Asset,
  AssetPosture,
  AssetRisk,
  CopilotAnswer,
  GateId,
  GateState,
  GeospatialLayer,
  OperatingStatus,
  OpsAlert,
  ThresholdRule,
  WeatherEvent,
} from "@/lib/domain/types";
import { DEFAULT_RULES } from "@/lib/services/thresholds";
import type {
  AlertService,
  AssetService,
  CopilotService,
  PlanetaryComputerService,
  PostureService,
  RiskEngineService,
  ThresholdService,
  WeatherService,
} from "@/lib/services/interfaces";
import { derivePosture } from "@/lib/services/posture";
import { scoreAsset } from "@/lib/services/risk-engine";
import {
  askFoundryCopilot,
  listAuroraWeatherEvents,
  listStacLayers,
  listUploadedAssets,
  loadThresholdRules,
  saveThresholdRules,
} from "@/lib/services/azure/server";

/** Geospatial layers from the tenant's GeoCatalog STAC collections. */
export class AzurePlanetaryComputerService implements PlanetaryComputerService {
  listLayers(): Promise<GeospatialLayer[]> {
    return listStacLayers();
  }
}

/** Grounded assistant backed by Azure OpenAI (Foundry) via managed identity. */
export class AzureCopilotService implements CopilotService {
  suggestions(): string[] {
    return [
      "Which assets are most at risk over the next 72 hours?",
      "Summarize current exposure for leadership.",
      "What changed since the previous forecast cycle?",
    ];
  }
  ask(question: string): Promise<CopilotAnswer> {
    return askFoundryCopilot({ data: { question } });
  }
}

/**
 * Tenant assets. Bind this to your asset master (STAC items / Blob / Fabric).
 * Until the customer ingests their estate this is empty by design.
 */
export class AzureAssetService implements AssetService {
  async listAssets(): Promise<Asset[]> {
    return listUploadedAssets();
  }
  async getAsset(id: string): Promise<Asset | null> {
    const all = await listUploadedAssets();
    return all.find((a) => a.id === id) ?? null;
  }
}

/** Forecasts normalized by the Aurora post-processing job and persisted in Blob Storage. */
export class AzureWeatherService implements WeatherService {
  readonly providerLabel = "Aurora / ECMWF (Planetary Computer Pro)";
  listEvents(): Promise<WeatherEvent[]> {
    return listAuroraWeatherEvents();
  }
  async getEvent(id: string): Promise<WeatherEvent | null> {
    const events = await listAuroraWeatherEvents();
    return events.find((event) => event.id === id) ?? null;
  }
}

function highestRiskFor(
  asset: Asset,
  events: WeatherEvent[],
  horizonHours: number,
): AssetRisk | null {
  if (events.length === 0) return null;
  return events
    .map((event) => scoreAsset(asset, event, horizonHours))
    .reduce((highest, risk) => (risk.score > highest.score ? risk : highest));
}

/** Risk is computed from the tenant's real assets and forecasts; no assets → no risks. */
export class AzureRiskEngineService implements RiskEngineService {
  async scoreEstate(horizonHours = 120): Promise<AssetRisk[]> {
    const [assets, events] = await Promise.all([listUploadedAssets(), listAuroraWeatherEvents()]);
    return assets.flatMap((asset) => {
      const risk = highestRiskFor(asset, events, horizonHours);
      return risk ? [risk] : [];
    });
  }
  async scoreOne(assetId: string, horizonHours = 120): Promise<AssetRisk | null> {
    const [assets, events] = await Promise.all([listUploadedAssets(), listAuroraWeatherEvents()]);
    const asset = assets.find((candidate) => candidate.id === assetId);
    return asset ? highestRiskFor(asset, events, horizonHours) : null;
  }
}

/** Alerts derive from real threshold breaches; empty until data flows. */
export class AzureAlertService implements AlertService {
  async listAlerts(): Promise<OpsAlert[]> {
    return [];
  }
  async setStatus(): Promise<OpsAlert[]> {
    return [];
  }
}

/** Response posture derives from real exposure, with process-local operator overrides. */
export class AzurePostureService implements PostureService {
  private gateOverrides = new Map<string, Partial<Record<GateId, GateState>>>();
  private statusOverrides = new Map<string, OperatingStatus>();

  private async build(): Promise<AssetPosture[]> {
    const [assets, events] = await Promise.all([listUploadedAssets(), listAuroraWeatherEvents()]);
    return assets.map((asset) => {
      const base = derivePosture(asset, highestRiskFor(asset, events, 120) ?? undefined);
      return {
        ...base,
        gates: { ...base.gates, ...(this.gateOverrides.get(asset.id) ?? {}) },
        productionStatus: this.statusOverrides.get(asset.id) ?? base.productionStatus,
      };
    });
  }

  async listPostures(): Promise<AssetPosture[]> {
    return this.build();
  }
  async setGate(assetId: string, gate: GateId, state: GateState): Promise<AssetPosture[]> {
    const current = this.gateOverrides.get(assetId) ?? {};
    this.gateOverrides.set(assetId, { ...current, [gate]: state });
    return this.build();
  }
  async setProductionStatus(assetId: string, status: OperatingStatus): Promise<AssetPosture[]> {
    this.statusOverrides.set(assetId, status);
    return this.build();
  }
  async resetOverrides(): Promise<AssetPosture[]> {
    this.gateOverrides.clear();
    this.statusOverrides.clear();
    return this.build();
  }
}

/**
 * Threshold rules are operator configuration (not sample weather data). A fresh
 * deployment starts from the built-in starter defaults; operator edits are
 * persisted as a JSON blob in the deployment's storage container (see
 * loadThresholdRules / saveThresholdRules) so tuned limits survive restarts.
 * When storage is unwired (local dev) edits stay in memory for the session.
 */
export class AzureThresholdService implements ThresholdService {
  private rules: ThresholdRule[] | null = null;

  /** Load persisted rules once; fall back to built-in starter defaults. */
  private async ensure(): Promise<ThresholdRule[]> {
    if (this.rules) return this.rules;
    const stored = await loadThresholdRules();
    this.rules = stored && stored.length > 0 ? stored : DEFAULT_RULES.map((r) => ({ ...r }));
    return this.rules;
  }

  private async persist(rules: ThresholdRule[]): Promise<ThresholdRule[]> {
    const result = await saveThresholdRules({ data: { rules } });
    if (!result.ok) throw new Error(result.message);
    this.rules = rules;
    return rules;
  }

  async listRules(): Promise<ThresholdRule[]> {
    return this.ensure();
  }
  async saveRule(rule: ThresholdRule): Promise<ThresholdRule[]> {
    const rules = [...(await this.ensure())];
    const i = rules.findIndex((r) => r.id === rule.id);
    if (i >= 0) rules[i] = rule;
    else rules.push(rule);
    return this.persist(rules);
  }
  async deleteRule(id: string): Promise<ThresholdRule[]> {
    const rules = (await this.ensure()).filter((r) => r.id !== id);
    return this.persist(rules);
  }
  async resetRules(): Promise<ThresholdRule[]> {
    return this.persist(DEFAULT_RULES.map((r) => ({ ...r })));
  }
}
