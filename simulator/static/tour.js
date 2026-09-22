(()=>{
  const body=document.body,page=body?.dataset?.page||(document.getElementById?.('launchHero')?'incidente':'');
  if(!body?.dataset||typeof body.getBoundingClientRect!=='function'||page!=='incidente')return;
  const KEY='cecop-tour',SEEN='cecop-demo-seen',ORDER=['conditions','paint','call','more-fire'];
  const STEPS={
    conditions:{target:'#launchHero',title:{es:'Prepara el simulacro',en:'Prepare the drill'},text:{es:'Elige viento, velocidad de propagación y flota. Luego pulsa Lanzar simulacro.',en:'Choose wind, spread speed and fleet. Then select Launch drill.'},auto:'conditions'},
    paint:{target:'#truth',title:{es:'Pinta el origen',en:'Paint the origin'},text:{es:'Pinta el fuego con el lanzallamas: un clic sobre vegetación, lejos de la base.',en:'Paint the fire with the flamethrower: click vegetation, away from the base.'},auto:'paint'},
    call:{target:'#callAlert',title:{es:'Da el aviso',en:'Raise the alert'},text:{es:'El vecino de la granja llama al 112. Pulsa la llamada de aviso.',en:'The farm neighbour calls 112. Select the alert call.'},auto:'call'},
    'more-fire':{target:'#addFire',title:{es:'La sala es tuya',en:'The room is yours'},text:{es:'Despacho ya está moviendo la flota (mira el mapa derecho). Cuando quieras, activa Añadir fuego y haz clic en el mapa para crear más focos.',en:'Dispatch is already moving the fleet (watch the right map). Whenever you like, enable Add fire and click the map to create more hotspots.'}}
  };
  const UI={
    es:{step:'Paso',skip:'Saltar demo',back:'Anterior',next:'Siguiente',waiting:'Esperando tu acción…',doIt:'Hacerlo por mí',finish:'Terminar'},
    en:{step:'Step',skip:'Skip demo',back:'Back',next:'Next',waiting:'Waiting for your action…',doIt:'Do it for me',finish:'Finish'}
  };
  let current=null,latest=window.state||window.cecop?.state||null,overlay,hole,card,target,queued=false,scrolled='',dispatchTimer,finishTimer,decisionCount=0;
  const lang=()=>window.cecop?.lang||document.documentElement.lang||'es';
  const save=id=>{current=id;try{sessionStorage.setItem(KEY,JSON.stringify({step:id}))}catch{}};
  const load=()=>{try{const value=JSON.parse(sessionStorage.getItem(KEY));return ORDER.includes(value?.step)?value.step:null}catch{return null}};
  const seen=()=>{try{return !!localStorage.getItem(SEEN)}catch{return false}};
  const markSeen=()=>{try{localStorage.setItem(SEEN,'1')}catch{}};
  const clear=()=>{try{sessionStorage.removeItem(KEY)}catch{}};
  function removeTarget(){target?.classList?.remove('tour-target');target=null}
  function close(){clearTimeout(dispatchTimer);clearTimeout(finishTimer);clear();current=null;window.setPaintMode?.(false);removeTarget();overlay?.remove?.();card?.remove?.();overlay=hole=card=null}
  function make(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el}
  function ensureUI(){if(card)return;overlay=make('div');overlay.id='tourOverlay';hole=make('div','tour-hole');overlay.append(hole);card=make('aside');card.id='tourCard';card.setAttribute('role','dialog');card.setAttribute('aria-live','polite');body.append(overlay,card)}
  function position(){queued=false;if(!target||typeof target.getBoundingClientRect!=='function')return;const r=target.getBoundingClientRect(),pad=7,vw=window.innerWidth||document.documentElement.clientWidth,vh=window.innerHeight||document.documentElement.clientHeight;hole.style.left=Math.max(0,r.left-pad)+'px';hole.style.top=Math.max(0,r.top-pad)+'px';hole.style.width=Math.max(0,Math.min(vw,r.right+pad)-Math.max(0,r.left-pad))+'px';hole.style.height=Math.max(0,Math.min(vh,r.bottom+pad)-Math.max(0,r.top-pad))+'px';
    // Keep the card off the highlighted element: try bottom-right, then bottom-left, then top-right.
    if(card&&typeof card.getBoundingClientRect==='function'){const overlaps=c=>!(c.right<r.left-pad||c.left>r.right+pad||c.bottom<r.top-pad||c.top>r.bottom+pad);for(const cls of ['','tour-card-left','tour-card-top']){card.classList.remove('tour-card-left','tour-card-top');if(cls)card.classList.add(cls);if(!overlaps(card.getBoundingClientRect()))break}}}
  function queuePosition(){if(queued)return;queued=true;if(typeof requestAnimationFrame==='function')requestAnimationFrame(position);else position()}
  function focusTarget(step,resetting){removeTarget();target=document.querySelector(resetting?'#resetSim':step.target);if(!target)return;target.classList?.add('tour-target');const r=target.getBoundingClientRect(),key=current+(resetting?'-reset':'');if(scrolled!==key&&(r.top<8||r.bottom>(window.innerHeight||0)-8)){scrolled=key;target.scrollIntoView?.({block:'center'});if(typeof requestAnimationFrame==='function')requestAnimationFrame(queuePosition)}queuePosition()}
  function go(id){if(!ORDER.includes(id))return;save(id);if(id==='paint')window.setPaintMode?.(true);else if(current==='paint')window.setPaintMode?.(false);render()}
  function next(){const i=ORDER.indexOf(current);if(i>=0&&i<ORDER.length-1)go(ORDER[i+1])}
  async function doIt(){
    if(current==='conditions'){document.getElementById('launchStart')?.click?.();return}
    if(current==='paint'){await window.paintFire?.(60,40);return}
    if(current==='call'){await window.act?.('call');return}
    if(current==='more-fire'){document.getElementById('addFire')?.click?.();if(!await window.act?.('add_fire',{x:40,y:20}))await window.act?.('add_fire',{x:30,y:25})}
  }
  function render(){
    if(!current)return;const step=STEPS[current];if(!step){close();return}ensureUI();const l=lang()==='en'?'en':'es',u=UI[l];save(current);focusTarget(step,false);card.replaceChildren();
    card.append(make('span','tour-count',`${u.step} ${ORDER.indexOf(current)+1} / ${ORDER.length}`),make('h2','',step.title[l]),make('p','tour-copy',step.text[l]));
    const actions=make('div','tour-actions'),skip=make('button','tour-skip',u.skip);skip.onclick=()=>{markSeen();close()};actions.append(skip);
    if(current==='more-fire'){
      const finish=make('button','tour-primary',u.finish);finish.onclick=close;actions.append(finish);
    }else{
      {const waiting=make('button','tour-primary',u.waiting),helper=make('button','tour-helper',u.doIt);waiting.disabled=true;helper.onclick=doIt;actions.append(waiting,helper)}
    }
    card.append(actions);
  }
  function onAction(e){
    if(!current||!e?.detail?.ok)return;const action=e.detail.action;
        if(STEPS[current]?.auto===action)next();
    else if(current==='more-fire'&&action==='add_fire'){clearTimeout(finishTimer);finishTimer=setTimeout(close,3000)}
  }
  function onState(e){
    const previous=decisionCount;latest=e?.detail||latest;decisionCount=Array.isArray(latest?.decisions)?latest.decisions.length:(latest?.mission_context||[]).length;
    if(!current){const hero=document.getElementById('launchHero');if(hero&&!hero.hidden&&!seen())start('conditions');return}
    if(current==='conditions')render();
    if(current==='call'&&latest?.called)go('more-fire');
  }
  function start(id='conditions'){markSeen();go(ORDER.includes(id)?id:'conditions')}
  window.CecopTour={start,close};
  window.addEventListener?.('cecop:action',onAction);window.addEventListener?.('cecop:state',onState);window.addEventListener?.('resize',queuePosition);window.addEventListener?.('scroll',queuePosition,true);
  window.addEventListener?.('keydown',e=>{if(!current)return;if(e.key==='Escape')close();});
  window.cecop?.onLanguageChange?.(render);window.addEventListener?.('cecop:lang',render);
  let query=false;try{query=new URLSearchParams(location.search).get('demo')==='1'}catch{}
  if(query){try{history?.replaceState?.(null,'',location.pathname+(location.hash||''))}catch{}start('conditions')}else{if(load())start('conditions')}
})();
