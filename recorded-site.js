// Shared, read-only presentation data for the GitHub Pages recording.
window.RecordedSite=(()=>{
  const cursorKey='cecop-recorded-demo-frame';
  let dataPromise;
  const translations={
    es:{demoBoard:'Demo grabada de Brunete. El resto de expedientes y reservas son fichas estáticas de demostración.',agentChain:'DEMO GRABADA · Central → Exploración / Extinción',footerNote:'Demo grabada. Reproduce, pausa o recorre la línea de tiempo en Sala de crisis.',salaHelp:'Consulta la misión y las decisiones del último paso visto en la grabación de Brunete.',salaHeading:'Sala de crisis · grabación',riskLive:'incluye el paso grabado de Brunete',liveTag:'grabación',fleetHelp:'Flota utilizada en la grabación. Los medios no se pueden modificar en esta demo.',bruneteFleetHelp:'flota de la grabación',liveAssignment:'asignación grabada',recordingInactive:'Demo disponible',archiveHelp:'Reproducir abre esta misma demo en Sala de crisis. Descargar guarda el archivo comprimido para volver a importarlo en la aplicación local.',archiveLocation:'176 fotogramas de una simulación grabada; no se generan nuevas decisiones.',sharedHeading:'Estado de la grabación',sharedHelp:'Distritos, medios y mensajes del último paso visto en Sala de crisis.',sharedDistrictsHeading:'Distritos de Brunete',sharedCommsHeading:'Comunicaciones y decisiones grabadas',sharedCommsHelp:'Mensajes y decisiones originales de esta ejecución, con su paso de simulación.',sharedNoComms:'Todavía no hay mensajes en este paso. Abre Sala de crisis para reproducir la demo.',tlLive:'Vista general',tlNow:'DEMO',bruneteLive:'Brunete · Madrid · demo grabada',lgBrunete:'Brunete · demo grabada'},
    en:{demoBoard:'Recorded Brunete demo. Other dossiers and reserves are static demonstration cards.',agentChain:'RECORDED DEMO · Central → Scout / Extinguisher',footerNote:'Recorded demo. Replay, pause or scrub the timeline in the incident room.',salaHelp:'View the mission and decisions from the last recording frame viewed in Brunete.',salaHeading:'Incident room · recording',riskLive:'includes the recorded Brunete frame',liveTag:'recording',fleetHelp:'Fleet used in the recording. Assets cannot be changed in this demo.',bruneteFleetHelp:'recorded fleet',liveAssignment:'recorded assignment',recordingInactive:'Demo available',archiveHelp:'Play opens this same demo in the incident room. Download saves the compressed recording for importing into the local application.',archiveLocation:'176 frames of a recorded simulation; no new decisions are generated.',sharedHeading:'Recorded state',sharedHelp:'Districts, assets and messages from the last frame viewed in the incident room.',sharedDistrictsHeading:'Brunete districts',sharedCommsHeading:'Recorded communications and decisions',sharedCommsHelp:'Original messages and decisions from this run, with their simulation step.',sharedNoComms:'No messages at this step yet. Open the incident room to play the demo.',tlLive:'Overview',tlNow:'DEMO',bruneteLive:'Brunete · Madrid · recorded demo',lgBrunete:'Brunete · recorded demo'}
  };
  function load(){
    return dataPromise||(dataPromise=fetch('./recordings/brunete-summary.json').then(async response=>{
      if(!response.ok)throw Error('No se pudo cargar la grabación.');
      return response.json();
    }));
  }
  function cursor(length){
    let index=0;try{index=Number(sessionStorage.getItem(cursorKey))||0}catch{}
    return Math.max(0,Math.min(length-1,Math.floor(index)));
  }
  function remember(index){try{sessionStorage.setItem(cursorKey,String(index))}catch{}}
  async function state(){
    const data=await load(),index=cursor(data.frames.length);
    return {...data.base,...data.frames[index],frame_index:index,frame_count:data.frames.length,recorded_frames:data.frames.length,recording:false,replay:true,running:false,busy:false,error:'',connected:true};
  }
  return {translations,cursor,remember,state};
})();
