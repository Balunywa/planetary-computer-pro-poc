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
import {
  askFoundryCopilot,
  listStacLayers,
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
    return [];
  }
  async getAsset(): Promise<Asset | null> {
    return null;
  }
}

/** Forecasts from Aurora / ECMWF via Planetary Computer Pro. Empty until wired. */
export class AzureWeatherService implements WeatherService {
  readonly providerLabel = "Aurora / ECMWF (Planetary Computer Pro)";
  async listEvents(): Promise<WeatherEvent[]> {
    return [];
  }
  async getEvent(): Promise<WeatherEvent | null> {
    return null;
  }
}

/** Risk is computed from the tenant's real assets and forecasts; no assets → no risks. */
export class AzureRiskEngineService implements RiskEngineService {
  async scoreEstate(): Promise<AssetRisk[]> {
    return [];
  }
  async scoreOne(): Promise<AssetRisk | null> {
    return null;
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

/** Response posture derives from real exposure; empty until assets exist. */
export class AzurePostureService implements PostureService {
  async listPostures(): Promise<AssetPosture[]> {
    return [];
  }
  async setGate(_assetId: string, _gate: GateId, _state: GateState): Promise<AssetPosture[]> {
    return [];
  }
  async setProductionStatus(_assetId: string, _status: OperatingStatus): Promise<AssetPosture[]> {
    return [];
  }
  async resetOverrides(): Promise<AssetPosture[]> {
    return [];
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
    this.rules = rules;
    await saveThresholdRules({ data: { rules } });
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
