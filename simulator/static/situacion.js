(()=>{
  const c=window.cecop,$=id=>document.getElementById(id);
  c.useTranslations({
    es:{nationalKpis:'Situación nacional',kOpenIncidents:'Incidentes abiertos',kCcaa:'CCAA afectadas',kRiskPeople:'Personas en riesgo',kAssetsCommitted:'Medios comprometidos',kLevel:'Nivel',activeEvents:'Expedientes abiertos',closedEvents:'Cerrados',salaHeading:'Sala abierta',salaHelp:'Única sala simulada bajo mando CECOP. Las órdenes proceden de la política de decisión y se muestran sin traducir.',salaClock:'Reloj de sala',lastOrder:'Última orden',openArchive:'Abrir archivo',unwarned:'Sin aviso',
      openDetail:'{watch} en observación · {live} sala abierta',riskIdle:'Brunete sin ignición · sólo expedientes en observación',riskLive:'incluye Brunete en directo',assetsDetail:'reservas nacionales asignadas',assetsLive:'+ flota Brunete',levelDetail:'nivel máximo abierto',demoTag:'ficha de demostración',liveTag:'en directo',peopleAtRisk:'personas en riesgo',assetsCount:'medios',noPeople:'sin población amenazada',updatedNow:'actualizado ahora',updatedStatic:'expediente estático',
      launchEyebrow:'SIMULACRO CON DRONES',launchEyebrowLive:'SIMULACRO EN CURSO',launchTitle:'Lanza un simulacro',launchTitleLive:'Sala de crisis abierta',launchLine:'Elige un incendio del mapa o empieza en Brunete. Los agentes despliegan la flota y deciden a quién avisar.',launchStart:'▶ Iniciar simulacro',launchGo:'Ir a la sala',launchWind:'Viento',windEast:'Este',windNorth:'Norte',windWest:'Oeste',windCalm:'Calma',
      onboardText:'Este es el tablero nacional. La simulación con drones vive en la sala de crisis.',onboardStart:'Iniciar simulacro',tourStart:'Demo guiada',onboardClose:'Cerrar aviso'},
    en:{nationalKpis:'National situation',kOpenIncidents:'Open incidents',kCcaa:'Regions affected',kRiskPeople:'People at risk',kAssetsCommitted:'Assets committed',kLevel:'Level',activeEvents:'Open dossiers',closedEvents:'Closed',salaHeading:'Open room',salaHelp:'The only simulated room under CECOP command. Orders come from the decision policy and are shown untranslated.',salaClock:'Room clock',lastOrder:'Latest order',openArchive:'Open archive',unwarned:'Unwarned',
      openDetail:'{watch} under observation · {live} room open',riskIdle:'Brunete not ignited · observation dossiers only',riskLive:'includes live Brunete',assetsDetail:'national reserves assigned',assetsLive:'+ Brunete fleet',levelDetail:'highest open level',demoTag:'demonstration card',liveTag:'live',peopleAtRisk:'people at risk',assetsCount:'assets',noPeople:'no population threatened',updatedNow:'updated now',updatedStatic:'static dossier',
      launchEyebrow:'DRONE SIMULATION',launchEyebrowLive:'DRILL IN PROGRESS',launchTitle:'Launch a drill',launchTitleLive:'Incident room open',launchLine:'Pick a fire on the map or start in Brunete. Agents deploy the fleet and decide who to warn.',launchStart:'▶ Start drill',launchGo:'Go to the room',launchWind:'Wind',windEast:'East',windNorth:'North',windWest:'West',windCalm:'Calm',
      onboardText:'This is the national board. The drone simulation lives in the incident room.',onboardStart:'Start drill',tourStart:'Guided demo',onboardClose:'Dismiss notice'}
  });
  // ---------- Simulacro launch (client-side presets from scenarios.js) ----------
  const launchUrl=(preset,overrides)=>{try{const S=window.Scenarios;return S.toQuery(preset||S.get('ES-2026-BRUNETE'),overrides||{})}catch{return '/incidente'}};
  const WIND_IDS={windEast:'east',windNorth:'north',windWest:'west',windCalm:'calm'};
  let wind='east';
  const bruneteUrl=()=>launchUrl(null,{wind});
  const go=url=>{try{location.assign(url)}catch{}};
  function renderLaunch(s){
    const live=!!(s&&c.isLive(s)),card=$('launchCard');if(!card)return;
    card.classList.toggle('is-live',live);
    $('launchEyebrow').textContent=c.t(live?'launchEyebrowLive':'launchEyebrow');
    $('launchTitle').textContent=c.t(live?'launchTitleLive':'launchTitle');
    $('launchLine').textContent=live?`Brunete · T+${s.tick} · ${s.mission||''}`.slice(0,90):c.t('launchLine');
    $('launchGo').textContent=c.t(live?'launchGo':'launchStart');
    if($('launchWind'))$('launchWind').hidden=live;
    $('launchGo').onclick=()=>go(live?'/incidente?demo=1':bruneteUrl());
  }
  function wireLaunch(){
    for(const [id,value] of Object.entries(WIND_IDS)){const b=$(id);if(!b)continue;b.onclick=()=>{wind=value;for(const [oid,ov] of Object.entries(WIND_IDS)){const o=$(oid);if(!o)continue;o.classList.toggle('is-on',ov===wind);o.setAttribute('aria-pressed',String(ov===wind))}}}
    renderLaunch(c.state);
  }
  function wireOnboarding(){
    const box=$('onboard');if(!box)return;
    let seen=false;try{seen=!!sessionStorage.getItem('cecop-onboarded')}catch{}
    box.hidden=seen;
    const dismiss=()=>{box.hidden=true;try{sessionStorage.setItem('cecop-onboarded','1')}catch{}};
    if($('onboardClose'))$('onboardClose').onclick=dismiss;
    if($('onboardTour'))$('onboardTour').onclick=()=>{dismiss();go('/incidente?demo=1')};
  }
  function ticket(d){
    const article=document.createElement('article');article.className=`order-ticket event-frozen event-${d.status}`;
    const label=document.createElement('div');label.className='order-label';
    const code=document.createElement('span');code.className='eyebrow';code.textContent=d.id;
    const st=document.createElement('span');st.className='event-status';st.textContent=c.t(c.statusKey(d));
    label.append(code,st);
    if(d.status!=='closed'){const lv=document.createElement('span');lv.className=`event-level level-${d.level}`;lv.textContent=c.t(c.levelKey(d.level));label.append(lv)}
    const body=document.createElement('div');
    const title=document.createElement('h2');title.textContent=d.place;
    const meta=document.createElement('p');meta.className='event-meta';meta.textContent=`${c.ccaaName(d.ccaa)} · ${d.year}${d.hectares?` · ≈${c.format(d.hectares)} ${c.t('hectares')}`:''} · ${d.people?c.format(d.people)+' '+c.t('peopleAtRisk'):c.t('noPeople')} · ${d.assets} ${c.t('assetsCount')}`;
    const note=document.createElement('p');note.textContent=d.noteKey?c.t(d.noteKey):'';
    const tag=document.createElement('p');tag.className='kpi-detail';tag.textContent=`${c.t('demoTag')} · ${c.t('updatedStatic')}`;
    body.append(title,meta,note,tag);article.append(label,body);
    return article;
  }
  function render(s){
    const list=c.dossiers(s),sum=c.summary(s),live=c.isLive(s);
    const brunete=list.find(d=>d.id==='ES-2026-BRUNETE'),watches=list.filter(d=>d.status==='watch'&&d.id!=='ES-2026-BRUNETE'),closed=list.filter(d=>d.status==='closed');
    $('openIncidents').textContent=String(sum.open);
    $('openDetail').textContent=c.t('openDetail').replace('{watch}',watches.length).replace('{live}',live?1:0);
    $('ccaaCount').textContent=String(sum.ccaa);
    $('ccaaDetail').textContent=[...new Set(list.filter(d=>d.status==='live'||d.status==='watch').map(d=>c.ccaaName(d.ccaa)))].join(' · ');
    $('riskPeople').textContent=c.format(sum.people);
    $('riskDetail').textContent=c.t(live?'riskLive':'riskIdle');
    $('assetsCommitted').textContent=String(sum.assets);
    $('assetsDetail').textContent=c.t('assetsDetail')+(live?' '+c.t('assetsLive'):'');
    $('nationalLevel').textContent=c.t(c.levelKey(sum.level));
    $('levelDetail').textContent=c.t('levelDetail');
    for(const level of ['observacion','alerta','alarma'])$('levelCell').classList.toggle(`level-${level}`,sum.level===level);
    $('eventThreat').textContent=c.t(c.statusKey(brunete));
    $('eventLevel').textContent=c.t(c.levelKey(brunete.level));
    for(const level of ['observacion','alerta','alarma'])$('eventLevel').classList.toggle(`level-${level}`,brunete.level===level);
    $('bruneteEvent').classList.toggle('is-live',live);
    $('eventMeta').textContent=`${c.ccaaName('madrid')} · ${live?c.t('liveTag'):c.t('statusStandby').toLowerCase()} · ${live?brunete.assets:c.liveFleetTotal(s)} ${c.t('assetsCount')} · T+${s.tick}`;
    $('eventMission').textContent=$('regionalMission').textContent=s.mission;
    $('eventPeople').textContent=`${c.t('unwarned')}: ${c.format(live?Object.values(s.people||{}).filter(g=>g.status==='unwarned').reduce((n,g)=>n+g.count,0):0)}`;
    $('salaClock').textContent=`T+${s.tick}`;
    $('salaRuns').textContent=`${s.workflow_calls||0}${s.latency?' · '+s.latency+'s':''}`;
    $('watchList').replaceChildren(...watches.map(ticket));
    $('closedList').replaceChildren(...closed.map(ticket));
    renderLaunch(s);
  }
  wireLaunch();wireOnboarding();
  if($('tourStart'))$('tourStart').onclick=e=>{e?.preventDefault?.();go('/incidente?demo=1')};
  c.onLanguageChange(()=>renderLaunch(c.state));
  c.subscribe(render);
})();
