"""Polygon -> dwellings -> contacts resolution, with explicit zero-contact gap.

The LEFT JOIN is the whole point: an inner join here silently deletes the
dwellings most at risk.
"""
from dataclasses import dataclass, field

import psycopg

from geo import config

EVACUABLE = ("residential", "tourist", "health", "education")


@dataclass
class ZoneResolution:
    incident_id: str
    dwellings_total: int = 0
    dwellings_residential: int = 0
    contacts_total: int = 0
    dwellings_without_contacts: int = 0
    vulnerable_count: int = 0
    dwellings: list[dict] = field(default_factory=list)


def resolve_zone(incident_id: str, db_url: str | None = None) -> ZoneResolution:
    """Resolve an incident's evac_polygon into dwellings + contacts + counts."""
    res = ZoneResolution(incident_id=incident_id)
    with psycopg.connect(db_url or config.DATABASE_URL) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT d.id, d.cadastral_ref, d.use_code, d.est_occupancy,
                   ST_Y(d.centroid::geometry) AS lat,
                   ST_X(d.centroid::geometry) AS lon,
                   d.plus_code,
                   c.id AS contact_id, c.display_name, c.phone_e164,
                   c.priority, c.channels, c.language, c.vulnerability
            FROM incidents i
            JOIN dwellings d
              ON ST_Intersects(i.evac_polygon, d.geom)
            LEFT JOIN contacts c ON c.dwelling_id = d.id
            WHERE i.id = %s
              AND d.use_code = ANY(%s)
            ORDER BY d.id, c.priority NULLS LAST
            """,
            (incident_id, list(EVACUABLE)),
        )
        rows = cur.fetchall()

    by_dwelling: dict[int, dict] = {}
    for r in rows:
        (dw_id, refcat, use, occ, lat, lon, pc, cid, name, phone,
         prio, chans, lang, vuln) = r
        d = by_dwelling.setdefault(dw_id, {
            "dwelling_id": dw_id, "cadastral_ref": refcat, "use_code": use,
            "est_occupancy": occ, "lat": lat, "lon": lon, "plus_code": pc,
            "contacts": [],
        })
        if cid is not None:
            d["contacts"].append({
                "contact_id": cid, "display_name": name, "phone_e164": phone,
                "priority": prio, "channels": chans, "language": lang,
                "vulnerability": vuln,
            })

    res.dwellings = list(by_dwelling.values())
    res.dwellings_total = len(res.dwellings)
    res.dwellings_residential = sum(
        1 for d in res.dwellings if d["use_code"] == "residential")
    res.contacts_total = sum(len(d["contacts"]) for d in res.dwellings)
    res.dwellings_without_contacts = sum(
        1 for d in res.dwellings if not d["contacts"])
    res.vulnerable_count = sum(
        1 for d in res.dwellings
        if any((c["vulnerability"] or {}) for c in d["contacts"]))
    return res
