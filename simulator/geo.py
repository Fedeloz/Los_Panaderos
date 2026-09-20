"""Georeference the 80×56 HappyRobot grid onto Sierra de Gata (PR #1 bbox)."""

# Same bbox as geo/config.py on wildfire-system (EPSG:4326).
WEST, SOUTH, EAST, NORTH = -6.82, 40.13, -6.55, 40.32
PLACE = dict(
    id='ES-2026-GATA',
    name='Sierra de Gata',
    municipality='Cáceres',
    west=WEST, south=SOUTH, east=EAST, north=NORTH,
    crs='EPSG:4326',
    note='Educational grid stretched over the study area. Not a cadastral reconstruction.',
)


def cell_to_lonlat(x, y, width=80, height=56):
    lon = WEST + (float(x) + 0.5) / width * (EAST - WEST)
    lat = NORTH - (float(y) + 0.5) / height * (NORTH - SOUTH)
    return lon, lat


def lonlat_to_cell(lon, lat, width=80, height=56):
    x = int((float(lon) - WEST) / (EAST - WEST) * width)
    y = int((NORTH - float(lat)) / (NORTH - SOUTH) * height)
    return max(0, min(width - 1, x)), max(0, min(height - 1, y))


def overlay(width=80, height=56):
    return dict(PLACE, width=width, height=height,
                places=(
                    dict(id='town', grid=[12, 44], label_en='Hoyos', label_es='Hoyos'),
                    dict(id='farm', grid=[65, 10], label_en='Gata foothills', label_es='Caserío hacia Gata'),
                    dict(id='station', grid=[12, 44], label_en='Fire station', label_es='Parque de bomberos'),
                ))
