"""Detect and track tropical cyclones in Aurora's predicted surface fields.

This is a pragmatic tracker, not an operational agency algorithm. At each lead
time it finds mean-sea-level-pressure minima that (a) sit below a pressure
threshold, (b) are a local minimum in a neighbourhood, and (c) coincide with a
10 m wind maximum above tropical-storm strength. Candidates are then linked
across consecutive 6-hourly steps by nearest neighbour within a plausible
movement radius. The result is a set of tracks the normalizer turns into
``WeatherEvent`` objects.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from .config import BBox, Config
from .inference import ForecastField

# Detection thresholds. Tropical-storm strength is ~17 m/s sustained wind; a
# tropical low is typically below ~1005 hPa. These are deliberately permissive so
# developing systems are caught early, then filtered by track quality.
_PRESSURE_THRESHOLD_PA = 1005_00.0  # 1005 hPa in Pa
_WIND_THRESHOLD_MS = 17.0
_NEIGHBOURHOOD_DEG = 2.0  # half-width of the local-minimum / wind search window
_MIN_CENTRE_SEPARATION_KM = 300.0
_MAX_STEP_MOVEMENT_KM = 550.0  # a fast storm over 6 h, with margin
_MIN_TRACK_POINTS = 2

EARTH_RADIUS_KM = 6371.0


@dataclass(frozen=True)
class Centre:
    lead_hours: int
    lat: float
    lon: float  # -180..180
    pressure_hpa: float
    wind_ms: float


Track = list[Centre]


def track_cyclones(config: Config, fields: list[ForecastField]) -> list[Track]:
    open_tracks: list[Track] = []
    closed_tracks: list[Track] = []

    for field in fields:
        centres = _find_centres(field, config.detection_bbox)
        open_tracks, closed = _link(open_tracks, centres, field.lead_hours)
        closed_tracks.extend(closed)

    closed_tracks.extend(open_tracks)
    return [t for t in closed_tracks if _is_valid_track(t)]


def _find_centres(field: ForecastField, bbox: BBox) -> list[Centre]:
    lon180 = _to_180(field.lon)
    lat_mask = (field.lat >= bbox.min_lat) & (field.lat <= bbox.max_lat)
    lon_mask = (lon180 >= bbox.min_lon) & (lon180 <= bbox.max_lon)
    lat_idx = np.where(lat_mask)[0]
    lon_idx = np.where(lon_mask)[0]
    if lat_idx.size == 0 or lon_idx.size == 0:
        return []

    sub_msl = field.msl[np.ix_(lat_idx, lon_idx)]
    sub_wind = field.wind10[np.ix_(lat_idx, lon_idx)]
    sub_lat = field.lat[lat_idx]
    sub_lon = lon180[lon_idx]

    # Grid resolution in cells for the neighbourhood window.
    dlat = abs(float(sub_lat[1] - sub_lat[0])) if sub_lat.size > 1 else 0.25
    radius = max(1, int(round(_NEIGHBOURHOOD_DEG / max(dlat, 1e-6))))

    local_min = _windowed(sub_msl, radius, np.min)
    wind_max = _windowed(sub_wind, radius, np.max)

    candidate = (
        (sub_msl == local_min)
        & (sub_msl < _PRESSURE_THRESHOLD_PA)
        & (wind_max >= _WIND_THRESHOLD_MS)
    )

    rows, cols = np.where(candidate)
    raw = [
        Centre(
            lead_hours=field.lead_hours,
            lat=float(sub_lat[r]),
            lon=float(sub_lon[c]),
            pressure_hpa=float(sub_msl[r, c]) / 100.0,
            wind_ms=float(wind_max[r, c]),
        )
        for r, c in zip(rows.tolist(), cols.tolist())
    ]
    return _deduplicate(raw)


def _windowed(grid: np.ndarray, radius: int, reducer) -> np.ndarray:
    window = 2 * radius + 1
    padded = np.pad(grid, radius, mode="edge")
    view = sliding_window_view(padded, (window, window))
    return reducer(view, axis=(2, 3))


def _deduplicate(centres: list[Centre]) -> list[Centre]:
    # Keep the deepest (lowest-pressure) centre when several are within the
    # minimum separation — avoids reporting one storm as several.
    kept: list[Centre] = []
    for centre in sorted(centres, key=lambda c: c.pressure_hpa):
        if all(
            _haversine_km(centre.lat, centre.lon, k.lat, k.lon) >= _MIN_CENTRE_SEPARATION_KM
            for k in kept
        ):
            kept.append(centre)
    return kept


def _link(
    open_tracks: list[Track], centres: list[Centre], lead_hours: int
) -> tuple[list[Track], list[Track]]:
    extendable = [t for t in open_tracks if lead_hours - t[-1].lead_hours == 6]
    stale = [t for t in open_tracks if lead_hours - t[-1].lead_hours != 6]

    still_open: list[Track] = []
    used_tracks: set[int] = set()
    remaining = list(centres)

    # Greedy nearest-neighbour assignment of centres to open tracks.
    pairs: list[tuple[float, int, Centre]] = []
    for ti, track in enumerate(extendable):
        last = track[-1]
        for centre in centres:
            d = _haversine_km(last.lat, last.lon, centre.lat, centre.lon)
            if d <= _MAX_STEP_MOVEMENT_KM:
                pairs.append((d, ti, centre))
    pairs.sort(key=lambda p: p[0])

    assigned_centres: set[tuple[int, float, float]] = set()
    for _, ti, centre in pairs:
        key = (centre.lead_hours, centre.lat, centre.lon)
        if ti in used_tracks or key in assigned_centres:
            continue
        extendable[ti].append(centre)
        used_tracks.add(ti)
        assigned_centres.add(key)

    for ti, track in enumerate(extendable):
        if ti in used_tracks:
            still_open.append(track)
        else:
            stale.append(track)

    unassigned = [
        c for c in remaining if (c.lead_hours, c.lat, c.lon) not in assigned_centres
    ]
    for centre in unassigned:
        still_open.append([centre])

    return still_open, stale


def _is_valid_track(track: Track) -> bool:
    if len(track) < _MIN_TRACK_POINTS:
        return False
    return min(c.pressure_hpa for c in track) < 1005.0


def _to_180(lon: np.ndarray) -> np.ndarray:
    return ((lon + 180.0) % 360.0) - 180.0


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    a = min(1.0, max(0.0, a))
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))
