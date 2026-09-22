window.cecop=(()=>{
  const $=id=>document.getElementById(id);
  const incident=document.body.dataset.page==='incidente';
  const shared={
    es:{navSituation:'Situación',navIncident:'Sala de crisis',navFleet:'Medios',navArchive:'Archivo',eyebrow:'CENTRAL DE OPERACIONES · CECOP',busy:'AGENTES DELIBERANDO · RELOJ EN PAUSA',live:'En curso',paused:'Pausado',replay:'Reproducción',connecting:'Conectando…',serverUnavailable:'Servidor local no disponible',watch:'Vigilancia',active:'Activo',enObservacion:'EN OBSERVACIÓN',resetPending:'reinicio al terminar la deliberación',queuedFires:'igniciones en cola',changeLanguage:'Switch to English',agentChain:'Política de decisión · Central → Exploración / Extinción',kClock:'Reloj',kAgents:'Agentes',fleetTitle:'Medios de respuesta',fleetTrucks:'camiones',fleetScouts:'exploradores',fleetExtinguishers:'drones Squirtle',applyFleet:'Aplicar flota',fleetHelp:'Configura antes de la ignición. Reinicia en Sala de crisis para cambiar los medios; los recuentos se conservan.',noVehicles:'Sin vehículos',actionFailed:'No se pudo completar la solicitud.',downloadFailed:'No se pudo descargar.',populationUnavailable:'Datos de población no disponibles.',populationSummary:'Brunete: {total} habitantes (padrón municipal {year}). Reparto por distritos estimado; granja: {farm} ocupantes supuestos, aparte del padrón. Ilustración no georreferenciada; límites no oficiales.',workflow:'Flujo',footerNote:'La política de decisión determinista decide. Ilustración inspirada en Brunete; rejilla educativa, no Rothermel/Catastro. El reloj se pausa durante la deliberación; la reproducción no llama a la IA.',censusLink:'Ayuntamiento de Brunete · padrón 2025',censusAssumptions:'Distribución por distritos estimada; ocupación de granja y refugios supuestos.',pnoaIntro:'Ilustración adaptada de una referencia',openIncident:'Abrir sala de crisis'},
    en:{navSituation:'Situation',navIncident:'Incident room',navFleet:'Assets',navArchive:'Archive',eyebrow:'OPERATIONS CENTER · CECOP',busy:'AGENTS DELIBERATING · CLOCK PAUSED',live:'Live',paused:'Paused',replay:'Replay',connecting:'Connecting…',serverUnavailable:'Local server unavailable',watch:'Watch',active:'Active',enObservacion:'UNDER OBSERVATION',resetPending:'reset after deliberation',queuedFires:'queued ignitions',changeLanguage:'Cambiar a español',agentChain:'Decision policy · Central → Scout / Extinguisher',kClock:'Clock',kAgents:'Agents',fleetTitle:'Response assets',fleetTrucks:'trucks',fleetScouts:'scouts',fleetExtinguishers:'Squirtle drones',applyFleet:'Apply fleet',fleetHelp:'Configure before ignition. Reset in the incident room to change assets; counts are preserved.',noVehicles:'No vehicles',actionFailed:'The request could not be completed.',downloadFailed:'Download failed.',populationUnavailable:'Population data unavailable.',populationSummary:'Brunete: {total} residents ({year} municipal census). District split is estimated; farm: {farm} assumed occupants, separate from the census. Illustration is not georeferenced; boundaries are not official.',workflow:'Workflow',footerNote:'A deterministic decision policy decides. Illustration inspired by Brunete; educational grid, not Rothermel/Catastro. Clock pauses during deliberation; replay never calls AI.',censusLink:'Brunete Town Council · 2025 census',censusAssumptions:'Estimated district allocations; assumed farm occupancy and refuges.',pnoaIntro:'Illustration adapted from a reference',openIncident:'Open incident room'}
  };
  const national={
    es:{nationalTitle:'España',nationalSubhead:'PROTECCIÓN CIVIL · CECOP NACIONAL',nationalCode:'CECOP-ES',officialTime:'Hora oficial',demoBoard:'Tablero de demostración: Brunete es la única sala simulada; el resto son expedientes estáticos de demostración.',baseMapCredit:'Mapa base derivado de Wikimedia Commons (NordNordWest) · CC BY-SA 3.0. Localizador esquemático, no cartografía oficial.',salaPrefix:'ES-2026-BRUNETE',
      statusLive:'ACTIVO',statusStandby:'SALA PREPARADA',statusWatch:'EN OBSERVACIÓN',statusExtinguished:'EXTINGUIDO',statusControlled:'CONTROLADO',levelObservacion:'OBSERVACIÓN',levelAlerta:'ALERTA',levelAlarma:'ALARMA',
      ccaaMadrid:'Comunidad de Madrid',ccaaExtremadura:'Extremadura',ccaaGalicia:'Galicia',ccaaCatalunya:'Cataluña',ccaaAndalucia:'Andalucía',ccaaValenciana:'Comunitat Valenciana',ccaaCanarias:'Canarias',
      dossierGata:'Vigilancia FIRMS sobre la sierra; sin focos confirmados en tierra.',dossierOurense:'Foco forestal con aldeas próximas; medios autonómicos y UME desplegados.',dossierEmporda:'Vigilancia por tramontana; parque natural cerrado al público.',dossierBermeja:'Gran incendio forestal de 2025; perímetro extinguido y zona en restauración.',dossierBejis:'Incendio controlado tras evacuaciones preventivas; seguimiento de reactivaciones.',dossierTenerife:'Incendio de 2024 en la corona forestal; extinguido, actas cerradas.',
      poolUme:'UME · BIEM I',poolBrif:'BRIF · MITECO',poolGalicia:'Medios autonómicos · Galicia',poolCatalunya:'Bombers · Generalitat de Catalunya',poolExtremadura:'Plan INFOEX · Extremadura',poolAndalucia:'Plan INFOCA · Andalucía',poolCanarias:'Medios autonómicos · Canarias',poolMadrid:'Plan INFOMA · Comunidad de Madrid',poolNational:'Estatal',
      demoFigures:'Cifras de demostración',peopleLabel:'personas',unitsLabel:'medios',assignedLabel:'asignados',availableLabel:'disponibles',hectares:'ha'},
    en:{nationalTitle:'Spain',nationalSubhead:'CIVIL PROTECTION · NATIONAL CECOP',nationalCode:'CECOP-ES',officialTime:'Official time',demoBoard:'Demonstration board: Brunete is the only simulated room; the other dossiers are static demo cards.',baseMapCredit:'Base map derived from Wikimedia Commons (NordNordWest) · CC BY-SA 3.0. Schematic locator, not official cartography.',salaPrefix:'ES-2026-BRUNETE',
      statusLive:'ACTIVE',statusStandby:'ROOM ON STANDBY',statusWatch:'UNDER OBSERVATION',statusExtinguished:'EXTINGUISHED',statusControlled:'CONTROLLED',levelObservacion:'OBSERVATION',levelAlerta:'ALERT',levelAlarma:'ALARM',
      ccaaMadrid:'Community of Madrid',ccaaExtremadura:'Extremadura',ccaaGalicia:'Galicia',ccaaCatalunya:'Catalonia',ccaaAndalucia:'Andalusia',ccaaValenciana:'Valencian Community',ccaaCanarias:'Canary Islands',
      dossierGata:'FIRMS watch over the range; no confirmed ground hotspots.',dossierOurense:'Forest fire near hamlets; regional crews and UME deployed.',dossierEmporda:'Tramontane wind watch; natural park closed to visitors.',dossierBermeja:'2025 large forest fire; perimeter extinguished, area under restoration.',dossierBejis:'Fire controlled after precautionary evacuations; monitoring flare-ups.',dossierTenerife:'2024 fire in the forest crown; extinguished, case closed.',
      poolUme:'UME · BIEM I',poolBrif:'BRIF · MITECO',poolGalicia:'Regional crews · Galicia',poolCatalunya:'Bombers · Government of Catalonia',poolExtremadura:'INFOEX plan · Extremadura',poolAndalucia:'INFOCA plan · Andalusia',poolCanarias:'Regional crews · Canary Islands',poolMadrid:'INFOMA plan · Community of Madrid',poolNational:'National',
      demoFigures:'Demo figures',peopleLabel:'people',unitsLabel:'units',assignedLabel:'assigned',availableLabel:'available',hectares:'ha'}
  };
  for(const lang of ['es','en'])Object.assign(shared[lang],national[lang]);
  // Equirectangular frame of maps/spain-location.svg (NordNordWest): top 44.4, bottom 34.7, left -9.9, right 4.8.
  const MAP={width:1183.5554,height:1015.8372,top:44.4,bottom:34.7,left:-9.9,right:4.8};
  function project(lon,lat){return {x:(lon-MAP.left)/(MAP.right-MAP.left)*MAP.width,y:(MAP.top-lat)/(MAP.top-MAP.bottom)*MAP.height}}
  // Frozen demonstration dossiers. Only ES-2026-BRUNETE is simulated; the rest never move and never call HappyRobot.
  const catalog=[
    {id:'ES-2026-BRUNETE',place:'Brunete · Madrid',ccaa:'madrid',lon:-3.999,lat:40.405,status:'live',level:'observacion',people:0,year:2026,href:'/incidente'},
    {id:'ES-2026-GATA',place:'Sierra de Gata · Cáceres',ccaa:'extremadura',lon:-6.6,lat:40.24,label:'left',status:'watch',level:'observacion',people:0,year:2026,noteKey:'dossierGata'},
    {id:'ES-2026-OURENSE',place:'Verín · Ourense',ccaa:'galicia',lon:-7.44,lat:41.94,status:'watch',level:'alerta',people:1900,year:2026,noteKey:'dossierOurense'},
    {id:'ES-2026-EMPORDA',place:'Cap de Creus · Girona',ccaa:'catalunya',lon:3.32,lat:42.32,label:'left',status:'watch',level:'observacion',people:450,year:2026,noteKey:'dossierEmporda'},
    {id:'ES-2025-BERMEJA',place:'Sierra Bermeja · Málaga',ccaa:'andalucia',lon:-5.2,lat:36.5,status:'closed',outcome:'extinguished',people:0,year:2025,hectares:2100,noteKey:'dossierBermeja'},
    {id:'ES-2025-BEJIS',place:'Bejís · Castellón',ccaa:'valenciana',lon:-0.72,lat:39.9,status:'closed',outcome:'controlled',people:0,year:2025,hectares:1350,noteKey:'dossierBejis'},
    {id:'ES-2024-TENERIFE',place:'Arafo–Candelaria · Tenerife',ccaa:'canarias',lon:-16.45,lat:28.35,inset:true,status:'closed',outcome:'extinguished',people:0,year:2024,hectares:3800,noteKey:'dossierTenerife'}
  ];
  const ccaaNames={madrid:'ccaaMadrid',extremadura:'ccaaExtremadura',galicia:'ccaaGalicia',catalunya:'ccaaCatalunya',andalucia:'ccaaAndalucia',valenciana:'ccaaValenciana',canarias:'ccaaCanarias'};
  // Frozen national asset pools (demo figures). Brunete's live fleet is added from /api/state when the room is open.
  const pools=[
    {id:'ume',nameKey:'poolUme',scope:'poolNational',units:12,assigned:{'ES-2026-OURENSE':2}},
    {id:'brif',nameKey:'poolBrif',scope:'poolNational',units:10,assigned:{'ES-2026-GATA':1,'ES-2026-EMPORDA':1}},
    {id:'galicia',nameKey:'poolGalicia',ccaa:'galicia',units:8,assigned:{'ES-2026-OURENSE':4}},
    {id:'catalunya',nameKey:'poolCatalunya',ccaa:'catalunya',units:6,assigned:{'ES-2026-EMPORDA':3}},
    {id:'extremadura',nameKey:'poolExtremadura',ccaa:'extremadura',units:5,assigned:{'ES-2026-GATA':2}},
    {id:'andalucia',nameKey:'poolAndalucia',ccaa:'andalucia',units:7,assigned:{}},
    {id:'canarias',nameKey:'poolCanarias',ccaa:'canarias',units:3,assigned:{}},
    {id:'madrid',nameKey:'poolMadrid',ccaa:'madrid',units:4,assigned:{},live:true}
  ];
  function isLive(s){return !!(s&&(s.ignited||s.called))}
  function liveFleetTotal(s){if(!s)return 0;const counts=fleet(s).counts;return (counts.trucks||0)+(counts.scouts||0)+(counts.extinguishers||0)}
  function bruneteLevel(s){
    if(!isLive(s))return 'observacion';
    const groups=Object.values(s.people||{});
    if(groups.some(g=>g.status==='burnt'))return 'alarma';
    return s.burning||groups.some(g=>['evacuating','blocked'].includes(g.status))?'alerta':'observacion';
  }
  function brunetePeople(s){if(!isLive(s))return 0;return Object.values(s.people||{}).filter(g=>['unwarned','evacuating','blocked'].includes(g.status)).reduce((n,g)=>n+g.count,0)}
  function assignedTo(id){return pools.reduce((n,p)=>n+(p.assigned[id]||0),0)}
  // Resolves every dossier against live state: Brunete is the only entry that changes.
  function dossiers(s){
    return catalog.map(d=>{
      if(d.id!=='ES-2026-BRUNETE')return {...d,assets:assignedTo(d.id)};
      const live=isLive(s);
      return {...d,status:live?'live':'standby',level:bruneteLevel(s),people:brunetePeople(s),assets:live?liveFleetTotal(s):0,mission:s?.mission||''};
    });
  }
  function statusKey(d){return d.status==='live'?'statusLive':d.status==='standby'?'statusStandby':d.status==='watch'?'statusWatch':d.outcome==='controlled'?'statusControlled':'statusExtinguished'}
  function levelKey(level){return level==='alarma'?'levelAlarma':level==='alerta'?'levelAlerta':'levelObservacion'}
  function ccaaName(code){return t(ccaaNames[code]||code)}
  function summary(s){
    const list=dossiers(s),open=list.filter(d=>d.status==='live'||d.status==='watch');
    const order={observacion:0,alerta:1,alarma:2};
    return {open:open.length,ccaa:new Set(open.map(d=>d.ccaa)).size,people:open.reduce((n,d)=>n+d.people,0),assets:open.reduce((n,d)=>n+d.assets,0),level:open.reduce((top,d)=>order[d.level]>order[top]?d.level:top,'observacion')};
  }
  const statuses={
    es:{at_station:'en base',mobilizing:'movilizando',en_route:'en ruta',suppressing:'suprimiendo',returning:'regresando',retreating:'replegando',blocked:'bloqueado',trapped:'atrapado',holding:'en espera',awaiting_assignment:'esperando misión',hold:'mantener',scout:'explorar',contain:'contener',warn:'avisar',patrol:'patrullando',continue:'continuar',on_scene:'en zona',evacuate_town:'avisar distrito',evacuate_farm:'avisar granja',unwarned:'sin aviso',evacuating:'evacuando',safe:'a salvo',burnt:'expuestos'},
    en:{at_station:'at station',mobilizing:'mobilizing',en_route:'en route',suppressing:'suppressing',returning:'returning',retreating:'retreating',blocked:'blocked',trapped:'trapped',holding:'holding',awaiting_assignment:'awaiting assignment',hold:'hold',scout:'scout',contain:'contain',warn:'warn',patrol:'patrolling',continue:'continue',on_scene:'on scene',evacuate_town:'warn district',evacuate_farm:'warn farm',unwarned:'unwarned',evacuating:'evacuating',safe:'safe',burnt:'exposed'}
  };
  let language='es',currentState=null,pageTranslations={es:{},en:{}},clientError='',pollingError=false,busySince=0,epoch=0,actionsPending=0,polling=false,pollTimer=null,started=false;
  const listeners=new Set(),languageListeners=new Set();
  try{const saved=localStorage.getItem('cecop-lang');if(saved==='es'||saved==='en')language=saved}catch{}
  const hasKey=key=>Object.hasOwn(pageTranslations[language]||{},key)||Object.hasOwn(shared[language],key);
  function t(key){return Object.hasOwn(pageTranslations[language]||{},key)?pageTranslations[language][key]:Object.hasOwn(shared[language],key)?shared[language][key]:key}
  function applyLang(){
    document.documentElement.lang=language;
    document.title=`CECOP · ${incident?'Brunete · Madrid':t('pageTitle')}`;
    document.querySelectorAll('[data-i18n]').forEach(el=>{if(hasKey(el.dataset.i18n))el.textContent=t(el.dataset.i18n)});
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el=>{if(hasKey(el.dataset.i18nAriaLabel))el.setAttribute('aria-label',t(el.dataset.i18nAriaLabel))});
    if($('langToggle')){$('langToggle').textContent=language==='es'?'EN':'ES';$('langToggle').setAttribute('aria-label',t('changeLanguage'))}
    const active=({'/':'situacion','/situacion':'situacion','/incidente':'incidente','/incidente/brunete':'incidente','/medios':'medios','/archivo':'archivo'})[location.pathname];
    document.querySelectorAll('[data-nav]').forEach(el=>{if(el.dataset.nav===active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')});
  }
  function renderError(){if(!$('error'))return;const messages=[clientError,pollingError?t('serverUnavailable'):'',currentState?.error].filter(Boolean);$('error').textContent=[...new Set(messages)].join('\n');$('error').hidden=!messages.length}
  function renderDuty(s){
    if(incident||!s)return;
    const busy=!!s.busy&&!s.replay;
    if(busy&&!busySince)busySince=Date.now();if(!busy)busySince=0;
    const wait=busy?` · ${Math.round((Date.now()-busySince)/1000)}s`:'';
    let label=busy?t('busy')+wait:s.replay?t('replay'):s.running?t('live'):t('paused');
    if(s.reset_pending)label+=` · ${t('resetPending')}`;
    if(!s.replay&&s.pending_fires)label+=` · ${s.pending_fires} ${t('queuedFires')}`;
    $('connection').textContent=pollingError?t('serverUnavailable'):`${t('salaPrefix')} · ${label}`;
    document.body.classList.toggle('is-busy',busy);
    document.body.classList.toggle('is-live',!!s.running&&!s.busy&&!s.replay);
    document.body.classList.toggle('is-replay',!!s.replay);
    document.body.classList.toggle('is-active',!!(s.ignited&&s.burning));
    renderError();
  }
  function publish(s){currentState=s;renderDuty(s);if($('workflow'))$('workflow').href=s.workflow_url;listeners.forEach(fn=>fn(s));if(typeof CustomEvent!=='undefined')window.dispatchEvent?.(new CustomEvent('cecop:state',{detail:s}))}
  function setLang(next,persist=true){
    if(next!=='es'&&next!=='en')return;
    language=next;
    if(persist)try{localStorage.setItem('cecop-lang',next)}catch{}
    applyLang();renderDuty(currentState);languageListeners.forEach(fn=>fn(next));
    if(!incident&&currentState)listeners.forEach(fn=>fn(currentState));
  }
  function setError(error){clientError=error?.message||String(error);renderError()}
  async function readJSON(response){let data;try{data=await response.json()}catch{throw Error(t('actionFailed'))}if(!response.ok)throw Error(typeof data?.error==='string'?data.error:t('actionFailed'));return data}
  async function pollState(){
    if(incident||polling||actionsPending)return currentState;
    const version=epoch;polling=true;
    try{const s=await readJSON(await fetch('/api/state'));if(version===epoch&&!actionsPending){pollingError=false;publish(s)}}
    catch(e){if(version===epoch&&!actionsPending){pollingError=true;renderError();$('connection').textContent=t('serverUnavailable')}}
    finally{polling=false}
    return currentState;
  }
  async function action(name,extra={}){
    const version=++epoch;actionsPending++;
    try{
      const s=await readJSON(await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-Simulator-Request':'1'},body:JSON.stringify({action:name,...extra})}));
      if(version!==epoch)return false;
      clientError='';pollingError=false;publish(s);return true;
    }catch(e){if(version===epoch)setError(e);return false}
    finally{actionsPending--}
  }
  function fleet(s){
    const vehicles={trucks:Array.isArray(s.trucks)?s.trucks:(s.truck?[s.truck]:[]),scouts:s.scouts||[],extinguishers:Array.isArray(s.extinguishers)?s.extinguishers:(s.drone?[s.drone]:[])};
    return {vehicles,counts:s.fleet_counts||Object.fromEntries(Object.entries(vehicles).map(([role,list])=>[role,list.length]))};
  }
  function format(n){return Number(n).toLocaleString(language==='es'?'es-ES':'en-US')}
  function populationText(s){const p=s.geography?.population_source;if(!p)return t('populationUnavailable');const farm=p.farm_occupancy?.count??Object.values(s.people||{}).filter(g=>g.kind==='farm').reduce((n,g)=>n+g.count,0);return t('populationSummary').replace('{total}',format(p.official_total)).replace('{year}',p.reference_year).replace('{farm}',format(farm))}
  function statusText(value){return Object.hasOwn(statuses[language],value)?statuses[language][value]:value}
  function openArchive(mode){if(mode!=='play'&&mode!=='open')return;try{sessionStorage.setItem('cecop-archive-intent',mode)}catch{}location.assign('/incidente')}
  function incidentArchive(){
    let mode=null;try{mode=sessionStorage.getItem('cecop-archive-intent');sessionStorage.removeItem('cecop-archive-intent')}catch{}
    if(mode==='play'&&$('playRecord')?.onclick){Promise.resolve($('playRecord').onclick()).catch(e=>window.setClientError?window.setClientError(e):setError(e))}
    if(mode==='open'){
      const reveal=()=>{$('setupPanel').open=true;document.querySelector('.record-tools').open=true;$('openRecording').focus()};
      if(window.state)reveal();
      else{const observer=new MutationObserver(()=>{if(window.state){observer.disconnect();reveal()}});observer.observe($('clock'),{childList:true,subtree:true})}
    }
  }
  function scheduleTick(){clearTimeout(pollTimer);pollTimer=null;if(!incident&&!document.hidden&&(!currentState||currentState.running))pollTimer=setTimeout(tick,1000)}
  async function tick(){await pollState();scheduleTick()}
  document.addEventListener?.('visibilitychange',()=>{clearTimeout(pollTimer);pollTimer=null;if(!document.hidden&&!incident&&(!currentState||currentState.running))tick()});
  function officialClock(){
    const el=$('officialClock');if(!el)return;
    try{el.textContent=new Date().toLocaleTimeString(language==='es'?'es-ES':'en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Europe/Madrid'})}catch{el.textContent=new Date().toLocaleTimeString()}
    setTimeout(officialClock,1000);
  }
  function start(){if(started)return;started=true;applyLang();if(incident){languageListeners.forEach(fn=>fn(language));incidentArchive()}else{$('langToggle').onclick=()=>setLang(language==='es'?'en':'es');officialClock();tick()}}
  window.addEventListener('storage',e=>{if(e.key==='cecop-lang'&&e.newValue!==language&&(e.newValue==='es'||e.newValue==='en'))setLang(e.newValue,false)});
  const api={get lang(){return language},get state(){return currentState},t,applyLang,setLang,useTranslations(values){for(const lang of ['es','en'])Object.assign(pageTranslations[lang],values[lang]||{});applyLang()},onLanguageChange(fn){languageListeners.add(fn);return()=>languageListeners.delete(fn)},subscribe(fn){listeners.add(fn);if(currentState)fn(currentState);return()=>listeners.delete(fn)},pollState,action,setError,format,fleet,populationText,statusText,openArchive,catalog,pools,dossiers,summary,project,statusKey,levelKey,ccaaName,isLive,assignedTo,liveFleetTotal};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else setTimeout(start,0);
  return api;
})();
