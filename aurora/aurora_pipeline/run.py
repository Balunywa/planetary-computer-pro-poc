"""End-to-end Aurora forecast cycle.

Fetch initial conditions -> run the endpoint -> track cyclones -> normalize ->
publish ``weather-events.json``. Run on the ECMWF cycle cadence (00/06/12/18 UTC).

    python -m aurora_pipeline.run

Every stage logs a one-line status so a scheduled run leaves an auditable trail.
Publishing an empty event list is a valid outcome: when no tropical cyclone is
present in the detection domain the weather map stays honestly empty.
"""

from __future__ import annotations

import logging
import sys

from .config import load_config
from .inference import run_forecast
from .initial_conditions import build_initial_condition
from .normalize import tracks_to_events
from .publish import publish_events
from .tracking import track_cyclones

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("aurora_pipeline")


def main() -> int:
    config = load_config()
    log.info(
        "Aurora cycle: analysis=%s source=%s steps=%d horizon=%dh",
        config.analysis_time.isoformat(),
        config.initial_condition_source,
        config.num_steps,
        config.horizon_hours,
    )

    log.info("Building initial conditions…")
    initial_condition = build_initial_condition(config)

    log.info("Submitting to Aurora endpoint %s…", config.endpoint)
    fields = run_forecast(config, initial_condition)
    log.info("Received %d predicted timesteps.", len(fields))

    log.info("Tracking tropical cyclones in the detection domain…")
    tracks = track_cyclones(config, fields)
    log.info("Found %d qualifying track(s).", len(tracks))

    events = tracks_to_events(config, tracks)

    blob_url = publish_events(config, events)
    log.info("Published %d event(s) to %s", len(events), blob_url)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 - top-level guard for scheduled runs
        log.exception("Aurora cycle failed: %s", exc)
        sys.exit(1)
