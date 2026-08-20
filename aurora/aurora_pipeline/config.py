"""Environment-driven configuration for the Aurora forecast pipeline.

Every value comes from the environment (or an adjacent ``.env`` loaded by the
caller) so the same code runs locally, in a container job, or in an AML pipeline
without edits. :func:`load_config` validates the combination up front and fails
with an actionable message rather than deep in an Azure SDK call.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone

# Aurora's fine-tuned 0.25-degree model expects these 13 pressure levels, in hPa.
ATMOS_LEVELS: tuple[int, ...] = (
    1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 50,
)

# Most recent synoptic hours that ECMWF produces analyses/forecasts for.
SYNOPTIC_HOURS: tuple[int, ...] = (0, 6, 12, 18)


@dataclass(frozen=True)
class BBox:
    """Detection domain in degrees. Longitudes use the -180..180 convention."""

    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float

    def contains(self, lon: float, lat: float) -> bool:
        return (
            self.min_lon <= lon <= self.max_lon
            and self.min_lat <= lat <= self.max_lat
        )


@dataclass(frozen=True)
class Config:
    endpoint: str
    endpoint_token: str
    model_name: str
    num_steps: int
    blob_channel_url: str

    initial_condition_source: str
    hres_input_dir: str | None
    analysis_time: datetime

    detection_bbox: BBox

    output_container_url: str | None
    output_sas_url: str | None
    output_blob_name: str

    @property
    def horizon_hours(self) -> int:
        return self.num_steps * 6


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def _parse_bbox(raw: str) -> BBox:
    parts = [p.strip() for p in raw.split(",")]
    if len(parts) != 4:
        raise SystemExit("DETECTION_BBOX must be 'minLon,minLat,maxLon,maxLat'.")
    try:
        min_lon, min_lat, max_lon, max_lat = (float(p) for p in parts)
    except ValueError as exc:  # noqa: BLE001 - surface a clear config error
        raise SystemExit(f"DETECTION_BBOX values must be numbers: {exc}") from exc
    if min_lon >= max_lon or min_lat >= max_lat:
        raise SystemExit("DETECTION_BBOX must have min < max for both lon and lat.")
    return BBox(min_lon, min_lat, max_lon, max_lat)


def _default_analysis_time(now: datetime | None = None) -> datetime:
    """Most recent synoptic cycle at least 6 h in the past (data latency buffer)."""
    now = now or datetime.now(timezone.utc)
    candidate = now.replace(minute=0, second=0, microsecond=0)
    # Step back to a synoptic hour, then one extra cycle for availability.
    while candidate.hour not in SYNOPTIC_HOURS:
        candidate = candidate.replace(hour=candidate.hour - 1)
    from datetime import timedelta

    return candidate - timedelta(hours=6)


def _parse_analysis_time(raw: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError as exc:  # noqa: BLE001
        raise SystemExit(f"ANALYSIS_TIME is not ISO-8601: {exc}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    if parsed.hour not in SYNOPTIC_HOURS:
        raise SystemExit("ANALYSIS_TIME hour must be one of 00, 06, 12, 18 UTC.")
    return parsed


def load_config() -> Config:
    source = os.environ.get("INITIAL_CONDITION_SOURCE", "era5").strip().lower()
    if source not in {"era5", "hres"}:
        raise SystemExit("INITIAL_CONDITION_SOURCE must be 'era5' or 'hres'.")

    hres_dir = os.environ.get("HRES_INPUT_DIR", "").strip() or None
    if source == "hres" and not hres_dir:
        raise SystemExit("HRES_INPUT_DIR is required when INITIAL_CONDITION_SOURCE=hres.")

    analysis_raw = os.environ.get("ANALYSIS_TIME", "").strip()
    analysis_time = (
        _parse_analysis_time(analysis_raw) if analysis_raw else _default_analysis_time()
    )

    num_steps = int(os.environ.get("AURORA_NUM_STEPS", "20"))
    if num_steps < 1 or num_steps > 60:
        raise SystemExit("AURORA_NUM_STEPS must be between 1 and 60.")

    output_container = os.environ.get("OUTPUT_CONTAINER_URL", "").strip() or None
    output_sas = os.environ.get("OUTPUT_SAS_URL", "").strip() or None
    if not output_container and not output_sas:
        raise SystemExit("Set OUTPUT_CONTAINER_URL (managed identity) or OUTPUT_SAS_URL.")

    return Config(
        endpoint=_require("AURORA_ENDPOINT"),
        endpoint_token=_require("AURORA_ENDPOINT_TOKEN"),
        model_name=os.environ.get("AURORA_MODEL_NAME", "aurora-0.25-finetuned").strip(),
        num_steps=num_steps,
        blob_channel_url=_require("AURORA_BLOB_CHANNEL_URL"),
        initial_condition_source=source,
        hres_input_dir=hres_dir,
        analysis_time=analysis_time,
        detection_bbox=_parse_bbox(os.environ.get("DETECTION_BBOX", "-100,15,-70,35")),
        output_container_url=output_container,
        output_sas_url=output_sas,
        output_blob_name=os.environ.get("OUTPUT_BLOB_NAME", "weather-events.json").strip(),
    )
