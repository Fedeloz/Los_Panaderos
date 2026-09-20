(()=>{
  const c=window.cecop,$=id=>document.getElementById(id);
  let posting=false;
  c.useTranslations({
    es:{pageTitle:'Archivo',pageSubhead:'PROTECCIÓN CIVIL · EXPEDIENTES Y GRABACIONES',recordingHeading:'Grabación del incidente · ES-2026-BRUNETE',
      kClosedFiles:'Expedientes cerrados',kClosedHa:'Superficie afectada',closedHaHelp:'hectáreas, suma de expedientes cerrados',kClosedCcaa:'CCAA',kRecording:'Grabación Brunete',framesLabelLower:'fotogramas',
      closedHeading:'Expedientes cerrados',closedHelp:'Fichas estáticas de demostración. Cada expediente conserva su resultado, superficie y actas; no abren sala de crisis.',closedFile:'expediente cerrado',actsClosed:'actas cerradas',noPeople:'sin población amenazada',recordingStatus:'Estado',framesLabel:'Fotogramas',recordingActive:'Grabando',recordingInactive:'Sin grabación activa',archiveRecordRun:'Ejecutar y grabar',archiveStopRecord:'Detener grabación',archiveDownloadRecord:'Descargar',archivePlayRecord:'Reproducir',archiveOpenRecording:'Abrir archivo',playbackHeading:'Reproducción',recordingEffect:'Ejecutar y grabar inicia el incidente y las decisiones de HappyRobot.',stopEffect:'Detener pausa el reloj; una deliberación en curso puede terminar.',archiveHelp:'Reproducir abre la grabación del servidor en Sala de crisis. Abrir archivo lleva al selector de archivos de esa sala (máx. 100 MB). La reproducción no llama a HappyRobot.',archiveLocation:'Los controles también están en Preparar incidente → Archivo y reproducción.',sharedHeading:'Estado compartido · Cloudflare KV',sharedHelp:'Documento que el simulador publica y los agentes de HappyRobot leen. Se consulta desde el servidor: el navegador nunca recibe el token.',sharedDistrictsHeading:'Distritos y nivel de peligro',sharedCommsHeading:'Comunicaciones emitidas',sharedCommsHelp:'Cada llamada y cada alerta de zona con su paso de simulación y su efecto real sobre la población.',sharedIncident:'Incidente',sharedSimClock:'Reloj de simulación',sharedWritten:'Última escritura',sharedLevel:'Nivel general',sharedLink:'Conexión',sharedStep:'paso',sharedAgo:'hace {n}',sharedJustNow:'ahora mismo',sharedNever:'sin escrituras',sharedOff:'Sin configurar',sharedOn:'Publicando',sharedFail:'Error de publicación',sharedNoDoc:'Todavía no hay nada publicado. Enciende un incendio en Sala de crisis y aparecerá aquí.',sharedNoComms:'El agente no ha emitido ninguna llamada ni alerta todavía.',levelCritical:'Crítico',levelWarning:'Aviso',levelWatch:'Vigilancia',levelNone:'Sin peligro',effectWarned:'población en marcha',effectInformed:'informados, sin evacuar',effectNoRecipient:'no llegó a ningún distrito',effectNoChange:'sin efecto',commCall:'Llamada',commZone:'Alerta de zona',commMessage:'Mensaje',peopleShort:'hab.',effectCalled:'persona contactada',effectPersonInformed:'persona informada'},
    en:{pageTitle:'Archive',pageSubhead:'CIVIL PROTECTION · CASE FILES AND RECORDINGS',recordingHeading:'Incident recording · ES-2026-BRUNETE',
      kClosedFiles:'Closed case files',kClosedHa:'Area affected',closedHaHelp:'hectares, sum of closed case files',kClosedCcaa:'Regions',kRecording:'Brunete recording',framesLabelLower:'frames',
      closedHeading:'Closed case files',closedHelp:'Static demonstration cards. Each file keeps its outcome, area and minutes; they do not open a crisis room.',closedFile:'closed case file',actsClosed:'minutes closed',noPeople:'no population threatened',recordingStatus:'Status',framesLabel:'Frames',recordingActive:'Recording',recordingInactive:'Not recording',archiveRecordRun:'Run & record',archiveStopRecord:'Stop recording',archiveDownloadRecord:'Download',archivePlayRecord:'Play',archiveOpenRecording:'Open file',playbackHeading:'Playback',recordingEffect:'Run & record starts the incident and HappyRobot decisions.',stopEffect:'Stopping pauses the clock; an in-flight deliberation may finish.',archiveHelp:'Play opens the server recording in the incident room. Open file takes you to that room’s file selector (max. 100 MB). Replay never calls HappyRobot.',archiveLocation:'The controls are also under Incident setup → Archive and replay.',sharedHeading:'Shared state · Cloudflare KV',sharedHelp:'The document the simulator publishes and the HappyRobot agents read. Fetched server-side: the browser never receives the token.',sharedDistrictsHeading:'Districts and danger level',sharedCommsHeading:'Communications sent',sharedCommsHelp:'Every call and zone alert with its simulation step and what it actually did to the population.',sharedIncident:'Incident',sharedSimClock:'Simulation clock',sharedWritten:'Last write',sharedLevel:'Overall level',sharedLink:'Link',sharedStep:'step',sharedAgo:'{n} ago',sharedJustNow:'just now',sharedNever:'no writes yet',sharedOff:'Not configured',sharedOn:'Publishing',sharedFail:'Publish error',sharedNoDoc:'Nothing published yet. Start a fire in the incident room and it will appear here.',sharedNoComms:'The agent has not sent any call or alert yet.',levelCritical:'Critical',levelWarning:'Warning',levelWatch:'Watch',levelNone:'No danger',effectWarned:'population moving',effectInformed:'informed, not evacuated',effectNoRecipient:'reached no district',effectNoChange:'no effect',commCall:'Call',commZone:'Zone alert',commMessage:'Message',peopleShort:'res.',effectCalled:'person reached',effectPersonInformed:'person informed'}
  });
  // ---- Estado compartido (Cloudflare KV) -----------------------------------
  // Se sondea aparte de c.subscribe: /api/state es local e inmediato, esto cruza a
  // Cloudflare. El servidor ya lo cachea 2 s, asi que sondear cada 3 s no castiga la KV.
  let shared=null;
  const LEVELS={critical:'levelCritical',warning:'levelWarning',watch:'levelWatch',none:'levelNone'};
  const EFFECTS={district_warned:'effectWarned',district_informed:'effectInformed',no_recipient:'effectNoRecipient',no_change:'effectNoChange',person_called:'effectCalled',person_informed:'effectPersonInformed'};
  const KINDS={call:'commCall',zone_alert:'commZone',personal_message:'commMessage'};

  const level=d=>d&&(d.danger_level||d.auto_danger_level)||'none';

  function ago(iso){
    if(!iso)return c.t('sharedNever');
    const s=Math.max(0,(Date.now()-Date.parse(iso))/1000);
    if(!isFinite(s))return c.t('sharedNever');
    if(s<2)return c.t('sharedJustNow');
    const txt=s<60?`${Math.round(s)} s`:s<3600?`${Math.round(s/60)} min`:`${Math.round(s/3600)} h`;
    return c.t('sharedAgo').replace('{n}',txt);
  }

  function metaCard(labelKey,value,detail,stale){
    const box=document.createElement('div');
    if(stale)box.className='shared-stale';
    const label=document.createElement('span');label.className='kpi-label';label.textContent=c.t(labelKey);
    const strong=document.createElement('strong');strong.textContent=value;
    box.append(label,strong);
    if(detail){const small=document.createElement('small');small.textContent=detail;box.append(small)}
    return box;
  }

  function chip(text,levelName){
    const el=document.createElement('span');
    el.className=`event-level level-${levelName}`;el.textContent=text;
    return el;
  }

  function districtRow(d){
    const row=document.createElement('article');
    const lvl=level(d);
    row.className=`order-ticket event-${lvl==='critical'||lvl==='warning'?'watch':'live'}`;
    const label=document.createElement('div');label.className='order-label';
    const code=document.createElement('span');code.className='order-code';code.textContent=d.district_id||'—';
    label.append(code,chip(c.t(LEVELS[lvl]||'levelNone'),lvl));
    const body=document.createElement('div');
    const title=document.createElement('h2');title.textContent=d.name||d.district_id||'—';
    const meta=document.createElement('p');meta.className='event-meta';
    meta.textContent=[d.population!=null?`${c.format(d.population)} ${c.t('peopleShort')}`:'',d.status,d.evacuation_point].filter(Boolean).join(' · ');
    body.append(title,meta);
    const advice=d.advice||d.auto_advice;
    if(advice){const p=document.createElement('p');p.textContent=advice;body.append(p)}
    row.append(label,body);
    return row;
  }

  function commRow(m){
    const row=document.createElement('article');
    // La accion evacuate/inform solo significa algo en una alerta de zona; una llamada
    // alcanza a una persona y no mueve distritos.
    const action=m.kind==='zone_alert'?(m.action||(m.effect==='district_warned'?'evacuate':'inform')):'';
    row.className=`order-ticket comm-${m.effect==='district_warned'?'evacuate':m.effect==='district_informed'?'inform':'none'}`;
    const label=document.createElement('div');label.className='order-label';
    const code=document.createElement('span');code.className='order-code';
    code.textContent=`${c.t('sharedStep')} ${m.tick!=null?m.tick:'—'}`;
    const status=document.createElement('span');status.className='event-status';
    status.textContent=`${m.channel==='phone'?'\u260e':'\u2709'} ${c.t(KINDS[m.kind]||'commMessage')}`;
    label.append(code,status);
    const body=document.createElement('div');
    const title=document.createElement('h2');title.textContent=m.contact_name||m.district_id||'—';
    const meta=document.createElement('p');meta.className='event-meta';
    meta.textContent=[m.criticality,m.status,m.effect?c.t(EFFECTS[m.effect]||'effectNoChange'):'',action].filter(Boolean).join(' · ');
    body.append(title,meta);
    if(m.information){const p=document.createElement('p');p.textContent=m.information;body.append(p)}
    row.append(label,body);
    return row;
  }

  const host=url=>{try{return new URL(url).host}catch{return url||''}};

  function empty(key){
    const p=document.createElement('p');p.className='shared-empty';p.textContent=c.t(key);return p;
  }

  function renderShared(){
    const meta=$('sharedMeta'),districts=$('sharedDistricts'),comms=$('sharedComms');
    if(!meta)return;
    const status=shared&&shared.status||{},doc=shared&&shared.document;
    const linkKey=!status.enabled?'sharedOff':status.error?'sharedFail':'sharedOn';
    const written=doc&&doc.updated_at;
    const stale=Boolean(written)&&(Date.now()-Date.parse(written))>15000;
    meta.replaceChildren(
      metaCard('sharedIncident',(shared&&shared.incident_id)||'—'),
      metaCard('sharedSimClock',doc&&doc.sim_time!=null?`T+${doc.sim_time}`:'—',doc&&doc.phase||''),
      metaCard('sharedWritten',ago(written),written||'',stale),
      metaCard('sharedLevel',doc?c.t(LEVELS[doc.incident_danger_level||'none']||'levelNone'):'—',doc&&doc.fire&&doc.fire.front||''),
      metaCard('sharedLink',c.t(linkKey),status.error||host(status.url)||''));
    if(!doc){
      districts.replaceChildren(empty('sharedNoDoc'));
      comms.replaceChildren();
      return;
    }
    districts.replaceChildren(...(doc.districts||[]).map(districtRow));
    const sent=(doc.communications_sent||[]).slice().reverse();
    comms.replaceChildren(...(sent.length?sent.map(commRow):[empty('sharedNoComms')]));
  }

  async function pollShared(){
    try{
      const response=await fetch('/api/shared');
      if(response.ok){shared=await response.json();renderShared()}
    }catch(e){/* el servidor local ya reporta su propia caida en la barra de estado */}
  }

  function closedCard(d){
    const card=document.createElement('article');card.className='order-ticket event-closed';
    const label=document.createElement('div');label.className='order-label';
    const code=document.createElement('span');code.className='order-code';code.textContent=d.id;
    const status=document.createElement('span');status.className='event-status';status.textContent=c.t(c.statusKey(d));
    label.append(code,status);
    const body=document.createElement('div');
    const title=document.createElement('h2');title.textContent=d.place;
    const meta=document.createElement('p');meta.className='event-meta';
    meta.textContent=`${c.ccaaName(d.ccaa)} · ${d.year} · ≈${c.format(d.hectares)} ${c.t('hectares')} · ${d.people?c.format(d.people)+' '+c.t('peopleLabel'):c.t('noPeople')}`;
    const note=document.createElement('p');note.textContent=c.t(d.noteKey);
    const foot=document.createElement('p');foot.className='kpi-detail';foot.textContent=`${c.t('closedFile')} · ${c.t('actsClosed')}`;
    body.append(title,meta,note,foot);
    card.append(label,body);
    return card;
  }
  function renderClosed(){
    const closed=c.catalog.filter(d=>d.status==='closed').sort((a,b)=>b.year-a.year);
    const regions=[...new Set(closed.map(d=>d.ccaa))];
    $('closedCount').textContent=c.format(closed.length);
    $('closedHa').textContent=c.format(closed.reduce((n,d)=>n+(d.hectares||0),0));
    $('closedCcaa').textContent=c.format(regions.length);
    $('closedCcaaDetail').textContent=regions.map(c.ccaaName).join(' · ');
    $('closedList').replaceChildren(...closed.map(closedCard));
  }
  function render(s){
    renderClosed();
    $('archiveRecordingState').textContent=s?c.t(s.recording?'recordingActive':'recordingInactive'):'—';
    $('archiveFrameCount').textContent=s?c.format(s.recorded_frames||0):'—';
    $('archiveRecordRun').disabled=!!(!s||posting||s.busy||s.replay||s.recording);
    $('archiveStopRecord').disabled=!!(!s||posting||!s.recording);
    $('archiveDownloadRecord').disabled=!!(!s||posting||!s.recorded_frames);
    $('archivePlayRecord').disabled=!!(!s||posting||s.busy||s.replay||s.recording||!s.recorded_frames);
    $('archiveOpenRecording').disabled=!!(!s||posting||s.busy||s.replay);
  }
  async function act(button,action){if($(button).disabled)return;posting=true;render(c.state);try{await c.action(action)}finally{posting=false;render(c.state)}}
  $('archiveRecordRun').onclick=()=>act('archiveRecordRun','record_run');
  $('archiveStopRecord').onclick=()=>act('archiveStopRecord','stop_recording');
  $('archivePlayRecord').onclick=()=>{if(!$('archivePlayRecord').disabled)c.openArchive('play')};
  $('archiveOpenRecording').onclick=()=>{if(!$('archiveOpenRecording').disabled)c.openArchive('open')};
  $('archiveDownloadRecord').onclick=async()=>{
    if($('archiveDownloadRecord').disabled)return;
    try{
      const response=await fetch('/api/recording');if(!response.ok)throw Error(c.t('downloadFailed'));
      const data=await response.json(),blob=new Blob([JSON.stringify(data)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='los-panaderos-recording.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){c.setError(e)}
  };
  c.subscribe(render);render(c.state);
  renderShared();pollShared();setInterval(pollShared,3000);
  c.onLanguageChange(renderShared);
})();
