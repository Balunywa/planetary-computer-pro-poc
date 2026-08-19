// Service registry. Swap a mock provider for an Azure-backed provider here;
// no UI code imports a provider implementation directly.

import type { PlatformServices } from "@/lib/services/interfaces";
import {
  MockAlertService,
  MockAssetService,
  MockCopilotService,
  MockPlanetaryComputerService,
  MockPostureService,
  MockRiskEngineService,
  MockThresholdService,
  MockWeatherService,
} from "@/lib/services/mock-providers";

export const services: PlatformServices = {
  assets: new MockAssetService(),
  weather: new MockWeatherService(),
  risk: new MockRiskEngineService(),
  alerts: new MockAlertService(),
  posture: new MockPostureService(),
  thresholds: new MockThresholdService(),
  geospatial: new MockPlanetaryComputerService(),
  copilot: new MockCopilotService(),
};

export type { PlatformServices };
