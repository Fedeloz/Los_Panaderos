"""Fetch raw rasters for the study area: Copernicus DEM GLO-30 + ESA WorldCover.

CORINE needs registration, so fuel reclassification uses the openly licensed
ESA WorldCover 2021 10 m product instead (public S3 bucket, no key).

Run: python -m geo.fetch_data
"""
import io
import sys

import httpx
import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds

from geo import config

DEM_TILE = (
    "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/"
    "Copernicus_DSM_COG_10_N40_00_W007_00_DEM/"
    "Copernicus_DSM_COG_10_N40_00_W007_00_DEM.tif"
)
# WorldCover tiles are 3x3 degrees; the bbox straddles the -6 deg line.
WC_TILES = [
    "https://esa-worldcover.s3.eu-central-1.amazonaws.com/"
    f"v200/2021/map/ESA_WorldCover_10m_2021_v200_{t}_Map.tif"
    for t in ("N39W009", "N39W006")
]


def _crop(url: str, out_path, bbox_4326, band_desc: str) -> None:
    """Windowed read of a remote COG -> local GeoTIFF clipped to bbox."""
    with rasterio.open(url) as src:
        left, bottom, right, top = transform_bounds(
            "EPSG:4326", src.crs, *bbox_4326, densify_pts=21
        )
        win = from_bounds(left, bottom, right, top, transform=src.transform)
        arr = src.read(1, window=win)
        tr = src.window_transform(win)
        profile = src.profile.copy()
        profile.update(
            height=arr.shape[0],
            width=arr.shape[1],
            transform=tr,
            driver="GTiff",
            compress="deflate",
        )
        profile.pop("blockxsize", None)
        profile.pop("blockysize", None)
        profile.pop("tiled", None)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with rasterio.open(out_path, "w", **profile) as dst:
            dst.write(arr, 1)
    print(f"  wrote {out_path} {arr.shape} ({band_desc})")


def fetch_weather(lat: float, lon: float) -> dict:
    """Current + 24 h forecast from Open-Meteo (no key)."""
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        "&current=wind_speed_10m,wind_direction_10m,temperature_2m,relative_humidity_2m"
        "&hourly=wind_speed_10m,wind_direction_10m,temperature_2m,relative_humidity_2m"
        "&forecast_days=1&wind_speed_unit=kmh"
    )
    r = httpx.get(url, timeout=30)
    r.raise_for_status()
    return r.json()


def main() -> None:
    bbox = (
        config.BBOX_LON_MIN,
        config.BBOX_LAT_MIN,
        config.BBOX_LON_MAX,
        config.BBOX_LAT_MAX,
    )
    print("Cropping Copernicus DEM GLO-30 to study area ...")
    _crop(DEM_TILE, config.DATA_DERIVED / "dem_30m.tif", bbox, "dem")

    print("Fetching ESA WorldCover tiles ...")
    rasters = []
    for url in WC_TILES:
        try:
            r = httpx.get(url, timeout=300, follow_redirects=True)
            r.raise_for_status()
            rasters.append(io.BytesIO(r.content))
            print(f"  {url.rsplit('/', 1)[-1]}: {len(r.content) // 1_048_576} MB")
        except Exception as e:  # noqa: BLE001
            print(f"  WARN tile failed: {url} ({e})")
    if rasters:
        srcs = [rasterio.open(b) for b in rasters]
        mosaic, tr = merge(srcs)
        profile = srcs[0].profile.copy()
        profile.update(
            height=mosaic.shape[1],
            width=mosaic.shape[2],
            transform=tr,
            compress="deflate",
        )
        profile.pop("blockxsize", None)
        profile.pop("blockysize", None)
        profile.pop("tiled", None)
        mosaic_path = config.DATA_DERIVED / "worldcover_mosaic.tif"
        with rasterio.open(mosaic_path, "w", **profile) as dst:
            dst.write(mosaic)
        for s in srcs:
            s.close()
        _crop(str(mosaic_path), config.DATA_DERIVED / "landcover_10m.tif", bbox, "landcover")
        mosaic_path.unlink()

    wx = fetch_weather(
        (config.BBOX_LAT_MIN + config.BBOX_LAT_MAX) / 2,
        (config.BBOX_LON_MIN + config.BBOX_LON_MAX) / 2,
    )
    cur = wx["current"]
    print(
        "Open-Meteo current: "
        f"wind {cur['wind_speed_10m']} km/h from {cur['wind_direction_10m']} deg, "
        f"{cur['temperature_2m']} C, RH {cur['relative_humidity_2m']}%"
    )


if __name__ == "__main__":
    sys.exit(main())
