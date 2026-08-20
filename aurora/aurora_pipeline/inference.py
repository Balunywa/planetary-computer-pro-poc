"""Call the deployed Aurora endpoint and collect predicted surface fields.

Aurora on Azure ML Foundry does not return tensors in the HTTP body — it streams
them through a blob-storage *channel*. :func:`run_forecast` submits the initial
condition, iterates the predicted :class:`aurora.Batch` objects, and reduces each
to the compact surface fields the tropical-cyclone tracker needs (mean sea-level
pressure and 10 m wind), tagged with lead time.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

import numpy as np

from .config import Config

if TYPE_CHECKING:
    from aurora import Batch


@dataclass(frozen=True)
class ForecastField:
    """One predicted timestep reduced to what cyclone tracking consumes."""

    lead_hours: int
    valid_time: datetime
    lat: np.ndarray  # (H,) degrees, descending
    lon: np.ndarray  # (W,) degrees, 0..360
    msl: np.ndarray  # (H, W) Pa
    wind10: np.ndarray  # (H, W) m/s, sqrt(u^2 + v^2)


def run_forecast(config: Config, initial_condition: Batch) -> list[ForecastField]:
    # Imported lazily so config validation can run without the endpoint SDK.
    from aurora.foundry import BlobStorageChannel, FoundryClient, submit

    foundry_client = FoundryClient(
        endpoint=config.endpoint,
        token=config.endpoint_token,
    )
    channel = BlobStorageChannel(config.blob_channel_url)

    analysis_time = initial_condition.metadata.time[-1]
    fields: list[ForecastField] = []

    for prediction in submit(
        batch=initial_condition,
        model_name=config.model_name,
        num_steps=config.num_steps,
        foundry_client=foundry_client,
        channel=channel,
    ):
        fields.append(_reduce(prediction, analysis_time))

    fields.sort(key=lambda f: f.lead_hours)
    return fields


def _reduce(prediction: Batch, analysis_time: datetime) -> ForecastField:
    valid_time = prediction.metadata.time[-1]
    lead_hours = round((valid_time - analysis_time).total_seconds() / 3600)

    lat = _to_numpy(prediction.metadata.lat)
    lon = _to_numpy(prediction.metadata.lon)
    msl = _last_step(prediction.surf_vars["msl"])
    u10 = _last_step(prediction.surf_vars["10u"])
    v10 = _last_step(prediction.surf_vars["10v"])
    wind10 = np.sqrt(u10**2 + v10**2)

    return ForecastField(
        lead_hours=lead_hours,
        valid_time=valid_time,
        lat=lat,
        lon=lon,
        msl=msl,
        wind10=wind10,
    )


def _to_numpy(tensor) -> np.ndarray:
    return tensor.detach().cpu().numpy() if hasattr(tensor, "detach") else np.asarray(tensor)


def _last_step(tensor) -> np.ndarray:
    """Aurora surface tensors are (batch, time, H, W); take the newest state."""
    array = _to_numpy(tensor)
    while array.ndim > 2:
        array = array[-1]
    return array
