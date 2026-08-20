"""Build an :class:`aurora.Batch` of initial conditions for the endpoint.

Aurora needs a *history* of two consecutive 6-hourly states (t0-6h and t0) with
surface variables, static variables, and five atmospheric variables on 13
pressure levels. Two sources are supported:

* ``era5`` — downloaded from the Copernicus CDS. This mirrors the official Aurora
  quickstart exactly and yields all 13 levels, so it is the reference path.
* ``hres`` — read from local ECMWF HRES GRIB files (operational path). GRIB
  layouts vary by acquisition, so this loader is intentionally strict and fails
  with a clear message when an expected field is absent.

The returned batch is on CPU; the endpoint does the GPU work.
"""

from __future__ import annotations

import tempfile
from datetime import timedelta
from pathlib import Path

import numpy as np
import torch
import xarray as xr
from aurora import Batch, Metadata

from .config import ATMOS_LEVELS, Config

# CDS variable names -> the short names xarray exposes in the downloaded NetCDF.
_ERA5_SURFACE = {
    "2m_temperature": "t2m",
    "10m_u_component_of_wind": "u10",
    "10m_v_component_of_wind": "v10",
    "mean_sea_level_pressure": "msl",
}
_ERA5_STATIC = {
    "geopotential": "z",
    "land_sea_mask": "lsm",
    "soil_type": "slt",
}
_ERA5_ATMOS = {
    "temperature": "t",
    "u_component_of_wind": "u",
    "v_component_of_wind": "v",
    "specific_humidity": "q",
    "geopotential": "z",
}


def build_initial_condition(config: Config) -> Batch:
    if config.initial_condition_source == "era5":
        return _from_era5(config)
    return _from_hres(config)


# ---------------------------------------------------------------------------
# ERA5 (Copernicus CDS) — reference path
# ---------------------------------------------------------------------------


def _from_era5(config: Config) -> Batch:
    import cdsapi  # imported lazily so HRES users need not install it

    t0 = config.analysis_time
    t_prev = t0 - timedelta(hours=6)
    client = cdsapi.Client()

    with tempfile.TemporaryDirectory(prefix="aurora-era5-") as tmp:
        tmp_path = Path(tmp)
        surface_nc = tmp_path / "surface.nc"
        static_nc = tmp_path / "static.nc"
        atmos_nc = tmp_path / "atmospheric.nc"

        # Request both days and all synoptic hours, then select the two we need;
        # this is robust when t0-6h and t0 straddle midnight.
        days = sorted({t_prev.strftime("%Y-%m-%d"), t0.strftime("%Y-%m-%d")})
        hours = [f"{h:02d}:00" for h in (0, 6, 12, 18)]

        client.retrieve(
            "reanalysis-era5-single-levels",
            {
                "product_type": "reanalysis",
                "variable": list(_ERA5_SURFACE),
                "date": "/".join(days),
                "time": hours,
                "format": "netcdf",
            },
            str(surface_nc),
        )
        client.retrieve(
            "reanalysis-era5-single-levels",
            {
                "product_type": "reanalysis",
                "variable": list(_ERA5_STATIC),
                "date": t0.strftime("%Y-%m-%d"),
                "time": [t0.strftime("%H:00")],
                "format": "netcdf",
            },
            str(static_nc),
        )
        client.retrieve(
            "reanalysis-era5-pressure-levels",
            {
                "product_type": "reanalysis",
                "variable": list(_ERA5_ATMOS),
                "pressure_level": [str(level) for level in ATMOS_LEVELS],
                "date": "/".join(days),
                "time": hours,
                "format": "netcdf",
            },
            str(atmos_nc),
        )

        surface = xr.open_dataset(surface_nc, engine="netcdf4")
        static = xr.open_dataset(static_nc, engine="netcdf4")
        atmos = xr.open_dataset(atmos_nc, engine="netcdf4")

        i_prev, i_curr = _time_indices(surface, np.datetime64(t_prev), np.datetime64(t0))
        levels = tuple(int(level) for level in atmos["pressure_level"].values)
        _ensure_levels(levels)

        def surf(cds_name: str) -> torch.Tensor:
            var = surface[_ERA5_SURFACE[cds_name]].values
            return torch.from_numpy(var[[i_prev, i_curr]][None].astype("float32"))

        def stat(cds_name: str) -> torch.Tensor:
            return torch.from_numpy(static[_ERA5_STATIC[cds_name]].values[0].astype("float32"))

        def atm(cds_name: str) -> torch.Tensor:
            var = atmos[_ERA5_ATMOS[cds_name]].values
            return torch.from_numpy(var[[i_prev, i_curr]][None].astype("float32"))

        return Batch(
            surf_vars={
                "2t": surf("2m_temperature"),
                "10u": surf("10m_u_component_of_wind"),
                "10v": surf("10m_v_component_of_wind"),
                "msl": surf("mean_sea_level_pressure"),
            },
            static_vars={
                "z": stat("geopotential"),
                "lsm": stat("land_sea_mask"),
                "slt": stat("soil_type"),
            },
            atmos_vars={
                "t": atm("temperature"),
                "u": atm("u_component_of_wind"),
                "v": atm("v_component_of_wind"),
                "q": atm("specific_humidity"),
                "z": atm("geopotential"),
            },
            metadata=Metadata(
                lat=torch.from_numpy(surface["latitude"].values.astype("float32")),
                lon=torch.from_numpy(surface["longitude"].values.astype("float32")),
                time=(t0.replace(tzinfo=None),),
                atmos_levels=levels,
            ),
        )


def _time_indices(
    dataset: xr.Dataset, t_prev: np.datetime64, t0: np.datetime64
) -> tuple[int, int]:
    time_name = "valid_time" if "valid_time" in dataset.coords else "time"
    times = dataset[time_name].values.astype("datetime64[s]")

    def index_of(target: np.datetime64) -> int:
        matches = np.where(times == target.astype("datetime64[s]"))[0]
        if matches.size == 0:
            raise SystemExit(f"Initial-condition data is missing time step {target}.")
        return int(matches[0])

    return index_of(t_prev), index_of(t0)


def _ensure_levels(levels: tuple[int, ...]) -> None:
    if tuple(levels) != ATMOS_LEVELS:
        raise SystemExit(
            "Initial conditions must provide exactly Aurora's 13 pressure levels "
            f"{ATMOS_LEVELS}; got {levels}."
        )


# ---------------------------------------------------------------------------
# HRES GRIB — operational path
# ---------------------------------------------------------------------------


def _from_hres(config: Config) -> Batch:
    assert config.hres_input_dir is not None
    directory = Path(config.hres_input_dir)
    if not directory.is_dir():
        raise SystemExit(f"HRES_INPUT_DIR does not exist: {directory}")

    surface = _open_grib(directory, filter_keys={"typeOfLevel": "surface"})
    single = _open_grib(directory, filter_keys={"typeOfLevel": "heightAboveGround"})
    msl = _open_grib(directory, filter_keys={"typeOfLevel": "meanSea"})
    atmos = _open_grib(directory, filter_keys={"typeOfLevel": "isobaricInhPa"})

    t0 = config.analysis_time
    t_prev = t0 - timedelta(hours=6)
    i_prev, i_curr = _time_indices(atmos, np.datetime64(t_prev), np.datetime64(t0))

    atmos = atmos.sel(isobaricInhPa=list(ATMOS_LEVELS))
    _ensure_levels(tuple(int(level) for level in atmos["isobaricInhPa"].values))

    def two_step(dataset: xr.Dataset, name: str) -> torch.Tensor:
        return torch.from_numpy(
            dataset[name].values[[i_prev, i_curr]][None].astype("float32")
        )

    return Batch(
        surf_vars={
            "2t": two_step(single, "t2m"),
            "10u": two_step(single, "u10"),
            "10v": two_step(single, "v10"),
            "msl": two_step(msl, "msl"),
        },
        static_vars={
            "z": torch.from_numpy(surface["z"].values.astype("float32")),
            "lsm": torch.from_numpy(surface["lsm"].values.astype("float32")),
            "slt": torch.from_numpy(surface["slt"].values.astype("float32")),
        },
        atmos_vars={
            "t": two_step(atmos, "t"),
            "u": two_step(atmos, "u"),
            "v": two_step(atmos, "v"),
            "q": two_step(atmos, "q"),
            "z": two_step(atmos, "z"),
        },
        metadata=Metadata(
            lat=torch.from_numpy(atmos["latitude"].values.astype("float32")),
            lon=torch.from_numpy(atmos["longitude"].values.astype("float32")),
            time=(t0.replace(tzinfo=None),),
            atmos_levels=tuple(int(level) for level in atmos["isobaricInhPa"].values),
        ),
    )


def _open_grib(directory: Path, filter_keys: dict[str, str]) -> xr.Dataset:
    files = sorted(str(p) for p in directory.glob("*.grib")) + sorted(
        str(p) for p in directory.glob("*.grib2")
    )
    if not files:
        raise SystemExit(f"No .grib/.grib2 files found in {directory}.")
    try:
        return xr.open_mfdataset(
            files,
            engine="cfgrib",
            combine="nested",
            concat_dim="time",
            backend_kwargs={"filter_by_keys": filter_keys, "indexpath": ""},
        )
    except Exception as exc:  # noqa: BLE001 - GRIB decoding surfaces many error types
        raise SystemExit(
            f"Could not read HRES GRIB with filter {filter_keys}: {exc}"
        ) from exc
