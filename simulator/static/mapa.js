(()=>{
  const c=window.cecop,$=id=>document.getElementById(id);
  c.useTranslations({
    es:{mapSubtitle:'Incendios Forestales — España',lgBrunete:'Brunete · sala simulada',cActive:'Activos',cRisk:'En riesgo',cRiskUnit:'núcleos',cControlled:'Controlados',wxWind:'Viento',wxTemp:'Temperatura',wxHumidity:'Humedad',lastUpdate:'Última actualización',
      layers:'Capas',lyHotspots:'Incendios activos',lyPerimeters:'Perímetros de incendio',lyRisk:'Zonas de riesgo',lyWind:'Viento',lyAdmin:'Límites administrativos',lyRoads:'Carreteras',lyCities:'Ciudades',lyTopo:'Topografía',zoomReset:'Vista nacional',
      activeIncidents:'Incendios activos',legend:'Leyenda',lgHotspot:'Foco de incendio',lgPerimeter:'Perímetro de incendio',lgControlled:'Incendio controlado',lgRisk:'Zona de riesgo',lgExtreme:'Extremo',lgVeryHigh:'Muy alto',lgHigh:'Alto',lgModerate:'Moderado',lgLow:'Bajo',lgWind:'Viento (dirección / intensidad)',lgCcaa:'Límite de comunidad autónoma',lgCountry:'Límite de país',lgRoads:'Carreteras principales',lgCities:'Ciudades principales',
      canarias:'Islas Canarias',symbolicNote:'Perímetros y focos a escala simbólica sobre localizador esquemático. Datos de demostración.',mapCredit:'Base cartográfica derivada de Wikimedia Commons (NordNordWest) · CC BY-SA 3.0 · localizador esquemático, no cartografía oficial',
      tlLive:'En directo',timelineNote:'Evolución de las últimas 24 h · escenario de demostración',tlReplay:'REPRODUCCIÓN',tlNow:'AHORA',
      sevExtreme:'EXTREMO',sevVeryHigh:'MUY ALTO',sevHigh:'ALTO',sevModerate:'MODERADO',sevControlled:'CONTROLADO',hoursAgo:'Hace {h} h',minutesAgo:'Hace {m} min',detectedAt:'Detectado',controlledAt:'Controlado',threatened:'núcleos en riesgo',noIncidents:'Sin incendios activos en este instante',
      bruneteLive:'Brunete · Madrid · sala de crisis abierta',bruneteStandby:'Brunete · Madrid · sala preparada',openRoom:'Abrir sala de crisis',
      simulateFire:'Simular este incendio',simulateShort:'Simular',closeCard:'Cerrar ficha',simNote:'Escenario ilustrado sobre el terreno de Brunete · viento {dir} {speed} km/h · {sev}',pinStandby:'SIMULACRO · pulsa para empezar',pinLive:'EN CURSO · T+{tick}',seaCantabrico:'Mar Cantábrico',seaAtlantic:'Océano Atlántico',seaMed:'Mar Mediterráneo',baleares:'Islas Baleares',france:'FRANCIA',portugal:'PORTUGAL',morocco:'MARRUECOS',spain:'ESPAÑA',
      windFrom:{N:'N',NE:'NE',E:'E',SE:'SE',S:'S',SW:'SO',W:'O',NW:'NO'}},
    en:{mapSubtitle:'Wildfires — Spain',lgBrunete:'Brunete · simulated room',cActive:'Active',cRisk:'At risk',cRiskUnit:'settlements',cControlled:'Controlled',wxWind:'Wind',wxTemp:'Temperature',wxHumidity:'Humidity',lastUpdate:'Last update',
      layers:'Layers',lyHotspots:'Active fires',lyPerimeters:'Fire perimeters',lyRisk:'Risk zones',lyWind:'Wind',lyAdmin:'Administrative boundaries',lyRoads:'Roads',lyCities:'Cities',lyTopo:'Topography',zoomReset:'National view',
      activeIncidents:'Active fires',legend:'Legend',lgHotspot:'Fire hotspot',lgPerimeter:'Fire perimeter',lgControlled:'Controlled fire',lgRisk:'Risk zone',lgExtreme:'Extreme',lgVeryHigh:'Very high',lgHigh:'High',lgModerate:'Moderate',lgLow:'Low',lgWind:'Wind (direction / intensity)',lgCcaa:'Autonomous community boundary',lgCountry:'Country boundary',lgRoads:'Major roads',lgCities:'Major cities',
      canarias:'Canary Islands',symbolicNote:'Perimeters and hotspots drawn at symbolic scale over a schematic locator. Demonstration data.',mapCredit:'Base map derived from Wikimedia Commons (NordNordWest) · CC BY-SA 3.0 · schematic locator, not official cartography',
      tlLive:'Live',timelineNote:'Evolution over the last 24 h · demonstration scenario',tlReplay:'REPLAY',tlNow:'NOW',
      sevExtreme:'EXTREME',sevVeryHigh:'VERY HIGH',sevHigh:'HIGH',sevModerate:'MODERATE',sevControlled:'CONTROLLED',hoursAgo:'{h} h ago',minutesAgo:'{m} min ago',detectedAt:'Detected',controlledAt:'Controlled',threatened:'settlements at risk',noIncidents:'No active fires at this instant',
      bruneteLive:'Brunete · Madrid · incident room open',bruneteStandby:'Brunete · Madrid · room on standby',openRoom:'Open incident room',
      simulateFire:'Simulate this fire',simulateShort:'Simulate',closeCard:'Close card',simNote:'Illustrated scenario on the Brunete terrain · wind {dir} {speed} km/h · {sev}',pinStandby:'DRILL · click to start',pinLive:'LIVE · T+{tick}',seaCantabrico:'Cantabrian Sea',seaAtlantic:'Atlantic Ocean',seaMed:'Mediterranean Sea',baleares:'Balearic Islands',france:'FRANCE',portugal:'PORTUGAL',morocco:'MOROCCO',spain:'SPAIN',
      windFrom:{N:'N',NE:'NE',E:'E',SE:'SE',S:'S',SW:'SW',W:'W',NW:'NW'}}
  });
  const SVG='http://www.w3.org/2000/svg',XLINK='http://www.w3.org/1999/xlink';
  const canSvg=typeof document.createElementNS==='function';
  const el=(tag,attrs={},text)=>{const node=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);if(text!=null)node.textContent=text;return node};
  const html=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node};
  // Simulacro entry points: every map incident maps onto a Brunete-terrain preset (scenarios.js).
  const launchUrl=(preset,overrides)=>{try{const S=window.Scenarios;return S.toQuery(preset||S.get('ES-2026-BRUNETE'),overrides||{})}catch{return '/incidente'}};
  const bruneteLaunchUrl=()=>launchUrl(null,{wind:'east'});
  const fireLaunchUrl=f=>{try{return launchUrl(window.Scenarios.fromIncident(f))}catch{return '/incidente'}};
  const go=url=>{try{location.assign(url)}catch{}};
  const MAP={width:1183.5554,height:1015.8372,top:44.4,bottom:34.7,left:-9.9,right:4.8};
  const KX=MAP.width/(MAP.right-MAP.left),KY=MAP.height/(MAP.top-MAP.bottom);
  const P=(lon,lat)=>c.project(lon,lat);
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const rng=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};

  // ---------- Demonstration scenario (frozen, fictional situation) ----------
  const SEV={extreme:{key:'sevExtreme',rank:4,color:'#ff3b2f'},very_high:{key:'sevVeryHigh',rank:3,color:'#ff7a1a'},high:{key:'sevHigh',rank:2,color:'#ffb020'},moderate:{key:'sevModerate',rank:1,color:'#f2df5a'}};
  // detected / controlled are hours before the reference instant ("now").
  const incidents=[
    {id:'IF-0412',name:'Sierra de la Culebra',province:'Zamora',lon:-6.32,lat:41.90,ha:2643,sev:'extreme',detected:11.2,threatened:6},
    {id:'IF-0408',name:'Verín – Monterrei',province:'Ourense',lon:-7.44,lat:41.94,ha:1260,sev:'very_high',detected:9.5,threatened:4,tag:'w'},
    {id:'IF-0415',name:'Folgoso do Courel',province:'Lugo',lon:-7.18,lat:42.60,ha:890,sev:'high',detected:7.8,threatened:3,tag:'w'},
    {id:'IF-0427',name:'Boiro – Barbanza',province:'A Coruña',lon:-8.88,lat:42.68,ha:140,sev:'moderate',detected:3.2,threatened:1},
    {id:'IF-0411',name:'Alto Tajo – Peralejos',province:'Guadalajara',lon:-1.95,lat:40.62,ha:1480,sev:'very_high',detected:8.6,threatened:3},
    {id:'IF-0419',name:'Montes de Toledo – Los Yébenes',province:'Toledo',lon:-3.85,lat:39.55,ha:512,sev:'high',detected:5.1,threatened:2},
    {id:'IF-0414',name:"Ribera d'Ebre – Flix",province:'Tarragona',lon:0.55,lat:41.24,ha:1150,sev:'very_high',detected:6.9,threatened:3},
    {id:'IF-0421',name:'Cap de Creus – Portbou',province:'Girona',lon:3.10,lat:42.40,ha:480,sev:'high',detected:4.4,threatened:2},
    {id:'IF-0416',name:'Tinença de Benifassà',province:'Castellón',lon:0.15,lat:40.70,ha:328,sev:'moderate',detected:6.0,threatened:1},
    {id:'IF-0418',name:"Vall d'Ebo",province:'Alicante',lon:-0.17,lat:38.80,ha:610,sev:'high',detected:5.6,threatened:2},
    {id:'IF-0422',name:'Sierra de las Nieves – Ronda',province:'Málaga',lon:-5.05,lat:36.70,ha:746,sev:'high',detected:4.2,threatened:2,tag:'w'},
    {id:'IF-0413',name:'Sierra de Aracena – Almonaster',province:'Huelva',lon:-6.78,lat:37.87,ha:1320,sev:'very_high',detected:7.3,threatened:3},
    {id:'IF-0417',name:'Las Hurdes – Nuñomoral',province:'Cáceres',lon:-6.28,lat:40.37,ha:690,sev:'high',detected:5.8,threatened:2},
    {id:'IF-0423',name:'Paramera – Navalmoral',province:'Ávila',lon:-4.80,lat:40.50,ha:540,sev:'high',detected:3.9,threatened:1},
    {id:'IF-0429',name:'Ateca – Ribera del Jalón',province:'Zaragoza',lon:-1.80,lat:41.33,ha:150,sev:'moderate',detected:1.4,threatened:0},
    {id:'IF-0428',name:'Andratx – Tramuntana',province:'Illes Balears',lon:2.42,lat:39.60,ha:90,sev:'moderate',detected:1.8,threatened:1},
    {id:'IF-0426',name:'Arafo – Candelaria',province:'Tenerife',lon:-16.45,lat:28.35,ha:180,sev:'moderate',detected:3.5,threatened:1,inset:true},
    {id:'IF-0402',name:'Losacio',province:'Zamora',lon:-6.10,lat:41.75,ha:1900,sev:'very_high',detected:30,controlled:2.5,threatened:0,tag:'s'},
    {id:'IF-0398',name:'Bejís',province:'Castellón',lon:-0.72,lat:39.90,ha:1350,sev:'high',detected:26,controlled:5,threatened:0},
    {id:'IF-0391',name:'Sierra Bermeja',province:'Málaga',lon:-5.20,lat:36.50,ha:2100,sev:'extreme',detected:40,controlled:9,threatened:0,tag:'s'},
    {id:'IF-0405',name:'Ourol',province:'Lugo',lon:-7.65,lat:43.55,ha:420,sev:'moderate',detected:14,controlled:1.5,threatened:0},
    {id:'IF-0401',name:'Tineo',province:'Asturias',lon:-6.42,lat:43.33,ha:380,sev:'moderate',detected:16,controlled:3,threatened:0}
  ];
  // Small isolated detections (single satellite hotspots, no perimeter).
  const singles=[[1.45,42.08,3.0],[-2.80,37.35,2.2],[-1.90,38.20,4.6],[-2.75,41.90,7.1],[-1.50,42.20,1.1],[-4.00,43.20,5.4],[-6.00,38.55,2.9],[-4.85,38.75,6.2],[-1.90,40.30,3.8],[-6.85,42.85,9.3],[-0.70,40.40,1.9],[-2.90,38.00,4.1],[-2.10,37.65,0.8],[1.00,42.40,2.5],[0.20,42.30,6.6],[-8.20,42.20,1.6],[-7.90,43.05,4.9]];
  // Risk field: lon, lat, half-axes in degrees, rotation (deg, screen), level.
  const RISK={low:'#39a35a',moderate:'#e6d94a',high:'#ff8c1a',very_high:'#ff4f1a',extreme:'#ff2323'};
  const riskZones=[
    ['low',-5.6,43.32,3.2,.32,0],['low',0.6,42.65,2.6,.3,0],['low',-8.55,42.95,.45,.85,0],['low',-2.2,43.15,1.1,.28,0],
    ['moderate',-1.5,41.45,1.1,.6,10],['moderate',-1.65,38.1,1.0,.6,0],['moderate',-3.0,37.4,1.3,.5,-10],['moderate',-2.9,41.9,1.0,.5,0],['moderate',-1.8,39.2,1.1,.75,0],['moderate',-5.6,41.35,1.4,.75,0],['moderate',-3.1,39.35,1.8,.8,0],['moderate',-7.9,42.35,1.2,1.0,0],['moderate',-4.4,38.3,2.1,.55,0],
    ['high',-7.4,42.35,1.1,.8,0],['high',-6.35,40.25,1.3,.5,-10],['high',-4.5,40.55,1.6,.55,-18],['high',2.75,42.2,.8,.5,0],['high',-0.45,39.45,.85,1.0,0],['high',-0.3,38.75,.65,.45,0],['high',-6.1,41.5,1.3,.7,0],['high',-4.8,38.35,1.8,.45,0],['high',0.9,41.3,1.0,.65,0],['high',-6.9,37.9,.95,.5,0],['high',-2.1,40.45,1.0,.7,-25],['high',-5.1,36.75,1.0,.45,-12],
    ['very_high',-6.7,41.95,1.0,.55,0],['very_high',-2.15,40.5,.85,.55,-25],['very_high',0.7,41.28,.7,.5,0],['very_high',-6.85,37.9,.7,.4,0],['very_high',-7.35,42.3,.7,.55,0],['very_high',-5.05,36.7,.7,.35,-12],['very_high',-6.3,40.35,.75,.35,-10],
    ['extreme',-6.45,41.92,.65,.36,0],['extreme',-2.0,40.6,.5,.35,-20],['extreme',-5.05,36.7,.42,.22,-12],['extreme',0.6,41.25,.42,.3,0],['extreme',-6.8,37.88,.45,.26,0],['extreme',-7.4,41.95,.42,.3,0]
  ];
  const cities=[
    ['Madrid',-3.70,40.42,'capital','e'],['Barcelona',2.17,41.39,'major','e'],['Valencia',-0.38,39.47,'major','e'],['Sevilla',-5.99,37.39,'major','e'],['Málaga',-4.42,36.72,'major','e'],['Bilbao',-2.93,43.26,'major','e'],['A Coruña',-8.41,43.36,'major','e'],
    ['Zaragoza',-0.88,41.65,'major','n'],['Valladolid',-4.72,41.65,'major','e'],['Murcia',-1.13,37.99,'major','e'],['Palma',2.65,39.57,'major','s'],['Lisboa',-9.14,38.72,'foreign','e'],['Porto',-8.61,41.15,'foreign','e'],['Toulouse',1.44,43.60,'foreign','e']
  ];
  const roads=[
    [[-3.70,40.42],[-3.69,41.67],[-3.70,42.34],[-2.67,42.85],[-1.98,43.32],[-1.79,43.34]],
    [[-2.93,43.26],[-2.95,42.69],[-2.45,42.47],[-1.64,42.07],[-0.88,41.65]],
    [[-3.70,40.42],[-3.17,40.63],[-2.2,41.05],[-0.88,41.65],[0.62,41.62],[2.17,41.39]],
    [[2.87,42.42],[2.82,41.98],[2.17,41.39],[1.25,41.12],[0.4,40.55],[-0.05,39.99],[-0.38,39.47],[-0.48,38.35],[-1.13,37.99],[-1.9,37.1],[-2.46,36.84],[-4.42,36.72],[-5.45,36.13]],
    [[-3.70,40.42],[-3.0,40.0],[-1.9,39.57],[-0.38,39.47]],
    [[-3.70,40.42],[-3.6,40.03],[-3.37,38.99],[-3.78,38.1],[-4.78,37.89],[-5.99,37.39],[-6.14,36.69],[-6.29,36.53]],
    [[-3.70,40.42],[-4.83,39.96],[-5.88,39.46],[-6.34,38.92],[-6.97,38.88],[-7.5,38.85],[-9.14,38.72]],
    [[-3.70,40.42],[-4.4,40.78],[-5.0,41.5],[-5.68,42.0],[-6.05,42.46],[-6.59,42.55],[-7.56,43.01],[-8.41,43.36]],
    [[-5.68,42.0],[-7.86,42.34],[-8.72,42.24]],
    [[-5.66,43.54],[-5.57,42.6],[-5.68,42.0],[-5.75,41.5],[-5.66,40.97],[-6.37,39.47],[-6.34,38.92],[-5.99,37.39]],
    [[-1.79,43.34],[-2.93,43.26],[-3.8,43.46],[-5.84,43.36],[-7.3,43.3],[-8.41,43.36]],
    [[-3.70,42.34],[-4.72,41.65],[-5.66,40.97],[-6.8,40.59],[-8.61,41.15]],
    [[-5.99,37.39],[-4.56,37.02],[-3.6,37.18],[-3.1,37.3],[-2.46,36.84]],
    [[-4.78,37.89],[-4.56,37.02],[-4.42,36.72]],
    [[-0.88,41.65],[-1.1,40.34],[-0.35,39.7],[-0.38,39.47]],
    [[2.65,39.57],[3.05,39.7]]
  ];
  // Mountain systems: lon, lat, half-length, half-width (deg), rotation (deg, screen)
  const ranges=[[0.5,42.65,2.2,.32,0],[-5.3,43.05,2.6,.3,0],[-4.5,40.6,2.4,.34,-16],[-6.8,42.5,.85,.6,0],[-2.2,41.45,1.7,.5,42],[-4.8,38.3,3.0,.28,0],[-3.2,37.2,2.8,.45,-12],[-4.4,39.5,1.5,.28,-8],[-1.05,40.35,1.0,.7,60],[1.5,41.65,1.3,.28,-45],[-16.6,28.3,.35,.2,-30]];
  // Geographic labels: key, lon, lat, class
  const labels=[['seaCantabrico',-4.4,44.05,'sea'],['seaAtlantic',-9.55,38.2,'sea vertical'],['seaMed',1.0,38.35,'sea'],['baleares',3.2,39.15,'sea small'],['france',1.9,43.95,'country'],['portugal',-8.15,39.6,'country'],['morocco',-5.6,35.0,'country'],['spain',-3.4,39.05,'country es'],['ANDORRA',1.55,42.62,'country tiny literal']];
  const canaryIslands=[[[-18.16,27.72],[-17.9,27.85],[-17.95,27.64]],[[-17.85,28.85],[-17.72,28.85],[-17.75,28.45],[-17.98,28.55],[-17.9,28.75]],[[-17.35,28.2],[-17.1,28.2],[-17.1,28.02],[-17.3,28.02]],[[-16.93,28.35],[-16.6,28.42],[-16.12,28.58],[-16.14,28.5],[-16.4,28.15],[-16.42,28.03],[-16.72,28.05]],[[-15.82,28.15],[-15.6,28.18],[-15.4,28.05],[-15.38,27.85],[-15.55,27.74],[-15.8,27.8],[-15.85,28.0]],[[-14.2,28.75],[-13.85,28.75],[-13.95,28.4],[-14.1,28.1],[-14.35,28.05],[-14.5,28.08],[-14.28,28.35],[-14.3,28.6]],[[-13.9,29.25],[-13.45,29.22],[-13.42,28.95],[-13.75,28.85],[-13.9,29.05]]];
  const INSET={left:-18.5,top:29.45,scale:48};
  const insetP=(lon,lat)=>({x:(lon-INSET.left)*INSET.scale,y:(INSET.top-lat)*INSET.scale});

  // Wind field: synoptic base plus regional regimes (tramontana, cierzo, poniente, levante, nordés).
  const regimes=[
    {lon:2.8,lat:42.3,s:1.1,u:0.05,v:-1,speed:38},{lon:-0.9,lat:41.7,s:0.9,u:0.75,v:-0.65,speed:32},{lon:-0.5,lat:39.3,s:0.9,u:1,v:0.05,speed:22},
    {lon:-5.4,lat:36.2,s:0.9,u:-1,v:0.1,speed:30},{lon:-8.0,lat:42.8,s:1.3,u:-0.85,v:-0.55,speed:26},{lon:-16.5,lat:28.3,s:2.5,u:-0.7,v:-0.7,speed:24}
  ];
  function wind(lon,lat){
    let u=-0.72,v=-0.7,speed=18,w=0.55;
    for(const r of regimes){const d=((lon-r.lon)**2+((lat-r.lat)*1.3)**2)/(2*r.s*r.s),g=Math.exp(-d);u+=r.u*g;v+=r.v*g;speed+=r.speed*g;w+=g}
    const n=Math.hypot(u,v)||1;return {u:u/n,v:v/n,speed:speed/w};
  }
  function windFrom(u,v){const deg=(Math.atan2(-u,-v)*180/Math.PI+360)%360;return ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg/45)%8]}
  const noisyRing=(cx,cy,rx,ry,rot,seed,amp,n)=>{
    const r=rng(seed),ph=[r()*6.28,r()*6.28,r()*6.28],a=[amp*(1+r()*.6),amp*.55*(1+r()),amp*.3*(1+r())],cos=Math.cos(rot*Math.PI/180),sin=Math.sin(rot*Math.PI/180),pts=[];
    for(let i=0;i<n;i++){const t=i/n*Math.PI*2,k=1+a[0]*Math.sin(2*t+ph[0])+a[1]*Math.sin(3*t+ph[1])+a[2]*Math.sin(5*t+ph[2])+(r()-.5)*amp*.5;
      const x=Math.cos(t)*k*rx,y=Math.sin(t)*k*ry;pts.push([cx+x*cos-y*sin,cy+x*sin+y*cos])}
    return pts;
  };
  const pathOf=pts=>pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join('')+'Z';
  const radiusOf=ha=>5+Math.sqrt(ha)*.36;

  // Build perimeter geometry and hotspot seeds once per incident (screen units, full size).
  for(const [i,f] of incidents.entries()){
    f.p=f.inset?insetP(f.lon,f.lat):P(f.lon,f.lat);
    const w=wind(f.lon,f.lat),angle=Math.atan2(-w.v,w.u)*180/Math.PI,r=radiusOf(f.ha)*(f.inset?.55:1),stretch=1.25+w.speed/90;
    const ring=noisyRing(f.p.x+Math.cos(angle*Math.PI/180)*r*(stretch-1)*.5,f.p.y+Math.sin(angle*Math.PI/180)*r*(stretch-1)*.5,r*stretch,r,angle,i*17+3,.24,26);
    f.path=pathOf(ring);f.r=r;f.angle=angle;f.wind=w;
    const rand=rng(i*101+7),count=clamp(3+Math.round(f.ha/220),3,16),spots=[];
    for(let k=0;k<count;k++){
      const biased=rand()<.62,t=biased?angle*Math.PI/180+(rand()-.5)*Math.PI*1.3:rand()*Math.PI*2,rr=r*Math.sqrt(rand())*.9*(biased?stretch*.85:.8);
      const size=(.9+rand()*1.4)*(SEV[f.sev].rank>=3?1.35:1)*(f.inset?.7:1);
      spots.push({x:f.p.x+Math.cos(t)*rr,y:f.p.y+Math.sin(t)*rr,size,flicker:(rand()*3).toFixed(2),dist:rr/r});
    }
    spots.sort((a,b)=>a.dist-b.dist);f.spots=spots;
  }

  // ---------- Time model ----------
  const loadedAt=new Date();let T=0;// minutes before loadedAt (<=0)
  const hoursBefore=()=>-T/60;
  const visibleAt=f=>f.detected>=hoursBefore();
  const controlledAt=f=>f.controlled!=null&&f.controlled>=hoursBefore();
  const growth=f=>{const age=f.detected-hoursBefore(),span=Math.max(.5,f.controlled!=null?f.detected-f.controlled:f.detected);return Math.pow(clamp(age/span,0,1),.55)};
  const timeAt=minutes=>new Date(loadedAt.getTime()+minutes*60000);
  const clock=d=>{try{return d.toLocaleTimeString(c.lang==='es'?'es-ES':'en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Madrid'})}catch{return d.toISOString().slice(11,16)}};
  const dateLabel=d=>{try{return d.toLocaleDateString(c.lang==='es'?'es-ES':'en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'Europe/Madrid'})}catch{return d.toISOString().slice(0,10)}};
  const hourOfDay=()=>{const d=timeAt(T);return d.getHours()+d.getMinutes()/60};
  const diurnal=()=>{const h=hourOfDay();return Math.exp(-(((h-15.5)/5.2)**2))};
  const ago=h=>h<1?c.t('minutesAgo').replace('{m}',Math.max(1,Math.round(h*60))):c.t('hoursAgo').replace('{h}',h<10?h.toFixed(h%1?1:0).replace('.',c.lang==='es'?',':'.'):Math.round(h));

  // ---------- Map construction ----------
  let svg=null,view={x:0,y:0,w:MAP.width,h:MAP.height},selected=null,layers={};
  const groups={};
  function defs(){
    const d=el('defs');
    const hs=el('radialGradient',{id:'hsGlow'});
    for(const [o,col,op] of [[0,'#fff7d6',1],[.18,'#ffcf6a',.95],[.38,'#ff8a2a',.6],[.62,'#ff4a12',.28],[1,'#ff2a00',0]])hs.append(el('stop',{offset:o,'stop-color':col,'stop-opacity':op}));
    const hsc=el('radialGradient',{id:'hsCtrl'});
    for(const [o,col,op] of [[0,'#d9f3e6',.9],[.4,'#6fbfa0',.35],[1,'#4b9c85',0]])hsc.append(el('stop',{offset:o,'stop-color':col,'stop-opacity':op}));
    const blur=el('filter',{id:'riskBlur',x:'-40%',y:'-40%',width:'180%',height:'180%'});
    blur.append(el('feTurbulence',{type:'fractalNoise',baseFrequency:'0.022',numOctaves:'3',seed:'11',result:'n'}));
    blur.append(el('feDisplacementMap',{in:'SourceGraphic',in2:'n',scale:'72',xChannelSelector:'R',yChannelSelector:'G',result:'d'}));
    blur.append(el('feGaussianBlur',{in:'d',stdDeviation:'8'}));
    const glow=el('filter',{id:'perimGlow',x:'-30%',y:'-30%',width:'160%',height:'160%'});
    glow.append(el('feGaussianBlur',{stdDeviation:'1.4',result:'b'}));const m=el('feMerge');m.append(el('feMergeNode',{in:'b'}),el('feMergeNode',{in:'SourceGraphic'}));glow.append(m);
    // Satellite-like grain: fine fractal noise, desaturated, tinted cold, alpha compressed.
    const tex=el('filter',{id:'terrainTex',x:'0',y:'0',width:'100%',height:'100%',filterUnits:'userSpaceOnUse'});
    tex.append(el('feTurbulence',{type:'fractalNoise',baseFrequency:'0.035 0.045',numOctaves:'3',seed:'7',result:'t'}));
    tex.append(el('feColorMatrix',{in:'t',type:'saturate',values:'0',result:'g'}));
    tex.append(el('feColorMatrix',{in:'g',type:'matrix',values:'0.55 0 0 0 0  0 0.72 0 0 0  0 0 0.9 0 0  0 0 0 1 0',result:'c'}));
    const ct=el('feComponentTransfer',{in:'c'});ct.append(el('feFuncA',{type:'table',tableValues:'0 0.02 0.1 0.24 0.4'}));tex.append(ct);
    const arrow=el('marker',{id:'windArrow',viewBox:'0 0 6 6',refX:'5',refY:'3',markerWidth:'4',markerHeight:'4',orient:'auto',markerUnits:'strokeWidth'});arrow.append(el('path',{d:'M0 0L6 3L0 6z',class:'wind-arrow'}));
    d.append(hs,hsc,blur,glow,tex,arrow);
    for(const [id,x2,y2] of [['fadeN',0,1],['fadeS',0,-1],['fadeW',1,0],['fadeE',-1,0]]){const g=el('linearGradient',{id,x1:x2<0?1:0,y1:y2<0?1:0,x2:x2<0?0:x2,y2:y2<0?0:y2});g.append(el('stop',{offset:0,'stop-color':'#070e18','stop-opacity':1}),el('stop',{offset:1,'stop-color':'#070e18','stop-opacity':0}));d.append(g)}
    return d;
  }
  function classifyBasemap(root){
    // The sea rect is enlarged so panning and wide containers never reveal a seam.
    root.querySelectorAll('#Meer rect').forEach(n=>{n.removeAttribute('style');n.setAttribute('class','sea');n.setAttribute('x',-3000);n.setAttribute('y',-3000);n.setAttribute('width',7200);n.setAttribute('height',7000)});
    const landClip=el('clipPath',{id:'landES'});
    root.querySelectorAll('#Land polygon').forEach(n=>{const es=(n.getAttribute('style')||'').includes('3a4952');n.removeAttribute('style');n.setAttribute('class',es?'land land-es':'land land-other');if(es){const u=el('use');u.setAttribute('href','#'+n.id);u.setAttributeNS(XLINK,'xlink:href','#'+n.id);landClip.append(u)}});
    root.querySelectorAll('#Linien polyline').forEach(n=>{const s=n.getAttribute('style')||'';n.removeAttribute('style');n.setAttribute('class',s.includes('stroke-width:1.2')?'border border-ccaa':s.includes('stroke-width:3.2')?'border border-country':'border coast')});
    const linien=root.querySelector('#Linien');if(linien)linien.removeAttribute('style');
    return landClip;
  }
  function buildStatic(root){
    const land=root.querySelector('#Land'),linien=root.querySelector('#Linien');
    const before=node=>root.insertBefore(node,linien);
    // Terrain texture + contours (topography layer).
    const topo=el('g',{id:'lyTopo',class:'layer layer-topo'});
    topo.append(el('rect',{x:0,y:0,width:MAP.width,height:MAP.height,class:'terrain-tex','clip-path':'url(#landES)',filter:'url(#terrainTex)'}));
    const contours=el('g',{class:'contours','clip-path':'url(#landES)'});
    for(const [i,[lon,lat,hl,hw,rot]] of ranges.entries()){if(lon<-10)continue;const p=P(lon,lat);for(let k=3;k>=1;k--){const s=k/3;contours.append(el('path',{d:pathOf(noisyRing(p.x,p.y,hl*KX*s,hw*KY*s,rot,i*31+k,.18,40)),class:'contour'}))}}
    topo.append(contours);
    // Graticule every 2 degrees.
    const grat=el('g',{class:'graticule'});
    for(let lon=-8;lon<=4;lon+=2){const a=P(lon,MAP.top),b=P(lon,MAP.bottom);grat.append(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y}))}
    for(let lat=36;lat<=44;lat+=2){const a=P(MAP.left,lat),b=P(MAP.right,lat);grat.append(el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y}))}
    // Risk zones under boundaries, clipped to mainland Spain.
    const risk=el('g',{id:'lyRisk',class:'layer layer-risk','clip-path':'url(#spainMainland)'}),inner=el('g',{filter:'url(#riskBlur)'});
    const order={low:0,moderate:1,high:2,very_high:3,extreme:4};
    for(const [level,lon,lat,rx,ry,rot] of [...riskZones].sort((a,b)=>order[a[0]]-order[b[0]])){const p=P(lon,lat);inner.append(el('ellipse',{cx:p.x.toFixed(1),cy:p.y.toFixed(1),rx:(rx*KX).toFixed(1),ry:(ry*KY).toFixed(1),transform:`rotate(${rot} ${p.x.toFixed(1)} ${p.y.toFixed(1)})`,fill:RISK[level],class:'risk risk-'+level}))}
    risk.append(inner);
    before(topo);before(grat);before(risk);
    // The basemap frame ends abruptly at the neighbouring countries; fade its edges into the sea.
    const fade=el('g',{class:'frame-fade'}),F=80;
    fade.append(el('rect',{x:0,y:0,width:MAP.width,height:F,fill:'url(#fadeN)'}),el('rect',{x:0,y:MAP.height-F,width:MAP.width,height:F,fill:'url(#fadeS)'}),el('rect',{x:0,y:0,width:F,height:MAP.height,fill:'url(#fadeW)'}),el('rect',{x:MAP.width-F,y:0,width:F,height:MAP.height,fill:'url(#fadeE)'}));
    root.append(fade);
    // Roads, incidents, cities, labels and wind go above boundaries.
    const roadsG=el('g',{id:'lyRoads',class:'layer layer-roads'});
    for(const line of roads)roadsG.append(el('polyline',{points:line.map(([lon,lat])=>{const p=P(lon,lat);return p.x.toFixed(1)+','+p.y.toFixed(1)}).join(' '),class:'road'}));
    const perims=el('g',{id:'lyPerimeters',class:'layer layer-perimeters'}),spots=el('g',{id:'lyHotspots',class:'layer layer-hotspots'}),tags=el('g',{class:'incident-tags'});
    for(const f of incidents){
      if(f.inset)continue;
      const g=el('g',{class:'perimeter-group','data-id':f.id});
      g.append(el('path',{d:f.path,class:'perimeter',filter:'url(#perimGlow)'}));
      f.perimNode=g;perims.append(g);
      const hg=el('g',{class:'hotspot-group','data-id':f.id});
      for(const s of f.spots){hg.append(el('circle',{cx:s.x.toFixed(1),cy:s.y.toFixed(1),r:(s.size*4.4).toFixed(1),class:'hs-halo',style:`animation-delay:-${s.flicker}s`}),el('circle',{cx:s.x.toFixed(1),cy:s.y.toFixed(1),r:(s.size*.55).toFixed(2),class:'hs-core'}))}
      f.spotNode=hg;spots.append(hg);
      const tag=el('g',{class:'tag'+(f.ha>=1000?' tag-major':' tag-minor'),'data-id':f.id});
      const side=f.tag||'e',sx=side==='w'?-1:1,tx=side==='s'?f.p.x+2:f.p.x+sx*(f.r*1.15+4),ty=side==='s'?f.p.y+f.r*1.2+8:f.p.y-f.r*.6;
      tag.append(el('line',{x1:side==='s'?f.p.x:f.p.x+sx*f.r*.7,y1:side==='s'?f.p.y+f.r*.8:f.p.y-f.r*.35,x2:side==='s'?tx:tx-sx*2,y2:side==='s'?ty-9:ty+3,class:'tag-leader'}));
      tag.append(el('text',{x:tx,y:ty,class:'tag-name','text-anchor':side==='w'?'end':'start'},f.name.split(' – ')[0]));
      tag.append(el('text',{x:tx,y:ty+10,class:'tag-meta','text-anchor':side==='w'?'end':'start'},''));
      f.tagNode=tag;tags.append(tag);
    }
    const singlesG=el('g',{class:'singles'});
    for(const [i,[lon,lat,det]] of singles.entries()){const p=P(lon,lat),r=rng(i*13+5),size=.7+r()*.6;const g=el('g',{class:'single','data-detected':det});g.append(el('circle',{cx:p.x.toFixed(1),cy:p.y.toFixed(1),r:(size*4).toFixed(1),class:'hs-halo hs-single'}),el('circle',{cx:p.x.toFixed(1),cy:p.y.toFixed(1),r:(size*.5).toFixed(2),class:'hs-core'}));singlesG.append(g)}
    spots.append(singlesG);
    const citiesG=el('g',{id:'lyCities',class:'layer layer-cities'});
    for(const [name,lon,lat,kind,anchor] of cities){const p=P(lon,lat),g=el('g',{class:'city city-'+kind});
      if(kind==='capital'){const star=el('g',{transform:`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`});star.append(el('path',{d:'M0 -5.5L1.6 -1.7L5.5 -1.7L2.4 .8L3.4 4.6L0 2.3L-3.4 4.6L-2.4 .8L-5.5 -1.7L-1.6 -1.7Z',class:'city-star'}));g.append(star)}
      else g.append(el('circle',{cx:p.x.toFixed(1),cy:p.y.toFixed(1),r:kind==='foreign'?2.2:3,class:'city-dot'}));
      const dx=anchor==='e'?7:anchor==='w'?-7:0,dy=anchor==='n'?-8:anchor==='s'?13:4;
      g.append(el('text',{x:(p.x+dx).toFixed(1),y:(p.y+dy).toFixed(1),'text-anchor':anchor==='w'?'end':anchor==='e'?'start':'middle',class:'city-label'},name));citiesG.append(g)}
    const labelsG=el('g',{class:'geo-labels'});
    for(const [key,lon,lat,cls] of labels){const p=P(lon,lat);const t=el('text',{x:p.x.toFixed(1),y:p.y.toFixed(1),class:'geo-label '+cls,'data-key':cls.includes('literal')?'':key},cls.includes('literal')?key:c.t(key));if(cls.includes('vertical'))t.setAttribute('transform',`rotate(-90 ${p.x.toFixed(1)} ${p.y.toFixed(1)})`);labelsG.append(t)}
    const windG=el('g',{id:'lyWind',class:'layer layer-wind'});
    const step=58,jit=rng(99);
    for(let y=10;y<MAP.height;y+=step)for(let x=10;x<MAP.width;x+=step){
      let px=x+(jit()-.5)*30,py=y+(jit()-.5)*30;const lon0=MAP.left+px/KX,lat0=MAP.top-py/KY;const w0=wind(lon0,lat0);
      const pts=[];for(let k=0;k<13;k++){pts.push(px.toFixed(1)+','+py.toFixed(1));const w=wind(MAP.left+px/KX,MAP.top-py/KY),len=3.6+w.speed/11;px+=w.u*len;py+=-w.v*len}
      windG.append(el('polyline',{points:pts.join(' '),class:'streamline','marker-end':'url(#windArrow)',style:`opacity:${(.2+w0.speed/70*.5).toFixed(2)};animation-duration:${(3.6-w0.speed/18).toFixed(2)}s`}));
    }
    // Brunete: the only simulated room in this product; status comes from /api/state.
    const bp=P(-3.999,40.405),brunete=el('a',{class:'brunete brunete-standby',href:bruneteLaunchUrl()});
    const sub=el('text',{x:(bp.x+15).toFixed(1),y:(bp.y+14).toFixed(1),class:'brunete-sub'},c.t('pinStandby'));
    brunete.append(el('title',{},''),el('circle',{cx:bp.x.toFixed(1),cy:bp.y.toFixed(1),r:22,class:'brunete-halo'}),el('circle',{cx:bp.x.toFixed(1),cy:bp.y.toFixed(1),r:11,class:'brunete-ring'}),el('rect',{x:(bp.x-6.5).toFixed(1),y:(bp.y-6.5).toFixed(1),width:13,height:13,transform:`rotate(45 ${bp.x.toFixed(1)} ${bp.y.toFixed(1)})`,class:'brunete-pin'}),el('text',{x:(bp.x+15).toFixed(1),y:(bp.y+3).toFixed(1),class:'brunete-label'},'Brunete'),sub);
    groups.brunete=brunete;groups.bruneteSub=sub;
    root.append(roadsG,perims,spots,tags,citiesG,labelsG,windG,brunete);
    Object.assign(groups,{topo,grat,risk,roads:roadsG,perims,spots,tags,cities:citiesG,labels:labelsG,wind:windG});
  }
  function buildInset(){
    const inset=$('canariasInset');if(!inset||!canSvg)return;
    const nodes=[el('rect',{x:0,y:0,width:260,height:112,class:'inset-sea'})];
    const risk=el('g',{class:'inset-risk'});const tp=insetP(-16.55,28.3);risk.append(el('ellipse',{cx:tp.x,cy:tp.y,rx:22,ry:14,fill:RISK.high,class:'risk'}));const gp=insetP(-15.6,27.95);risk.append(el('ellipse',{cx:gp.x,cy:gp.y,rx:12,ry:9,fill:RISK.moderate,class:'risk'}));nodes.push(risk);
    for(const poly of canaryIslands)nodes.push(el('polygon',{points:poly.map(([lon,lat])=>{const p=insetP(lon,lat);return p.x.toFixed(1)+','+p.y.toFixed(1)}).join(' '),class:'land land-es'}));
    for(const f of incidents.filter(f=>f.inset)){
      const g=el('g',{class:'perimeter-group','data-id':f.id});g.append(el('path',{d:f.path,class:'perimeter'}));f.perimNode=g;nodes.push(g);
      const hg=el('g',{class:'hotspot-group','data-id':f.id});for(const s of f.spots)hg.append(el('circle',{cx:s.x.toFixed(1),cy:s.y.toFixed(1),r:(s.size*4).toFixed(1),class:'hs-halo'}),el('circle',{cx:s.x.toFixed(1),cy:s.y.toFixed(1),r:(s.size*.5).toFixed(2),class:'hs-core'}));f.spotNode=hg;nodes.push(hg);
      const tag=el('g',{class:'tag tag-major','data-id':f.id});tag.append(el('text',{x:f.p.x+10,y:f.p.y-8,class:'tag-name'},f.name.split(' – ')[0]),el('text',{x:f.p.x+10,y:f.p.y+2,class:'tag-meta'},''));f.tagNode=tag;nodes.push(tag);
    }
    for(const [name,lon,lat] of [['Tenerife',-16.62,28.14],['Gran Canaria',-15.6,27.62],['Lanzarote',-13.62,29.35],['Fuerteventura',-14.1,27.95],['La Palma',-17.9,28.95]]){const p=insetP(lon,lat);nodes.push(el('text',{x:p.x.toFixed(1),y:p.y.toFixed(1),class:'inset-label','text-anchor':'middle'},name))}
    inset.replaceChildren(...nodes);
  }
  async function inlineBasemap(){
    const stage=$('gisMap');
    if(!stage||!canSvg||typeof DOMParser==='undefined'||typeof fetch!=='function')return;
    try{
      const text=await (await fetch('/maps/spain-location.svg')).text();
      const root=new DOMParser().parseFromString(text,'image/svg+xml').documentElement;
      if(!root||root.nodeName!=='svg')return;
      root.removeAttribute('width');root.removeAttribute('height');root.setAttribute('class','gis-svg');root.setAttribute('preserveAspectRatio','xMidYMid meet');root.setAttribute('aria-hidden','true');
      const d=defs();d.append(classifyBasemap(root));root.insertBefore(d,root.firstChild);
      buildStatic(root);
      stage.replaceChildren(root);svg=root;
      wireMap();goHome(false);renderDynamic();
      if(c.state)renderState(c.state);
    }catch(e){c.setError(e)}
  }

  // ---------- Dynamic rendering (time-dependent) ----------
  function renderDynamic(){
    const h=hoursBefore(),active=[],controlled=[];
    for(const f of incidents){
      const on=visibleAt(f),ctrl=on&&controlledAt(f),s=growth(f);
      if(on&&!ctrl)active.push(f);if(ctrl)controlled.push(f);
      if(f.perimNode){f.perimNode.style.display=on?'':'none';f.perimNode.classList.toggle('is-controlled',ctrl);f.perimNode.firstChild.setAttribute('transform',`translate(${f.p.x.toFixed(1)} ${f.p.y.toFixed(1)}) scale(${s.toFixed(3)}) translate(${(-f.p.x).toFixed(1)} ${(-f.p.y).toFixed(1)})`)}
      if(f.spotNode){f.spotNode.style.display=on?'':'none';f.spotNode.classList.toggle('is-controlled',ctrl);const shown=ctrl?2:Math.max(1,Math.ceil(f.spots.length*s));[...f.spotNode.children].forEach((n,i)=>{n.style.display=Math.floor(i/2)<shown?'':'none'})}
      if(f.tagNode){f.tagNode.style.display=on?'':'none';f.tagNode.classList.toggle('is-controlled',ctrl);f.tagNode.lastChild.textContent=`${c.format(Math.round(f.ha*s))} ha · ${ctrl?c.t('sevControlled'):c.t(SEV[f.sev].key)}`}
    }
    if(groups.spots)groups.spots.querySelectorAll('.single').forEach(n=>{n.style.display=Number(n.dataset.detected)>=h?'':'none'});
    const live=c.state&&c.isLive(c.state)&&T===0;
    $('countActive').textContent=String(active.length+(live?1:0));
    $('countRisk').textContent=String(active.reduce((n,f)=>n+f.threatened,0)+(live?5:0));
    $('countControlled').textContent=String(controlled.length);
    renderList(active);renderWeather();renderTimeline();
  }
  function renderList(active){
    const list=$('incidentList');if(!list)return;
    const rank=f=>SEV[f.sev].rank*1e5+f.ha;
    const items=[];
    const s=c.state;
    if(s&&c.isLive(s)&&T===0){
      const li=html('li','incident is-brunete');const a=html('a','',null);a.href='/incidente';
      const head=html('div','incident-head');head.append(html('strong','',c.t('bruneteLive')),html('span','sev sev-live','LIVE'));
      a.append(head,html('span','incident-meta',`${s.mission||''}`.slice(0,90)));li.append(a);items.push(li);
    }
    for(const f of [...active].sort((a,b)=>rank(b)-rank(a))){
      const li=html('li','incident'+(selected===f.id?' is-selected':''));li.dataset.id=f.id;li.tabIndex=0;
      const head=html('div','incident-head');head.append(html('strong','',`${f.name}`),html('span','sev sev-'+f.sev,c.t(SEV[f.sev].key)));
      const meta=html('span','incident-meta',`${f.province} · ${c.format(Math.round(f.ha*growth(f)))} ha · ${ago(f.detected-hoursBefore())}`);
      const sim=html('button','incident-sim',c.t('simulateShort'));sim.type='button';sim.setAttribute('aria-label',`${c.t('simulateFire')}: ${f.name}`);
      sim.onclick=e=>{e?.stopPropagation?.();go(fireLaunchUrl(f))};sim.onkeydown=e=>{e?.stopPropagation?.()};
      const foot=html('div','incident-foot');foot.append(meta,sim);
      li.append(head,foot);li.onclick=()=>select(f.id,true);li.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(f.id,true)}};
      items.push(li);
    }
    if(!items.length)items.push(html('li','incident incident-empty',c.t('noIncidents')));
    list.replaceChildren(...items);
    $('incidentCount').textContent=String(active.length);
  }
  function renderWeather(){
    const d=diurnal(),w=wind(-3.7,40.42),speed=Math.round(w.speed*(.72+.5*d));
    $('wxWind').textContent=`${c.t('windFrom')[windFrom(w.u,w.v)]} ${speed} km/h`;
    $('wxTemp').textContent=`${Math.round(20+15*d)} °C`;
    $('wxHumidity').textContent=`${Math.round(66-44*d)} %`;
  }
  function renderTimeline(){
    const now=timeAt(T);
    $('tlTime').textContent=`${clock(now)} · ${dateLabel(now)}`;
    $('tlPhase').textContent=T===0?c.t('tlNow'):c.t('tlReplay');
    $('tlLive').classList.toggle('is-live',T===0);
    if($('tlRange')&&String($('tlRange').value)!==String(T))$('tlRange').value=String(T);
    document.body.classList.toggle('is-scrubbing',T!==0);
  }
  function renderTicks(){
    const ticks=$('tlTicks');if(!ticks)return;
    ticks.replaceChildren(...[-1440,-1080,-720,-360,0].map(m=>{const s=html('span','',clock(timeAt(m)));if(s.style)s.style.left=`${(m+1440)/1440*100}%`;return s}));
  }
  function renderState(s){
    const b=groups.brunete,live=c.isLive(s);
    if(b){b.setAttribute('class','brunete '+(live?'brunete-live':'brunete-standby'));b.setAttribute('href',live?'/incidente':bruneteLaunchUrl());b.querySelector('title').textContent=live?`${c.t('bruneteLive')} · ${s.mission||''}`:c.t('bruneteStandby')}
    renderPinSub(s);
    renderDynamic();
  }
  function renderPinSub(s){
    const sub=groups.bruneteSub;if(!sub)return;
    sub.textContent=s&&c.isLive(s)?c.t('pinLive').replace('{tick}',s.tick??0):c.t('pinStandby');
  }
  function renderLabels(){
    if(groups.labels)groups.labels.querySelectorAll('[data-key]').forEach(t=>{if(t.dataset.key)t.textContent=c.t(t.dataset.key)});
    $('updatedAt').textContent=`${clock(loadedAt)} · ${dateLabel(loadedAt)}`;
    renderPinSub(c.state);
    renderTicks();renderDynamic();renderCard();
  }

  // ---------- Interaction: layers, selection, zoom/pan, tooltip, timeline ----------
  function setLayer(name,on){layers[name]=on;if(svg)svg.classList.toggle('hide-'+name,!on)}
  function select(id,zoom){
    selected=selected===id?null:id;
    for(const f of incidents){for(const n of [f.perimNode,f.spotNode,f.tagNode])if(n)n.classList.toggle('is-selected',selected===f.id)}
    document.querySelectorAll('#incidentList .incident').forEach(li=>li.classList.toggle('is-selected',li.dataset.id===selected));
    const f=incidents.find(f=>f.id===selected);
    if(zoom&&f&&!f.inset){const home=homeView(),w=home.w/3.2,h=home.h/3.2;animateView({x:f.p.x-w/2,y:f.p.y-h/2,w,h})}
    renderCard();
  }
  // Pinned detail card for the selected incident: tooltip lines + "simulate this fire" entry point.
  function renderCard(){
    const card=$('incidentCard');if(!card)return;
    const f=incidents.find(f=>f.id===selected);
    if(!f){card.hidden=true;return}
    const lines=tooltipFor(f),ctrl=controlledAt(f);
    $('incidentCardTitle').textContent=lines[0];
    $('incidentCardLines').replaceChildren(...lines.slice(1).map(l=>html('div','',l)));
    $('incidentCardNote').textContent=c.t('simNote').replace('{dir}',c.t('windFrom')[windFrom(f.wind.u,f.wind.v)]).replace('{speed}',Math.round(f.wind.speed)).replace('{sev}',(ctrl?c.t('sevControlled'):c.t(SEV[f.sev].key)).toLowerCase());
    const sim=$('incidentCardSim');if(sim){sim.textContent=c.t('simulateFire');sim.onclick=()=>go(fireLaunchUrl(f))}
    card.hidden=false;
  }
  // Home view: the whole frame fitted into the stage area left free by the floating panels, so no panel covers Spain.
  let atHome=true;
  function homeView(){
    const stage=$('gisMap'),rect=stage.getBoundingClientRect();
    if(!rect.width||!rect.height)return {x:0,y:0,w:MAP.width,h:MAP.height};
    const floating=n=>n&&typeof getComputedStyle==='function'&&getComputedStyle(n).position==='absolute';
    const left=document.querySelector('.gis-layers'),right=document.querySelector('.gis-incidents');
    const L=floating(left)?left.getBoundingClientRect().width+24:0,R=floating(right)?right.getBoundingClientRect().width+24:0;
    const U=Math.max(rect.width-L-R,rect.width*.4),s=Math.min(U/MAP.width,(rect.height-24)/MAP.height);
    const w=rect.width/s,h=rect.height/s;
    return {x:MAP.width/2-(L+U/2)/s,y:MAP.height/2-h/2,w,h};
  }
  function screenScale(rect){return Math.min(rect.width/view.w,rect.height/view.h)}
  function applyView(){
    if(!svg)return;
    const home=homeView();
    view.w=clamp(view.w,home.w/9,home.w);view.h=view.w*home.h/home.w;
    view.x=clamp(view.x,Math.min(home.x,-view.w*.25),Math.max(home.x,MAP.width-view.w*.75));view.y=clamp(view.y,Math.min(home.y,-view.h*.25),Math.max(home.y,MAP.height-view.h*.75));
    svg.setAttribute('viewBox',`${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`);
    const z=home.w/view.w;svg.style.setProperty('--z',z.toFixed(3));svg.classList.toggle('z2',z>=2);svg.classList.toggle('z4',z>=4);
    svg.querySelectorAll('.city-dot').forEach(n=>n.setAttribute('r',(3/Math.sqrt(z)).toFixed(2)));
    renderScale();
  }
  let viewAnim=null;
  function animateView(target){
    atHome=false;
    if(typeof requestAnimationFrame!=='function'){Object.assign(view,target);applyView();return}
    const from={...view},start=performance.now();if(viewAnim)cancelAnimationFrame(viewAnim);
    const step=now=>{const u=clamp((now-start)/420,0,1),e=1-Math.pow(1-u,3);view={x:from.x+(target.x-from.x)*e,y:from.y+(target.y-from.y)*e,w:from.w+(target.w-from.w)*e,h:from.h+(target.h-from.h)*e};applyView();if(u<1)viewAnim=requestAnimationFrame(step)};
    viewAnim=requestAnimationFrame(step);
  }
  function goHome(animate){atHome=true;const home=homeView();if(animate)animateView(home);else{view=home;applyView()}atHome=true}
  function zoomBy(factor,cx,cy){
    const stage=$('gisMap'),rect=stage.getBoundingClientRect(),home=homeView();
    const scale=screenScale(rect),ox=(rect.width-view.w*scale)/2,oy=(rect.height-view.h*scale)/2;
    const mx=view.x+((cx??rect.width/2)-ox)/scale,my=view.y+((cy??rect.height/2)-oy)/scale;
    const w=clamp(view.w/factor,home.w/9,home.w),k=w/view.w;
    atHome=false;view={x:mx-(mx-view.x)*k,y:my-(my-view.y)*k,w,h:w*home.h/home.w};applyView();
  }
  function renderScale(){
    const bar=$('scaleBar');if(!bar)return;
    const stage=$('gisMap'),rect=stage.getBoundingClientRect();if(!rect.width)return;
    const pxPerUnit=screenScale(rect);// screen px per map unit
    const kmPerUnit=111.32*Math.cos(40*Math.PI/180)/KX;// approx at 40°N
    const target=250/pxPerUnit*kmPerUnit;const nice=[1000,500,250,200,100,50,25,20,10,5].find(v=>v<=target)||5;
    const width=nice/kmPerUnit*pxPerUnit;
    bar.replaceChildren(el('rect',{x:0,y:12,width:width.toFixed(1),height:4,class:'scale-bar'}),...[0,.5,1].map(f=>el('line',{x1:(width*f).toFixed(1),y1:8,x2:(width*f).toFixed(1),y2:20,class:'scale-tick'})),el('text',{x:0,y:28,class:'scale-text'},'0'),el('text',{x:(width/2).toFixed(1),y:28,'text-anchor':'middle',class:'scale-text'},String(nice/2)),el('text',{x:width.toFixed(1),y:28,'text-anchor':'end',class:'scale-text'},`${nice} km`));
  }
  function tooltipFor(f){
    const ctrl=controlledAt(f),lines=[`${f.name} · ${f.province}`,`${c.format(Math.round(f.ha*growth(f)))} ha · ${ctrl?c.t('sevControlled'):c.t(SEV[f.sev].key)}`,`${c.t('detectedAt')}: ${clock(timeAt(-f.detected*60))} · ${ago(f.detected-hoursBefore())}`];
    if(ctrl)lines.push(`${c.t('controlledAt')}: ${clock(timeAt(-f.controlled*60))}`);
    if(f.threatened&&!ctrl)lines.push(`${f.threatened} ${c.t('threatened')}`);
    lines.push(`${c.t('wxWind')}: ${c.t('windFrom')[windFrom(f.wind.u,f.wind.v)]} ${Math.round(f.wind.speed)} km/h`);
    return lines;
  }
  function wireMap(){
    const stage=$('gisMap'),tip=$('tooltip');
    if(!stage||typeof stage.addEventListener!=='function')return;
    let drag=null;
    stage.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,vx:view.x,vy:view.y,moved:false};stage.setPointerCapture?.(e.pointerId)});
    stage.addEventListener('pointermove',e=>{
      if(drag){const scale=screenScale(stage.getBoundingClientRect());
        const dx=(e.clientX-drag.x)/scale,dy=(e.clientY-drag.y)/scale;if(Math.abs(dx)+Math.abs(dy)>2){drag.moved=true;atHome=false}view.x=drag.vx-dx;view.y=drag.vy-dy;applyView();stage.classList.add('is-dragging');return}
      const g=e.target.closest?.('[data-id]');const f=g&&incidents.find(f=>f.id===g.dataset.id);
      if(f&&tip){tip.replaceChildren(...tooltipFor(f).map((l,i)=>html('div',i?'':'tip-title',l)));tip.hidden=false;const r=$('gisStage').getBoundingClientRect();tip.style.left=`${Math.min(e.clientX-r.left+14,r.width-260)}px`;tip.style.top=`${Math.min(e.clientY-r.top+14,r.height-120)}px`}
      else if(tip)tip.hidden=true;
    });
    const end=e=>{if(!drag)return;const g=e.target.closest?.('[data-id]');if(!drag.moved){if(g)select(g.dataset.id,false);else if(selected&&!e.target.closest?.('.brunete'))select(selected,false)}drag=null;stage.classList.remove('is-dragging')};
    stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',()=>{drag=null;stage.classList.remove('is-dragging')});
    stage.addEventListener('pointerleave',()=>{if(tip)tip.hidden=true});
    stage.addEventListener('wheel',e=>{e.preventDefault();const rect=stage.getBoundingClientRect();zoomBy(e.deltaY<0?1.18:1/1.18,e.clientX-rect.left,e.clientY-rect.top)},{passive:false});
    stage.addEventListener('dblclick',e=>{const rect=stage.getBoundingClientRect();zoomBy(1.8,e.clientX-rect.left,e.clientY-rect.top)});
    if(typeof ResizeObserver==='function')new ResizeObserver(()=>{if(atHome)goHome(false);else applyView()}).observe(stage);
  }
  // Playback: 1× covers the 24 h window in one minute.
  let playing=false,timer=null;
  function setTime(minutes,fromUser){T=clamp(Math.round(minutes/5)*5,-1440,0);if(fromUser&&T!==0&&playing)stopPlay();renderDynamic()}
  function stopPlay(){playing=false;if(timer)clearInterval(timer);timer=null;$('tlPlay').textContent='▶';$('tlPlay').classList.remove('is-playing')}
  function startPlay(){
    if(typeof setInterval!=='function')return;
    if(T===0)T=-1440;playing=true;$('tlPlay').textContent='❚❚';$('tlPlay').classList.add('is-playing');
    timer=setInterval(()=>{const speed=Number($('tlSpeed')?.value||1);setTime(T+4*speed);if(T>=0)stopPlay()},100);
  }
  function wireControls(){
    document.querySelectorAll('[data-layer]').forEach(input=>{setLayer(input.dataset.layer,input.checked);input.onchange=()=>setLayer(input.dataset.layer,input.checked)});
    if($('zoomIn'))$('zoomIn').onclick=()=>zoomBy(1.6);
    if($('zoomOut'))$('zoomOut').onclick=()=>zoomBy(1/1.6);
    if($('zoomReset'))$('zoomReset').onclick=()=>{if(selected)select(selected,false);goHome(true)};
    if($('incidentCardClose'))$('incidentCardClose').onclick=()=>{if(selected)select(selected,false)};
    if($('tlRange'))$('tlRange').oninput=e=>setTime(Number(e.target.value),true);
    if($('tlPlay'))$('tlPlay').onclick=()=>playing?stopPlay():startPlay();
    if($('tlBack'))$('tlBack').onclick=()=>{stopPlay();setTime(-1440)};
    if($('tlFwd'))$('tlFwd').onclick=()=>{stopPlay();setTime(T+60)};
    if($('tlLive'))$('tlLive').onclick=()=>{stopPlay();setTime(0)};
    if(typeof document.addEventListener==='function')document.addEventListener('keydown',e=>{if(e.target&&/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(e.key===' '){e.preventDefault();playing?stopPlay():startPlay()}else if(e.key==='Escape'&&selected)select(selected,false)});
  }
  wireControls();
  c.subscribe(renderState);
  c.onLanguageChange(renderLabels);
  $('updatedAt').textContent=`${clock(loadedAt)} · ${dateLabel(loadedAt)}`;
  renderTicks();renderDynamic();
  buildInset();inlineBasemap();
  window.gisMap={incidents,wind,setTime,get time(){return T},select,view:()=>({...view})};
})();
