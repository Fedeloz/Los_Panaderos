"""Synthetic padron: generate contacts for dwellings.

Hard rules baked in:
  - 8% of residential dwellings get ZERO contacts (the critical bucket).
  - source='SYNTHETIC' on every row, no exceptions.
  - Phone numbers use an obviously-fake 555 block, except up to 5 dwellings
    overridden with real team numbers from ALLOWED_PHONES (.env) so the live
    demo can ring a real phone on stage.

Run: python -m geo.synth_padron
"""
import os
import random
import sys

import psycopg

from geo import config

rng = random.Random(20260919)

EVACUABLE = ("residential", "tourist", "health", "education")

FIRST = ["Maria", "Jose", "Carmen", "Antonio", "Ana", "Manuel", "Isabel",
         "Francisco", "Dolores", "Juan", "Pilar", "Miguel", "Rosa", "Pedro",
         "Elena", "Rafael", "Lucia", "Fernando", "Marta", "Andrei", "Mohamed",
         "Jean", "Sorin", "Youssef", "Marie"]
LAST = ["Garcia", "Fernandez", "Lopez", "Martinez", "Sanchez", "Perez",
        "Martin", "Dominguez", "Hernandez", "Jimenez", "Nunez", "Camacho",
        "Calderon", "Barroso", "Miron", "Popescu", "Ionescu", "Dupont",
        "El Amrani", "Benali"]

NON_ES = ["en", "ro", "ar", "fr"]


def _synth_phone() -> str:
    return f"+3491555{rng.randint(1000, 9999)}"


def _vulnerability() -> dict:
    if rng.random() > 0.12:
        return {}
    v = {}
    if rng.random() < 0.20:
        v["mobility"] = "impaired"
    if rng.random() < 0.05:
        v["oxygen"] = True
    if rng.random() < 0.30:
        v["livestock"] = True
    if rng.random() < 0.40:
        v["lives_alone"] = True
    return v or {"lives_alone": True}


def main() -> None:
    team_phones = [p.strip() for p in
                   os.getenv("ALLOWED_PHONES", "").split(",") if p.strip()]

    with psycopg.connect(config.DATABASE_URL, autocommit=False) as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM contacts")
        cur.execute(
            "SELECT id, use_code, est_occupancy FROM dwellings "
            "WHERE use_code = ANY(%s) ORDER BY id",
            (list(EVACUABLE),),
        )
        dwellings = cur.fetchall()
        print(f"{len(dwellings)} evacuable dwellings")

        # choose up to 5 dwellings to carry real team phones
        demo_ids = {d[0] for d in rng.sample(dwellings, min(5, len(dwellings), len(team_phones)))}
        demo_phones = iter(team_phones)

        n_contacts = n_zero = n_vuln = n_nones = 0
        rows = []
        for dw_id, _use, occ in dwellings:
            if rng.random() < 0.08:
                n_zero += 1
                continue
            k = rng.randint(1, 4)
            vuln = _vulnerability()
            if vuln:
                n_vuln += 1
            for prio in range(1, k + 1):
                lang = "es" if rng.random() > 0.06 else rng.choice(NON_ES)
                if lang != "es":
                    n_nones += 1
                if dw_id in demo_ids and prio == 1:
                    phone = next(demo_phones, None)
                else:
                    phone = _synth_phone()
                rows.append((
                    dw_id,
                    f"{rng.choice(FIRST)} {rng.choice(LAST)}",
                    phone,
                    prio,
                    ["voice"] if prio == 1 else ["voice", "sms"],
                    lang,
                    psycopg.types.json.Jsonb(vuln),
                    "SYNTHETIC",
                ))
                n_contacts += 1

        cur.executemany(
            """
            INSERT INTO contacts
              (dwelling_id, display_name, phone_e164, priority,
               channels, language, vulnerability, source)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            rows,
        )
        conn.commit()

        print(f"contacts inserted: {n_contacts}")
        print(f"dwellings with zero contacts: {n_zero} "
              f"({100 * n_zero / max(1, len(dwellings)):.1f}% of evacuable)")
        print(f"vulnerable dwellings: {n_vuln}, non-es contacts: {n_nones}")
        cur.execute("SELECT count(*) FROM contacts WHERE source <> 'SYNTHETIC'")
        bad = cur.fetchone()[0]
        assert bad == 0, "non-SYNTHETIC contact leaked in"


if __name__ == "__main__":
    sys.exit(main())
