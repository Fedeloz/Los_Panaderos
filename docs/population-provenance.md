# Population and illustrated districts

Verified on 19 September 2026:

- [Ayuntamiento de Brunete: datos estadísticos](https://brunete.org/nuestro-pueblo/datos-estadisticos/) reports **11,261 census residents**, reference year **2025**. The page identifies INE's annual census and was revised July 2026.
- [Comunidad de Madrid: Población total censada de Brunete](https://gestiona.comunidad.madrid/desvan/desvan/AccionDatosUnaSerie.icm?codMun=0262&codTema=1929381) corroborates 11,261 at 1 January 2025 and identifies the INE annual census as its source.
- This is a **municipal census total**, not a count of people currently inside the illustrated town footprint. Other population series, such as the municipal register, can differ; they are not mixed into this scenario.

## Scenario allocation

| District ID | Display name | Count | Basis |
|---|---|---:|---|
| town_north | Brunete North | 2,815 | 25% allocation, rounded |
| town | Brunete Centre | 4,504 | 40% allocation, rounded |
| town_south | Brunete South | 3,942 | Remaining municipal total, approximately 35% |
| farm | El Álamo Farm | 6 | Assumed on-site demo occupancy |

The three town counts sum to **11,261**. District boundaries and names are fictional response sectors; their counts are scenario allocations, not official census-section counts. No verified spatial distribution was found for these invented districts. The whole municipal population is concentrated into the schematic town for the demonstration. Farm occupants are a separate scenario group, not a revision to the official census number; total simulated people are 11,267.

[Granja Escuela El Álamo's own accommodation page](https://www.granjaelalamo.es/albergue) describes group lodging but does not establish current occupancy or permanent population. Six is retained from the existing scenario and is explicitly marked assumed, not presented as a sourced farm population or capacity.

## Map and model

The clean illustrated asset is an image-generation edit of the user-approved map concept. Original aerial reference: PNOA máxima actualidad, CC BY 4.0 scne.es; the image, framing and overlays have been modified. The illustrated map is not georeferenced. Roads, land-cover polygons, population anchors and refuges are registered schematically to the illustration. Each district is a single moving population group in the existing demo physics. House drawings are orientation details, not a household census.

Authoritative local scenario configuration: `simulator/static/maps/brunete-illustrated.json`.
