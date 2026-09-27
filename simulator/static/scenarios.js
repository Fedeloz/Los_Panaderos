/* Simulacro presets shared by Situación (launch) and Sala de crisis (run).
   Every preset is applied client-side with existing actions:
   reset → fleet → place_fire → wind → spread_factor → ignite → call.
   The terrain is always the illustrated Brunete grid; presets only change wind,
   spread, fleet and (optionally) the ignition cell. */
window.Scenarios=(()=>{
  const WINDS={east:[1,0],north:[0,-1],west:[-1,0],south:[0,1],calm:[0,0]};
  const DEFAULT_FLEET={trucks:1,scouts:1,extinguishers:1};
  // Catalogue dossiers (chrome.js) and their demo presets. `ignition` null = engine default.
  const PRESETS={
    'ES-2026-BRUNETE':{name:'Brunete · Madrid',wind:[1,0],spread:0.5,fleet:DEFAULT_FLEET,ignition:null,
      summary:{es:'Viento del oeste, propagación moderada. El escenario de referencia.',en:'Westerly wind, moderate spread. The reference scenario.'}},
    'ES-2026-GATA':{name:'Sierra de Gata · Cáceres',wind:[-1.2,-0.4],spread:0.75,fleet:{trucks:1,scouts:2,extinguishers:1},ignition:null,
      summary:{es:'Viento hacia el casco, dos exploradores para confirmar pronto.',en:'Wind towards the town, two scouts for early confirmation.'}},
    'ES-2026-OURENSE':{name:'Verín · Ourense',wind:[0,-1.6],spread:1,fleet:{trucks:2,scouts:1,extinguishers:1},ignition:null,
      summary:{es:'Viento fuerte hacia la granja; dos camiones disponibles.',en:'Strong wind towards the farm; two engines available.'}},
    'ES-2026-EMPORDA':{name:'Cap de Creus · Girona',wind:[0.4,1.8],spread:1.5,fleet:{trucks:1,scouts:1,extinguishers:2},ignition:null,
      summary:{es:'Tramontana: propagación rápida hacia el sur, refuerzo de drones.',en:'Tramontane: fast southward spread, extra drones.'}},
    'ES-2025-BERMEJA':{name:'Sierra Bermeja · Málaga',wind:[-0.8,0.6],spread:2,fleet:{trucks:2,scouts:2,extinguishers:1},ignition:null,
      summary:{es:'Gran incendio: propagación muy alta y flota máxima.',en:'Large fire: very high spread and full fleet.'}},
    'ES-2025-BEJIS':{name:'Bejís · Castellón',wind:[0.6,-0.6],spread:1.25,fleet:DEFAULT_FLEET,ignition:null,
      summary:{es:'Viento cruzado hacia el nordeste.',en:'Cross wind towards the north-east.'}},
    'ES-2024-TENERIFE':{name:'Arafo–Candelaria · Tenerife',wind:[-0.5,-0.5],spread:1,fleet:{trucks:1,scouts:2,extinguishers:1},ignition:null,
      summary:{es:'Ladera con viento moderado; prioridad a la exploración.',en:'Hillside with moderate wind; scouting first.'}}
  };
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const round=(v,d=2)=>Math.round(v*10**d)/10**d;
  // Map an incident from mapa.js (wind {u,v,speed}, sev, ha) onto simulator parameters.
  function fromIncident(f){
    const w=f.wind||{u:1,v:0,speed:18};
    const k=clamp(w.speed/16,0.4,3);
    const spread={extreme:2,very_high:1.5,high:1,moderate:0.5}[f.sev]||0.75;
    const fleet=f.ha>=1500?{trucks:2,scouts:2,extinguishers:1}:f.ha>=800?{trucks:2,scouts:1,extinguishers:1}:DEFAULT_FLEET;
    return {id:f.id,name:`${f.name} · ${f.province}`,wind:[round(clamp(w.u*k,-3,3)),round(clamp(-w.v*k,-3,3))],spread,fleet,ignition:null,custom:true};
  }
  function get(id){const p=PRESETS[id];return p?{id,...p,custom:false}:null}
  function normalizeWind(value){
    if(Array.isArray(value)&&value.length===2&&value.every(Number.isFinite))return [clamp(value[0],-3,3),clamp(value[1],-3,3)];
    if(typeof value==='string'&&WINDS[value])return WINDS[value].slice();
    return null;
  }
  // /incidente?scenario=<id>[&wind=east|x,y][&spread=1.5][&fleet=t,s,e][&name=…]
  function toQuery(s,overrides={}){
    const q=new URLSearchParams();q.set('scenario',s.id);
    if(s.custom&&s.name)q.set('name',s.name.slice(0,80));
    const wind=overrides.wind??(s.custom?s.wind:null);
    if(wind)q.set('wind',typeof wind==='string'?wind:wind.map(v=>round(v)).join(','));
    if(s.custom){q.set('spread',String(s.spread));q.set('fleet',[s.fleet.trucks,s.fleet.scouts,s.fleet.extinguishers].join(','))}
    return '/incidente?'+q.toString();
  }
  function fromQuery(search){
    const q=new URLSearchParams(search||'');const id=q.get('scenario');if(!id)return null;
    const base=get(id)||{id,name:(q.get('name')||id).slice(0,80),wind:[1,0],spread:0.5,fleet:DEFAULT_FLEET,ignition:null,custom:true};
    const windRaw=q.get('wind');let wind=null;
    if(windRaw){const parts=windRaw.split(',').map(Number);wind=normalizeWind(parts.length===2?parts:windRaw)}
    const spread=Number(q.get('spread')),fleetRaw=(q.get('fleet')||'').split(',').map(Number);
    const fleet=fleetRaw.length===3&&fleetRaw.every(n=>Number.isInteger(n)&&n>=0&&n<=3)&&fleetRaw.some(n=>n>0)?{trucks:fleetRaw[0],scouts:fleetRaw[1],extinguishers:fleetRaw[2]}:base.fleet;
    return {...base,wind:wind||base.wind,spread:Number.isFinite(spread)&&spread>=0.25&&spread<=4?spread:base.spread,fleet};
  }
  // Ordered list of {action, extra} to run; `act` in app.js posts each one.
  function steps(s){
    const list=[{action:'reset'},{action:'fleet',extra:{counts:s.fleet}}];
    if(Array.isArray(s.ignition))list.push({action:'place_fire',extra:{x:s.ignition[0],y:s.ignition[1]},optional:true});
    list.push({action:'wind',extra:{x:s.wind[0],y:s.wind[1]}},{action:'spread_factor',extra:{value:s.spread}},{action:'ignite'},{action:'call'});
    return list;
  }
  return {PRESETS,WINDS,DEFAULT_FLEET,get,fromIncident,toQuery,fromQuery,steps,normalizeWind,list:()=>Object.keys(PRESETS).map(get)};
})();
