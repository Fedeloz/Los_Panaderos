# Population and illustrated districts

Verified on 19 September 2026:

- [Ayuntamiento de Brunete: datos estadísticos](https://brunete.org/nuestro-pueblo/datos-estadisticos/) reports **11,261 census residents**, reference year **2025**. The page identifies INE's annual census and was revised July 2026.
- [Comunidad de Madrid: Población total censada de Brunete](https://gestiona.comunidad.madrid/desvan/desvan/AccionDatosUnaSerie.icm?codMun=0262&codTema=1929381) corroborates 11,261 at 1 January 2025 and identifies the INE annual census as its source.
- This is a **municipal census total**, not a count of people currently inside the illustrated town footprint. Other population series, such as the municipal register, can differ; they are not mixed into this scenario.

## Scenario allocation

| District ID | Display name | Count | Basis |
|---|---|---:|---|
| town | Casco Histórico | 3,942 | 35% scenario allocation |
| town_north | Prado Alto | 2,815 | 25% scenario allocation |
| town_south | Prado Nuevo | 3,378 | 30% scenario allocation |
| town_rosales | Valle de los Rosales | 1,126 | 10% scenario allocation |
| farm | El Álamo Farm | 100 | Assumed visitors and staff |

The four town counts sum to **11,261**. The names are inspired by Brunete neighbourhoods; their placement and street-following polygons belong to the illustration and are not real administrative boundaries. Their counts are scenario allocations, not official census-section counts. No verified population distribution is asserted for these sectors. The whole municipal population is concentrated into the schematic town for the demonstration. Farm occupants are a separate scenario group, not a revision to the official census number; total simulated people are 11,361.

[Granja Escuela El Álamo's own accommodation page](https://www.granjaelalamo.es/albergue) describes group lodging but does not establish current occupancy or permanent population. The demo uses 100 visitors and staff, explicitly marked assumed, not presented as a sourced farm population or capacity.

## Map and model

The clean illustrated asset is an image-generation edit of the user-approved map concept. Original aerial reference: PNOA máxima actualidad, CC BY 4.0 scne.es; the image, framing and overlays have been modified. The illustrated map is not georeferenced. Roads, land-cover polygons, population anchors and refuges are registered schematically to the illustration. Each district is a single moving population group in the existing demo physics. House drawings are orientation details, not a household census.

Authoritative local scenario configuration: `simulator/static/maps/brunete-illustrated.json`.

Neighbourhood naming: [BOCM, 16 April 2014, p. 204](https://origin-www.bocm.es/boletin/CM_Orden_BOCM/2014/04/16/BOCM-20140416-40.PDF) lists Brunete's Prado Alto, Prado Nuevo and Valle Los Rosales urbanisations. [Brunete, Historia y Vida](https://brunetehistoriayvida.es/tercera-fase/) describes the casco histórico. These sources establish names, not this illustration's geometry or allocated counts. Original IDs town_north/town_south are retained for existing integration compatibility; human-facing names come from the current district metadata.

## Muster points

One per district, so the four town districts never converge on the same place. The facility
names are real Brunete municipal facilities, verified on 20 September 2026:

| District | Muster point | Cell | Source |
|---|---|---|---|
| town (Casco Histórico) | Polideportivo Municipal José Ramón de la Morena, C/ Estudiantes 1 | (5,30) | [Ayuntamiento de Brunete: teléfonos de interés](https://brunete.org/el-ayuntamiento/telefonos-de-interes/), [Concejalía de Deportes](https://brunete.org/concejalias/deportes/) |
| town_north (Prado Alto) | Patio del Colegio Público Ágora, C/ Miguel Induráin s/n | (17,30) | [Ayuntamiento de Brunete: teléfonos de interés](https://brunete.org/el-ayuntamiento/telefonos-de-interes/) |
| town_south (Prado Nuevo) | Estadio Municipal Los Arcos, C/ Arcos esquina con Madrid | (15,44) | [Ayuntamiento de Brunete: teléfonos de interés](https://brunete.org/el-ayuntamiento/telefonos-de-interes/) |
| town_rosales (Valle de los Rosales) | Explanada de la carretera del Valle de los Rosales | (6,16) | [Concejalía de Deportes](https://brunete.org/concejalias/deportes/) names the Carretera del Valle de los Rosales |
| farm (El Álamo) | Cruce de la Dehesa, explanada del camino de la M-600 | (60,26) | Invented demo landmark; no real-world claim |

**These are not official evacuation points.** Brunete publishes no municipal evacuation plan
naming assembly points, so the assignment of a facility to a district — and the cell each one
occupies on this non-georeferenced illustration — is a scenario convention, exactly like the
population split above. What *is* verified is that each facility exists at the address given.

The cells are chosen for simulation properties, not for looks: every one is a road cell with
`fuel` 0, so fire cannot reach it; each sits 2–3 cells from its own district anchor and at
least 12 cells from every other muster point; and each is reachable from its anchor. The farm
point additionally lies on the station-to-farm track the engine travels, which is what lets
the agent promise a pick-up. Before this change all four town districts shared cell (5,22),
which is `field` terrain with `fuel` 1.0 — 11,261 people were being sent to a cell that could
itself burn.
