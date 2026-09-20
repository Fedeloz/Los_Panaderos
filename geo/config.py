"""Shared config for the Sierra de Gata study area."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

# ~22 x 21 km covering the Sierra de Gata comarca (Hoyos, Gata, Valverde del
# Fresno, San Martin de Trevejo, ...). lon/lat, EPSG:4326.
BBOX_LON_MIN = -6.82
BBOX_LAT_MIN = 40.13
BBOX_LON_MAX = -6.55
BBOX_LAT_MAX = 40.32

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://wildfire:wildfire@localhost:5433/wildfire")
OSRM_BASE_URL = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")

DATA_RAW = ROOT / "data" / "raw"
DATA_DERIVED = ROOT / "data" / "derived"

CATASTRO_BU_WFS = "https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx"
