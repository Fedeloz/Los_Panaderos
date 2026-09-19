"""One-shot liveness check for every external endpoint the system depends on."""
import json
import urllib.request
import urllib.error

CHECKS = [
    (
        "catastro_bu_wfs_capabilities",
        "https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx?service=WFS&request=GetCapabilities",
    ),
    (
        "copernicus_dem_glo30_tile_n40_w007",
        "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/"
        "Copernicus_DSM_COG_10_N40_00_W007_00_DEM/"
        "Copernicus_DSM_COG_10_N40_00_W007_00_DEM.tif",
    ),
    (
        "esa_worldcover_tile_n39_w009",
        "https://esa-worldcover.s3.eu-central-1.amazonaws.com/"
        "v200/2021/map/ESA_WorldCover_10m_2021_v200_N39W009_Map.tif",
    ),
    (
        "open_meteo_forecast",
        "https://api.open-meteo.com/v1/forecast?latitude=40.23&longitude=-6.66"
        "&hourly=wind_speed_10m,wind_direction_10m,temperature_2m,relative_humidity_2m&forecast_days=1",
    ),
    (
        "osrm_route",
        "https://router.project-osrm.org/route/v1/driving/-6.72,40.17;-6.60,40.23?overview=false",
    ),
    (
        "nasa_firms_api_ping",
        "https://firms.modaps.eosdis.nasa.gov/api/area/csv/MAP_KEY/VIIRS_SNPP_NRT/world/1",
    ),
]


def main() -> None:
    for name, url in CHECKS:
        u = url.replace("MAP_KEY", "DEMO_KEY")
        req = urllib.request.Request(u, headers={"User-Agent": "endpoint-check"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read(400)
                print(f"{name}: HTTP {r.status} {len(body)}B {body[:120]!r}")
        except urllib.error.HTTPError as e:
            print(f"{name}: HTTP {e.code} {e.read(200)!r}")
        except Exception as e:  # noqa: BLE001
            print(f"{name}: FAIL {type(e).__name__} {e}")


if __name__ == "__main__":
    main()
