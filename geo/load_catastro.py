"""Load Catastro INSPIRE buildings (bu:Building) for the study area -> dwellings.

Verified live: the wfsBU service ignores KVP bbox; it needs an FES 2.0
``filter`` parameter containing a gml:Envelope. Geometry arrives in
EPSG:25830 (UTM 30N); we reproject to 4326.

Run: python -m geo.load_catastro
"""
import sys
import time
import xml.etree.ElementTree as ET

import httpx
import psycopg
from openlocationcode import openlocationcode as olc
from pyproj import Transformer

from geo import config

PAGE = 500
# ~4 km tiles keep every page well under the server's feature cap.
TILE_DEG = 0.036

_to_4326 = Transformer.from_crs("EPSG:25830", "EPSG:4326", always_xy=True)


def _localname(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _find(el, name):
    for c in el.iter():
        if _localname(c.tag) == name:
            return c
    return None


def _findall(el, name):
    return [c for c in el.iter() if _localname(c.tag) == name]


def use_code(current_use: str | None) -> str:
    """INSPIRE currentUse -> spec use_code."""
    if not current_use:
        return "other"
    u = current_use.lower()
    if "residential" in u:
        return "residential"
    if "agriculture" in u or "agricultural" in u or "greenhouse" in u:
        return "agricultural"
    if "industrial" in u:
        return "industrial"
    if "health" in u or "medical" in u or "hospital" in u:
        return "health"
    if "educat" in u or "school" in u:
        return "education"
    if "hotel" in u or "tourist" in u or "accommodation" in u:
        return "tourist"
    return "other"


EVACUABLE = {"residential", "tourist", "health", "education"}


def _fes_bbox_filter(lat_min: float, lon_min: float, lat_max: float, lon_max: float) -> str:
    return (
        '<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0">'
        "<fes:BBOX><fes:ValueReference>geometry</fes:ValueReference>"
        '<gml:Envelope xmlns:gml="http://www.opengis.net/gml/3.2" '
        'srsName="urn:ogc:def:crs:EPSG::4326">'
        f"<gml:lowerCorner>{lat_min} {lon_min}</gml:lowerCorner>"
        f"<gml:upperCorner>{lat_max} {lon_max}</gml:upperCorner>"
        "</gml:Envelope></fes:BBOX></fes:Filter>"
    )


def _parse_members(xml: bytes):
    """Yield (refcat, use_code, wkt_polygon_4326, centroid_lonlat) per Building."""
    root = ET.fromstring(xml.decode("latin-1"))
    for member in _findall(root, "member") + _findall(root, "featureMember"):
        building = None
        for c in member:
            if "Building" in _localname(c.tag):
                building = c
                break
        if building is None:
            continue

        local_id = _find(building, "localId")
        refcat = local_id.text.strip() if local_id is not None and local_id.text else None
        cur_use_el = _find(building, "currentUse")
        cur_use = cur_use_el.text.strip() if cur_use_el is not None and cur_use_el.text else None

        rings = []
        for poslist in _findall(building, "posList"):
            vals = [float(v) for v in (poslist.text or "").split()]
            pts = list(zip(vals[0::2], vals[1::2]))
            lonlat = [_to_4326.transform(x, y) for x, y in pts]
            rings.append(lonlat)
        if not rings:
            env = _find(building, "Envelope")
            if env is None:
                continue
            lc = _find(env, "lowerCorner").text.split()
            uc = _find(env, "upperCorner").text.split()
            x0, y0 = float(lc[0]), float(lc[1])
            x1, y1 = float(uc[0]), float(uc[1])
            rings = [[_to_4326.transform(x, y) for x, y in
                      [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]]]

        exterior = rings[0]
        holes = "".join(
            ",(" + ",".join(f"{p[0]} {p[1]}" for p in r) + ")" for r in rings[1:]
        )
        wkt = (
            "POLYGON(("
            + ",".join(f"{p[0]} {p[1]}" for p in exterior)
            + ")" + holes + ")"
        )
        cx = sum(p[0] for p in exterior) / len(exterior)
        cy = sum(p[1] for p in exterior) / len(exterior)
        yield refcat, use_code(cur_use), wkt, (cx, cy)


def fetch_tile(client, lat_min, lon_min, lat_max, lon_max):
    """Page through one bbox tile; yields parsed building tuples."""
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": "bu:Building",
        "count": str(PAGE),
        "filter": _fes_bbox_filter(lat_min, lon_min, lat_max, lon_max),
    }
    start = 0
    while True:
        params["startIndex"] = str(start)
        r = client.get(config.CATASTRO_BU_WFS, params=params, timeout=180)
        if r.status_code != 200:
            raise RuntimeError(f"WFS HTTP {r.status_code}: {r.text[:200]}")
        body = r.content
        if b"ExceptionReport" in body[:400]:
            if b"No records founded" in body:
                return
            raise RuntimeError(f"WFS exception: {body[:300]!r}")
        n = 0
        for item in _parse_members(body):
            n += 1
            yield item
        if n < PAGE:
            return
        start += n


def main() -> None:
    tiles = []
    lat = config.BBOX_LAT_MIN
    while lat < config.BBOX_LAT_MAX:
        lon = config.BBOX_LON_MIN
        while lon < config.BBOX_LON_MAX:
            tiles.append((lat, lon, min(lat + TILE_DEG, config.BBOX_LAT_MAX),
                          min(lon + TILE_DEG, config.BBOX_LON_MAX)))
            lon += TILE_DEG
        lat += TILE_DEG
    print(f"Study area split into {len(tiles)} WFS tiles")

    inserted = 0
    skipped = 0
    t0 = time.time()
    with psycopg.connect(config.DATABASE_URL) as conn, conn.cursor() as cur, \
            httpx.Client() as client:
        for i, (a, b, c, d) in enumerate(tiles):
            tile_n = 0
            for refcat, uc, wkt, (cx, cy) in fetch_tile(client, a, b, c, d):
                try:
                    cur.execute(
                        """
                        INSERT INTO dwellings
                            (cadastral_ref, geom, centroid, use_code,
                             est_occupancy, plus_code)
                        VALUES (
                            %s,
                            ST_GeogFromText(%s)::geography,
                            ST_GeogFromText('POINT(' || %s || ' ' || %s || ')'),
                            %s,
                            CASE WHEN %s IN ('residential','tourist','health','education')
                                 THEN GREATEST(1, ROUND(ST_Area(
                                     ST_GeogFromText(%s)::geometry) / 60)::int)
                                 ELSE NULL END,
                            %s)
                        ON CONFLICT (cadastral_ref) DO NOTHING
                        """,
                        (refcat, wkt, cx, cy, uc, uc, wkt, olc.encode(cy, cx)),
                    )
                    inserted += cur.rowcount
                    tile_n += cur.rowcount
                except Exception as e:  # noqa: BLE001
                    skipped += 1
                    conn.rollback()
                    print(f"  skip {refcat}: {e}")
                    continue
            conn.commit()
            print(f"  tile {i + 1}/{len(tiles)} ({a:.3f},{b:.3f}): +{tile_n} "
                  f"(total {inserted}, {time.time() - t0:.0f}s)")

        cur.execute("SELECT use_code, count(*) FROM dwellings GROUP BY 1 ORDER BY 2 DESC")
        print("\nuse_code distribution:")
        for row in cur.fetchall():
            print(f"  {row[0]:<14} {row[1]}")
    print(f"\nDone: {inserted} inserted, {skipped} skipped")


if __name__ == "__main__":
    sys.exit(main())
