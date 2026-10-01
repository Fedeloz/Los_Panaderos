(()=>{
  const c=window.cecop,$=id=>document.getElementById(id),roles=['trucks','scouts','extinguishers'];
  const labels={trucks:'fleetTrucks',scouts:'fleetScouts',extinguishers:'fleetExtinguishers'};
  let dirty=false,applying=false,lastIncident=null;
  c.useTranslations({
    es:{pageTitle:'Medios',pageSubhead:'PROTECCIÓN CIVIL · RESERVAS Y ASIGNACIÓN',inventory:'Inventario de la sala',unknownId:'Sin identificador',
      kPoolUnits:'Medios nacionales',kPoolAssigned:'Asignados',kPoolAvailable:'Disponibles',kBruneteFleet:'Flota Brunete',demoFigures:'Cifras de demostración',poolAvailableHelp:'reservas sin expediente asignado',bruneteFleetHelp:'única sala simulada',
      poolsHeading:'Reservas nacionales',poolsHelp:'Fichas estáticas de demostración: UME, BRIF y medios autonómicos con sus asignaciones a expedientes abiertos. No abren sala de crisis.',
      bruneteAssignment:'Asignación Brunete · ES-2026-BRUNETE',fleetHelp:'Configura antes de la ignición. Reinicia en Sala de crisis para cambiar los medios; los recuentos se conservan.',
      poolUnits:'unidades',poolAssignedTo:'asignadas a',poolFree:'libres',poolIdle:'sin asignación',liveAssignment:'sala simulada · en directo'},
    en:{pageTitle:'Assets',pageSubhead:'CIVIL PROTECTION · RESERVES AND ASSIGNMENT',inventory:'Room inventory',unknownId:'No identifier',
      kPoolUnits:'National assets',kPoolAssigned:'Assigned',kPoolAvailable:'Available',kBruneteFleet:'Brunete fleet',demoFigures:'Demonstration figures',poolAvailableHelp:'reserves with no case file assigned',bruneteFleetHelp:'only simulated room',
      poolsHeading:'National reserves',poolsHelp:'Static demonstration cards: UME, BRIF and regional assets with their assignments to open case files. They do not open a crisis room.',
      bruneteAssignment:'Brunete assignment · ES-2026-BRUNETE',fleetHelp:'Configure before ignition. Reset in Crisis room to change assets; counts are kept.',
      poolUnits:'units',poolAssignedTo:'assigned to',poolFree:'free',poolIdle:'unassigned',liveAssignment:'simulated room · live'}
  });
  function poolCard(pool,s){
    const card=document.createElement('article');card.className='order-ticket pool-ticket';
    const label=document.createElement('div');label.className='order-label';
    const code=document.createElement('span');code.className='order-code';code.textContent=c.t(pool.nameKey);
    const badge=document.createElement('span');badge.className='order-badge';badge.textContent=`${pool.units} ${c.t('poolUnits')}`;
    label.append(code,badge);
    const body=document.createElement('div');
    const title=document.createElement('h2');title.textContent=pool.ccaa?c.ccaaName(pool.ccaa):c.t(pool.scope);
    const meta=document.createElement('p');meta.className='event-meta';
    const assigned=assignments(pool,s);
    meta.textContent=assigned.length?`${c.t('poolAssignedTo')} ${assigned.map(a=>`${a.id} (${a.units})`).join(' · ')}`:c.t('poolIdle');
    const free=document.createElement('p');free.className='kpi-detail';
    const used=assigned.reduce((n,a)=>n+a.units,0);
    free.textContent=`${c.format(pool.units-used)} ${c.t('poolFree')}${pool.live&&c.isLive(s)?' · '+c.t('liveAssignment'):''}`;
    body.append(title,meta,free);
    card.append(label,body);
    return card;
  }
  // The Madrid pool is the only one that follows live state: Brunete's fleet counts as its assignment once the room is open.
  function assignments(pool,s){
    const list=Object.entries(pool.assigned).map(([id,units])=>({id,units}));
    if(pool.live&&c.isLive(s)){const units=Math.min(pool.units,c.liveFleetTotal(s));if(units)list.push({id:'ES-2026-BRUNETE',units})}
    return list;
  }
  function renderPools(s){
    let total=0,assigned=0;const files=new Set();
    for(const pool of c.pools){total+=pool.units;for(const a of assignments(pool,s)){assigned+=a.units;files.add(a.id)}}
    $('poolUnits').textContent=c.format(total);
    $('poolAssigned').textContent=c.format(assigned);
    $('poolAssignedDetail').textContent=files.size?[...files].join(' · '):c.t('poolIdle');
    $('poolAvailable').textContent=c.format(total-assigned);
    $('poolList').replaceChildren(...c.pools.map(pool=>poolCard(pool,s)));
  }
  function render(s){
    renderPools(s);
    const locked=!s||s.ignited||s.called||s.busy||s.replay||s.reset_pending;
    for(const role of roles)$('fleet-'+role).disabled=!!(locked||applying);
    $('applyFleet').disabled=!!(locked||applying);
    if(!s)return;
    if(lastIncident!==s.incident_id){dirty=false;lastIncident=s.incident_id}
    const {vehicles,counts}=c.fleet(s);
    if(!dirty||locked)for(const role of roles)$('fleet-'+role).value=counts[role];
    $('fleetSummary').textContent=roles.map(role=>`${counts[role]} ${c.t(labels[role])}`).join(' · ');
    const cards=[];
    for(const role of roles)for(const vehicle of vehicles[role]){
      const card=document.createElement('article');card.className='panel';
      const kind=document.createElement('span');kind.className='eyebrow';kind.textContent=c.t(labels[role]);
      const title=document.createElement('h2'),id=vehicle.drone_id||vehicle.truck_id||c.t('unknownId');title.textContent=vehicle.name?`${vehicle.name} · ${id}`:id;
      const status=document.createElement('span');status.className='person '+(vehicle.status==='at_station'?'person-safe':['blocked','trapped'].includes(vehicle.status)?'person-blocked':'person-unwarned');status.textContent=c.statusText(vehicle.status);
      card.append(kind,title,status);
      if(vehicle.mode){const mode=document.createElement('p');mode.className='kpi-detail';mode.textContent=c.statusText(vehicle.mode);card.append(mode)}
      cards.push(card);
    }
    if(!cards.length){const empty=document.createElement('p');empty.textContent=c.t('noVehicles');cards.push(empty)}
    $('vehicleInventory').replaceChildren(...cards);
  }
  for(const role of roles)$('fleet-'+role).onchange=()=>{dirty=true};
  $('applyFleet').onclick=async()=>{
    if($('applyFleet').disabled)return;
    const counts=Object.fromEntries(roles.map(role=>[role,Number($('fleet-'+role).value)]));
    applying=true;render(c.state);
    try{if(await c.action('fleet',{counts}))dirty=false}finally{applying=false;render(c.state)}
  };
  c.subscribe(render);render(c.state);
})();
