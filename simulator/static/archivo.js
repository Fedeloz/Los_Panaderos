(()=>{
  const c=window.cecop,$=id=>document.getElementById(id);
  let posting=false;
  c.useTranslations({
    es:{pageTitle:'Archivo',pageSubhead:'PROTECCIÓN CIVIL · EXPEDIENTES Y GRABACIONES',recordingHeading:'Grabación del incidente · ES-2026-BRUNETE',
      kClosedFiles:'Expedientes cerrados',kClosedHa:'Superficie afectada',closedHaHelp:'hectáreas, suma de expedientes cerrados',kClosedCcaa:'CCAA',kRecording:'Grabación Brunete',framesLabelLower:'fotogramas',
      closedHeading:'Expedientes cerrados',closedHelp:'Fichas estáticas de demostración. Cada expediente conserva su resultado, superficie y actas; no abren sala de crisis.',closedFile:'expediente cerrado',actsClosed:'actas cerradas',noPeople:'sin población amenazada',recordingStatus:'Estado',framesLabel:'Fotogramas',recordingActive:'Grabando',recordingInactive:'Sin grabación activa',archiveRecordRun:'Ejecutar y grabar',archiveStopRecord:'Detener grabación',archiveDownloadRecord:'Descargar',archivePlayRecord:'Reproducir',archiveOpenRecording:'Abrir archivo',playbackHeading:'Reproducción',recordingEffect:'Ejecutar y grabar inicia el incidente y las decisiones de HappyRobot.',stopEffect:'Detener pausa el reloj; una deliberación en curso puede terminar.',archiveHelp:'Reproducir abre la grabación del servidor en Sala de crisis. Abrir archivo lleva al selector de archivos de esa sala (máx. 100 MB). La reproducción no llama a HappyRobot.',archiveLocation:'Los controles también están en Preparar incidente → Archivo y reproducción.'},
    en:{pageTitle:'Archive',pageSubhead:'CIVIL PROTECTION · CASE FILES AND RECORDINGS',recordingHeading:'Incident recording · ES-2026-BRUNETE',
      kClosedFiles:'Closed case files',kClosedHa:'Area affected',closedHaHelp:'hectares, sum of closed case files',kClosedCcaa:'Regions',kRecording:'Brunete recording',framesLabelLower:'frames',
      closedHeading:'Closed case files',closedHelp:'Static demonstration cards. Each file keeps its outcome, area and minutes; they do not open a crisis room.',closedFile:'closed case file',actsClosed:'minutes closed',noPeople:'no population threatened',recordingStatus:'Status',framesLabel:'Frames',recordingActive:'Recording',recordingInactive:'Not recording',archiveRecordRun:'Run & record',archiveStopRecord:'Stop recording',archiveDownloadRecord:'Download',archivePlayRecord:'Play',archiveOpenRecording:'Open file',playbackHeading:'Playback',recordingEffect:'Run & record starts the incident and HappyRobot decisions.',stopEffect:'Stopping pauses the clock; an in-flight deliberation may finish.',archiveHelp:'Play opens the server recording in the incident room. Open file takes you to that room’s file selector (max. 100 MB). Replay never calls HappyRobot.',archiveLocation:'The controls are also under Incident setup → Archive and replay.'}
  });
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
})();
