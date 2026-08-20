# Aurora forecast pipeline

The web app renders **normalized `WeatherEvent` objects** (cyclone track, forecast
cone, intensity), not raw atmospheric grids. A live Azure ML **Aurora** endpoint
only produces atmospheric fields — it does not, on its own, populate the weather
map. This pipeline is the missing production business logic that connects the two:

```
ERA5 / HRES initial conditions
        │  (Batch: surface + 13 pressure levels + static)
        ▼
Aurora online endpoint  ──(FoundryClient + BlobStorageChannel)──►  predicted Batches
        │  (msl, 10u, 10v, t, z … on a lat/lon grid, every 6 h)
        ▼
Tropical-cyclone tracker  (MSL minima + 10 m wind maxima, linked across lead times)
        │
        ▼
Normalizer  ──►  WeatherEvent[]   (exact webapp/src/lib/domain/types.ts schema)
        │
        ▼
Publish  ──►  model-outputs/weather-events.json   (read by the App Service identity)
```

The web app's `getDataPlaneStatus` reports **"Adapter connected"** only when a
recent `weather-events.json` exists in the `model-outputs` container, so this job
running on a schedule is what flips the Deployment page from *"Adapter required"*
to a live, populated weather map.

## What this is (and is not)

- It **is** a real, runnable pipeline that calls the deployed Aurora endpoint and
  writes the domain objects the app consumes.
- It does **not** invent weather. When no tropical cyclone is present in the
  forecast domain, it publishes an empty event list — the map stays honestly empty.
- Aurora emits atmospheric state; the cyclone detection/tracking here is a
  pragmatic MSL-minimum + wind-maximum tracker, not an operational agency tracker.
  Treat its output as decision-support, not an official advisory.

## Prerequisites

- Python 3.11+
- Access to the deployed Aurora endpoint (scoring URI + token).
- A blob container the endpoint can use as its transfer **channel** (Aurora
  passes large tensors via blob storage, not the HTTP body). A short-lived
  read/write SAS URL for that container is required.
- Initial conditions. Two supported sources:
  - **ERA5** via the Copernicus CDS API (`cdsapi`) — the reference path used by
    the official Aurora examples. Requires free CDS credentials in `~/.cdsapirc`.
  - **HRES T0** GRIB files you already have on disk (operational path).
- Write access to the `model-outputs` container to publish the result. On Azure
  this uses the job's managed identity via `DefaultAzureCredential`; locally set
  `OUTPUT_SAS_URL` instead.

## Configure

Copy `.env.example` to `.env` and fill it in (or export the variables):

```bash
cp .env.example .env
```

## Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python -m aurora_pipeline.run
```

This fetches initial conditions, runs the endpoint, tracks cyclones, and writes
`weather-events.json` to the output container. Schedule it (Azure Container Apps
job, ACI, or an AML pipeline) on the ECMWF cycle cadence (00/06/12/18 UTC).

## Layout

| Module | Responsibility |
| --- | --- |
| `config.py` | Environment-driven configuration and validation |
| `initial_conditions.py` | Build an `aurora.Batch` from ERA5 (CDS) or HRES GRIB |
| `inference.py` | Call the Aurora endpoint via the Foundry client + blob channel |
| `tracking.py` | Detect and track tropical cyclones in the predicted grids |
| `normalize.py` | Convert tracks to the app's `WeatherEvent` schema |
| `publish.py` | Write `weather-events.json` to the output container |
| `run.py` | Orchestrate the end-to-end cycle |
