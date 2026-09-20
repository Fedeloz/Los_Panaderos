# Avances — Wildfire Coordination System

Spec: `../docs/BUILD_SPEC.md` (raíz del workspace). Área de estudio: **Sierra de Gata (Cáceres)**, bbox lon -6.82..-6.55, lat 40.13..40.32. Alcance acordado: fases 1, 2, 3, 6, 7 (núcleo + consola + escenario). Fase 5 (swarm) y 4 (HappyRobot) fuera del corte actual; el MCP de workflows existe y la fase 4 sería ejecutable por agente si se retoma.

## Estado por fase

| Fase | Estado | Notas |
|---|---|---|
| Scaffold | ✅ | Layout `db/ engine/ geo/ api/ console/ scenarios/ data/`, docker-compose, Makefile, requirements, schema.sql |
| Endpoints externos | ✅ verificados en vivo | Ver tabla abajo |
| F1 Geo (PostGIS + Catastro + padrón sintético + resolve) | 🔶 | PostGIS 3.4 arriba en :5433. Loader Catastro escrito; depurando que el filtro FES no se aplica server-side (devuelve primeras N features sin filtrar) |
| F2 Motor propagación | 🔶 | `fuel_models.csv` + `worldcover_to_fuel.csv` + `rothermel.py` escritos; falta propagate/czml/run_scenario |
| F3 Tool API | ⬜ | Contratos en spec §8 |
| F6 Consola Cesium | ⬜ | **Prioridad del usuario**: mapa + UI primero |
| F7 Escenario | ⬜ | sierra_de_gata_2026 |

## Verificación de endpoints en vivo (hecha antes de codificar)

| Servicio | Resultado |
|---|---|
| Catastro INSPIRE wfsBU | GetCapabilities OK. Tipos: `bu:Building`, `bu:BuildingPart`, `bu:OtherConstruction`. KVP `bbox` NO funciona ("No records founded"); FES 2.0 `filter` con gml:Envelope devuelve features **pero sin filtrar espacialmente** → investigando stored queries |
| Copernicus DEM GLO-30 | ✅ tile N40_W007 COG público, descargado y recortado → `data/derived/dem_30m.tif` (684×972) |
| CORINE | ⚠️ requiere registro → sustituido por **ESA WorldCover 2021 10 m** (S3 público, sin key). Mosaico → `data/derived/landcover_10m.tif` (2280×3240). Desviación del spec reportada y justificada |
| Open-Meteo | ✅ sin key. Actual: viento 13.4 km/h del 153°, 27.2 °C, RH 32 % |
| OSRM público | ✅ rutas driving reales (fallback si no hay key de routing) |
| NASA FIRMS | endpoint existe; pide `MAP_KEY` real. `NASA_KEY` y `CESIUM_API_KEY` NO estaban en el .env raíz a pesar de lo indicado — placeholders en `Los_Panaderos/.env`, rellenar cuando haya valores |

## Decisiones / desviaciones reportadas

- **Python 3.12** en lugar de 3.11 (lo que hay en la máquina).
- **Puerto Postgres 5433** (5432 ocupado por otro proyecto: `comparator-web-postgres-1`).
- **ESA WorldCover** en lugar de CORINE (sin registro).
- OSRM público como routing (sin key de Google).
- `simulator/` y `tests/` del demo antiguo se conservan; el sistema nuevo vive en la raíz del repo en paralelo.

## Cómo probar ahora

```sh
docker compose up -d db                                   # PostGIS :5433
./.venv/Scripts/python -m geo.fetch_data                  # rasters (ya hecho)
./.venv/Scripts/python -m geo.load_catastro               # en depuración
./.venv/Scripts/python -m geo.synth_padron                # tras el load
```
