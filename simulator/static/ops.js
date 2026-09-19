/* Cesium nadir view of Sierra de Gata; HappyRobot grid is draped as entities. */
let opsViewer, opsReady = false, opsConfig = {}, lastFireKey = '', lastLabelLang = null;
let fireEntities = [], placeEntities = [];
let droneRouteEnt = null, truckRouteEnt = null, dropEnt = null;
window.opsStatus = {ready: false, reason: null, firms: false};

const DEFAULT_BOX = {west: -6.82, south: 40.13, east: -6.55, north: 40.32};

function opsBox() {
    const p = opsConfig.place || {};
    const keys = ['west', 'south', 'east', 'north'];
    if (keys.every(k => Number.isFinite(p[k]))) {
        return {west: p.west, south: p.south, east: p.east, north: p.north};
    }
    return DEFAULT_BOX;
}

function opsStatusFail(reason) {
    window.opsStatus = {ready: false, reason, firms: false};
    return false;
}

function cellLonLat(s, x, y) {
    const g = s.geo || {west: -6.82, south: 40.13, east: -6.55, north: 40.32, width: 80, height: 56};
    const lon = g.west + (x + 0.5) / g.width * (g.east - g.west);
    const lat = g.north - (y + 0.5) / g.height * (g.north - g.south);
    return [lon, lat];
}

async function initOpsMap() {
    if (opsReady) return true;
    if (typeof Cesium === 'undefined') return opsStatusFail('cesium_missing');
    try {
        const res = await fetch('/api/config');
        if (res.ok) opsConfig = await res.json();
    } catch (e) { opsConfig = {}; }
    if (!opsConfig.cesium_token) return opsStatusFail('no_token');
    const globe = document.getElementById('globe');
    if (globe) globe.hidden = false;
    const box = opsBox();
    try {
        Cesium.Ion.defaultAccessToken = opsConfig.cesium_token;
        opsViewer = new Cesium.Viewer('globe', {
            animation: false, timeline: false, geocoder: false, homeButton: false,
            sceneModePicker: false, baseLayerPicker: false, navigationHelpButton: false,
            fullscreenButton: false, infoBox: false, selectionIndicator: false,
            sceneMode: Cesium.SceneMode.SCENE2D
        });
        opsViewer.scene.globe.enableLighting = false;
        opsViewer.scene.screenSpaceCameraController.enableTilt = false;
        opsViewer.scene.screenSpaceCameraController.enableLook = false;
        opsViewer.camera.setView({
            destination: Cesium.Rectangle.fromDegrees(box.west, box.south, box.east, box.north)
        });
        opsViewer.entities.add({
            id: 'bbox',
            polyline: {
                positions: Cesium.Cartesian3.fromDegreesArray([
                    box.west, box.south,
                    box.east, box.south,
                    box.east, box.north,
                    box.west, box.north,
                    box.west, box.south
                ]),
                width: 2,
                material: Cesium.Color.WHITE.withAlpha(0.55)
            }
        });
    } catch (e) {
        if (opsViewer) {
            try { opsViewer.destroy(); } catch (e2) { /* already broken */ }
            opsViewer = null;
        }
        return opsStatusFail('init_failed');
    }
    // The map is a presentation extra: nothing below may take the simulator down.
    if (opsConfig.nasa_key) {
        try {
            const provider = new Cesium.WebMapServiceImageryProvider({
                url: 'https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/' + opsConfig.nasa_key + '/',
                layers: 'fires_modis_24',
                parameters: {transparent: true, format: 'image/png'},
                credit: 'NASA FIRMS'
            });
            const layer = opsViewer.imageryLayers.addImageryProvider(provider);
            window.opsStatus.firms = true;
            let errors = 0, removed = false;
            provider.errorEvent.addEventListener(() => {
                errors++;
                if (removed || errors < 3) return;
                removed = true;
                window.opsStatus.firms = false;
                try { opsViewer.imageryLayers.remove(layer); } catch (e) { /* already gone */ }
            });
        } catch (e) { window.opsStatus.firms = false; }
    }
    try {
        const handler = opsViewer.screenSpaceEventHandler
            || (opsViewer.cesiumWidget && opsViewer.cesiumWidget.screenSpaceEventHandler);
        handler.setInputAction((click) => {
            if (!window.state || window.state.ignited || window.state.busy || window.state.replay) return;
            const ray = opsViewer.camera.getPickRay(click.position);
            let cartesian = ray ? opsViewer.scene.globe.pick(ray, opsViewer.scene) : null;
            if (!cartesian) cartesian = opsViewer.camera.pickEllipsoid(click.position, opsViewer.scene.globe.ellipsoid);
            if (!cartesian) return;
            const carto = Cesium.Cartographic.fromCartesian(cartesian);
            window.act('place_fire', {
                lon: Cesium.Math.toDegrees(carto.longitude),
                lat: Cesium.Math.toDegrees(carto.latitude)
            });
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    } catch (e) {
        // Lose click-to-ignite, keep the map and the canvas ignition path.
    }
    opsReady = true;
    window.opsReady = true;
    window.opsStatus = {ready: true, reason: null, firms: window.opsStatus.firms};
    return true;
}

function rebuildLine(ent, key, positions, width, material) {
    if (ent && ent._key === key) return ent;
    if (ent) opsViewer.entities.remove(ent);
    if (!positions) return null;
    const e = opsViewer.entities.add({polyline: {positions, width, material}});
    e._key = key;
    return e;
}

function routeKey(v, route) {
    if (!route || !route.length) return null;
    return route.length + ':' + route[route.length - 1] + ':' + Math.round(v.x * 4) + ',' + Math.round(v.y * 4);
}

function routePositions(s, v, route) {
    const pts = [[v.x, v.y], ...route];
    return Cesium.Cartesian3.fromDegreesArray(pts.flatMap(([x, y]) => cellLonLat(s, x, y)));
}

function upsertPoint(id, lon, lat, color, pixelSize) {
    let e = opsViewer.entities.getById(id);
    const pos = Cesium.Cartesian3.fromDegrees(lon, lat);
    if (!e) {
        opsViewer.entities.add({
            id, position: pos,
            point: {pixelSize: pixelSize || 14, color, outlineColor: Cesium.Color.WHITE, outlineWidth: 1}
        });
    } else {
        e.position = pos;
        if (e.point) e.point.color = color;
    }
}

function updateOpsMap(s) {
    if (!opsReady || !opsViewer) return;
    const fires = [];
    let count = 0, hash = 0;
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
        if (s.cells[y][x].heat) {
            fires.push(x, y);
            count++;
            hash = (hash * 31 + (y * s.width + x)) | 0;
        }
    }
    const key = count + ':' + hash;
    if (key !== lastFireKey) {
        opsViewer.entities.suspendEvents();
        try {
            fireEntities.forEach(e => opsViewer.entities.remove(e));
            fireEntities = [];
            const stride = Math.max(1, Math.ceil(count / 400));
            const radius = 140 * Math.sqrt(stride);
            for (let i = 0; i < fires.length; i += 2 * stride) {
                const x = fires[i], y = fires[i + 1];
                const [lon, lat] = cellLonLat(s, x, y);
                fireEntities.push(opsViewer.entities.add({
                    position: Cesium.Cartesian3.fromDegrees(lon, lat),
                    ellipse: {
                        semiMinorAxis: radius, semiMajorAxis: radius,
                        material: Cesium.Color.ORANGE.withAlpha(0.65),
                        outline: true, outlineColor: Cesium.Color.RED
                    }
                }));
            }
        } finally {
            opsViewer.entities.resumeEvents();
        }
        lastFireKey = key;
    }
    const uiLang = window.uiLang || 'es';
    if (uiLang !== lastLabelLang) {
        placeEntities.forEach(e => opsViewer.entities.remove(e));
        placeEntities = [];
        const seen = new Set();
        for (const p of (s.geo && s.geo.places) || []) {
            const gk = p.grid[0] + ',' + p.grid[1];
            if (seen.has(gk)) continue;
            seen.add(gk);
            const [lon, lat] = cellLonLat(s, p.grid[0], p.grid[1]);
            placeEntities.push(opsViewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(lon, lat),
                point: {pixelSize: 5, color: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 1},
                label: {
                    text: (uiLang === 'en' ? p.label_en : p.label_es) || '',
                    font: 'bold 11px sans-serif',
                    fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 3,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: new Cesium.Cartesian2(0, -14),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            }));
        }
        lastLabelLang = uiLang;
    }
    const d = s.drone;
    droneRouteEnt = rebuildLine(droneRouteEnt, routeKey(d, d.route),
        routeKey(d, d.route) ? routePositions(s, d, d.route) : null,
        2, new Cesium.PolylineDashMaterialProperty({color: Cesium.Color.GOLD.withAlpha(0.85)}));
    if (s.truck) {
        truckRouteEnt = rebuildLine(truckRouteEnt, routeKey(s.truck, s.truck.route),
            routeKey(s.truck, s.truck.route) ? routePositions(s, s.truck, s.truck.route) : null,
            3, Cesium.Color.CRIMSON.withAlpha(0.8));
    }
    dropEnt = rebuildLine(dropEnt,
        d.last_drop ? 'drop:' + d.last_drop + ':' + Math.round(d.x * 4) + ',' + Math.round(d.y * 4) : null,
        d.last_drop ? Cesium.Cartesian3.fromDegreesArray([...cellLonLat(s, d.x, d.y), ...cellLonLat(s, d.last_drop[0], d.last_drop[1])]) : null,
        2, Cesium.Color.fromCssColorString('#9ee7f7'));
    if (d.target) {
        upsertPoint('drone-target', ...cellLonLat(s, d.target[0], d.target[1]), Cesium.Color.AQUAMARINE, 10);
    } else {
        const te = opsViewer.entities.getById('drone-target');
        if (te) opsViewer.entities.remove(te);
    }
    upsertPoint('drone', ...cellLonLat(s, d.x, d.y), Cesium.Color.GOLD, 16);
    if (s.truck) upsertPoint('truck', ...cellLonLat(s, s.truck.x, s.truck.y), Cesium.Color.CRIMSON, 14);
    for (const [name, g] of Object.entries(s.people || {})) {
        const color = g.status === 'burnt' ? Cesium.Color.DARKRED
            : g.status === 'safe' ? Cesium.Color.LIME : Cesium.Color.ALICEBLUE;
        upsertPoint('p-' + name, ...cellLonLat(s, g.x, g.y), color, 12);
    }
}

window.initOpsMap = initOpsMap;
window.updateOpsMap = updateOpsMap;
