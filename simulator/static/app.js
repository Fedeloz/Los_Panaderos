/* Aerial presentation layer. Simulation coordinates and agent knowledge remain authoritative. */
window.AerialView = (() => {
  const Z=10, W=800, H=560, views=new Map(), reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let base, baseKey='', previous=null, motion={}, started=0, duration=0, phase=0, lastFrame=0;
  const noise=(x,y,k=0)=>{const n=Math.sin(x*127.1+y*311.7+k*74.7)*43758.5453;return n-Math.floor(n)};
  function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill()}
  function text(c,x,y,label,color='#eff3dc'){
    c.font='600 10px system-ui';const w=c.measureText(label).width;c.fillStyle='#14251de0';c.fillRect(x-5,y-12,w+10,18);c.fillStyle=color;c.fillText(label,x,y);
  }
  const aerial=new Image();let aerialFailed=false;
  aerial.onload=()=>{for(const [canvas,belief] of views)if(previous)paint(canvas,previous,belief,performance.now())};
  aerial.onerror=()=>{aerialFailed=true;for(const [canvas,belief] of views)if(previous)paint(canvas,previous,belief,performance.now())};
  aerial.src='/maps/brunete.jpg';
  const illustrated=new Image();
  illustrated.onload=()=>{for(const [canvas,belief] of views)if(previous)paint(canvas,previous,belief,performance.now())};
  illustrated.src='/maps/brunete-illustrated.png';
  function terrain(s){
    if(s.geography?.map_style==='illustrated'&&illustrated.complete&&illustrated.naturalWidth)return illustrated;
    if(s.geography?.id==='brunete-el-alamo-v1'){
      if(aerial.complete&&aerial.naturalWidth){
        if(!s.geography.image_crop)return aerial;
        const key=JSON.stringify(s.geography.image_crop);
        if(base&&baseKey===key)return base;
        baseKey=key;base=document.createElement('canvas');base.width=W*2;base.height=H*2;
        const [x,y,w,h]=s.geography.image_crop;
        base.getContext('2d').drawImage(aerial,x*aerial.naturalWidth,y*aerial.naturalHeight,w*aerial.naturalWidth,h*aerial.naturalHeight,0,0,base.width,base.height);
        return base;
      }
      const placeholder=document.createElement('canvas');placeholder.width=W;placeholder.height=H;
      const c=placeholder.getContext('2d');c.fillStyle='#38443b';c.fillRect(0,0,W,H);
      text(c,200,260,aerialFailed?'Aerial image unavailable — refresh after server restart':'Loading Brunete aerial image…');return placeholder;
    }
    const key=JSON.stringify(s.roads||[]);if(base&&key===baseKey)return base;baseKey=key;
    base=document.createElement('canvas');base.width=W*2;base.height=H*2;const c=base.getContext('2d');c.scale(2,2);
    c.fillStyle='#77754f';c.fillRect(0,0,W,H);
    // Deterministic agricultural parcels and fine grain, cached once for both maps.
    for(let y=0;y<H;y+=2)for(let x=0;x<W;x+=2){
      const n=noise(x,y),terrain=Math.sin(x/110+y/75)*.5+Math.sin(y/83-x/120)*.5;
      const light=32+terrain*4+n*12;c.fillStyle=`hsl(${65+terrain*12} 23% ${light}%)`;c.fillRect(x,y,2,2);
    }
    for(const [x,y,w,h,col,angle] of [[20,25,190,95,'#b4a56a',.08],[230,15,165,125,'#918957',-.12],[20,150,180,90,'#8c9762',0],[265,155,130,100,'#bcab75',.13],[420,25,130,120,'#899258',0],[580,55,150,110,'#c3b37c',0]]){
      c.save();c.beginPath();c.rect(x,y,w,h);c.clip();c.fillStyle=col;c.globalAlpha=.7;c.fillRect(x,y,w,h);c.translate(x,y);c.rotate(angle);c.strokeStyle='#514e393b';c.lineWidth=2;
      for(let row=-30;row<h+35;row+=7){c.beginPath();c.moveTo(-30,row);c.lineTo(w+30,row);c.stroke()}c.restore();c.strokeStyle='#bfc08a77';c.lineWidth=2;c.strokeRect(x,y,w,h);
    }
    const roads=new Set((s.roads||[]).map(p=>p.join(',')));
    for(const [x,y] of s.roads||[]){c.fillStyle='#554f40';c.fillRect(x*Z-1,y*Z-1,12,12)}
    for(const [x,y] of s.roads||[]){c.fillStyle='#b7ad8d';c.fillRect(x*Z,y*Z,10,10);c.fillStyle='#d1c6a022';c.fillRect(x*Z+3,y*Z,4,10)}
    // Small approach tracks are part of the public schematic geography.
    c.strokeStyle='#bdaf8c';c.lineWidth=5;for(const line of [[[50,280],[120,280]],[[440,40],[650,40],[650,100]]]){c.beginPath();line.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke()}
    function tree(x,y,r){
      ellipse(c,x+3,y+4,r*1.25,r*.85,'#17271955');
      const g=c.createRadialGradient(x-r*.35,y-r*.4,0,x,y,r);g.addColorStop(0,'#839069');g.addColorStop(.4,'#526844');g.addColorStop(1,'#2c422c');ellipse(c,x,y,r,r*.88,g);
      for(let j=0;j<4;j++){const a=j*2.1;ellipse(c,x+Math.cos(a)*r*.5,y+Math.sin(a)*r*.5,r*.38,r*.32,'#9da27622')}
    }
    for(let y=18;y<55;y++)for(let x=24;x<79;x++){
      if(roads.has(`${x},${y}`)||roads.has(`${x-1},${y}`)||roads.has(`${x},${y-1}`))continue;
      if(noise(x,y,2)>.62)tree(x*Z+noise(x,y)*7,y*Z+noise(y,x)*7,3+noise(x,y,4)*5);
    }
    for(let y=64;y<160;y+=16)for(let x=590;x<720;x+=19)tree(x,y,4.2);
    c.fillStyle='#aaa18c';c.fillRect(28,370,185,151);
    c.fillStyle='#c9c0a5';for(const y of [420,470])c.fillRect(30,y,183,8);c.fillRect(85,373,8,145);c.fillRect(145,373,8,145);
    function roof(x,y,w=29,h=21,station=false){
      c.fillStyle='#25312766';c.fillRect(x+5,y+6,w+3,h+3);c.fillStyle='#e5d7b2';c.fillRect(x,y,w,h);
      const g=c.createLinearGradient(x,y,x,y+h);g.addColorStop(0,station?'#c05f4a':'#b88864');g.addColorStop(.48,station?'#ad4739':'#aa7351');g.addColorStop(.52,station?'#7c322c':'#805b43');g.addColorStop(1,station?'#a64035':'#936c4a');c.fillStyle=g;c.fillRect(x-1,y-1,w+2,h+2);
      c.strokeStyle='#e0b99555';c.lineWidth=.6;for(let i=3;i<w;i+=4){c.beginPath();c.moveTo(x+i,y);c.lineTo(x+i,y+h);c.stroke()}
      c.fillStyle='#544d40';c.fillRect(x+w-8,y+3,4,4);c.fillStyle='#e6d9bf';c.fillRect(x+w-9,y+1,4,3);
    }
    for(const [x,y] of [[48,389],[103,389],[161,389],[48,440],[161,440],[48,487],[103,487],[161,487]])roof(x,y);
    roof(109,438,32,24,true);roof(627,87,38,27);roof(607,124,63,18);
    const sun=c.createLinearGradient(0,0,W,H);sun.addColorStop(0,'#fff0be10');sun.addColorStop(1,'#19352a22');c.fillStyle=sun;c.fillRect(0,0,W,H);
    return base;
  }
  function accept(s){
    if(previous===s)return;
    const changed=!previous||previous.incident_id!==s.incident_id||previous.tick!==s.tick||previous.replay!==s.replay||previous.busy!==s.busy||previous.running!==s.running;
    if(changed){
      const now=performance.now(),animate=previous&&s.incident_id===previous.incident_id&&s.tick>previous.tick&&s.tick-previous.tick<=8&&!s.busy&&!reduced.matches;
      const oldMotion=motion;motion={};
      for(const name of ['drone','truck']){
        const end=s[name];if(!end)continue;
        const old=previous?.[name];let from=old?position(name,now,oldMotion):end;
        let points=[from],found=false;
        // Follow recorded route segments rather than interpolating through corners/fire.
        for(const p of old?.route||[]){points.push({x:p[0],y:p[1]});if(p[0]===end.x&&p[1]===end.y){found=true;break}}
        if(!found)points=[from,{x:end.x,y:end.y}];
        if(!animate)points=[{x:end.x,y:end.y}];
        motion[name]={points,end,angle:oldMotion[name]?.angle||0};
      }
      started=now;duration=animate?(s.replay?210:Math.min(550,1000/(s.speed||2))):0;
    }
    previous=s;
  }
  function position(name,now,source=motion){
    const m=source[name];if(!m)return previous?.[name]||{x:0,y:0};
    const p=m.points,t=duration?Math.min(1,(now-started)/duration):1;
    const lengths=p.slice(1).map((q,i)=>Math.hypot(q.x-p[i].x,q.y-p[i].y)),total=lengths.reduce((a,b)=>a+b,0);
    let dist=total*t;
    for(let i=0;i<lengths.length;i++){
      const len=lengths[i];if(dist<=len&&len){const a=p[i],b=p[i+1];m.angle=Math.atan2(b.y-a.y,b.x-a.x);return {x:a.x+(b.x-a.x)*dist/len,y:a.y+(b.y-a.y)*dist/len,angle:m.angle}}
      dist-=len;
    }
    return {...m.end,angle:m.angle};
  }
  function route(c,v,pos,color){if(!v?.route?.length)return;c.save();c.strokeStyle=color;c.lineWidth=1;c.setLineDash([3,5]);c.beginPath();c.moveTo(pos.x*Z,pos.y*Z);for(const [x,y] of v.route)c.lineTo(x*Z,y*Z);c.stroke();c.restore()}
  function sensor(c,v,pos,color){c.save();c.strokeStyle=color;c.lineWidth=1;c.setLineDash([5,5]);c.beginPath();c.arc(pos.x*Z,pos.y*Z,(v.sensor_radius||9)*Z,0,Math.PI*2);c.stroke();c.restore()}
  function vehicle(c,v,p,drone,time){
    const x=p.x*Z,y=p.y*Z;
    ellipse(c,x+5,y+7,drone?10:13,drone?5:7,'#14231c66');
    c.save();c.translate(x,y);c.rotate(p.angle||0);
    if(drone){
      c.strokeStyle='#242d2c';c.lineWidth=3;c.beginPath();c.moveTo(-7,-7);c.lineTo(7,7);c.moveTo(7,-7);c.lineTo(-7,7);c.stroke();
      for(const a of [-1,1])for(const b of [-1,1]){ellipse(c,a*7,b*7,4.5,4.5,'#edf1dc55');c.strokeStyle='#e6eadb';c.lineWidth=1;c.beginPath();c.arc(a*7,b*7,4,0,Math.PI*2);c.stroke();const q=time*26+a+b;c.beginPath();c.moveTo(a*7+Math.cos(q)*4,b*7+Math.sin(q)*4);c.lineTo(a*7-Math.cos(q)*4,b*7-Math.sin(q)*4);c.stroke()}
      c.fillStyle='#f0ede0';c.fillRect(-5,-3,10,6);c.fillStyle='#343e3b';c.fillRect(2,-2,4,4);ellipse(c,6,0,1.5,1.5,'#72d5b4');
    }else{
      c.fillStyle='#202726';for(const x of [-8,7]){c.fillRect(x,-7,4,3);c.fillRect(x,4,4,3)}
      const g=c.createLinearGradient(0,-6,0,6);g.addColorStop(0,'#ed795e');g.addColorStop(.5,'#bf3e30');g.addColorStop(1,'#832e28');c.fillStyle=g;c.fillRect(-12,-5,24,10);
      c.fillStyle='#d6ded6';c.fillRect(-10,-3,11,6);c.strokeStyle='#8d9990';c.lineWidth=1;for(let x=-9;x<0;x+=3){c.beginPath();c.moveTo(x,-3);c.lineTo(x,3);c.stroke()}
      c.fillStyle='#293e43';c.fillRect(7,-4,3,8);c.fillStyle='#faf2d4';c.fillRect(11,-4,2,2);c.fillRect(11,2,2,2);c.fillStyle='#93d3f5';c.fillRect(4,-5,2,3);c.fillStyle='#efe5c8';c.fillRect(4,2,2,3);
    }
    c.restore();text(c,x-18,y+(drone?-18-(v.role==='scout'?18*Number(v.drone_id.split('-')[1]):0):27),drone?(v.role==='scout'?v.drone_id.toUpperCase():(v.name||(v.drone_id==='drone-1'?'Squirtle':v.drone_id)||'Squirtle').toUpperCase()):(v.truck_id||'engine-1').toUpperCase());
    for(const [fx,fy] of drone?(v.last_drop?[v.last_drop]:[]):v.last_drops||[]){c.save();c.strokeStyle='#d8f7ffbb';c.lineWidth=drone?1.8:3;c.shadowColor='#8cdaef';c.shadowBlur=4;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo((x+fx*Z)/2,(y+fy*Z)/2-12,fx*Z,fy*Z);c.stroke();c.restore()}
  }
  function distanceAxes(c,s){
    const metres=s.geography?.meters_per_cell_approx;
    if(!metres)return;
    const label=distance=>distance>=1000?(distance/1000).toFixed(1)+' km':Math.round(distance)+' m';
    c.save();c.font='10px system-ui';c.fillStyle='#101e19dc';
    c.fillRect(0,0,W,18);c.fillRect(0,18,38,H-18);
    c.fillStyle='#e8eee2';c.strokeStyle='#d4e2c599';c.lineWidth=.7;
    for(let x=0;x<=s.width;x+=10){
      const px=x/s.width*W;c.beginPath();c.moveTo(px,18);c.lineTo(px,23);c.stroke();
      c.textAlign=x===0?'left':x===s.width?'right':'center';c.fillText(label(x*metres),Math.min(W-2,Math.max(2,px)),12);
    }
    c.textAlign='left';
    for(let y=10;y<s.height;y+=10){
      const py=y/s.height*H;c.beginPath();c.moveTo(34,py);c.lineTo(41,py);c.stroke();c.fillText(label(y*metres),3,py-3);
    }
    c.restore();
  }
  function paint(canvas,s,belief,now){
    if(canvas.width!==1600){canvas.width=1600;canvas.height=1120}canvas.style.imageRendering='auto';
    const c=canvas.getContext('2d');c.setTransform(2,0,0,2,0,0);c.clearRect(0,0,W,H);c.drawImage(terrain(s),0,0,W,H);
    const fires=[],seen=new Set(),time=s.replay?s.tick*.4:phase;
    function fire(x,y,stale=false,intensity=1){const key=x+','+y;if(!seen.has(key)){seen.add(key);fires.push({x,y,stale,intensity})}}
    if(belief){
      c.fillStyle='#091b16b3';c.fillRect(0,0,W,H);
      // Reveal only cells observed this tick, including both vehicles' shared view.
      // Old sightings stay dark; replay uses its own frame's observation timestamps.
      c.save();c.beginPath();
      for(const o of s.observed_cells||[])if(o.observed_at===s.tick)c.rect(o.x*Z,o.y*Z,Z,Z);
      c.clip();c.drawImage(terrain(s),0,0,W,H);
      c.fillStyle='#10262324';c.fillRect(0,0,W,H);c.restore();
      ObservationMap.zones(c,s);
      for(const o of s.observed_cells||[]){if(o.burning)fire(o.x,o.y,o.observed_at!==s.tick,o.intensity??1);else{c.fillStyle=o.observed_at===s.tick?'#aecfac0a':'#aecfac04';c.fillRect(o.x*Z,o.y*Z,Z,Z)}}
      for(const f of s.truck?.observed_fire||[]){const key=f.x+','+f.y;const old=fires.find(p=>p.x===f.x&&p.y===f.y);if(old)old.stale=false;else fire(f.x,f.y)}
      for(const [x,y] of s.satellite?.blocks||[]){c.fillStyle='#e0ae5b22';c.fillRect(x*Z,y*Z,80,80);c.strokeStyle='#d8b06977';c.strokeRect(x*Z,y*Z,80,80)}
    }else{
      for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){
        const cell=s.cells[y][x];const burned=cell.burned??(!cell.fuel?1:0);
        if(burned>0){const px=x*Z+5,py=y*Z+5,g=c.createRadialGradient(px,py,1,px,py,10);g.addColorStop(0,`rgba(25,24,20,${Math.min(.85,burned*1.5)})`);g.addColorStop(1,'rgba(25,24,20,0)');c.fillStyle=g;c.fillRect(px-10,py-10,20,20)}
        if(cell.heat&&cell.fuel)fire(x,y,false,cell.heat);
      }
    }
    // Overlapping soft fields form a continuous front; the grid remains physics-only.
    c.save();c.globalCompositeOperation='source-over';
    for(const f of fires){
      const intensity=Math.max(.05,Math.min(1,f.intensity)),jitter=noise(f.x,f.y,5);
      const x=f.x*Z+5+Math.sin(time*1.7+jitter*9)*1.3,y=f.y*Z+5;
      if(f.stale){ellipse(c,x,y,4,4,'#b38b5877');continue}
      const radius=8+intensity*6,pulse=.85+.15*Math.sin(time*5+jitter*20);
      const g=c.createRadialGradient(x,y,0,x,y,radius);
      g.addColorStop(0,`rgba(255,${Math.round(175+intensity*75)},65,${(.85+intensity*.15)*pulse})`);
      g.addColorStop(.22,`rgba(255,125,0,${.85*pulse})`);
      g.addColorStop(.5,`rgba(255,48,0,${(.5+intensity*.4)*pulse})`);
      g.addColorStop(.75,`rgba(220,25,0,${.25+intensity*.2})`);
      g.addColorStop(1,'rgba(180,35,5,0)');
      c.fillStyle=g;c.fillRect(x-radius,y-radius,radius*2,radius*2);
    }
    c.restore();
    // Cosmetic smoke follows wind; belief smoke is sourced only from current detections.
    const current=fires.filter(f=>!f.stale),stride=Math.max(1,Math.ceil(current.length/65));
    for(let i=0;i<current.length;i+=stride){const f=current[i],seed=noise(f.x,f.y,9);for(let j=0;j<3;j++){
      const age=((time*.13+seed+j/3)%1),wx=s.wind[0],wy=s.wind[1],x=f.x*Z+5+wx*age*18+Math.sin(seed*30+age*3)*7,y=f.y*Z+5+wy*age*18-age*17;
      const radius=5+age*17;const g=c.createRadialGradient(x,y,0,x,y,radius);g.addColorStop(0,`rgba(139,140,127,${(1-age)*.3})`);g.addColorStop(.7,`rgba(150,150,135,${(1-age)*.16})`);g.addColorStop(1,'#666a6000');ellipse(c,x,y,radius,radius*.8,g);
    }}
    const d=position('drone',now),t=position('truck',now);
    if(belief){if(s.drone)sensor(c,s.drone,d,'#d7efbcbb');if(s.truck)sensor(c,s.truck,t,'#82cde9bb');for(const p of s.drone?.safe_containment_positions||[])ellipse(c,p.x*Z+5,p.y*Z+5,2,2,'#8de3cc')}
    if(s.drone)route(c,s.drone,d,'#eef2c9a0');if(s.truck)route(c,s.truck,t,'#f2917b99');
    for(const [name,g] of Object.entries(s.people||{})){ellipse(c,g.x*Z+2,g.y*Z+3,4,2,'#182f2477');ellipse(c,g.x*Z,g.y*Z,2.5,3.2,g.status==='burnt'?'#a64335':g.status==='safe'?'#c1e99c':'#f5ead2');if(!belief&&g.status!=='unwarned')text(c,g.x*Z+7,g.y*Z,name.toUpperCase()+': '+g.status.toUpperCase())}
    if(s.truck)vehicle(c,s.truck,t,false,time);if(s.drone)vehicle(c,s.drone,d,true,time);
    for(const extra of [...(s.extinguishers||[]).slice(1),...(s.trucks||[]).slice(1)]){const p={x:extra.x,y:extra.y},flying=extra.role!=='truck';if(belief)sensor(c,extra,p,flying?'#d7efbcbb':'#82cde9bb');route(c,extra,p,'#d7efbcbb');vehicle(c,extra,p,flying,time)}
    for(const scout of s.scouts||[]){const p={x:scout.x,y:scout.y};if(belief)sensor(c,scout,p,'#afbcff88');route(c,scout,p,'#b8caffaa');vehicle(c,scout,p,true,time)}
    if(!s.ignited&&!belief&&s.ignition_point){const [x,y]=s.ignition_point;c.strokeStyle='#fff0bd';c.lineWidth=1.5;c.beginPath();c.arc(x*Z,y*Z,17,0,Math.PI*2);c.moveTo(x*Z-23,y*Z);c.lineTo(x*Z+23,y*Z);c.moveTo(x*Z,y*Z-23);c.lineTo(x*Z,y*Z+23);c.stroke();text(c,x*Z-27,y*Z-27,'IGNITION')}
    if(belief&&s.report){c.strokeStyle='#f4d89a';c.setLineDash([3,4]);c.beginPath();c.arc(s.report[0]*Z,s.report[1]*Z,22,0,Math.PI*2);c.stroke();c.setLineDash([]);text(c,s.report[0]*Z-30,s.report[1]*Z+36,'SMOKE REPORT')}
    if(s.geography){
      if(!belief){text(c,s.town[0]*Z-65,s.town[1]*Z-30,'BRUNETE');
      text(c,s.farm[0]*Z-50,s.farm[1]*Z-22,'FARM · EL ÁLAMO');
      text(c,s.base[0]*Z-65,s.base[1]*Z+48,'DEMO RESPONSE BASE');}
      text(c,60,519,s.geography.map_style==='illustrated'?'ILLUSTRATED SCENARIO · APPROX. SCALE':'PNOA · CC BY 4.0 scne.es');
      c.strokeStyle='#ffffff';c.lineWidth=2;c.beginPath();c.moveTo(60,536);c.lineTo(60+1000/(s.geography.meters_per_cell_approx||60)*Z,536);c.stroke();text(c,60,530,`1 km · grid ≈${s.geography.meters_per_cell_approx||60} m/cell`);
    }else{text(c,38,361,'TOWN · CÁRTAMA');text(c,585,39,'FARM');text(c,31,546,'FIRE STATION')}
    text(c,60,28,'N ↑');
    text(c,549,541,`WIND →  X ${s.wind[0]} · Y ${s.wind[1]}`);text(c,275,28,belief?'OBSERVATION / THERMAL OVERLAY':(s.geography?.map_style==='illustrated'?'BRUNETE · ILLUSTRATED TERRAIN':s.geography?'BRUNETE · REAL AERIAL IMAGE':'AERIAL VIEW · SIMULATED TERRAIN'));
    if(belief){distanceAxes(c,s);ObservationMap.labels(c,s);}
  }
  function frame(now){
    requestAnimationFrame(frame);if(now-lastFrame<33||!previous||document.hidden)return;
    const active=previous.running&&!previous.busy&&!previous.replay&&!reduced.matches;
    if(!active&&now>=started+duration)return;
    const dt=lastFrame?Math.min(.1,(now-lastFrame)/1000):0;lastFrame=now;
    if(previous.running&&!previous.busy&&!previous.replay&&!reduced.matches)phase+=dt;
    for(const [canvas,belief] of views)paint(canvas,previous,belief,now);
  }
  requestAnimationFrame(frame);
  return {draw(canvas,s,belief){accept(s);views.set(canvas,belief);paint(canvas,s,belief,performance.now())}};
})();

let spreadDirty=false;
let state, replayTimer, pending=false, windDirty=false, recordingPlayback=null, lang=window.cecop?.lang||'es', busySince=0, setupCollapsed=false;
let fleetDirty=false,addingFire=false;
let viewEpoch=0,requestsInFlight=0,loadEpoch=0,replayEpoch=0,replayStarting=false,clientError='',pollingError='';
const $=id=>document.getElementById(id);
const I18N={
es:{eyebrow:'CENTRAL DE OPERACIONES · CECOP',subhead:'PROTECCIÓN CIVIL · EXTINCIÓN',setup:'Preparar incidente',hint:'Configura la flota antes de empezar. Clic en el mapa para el origen, ignición, viento y aviso de humo. Durante el incidente, activa Añadir fuego para nuevos focos; si los agentes deliberan, quedan en cola.',truth:'Situación real',truthTag:'BRUNETE · TERRENO ILUSTRADO',truthCesiumTag:'BRUNETE · TERRENO ILUSTRADO',truthIllustratedTag:'BRUNETE · TERRENO ILUSTRADO',belief:'Lo que el sistema ve',beliefTag:'SENSORES + SATÉLITE RETARDADO',mission:'MISIÓN / ORDEN',trail:'COMUNICACIONES',inspect:'Registro técnico de HappyRobot',explain:'HappyRobot decide explorar, contener o avisar a cada distrito. Terreno ilustrado, fuego y satélite simulados. No es una predicción operativa.',footerNote:'HappyRobot decide. Ilustración inspirada en Brunete; rejilla educativa, no Rothermel/Catastro. El reloj se pausa durante la deliberación; la reproducción no llama a la IA.',workflow:'Flujo',watch:'Vigilancia',active:'Activo',busy:'AGENTES DELIBERANDO · RELOJ EN PAUSA',live:'En curso',paused:'Pausado',replay:'Reproducción',mapFallback:'Ilustración no georreferenciada · escala aproximada',firmsDown:'FIRMS no disponible',
kClock:'Reloj',kThreat:'Amenaza',kPeople:'PERSONAS EN RIESGO',kDrone:'Drones',kCrew:'Camiones',kAgents:'Agentes',
recordRun:'Iniciar grabación',stopRec:'Detener',playRec:'Reproducir grabación',download:'Descargar',openRec:'Abrir',ignite:'1 · Ignición',call:'2 · Aviso de humo',step:'+1',speed:'Velocidad',wind:'VIENTO',windHelp:'X este · Y sur · unidades demo',applyWind:'Aplicar',calmWind:'Calma',ask:'Preguntar a los agentes',reset:'↺ Reiniciar',liveBtn:'En vivo',spread:'Propagación',
windStrength:'Fuerza',windStrong:' · fuerte',windPreview:'Vista previa · pulsa Aplicar viento',windApplied:'Viento aplicado',
replayStart:'▶ Repetir',replayStop:'Ⅱ Repetir',playBtn:'Reproducir',pauseBtn:'Pausar',
legendSim:'Frente simulado (rejilla educativa)',legendFirms:'FIRMS · focos reales 24 h (NASA)',legendDrone:'Squirtle',legendScout:'Explorador',legendTruck:'Camión',legendArea:'Distritos ilustrados',
lblIgnition:'IGNICIÓN',lblRefuge:'REFUGIO',lblSmoke:'AVISO DE HUMO',lblEngine:'DOTACIÓN 1',lblDrone:'DRON 01',lblWind:'VIENTO',
viewTruth:'VISTA AÉREA · TERRENO SIMULADO',viewBelief:'OBSERVACIÓN / CAPA TÉRMICA',
cellsBurning:'celdas ardiendo',crewWord:'dotación',firesDrone:'fuegos (dron)',firesShared:'fuegos en vista compartida',droneWord:'dron',truckWord:'camión',satellite:'satélite',notYet:'aún no',tealHint:'puntos turquesa = posiciones seguras',
unwarnedLbl:'sin aviso',evacLbl:'evacuando',safeLbl:'a salvo',exposedLbl:'expuestos',
agentChain:'HappyRobot · Central → Exploración / Extinción',orderChannel:'HAPPYROBOT · CENTRAL',mapPaused:'RELOJ EN PAUSA',
incidentActive:'Incidente en curso',incidentReady:'Incidente preparado',recordTools:'Archivo y reproducción',
radioChannel:'CANAL OPERATIVO',radioEmpty:'A la espera de comunicaciones.',
knowledgeNote:'Observaciones locales y satélite simulado retardado. No es el frente real.',
backFrame:'Fotograma anterior',forwardFrame:'Fotograma siguiente',recordedFrame:'Fotograma grabado',changeLanguage:'Switch to English',
serverUnavailable:'Servidor local no disponible',uiError:'Error de interfaz',downloadFailed:'No se pudo descargar',
recordingTooLarge:'La grabación debe ocupar menos de 100 MB.',invalidRecording:'Grabación de simulación no válida.',actionFailed:'No se pudo completar la solicitud.',recordingLoadFailed:'No se pudo cargar la grabación.',replayReadOnly:'Vuelve a En vivo para cambiar la simulación.',invalidFrame:'Fotograma no válido.',
recordingLabel:'Grabando',framesLabel:'fotogramas',resetQueued:'Reinicio en cola',resetPending:'reinicio al terminar la deliberación',
populationSummary:'Brunete: {total} habitantes (padrón municipal {year}). Reparto por distritos estimado; granja: {farm} ocupantes supuestos, aparte del padrón. Ilustración no georreferenciada; límites no oficiales.',
peopleWord:'personas',refugeArrivals:'llegadas al refugio',
legendTown:'Viviendas urbanas',legendFarm:'Viviendas de granja',legendFields:'Cultivos',legendWoodland:'Bosque',legendRefuge:'Refugio',legendDistricts:'Distritos ficticios · terreno ilustrado',observationLegend:'Leyenda del mapa de observación',
archiveHeadline:'Reproducción · escenario histórico',archiveTag:'ARCHIVO · TERRENO DE LA GRABACIÓN',archiveNote:'Escenario histórico de la grabación; no representa el incidente actual de Brunete.',archiveCode:'ARCHIVO',
censusLink:'Ayuntamiento de Brunete · padrón 2025',censusAssumptions:'Distribución por distritos estimada; ocupación de granja y refugios supuestos.',pnoaIntro:'Ilustración adaptada de una referencia',
fleetTitle:'Medios de respuesta',fleetTrucks:'camiones',fleetScouts:'exploradores',fleetExtinguishers:'drones Squirtle',scoutsShort:'exploración',extinguishersShort:'Squirtle',applyFleet:'Aplicar flota',fleetHelp:'Configura antes de la ignición. Reinicia para cambiar los medios; los recuentos se conservan.',noVehicles:'Sin vehículos',addFire:'Añadir fuego en el mapa',addFireArmed:'Añadir fuego · ACTIVADO',addFireHint:'Modo ignición activado: clic en el mapa. Durante la deliberación, el fuego queda en cola.',queuedFires:'igniciones en cola',
sources:{central:'Central',edge:'Agente dron',drone:'Dron','drone → truck':'Dron → Dotación','scout agent':'Agente explorador','scout → central':'Explorador → Central','drone-1':'Squirtle',system:'Sistema',simulation:'Simulación',dispatch:'Despacho',autopilot:'Navegación',weather:'Meteorología',farmer:'Avisante',people:'Población'}},
en:{eyebrow:'OPERATIONS CENTER · CECOP',subhead:'CIVIL PROTECTION · WILDLAND RESPONSE',setup:'Set up incident',hint:'Configure the fleet before starting. Click the map for the origin, ignite, apply wind and send the smoke report. During the incident, enable Add fire for new ignitions; they queue while agents deliberate.',truth:'Actual situation',truthTag:'BRUNETE · ILLUSTRATED TERRAIN',truthCesiumTag:'BRUNETE · ILLUSTRATED TERRAIN',truthIllustratedTag:'BRUNETE · ILLUSTRATED TERRAIN',belief:'What the system sees',beliefTag:'SENSORS + DELAYED SATELLITE',mission:'MISSION / ORDER',trail:'COMMUNICATIONS',inspect:'HappyRobot technical record',explain:'HappyRobot chooses scouting, containment or district warnings. Illustrated terrain, simulated fire and satellite. Not an operational forecast.',footerNote:'HappyRobot decides. Illustration inspired by Brunete; educational grid, not Rothermel/Catastro. Clock pauses during deliberation; replay never calls AI.',workflow:'Workflow',watch:'Watch',active:'Active',busy:'AGENTS DELIBERATING · CLOCK PAUSED',live:'Live',paused:'Paused',replay:'Replay',mapFallback:'Non-georeferenced illustration · approximate scale',firmsDown:'FIRMS unavailable',
kClock:'Clock',kThreat:'Threat',kPeople:'PEOPLE AT RISK',kDrone:'Drones',kCrew:'Trucks',kAgents:'Agents',
recordRun:'Start recording',stopRec:'Stop',playRec:'Play recording',download:'Download',openRec:'Open',ignite:'1 · Ignite',call:'2 · Smoke report',step:'+1',speed:'Speed',wind:'WIND',windHelp:'X east · Y south · demo units',applyWind:'Apply',calmWind:'Calm',ask:'Ask agents',reset:'↺ Reset',liveBtn:'Live',spread:'Fire spread',
windStrength:'Strength',windStrong:' · strong',windPreview:'Preview · press Apply wind',windApplied:'Applied wind',
replayStart:'▶ Replay',replayStop:'Ⅱ Replay',playBtn:'Play',pauseBtn:'Pause',
legendSim:'Simulated front (educational grid)',legendFirms:'FIRMS · real 24 h hotspots (NASA)',legendDrone:'Squirtle',legendScout:'Scout',legendTruck:'Engine',legendArea:'Illustrated districts',
lblIgnition:'IGNITION',lblRefuge:'REFUGE',lblSmoke:'SMOKE REPORT',lblEngine:'ENGINE 1',lblDrone:'DRONE 01',lblWind:'WIND',
viewTruth:'AERIAL VIEW · SIMULATED TERRAIN',viewBelief:'OBSERVATION / THERMAL OVERLAY',
cellsBurning:'burning',crewWord:'crew',firesDrone:'fires (drone)',firesShared:'fires in shared view',droneWord:'drone',truckWord:'truck',satellite:'satellite',notYet:'n/a',tealHint:'teal dots = safe flight positions',
unwarnedLbl:'unwarned',evacLbl:'evacuating',safeLbl:'safe',exposedLbl:'exposed',
agentChain:'HappyRobot · Central → Scout / Extinguisher',orderChannel:'HAPPYROBOT · CENTRAL',mapPaused:'CLOCK PAUSED',
incidentActive:'Incident in progress',incidentReady:'Incident prepared',recordTools:'Archive and replay',
radioChannel:'OPERATIONS CHANNEL',radioEmpty:'Awaiting communications.',
knowledgeNote:'Local observations and delayed simulated satellite. Not the actual fire front.',
backFrame:'Previous frame',forwardFrame:'Next frame',recordedFrame:'Recorded frame',changeLanguage:'Cambiar a español',
serverUnavailable:'Local server unavailable',uiError:'UI error',downloadFailed:'Download failed',
recordingTooLarge:'Recording must be under 100 MB.',invalidRecording:'Invalid simulation recording.',actionFailed:'The request could not be completed.',recordingLoadFailed:'The recording could not be loaded.',replayReadOnly:'Return to Live to change the simulation.',invalidFrame:'Invalid frame.',
recordingLabel:'Recording',framesLabel:'frames',resetQueued:'Reset queued',resetPending:'reset after deliberation',
populationSummary:'Brunete: {total} residents ({year} municipal census). District split is estimated; farm: {farm} assumed occupants, separate from the census. Illustration is not georeferenced; boundaries are not official.',
peopleWord:'people',refugeArrivals:'refuge arrivals',
legendTown:'Town homes',legendFarm:'Farm homes',legendFields:'Fields',legendWoodland:'Woodland',legendRefuge:'Refuge',legendDistricts:'Fictional districts · illustrated terrain',observationLegend:'Observation map legend',
archiveHeadline:'Replay · historical scenario',archiveTag:'ARCHIVE · RECORDED TERRAIN',archiveNote:'Historical recording scenario; not the current Brunete incident.',archiveCode:'ARCHIVE',
censusLink:'Brunete Town Council · 2025 census',censusAssumptions:'Estimated district allocations; assumed farm occupancy and refuges.',pnoaIntro:'Illustration adapted from a reference',
fleetTitle:'Response assets',fleetTrucks:'trucks',fleetScouts:'scouts',fleetExtinguishers:'Squirtle drones',scoutsShort:'scout',extinguishersShort:'Squirtle',applyFleet:'Apply fleet',fleetHelp:'Configure before ignition. Reset to change assets; counts are preserved.',noVehicles:'No vehicles',addFire:'Add fire on map',addFireArmed:'Add fire · ON',addFireHint:'Ignition mode on: click the map. Fires are queued during deliberation.',queuedFires:'queued ignitions',
sources:{central:'Central',edge:'Drone agent',drone:'Drone','drone → truck':'Drone → Engine','scout agent':'Scout agent','scout → central':'Scout → Central','drone-1':'Squirtle',system:'System',simulation:'Simulation',dispatch:'Dispatch',autopilot:'Navigation',weather:'Weather',farmer:'Caller',people:'People'}}
};
const STATUS_I18N={
es:{at_station:'en base',mobilizing:'movilizando',en_route:'en ruta',suppressing:'suprimiendo',returning:'regresando',retreating:'replegando',blocked:'bloqueado',trapped:'atrapado',holding:'en espera',awaiting_assignment:'esperando misión',hold:'mantener',scout:'explorar',contain:'contener',warn:'avisar',patrol:'patrullando',continue:'continuar',on_scene:'en zona',evacuate_town:'avisar distrito',evacuate_farm:'avisar granja',unwarned:'sin aviso',evacuating:'evacuando',safe:'a salvo',burnt:'expuestos'},
en:{at_station:'at station',mobilizing:'mobilizing',en_route:'en route',suppressing:'suppressing',returning:'returning',retreating:'retreating',blocked:'blocked',trapped:'trapped',holding:'holding',awaiting_assignment:'awaiting assignment',hold:'hold',scout:'scout',contain:'contain',warn:'warn',patrol:'patrolling',continue:'continue',on_scene:'on scene',evacuate_town:'warn district',evacuate_farm:'warn farm',unwarned:'unwarned',evacuating:'evacuating',safe:'safe',burnt:'exposed'}
};
function statusText(v){const labels=STATUS_I18N[lang]||{};return Object.hasOwn(labels,v)?labels[v]:v}
function updateErrors(){const messages=[clientError,pollingError,state?.error].filter(Boolean);$('error').textContent=[...new Set(messages)].join('\n');$('error').hidden=!messages.length}
function setClientError(error){clientError=error?.message||String(error);updateErrors()}
async function responseJSON(response,fallback){let data;try{data=await response.json()}catch{throw Error(fallback)}if(!response.ok)throw Error(typeof data?.error==='string'?data.error:fallback);return data}
function validateRecording(data){
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const text=v=>typeof v==='string',finite=Number.isFinite;
  const positive=v=>finite(v)&&v>0,nonnegative=v=>finite(v)&&v>=0,integer=v=>Number.isInteger(v)&&v>=0;
  const list=(v,check)=>Array.isArray(v)&&v.every(check);
  const optional=(v,check)=>v==null||check(v);
  const pair=v=>Array.isArray(v)&&v.length===2&&v.every(finite);
  const point=v=>object(v)&&finite(v.x)&&finite(v.y)&&optional(v.intensity,nonnegative);
  const vehicle=v=>point(v)&&text(v.status)&&['mode','name','role','drone_id','truck_id'].every(k=>optional(v[k],text))&&
    (v.role!=='scout'||typeof v.drone_id==='string'&&/^scout-\d+$/.test(v.drone_id))&&
    ['route','last_drops','waypoints'].every(k=>optional(v[k],a=>list(a,pair)))&&
    ['target','last_drop'].every(k=>optional(v[k],pair))&&
    ['observed_fire','safe_containment_positions'].every(k=>optional(v[k],a=>list(a,point)))&&optional(v.sensor_radius,positive);
  const person=v=>point(v)&&integer(v.count)&&text(v.status)&&optional(v.burnt,n=>integer(n)&&n<=v.count)&&
    ['name','short_name','kind'].every(k=>optional(v[k],text))&&optional(v.refuge,pair);
  const zone=v=>object(v)&&list(v.polygon,pair)&&v.polygon.length>=3&&
    ['name','short_name','id','kind','color'].every(k=>optional(v[k],text))&&
    ['anchor','refuge'].every(k=>optional(v[k],pair))&&optional(v.homes,a=>list(a,pair));
  const geography=v=>object(v)&&['id','name','map_style'].every(k=>optional(v[k],text))&&
    optional(v.meters_per_cell_approx,positive)&&optional(v.image_crop,a=>Array.isArray(a)&&a.length===4&&a.every(finite)&&a[2]>0&&a[3]>0)&&
    optional(v.observation_zones,a=>list(a,zone))&&optional(v.population_source,p=>object(p)&&integer(p.official_total)&&integer(p.reference_year)&&optional(p.farm_occupancy,f=>object(f)&&integer(f.count)));
  const validFrame=f=>{
    if(!object(f)||f.width!==80||f.height!==56||!integer(f.tick)||!text(f.mission)||!pair(f.wind)||
      !['base','town','farm'].every(k=>pair(f[k]))||!optional(f.incident_id,text)||
      !list(f.cells,row=>list(row,c=>object(c)&&nonnegative(c.heat)&&nonnegative(c.fuel)&&optional(c.burned,nonnegative))&&row.length===80)||f.cells.length!==56||
      !object(f.people)||!Object.values(f.people).every(person)||
      !list(f.history,e=>object(e)&&integer(e.tick)&&text(e.source)&&text(e.message))||!list(f.observation,point)||
      !optional(f.observed_cells,a=>list(a,c=>point(c)&&integer(c.observed_at)))||!optional(f.roads,a=>list(a,pair))||
      !['ignition_point','report'].every(k=>optional(f[k],pair))||
      !['drone','truck'].every(k=>optional(f[k],vehicle))||!['scouts','extinguishers','trucks'].every(k=>optional(f[k],a=>list(a,vehicle)))||
      (!f.drone&&!Array.isArray(f.extinguishers))||
      !['burning','extinguished','crew_extinguished'].every(k=>optional(f[k],nonnegative))||
      !optional(f.rules,r=>object(r)&&optional(r.spread_factor,n=>finite(n)&&n>=0.25&&n<=4))||
      !optional(f.satellite,s=>object(s)&&integer(s.captured_at)&&list(s.blocks,pair))||!optional(f.geography,geography))return false;
    if(f.fleet_counts!=null){
      const vehicles=fleetVehicles(f);
      if(!object(f.fleet_counts)||!['trucks','scouts','extinguishers'].every(k=>integer(f.fleet_counts[k])&&f.fleet_counts[k]<=3&&f.fleet_counts[k]===vehicles[k].length))return false;
    }
    return true;
  };
  if(!object(data)||data.format!=='los-panaderos-recording-v1'||!Array.isArray(data.frames)||!data.frames.length||data.frames.length>1500||!data.frames.every(validFrame))throw Error(I18N[lang].invalidRecording);
  return data.frames;
}
function fleetVehicles(s){
  return {trucks:Array.isArray(s.trucks)?s.trucks:(s.truck?[s.truck]:[]),scouts:s.scouts||[],extinguishers:Array.isArray(s.extinguishers)?s.extinguishers:(s.drone?[s.drone]:[])};
}
function fleetCounts(s){
  const vehicles=fleetVehicles(s);
  return s.fleet_counts||Object.fromEntries(Object.entries(vehicles).map(([role,list])=>[role,list.length]));
}
function statusSummary(vehicles){
  const counts=new Map();
  for(const v of vehicles){const label=statusText(v.status);counts.set(label,(counts.get(label)||0)+1)}
  return [...counts].map(([label,count])=>`${count} ${label}`).join(' · ')||I18N[lang].noVehicles;
}
function renderFireControl(s){
  const t=I18N[lang],queued=s.replay?0:(s.pending_fires||0);
  $('addFire').disabled=!!(s.replay||s.reset_pending||(s.ignited&&s.phase!=='active'));
  const placing=addingFire&&!$('addFire').disabled;
  $('addFire').setAttribute('aria-pressed',String(addingFire));
  $('addFire').textContent=(addingFire?t.addFireArmed:t.addFire)+(queued?` · ${queued} ${t.queuedFires}`:'');
  $('firePlacementHint').hidden=!placing;
  $('firePlacementHint').textContent=t.addFireHint;
  document.body.classList.toggle('is-adding-fire',placing);
}
function renderFleet(s){
  const t=I18N[lang],counts=fleetCounts(s),vehicles=fleetVehicles(s);
  const locked=!!(s.ignited||s.called||s.busy||s.replay||s.reset_pending);
  if(!fleetDirty||s.replay||locked)for(const role of ['trucks','scouts','extinguishers'])$('fleet-'+role).value=counts[role];
  for(const role of ['trucks','scouts','extinguishers'])$('fleet-'+role).disabled=locked;
  $('applyFleet').disabled=locked;
  $('fleetSummary').textContent=`${counts.trucks} ${t.fleetTrucks} · ${counts.scouts} ${t.fleetScouts} · ${counts.extinguishers} ${t.fleetExtinguishers}`;
  $('droneKpi').textContent=`${counts.scouts} ${t.scoutsShort} · ${counts.extinguishers} ${t.extinguishersShort}`;
  $('droneStatus').textContent=statusSummary([...vehicles.scouts,...vehicles.extinguishers]);
  $('crew').textContent=`${counts.trucks} ${t.fleetTrucks}`;
  $('crewStatus').textContent=statusSummary(vehicles.trucks);
}
function observedCount(vehicles){
  return new Set(vehicles.flatMap(v=>(v.observed_fire||[]).map(f=>`${f.x},${f.y}`))).size;
}
function applyMapMode(){
  const st = {ready:false, reason:'illustrated', firms:false};
  const archived=!!state?.replay&&!state?.geography?.id?.startsWith('brunete-');
  $('globe').hidden = !st.ready;
  $('truth').hidden = st.ready;
  const t = I18N[lang];
  const msg=archived?t.archiveNote:(!st.ready?t.mapFallback:(!st.firms?t.firmsDown:''));
  $('mapNote').textContent = msg;
  $('mapNote').hidden = !msg;
  $('legendFirms').hidden = !(st.ready && st.firms);
  $('truthTag').textContent=archived?t.archiveTag:(st.ready?(st.firms?t.truthTag:t.truthCesiumTag):t.truthIllustratedTag);
  $('headline').textContent=archived?t.archiveHeadline:'Brunete · Madrid';
  if (st.ready && window.AerialView && window.AerialView.forget) window.AerialView.forget($('truth'));
  if (st.ready) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  $('wx').hidden=true;
}
function applyLang(){window.cecop?.applyLang();const t=I18N[lang];document.documentElement.lang=lang;window.uiLang=lang;document.querySelectorAll('[data-i18n]').forEach(el=>{const v=t[el.dataset.i18n];if(v!==undefined)el.textContent=v});document.querySelectorAll('[data-i18n-aria-label]').forEach(el=>{const value=t[el.dataset.i18nAriaLabel];if(value)el.setAttribute('aria-label',value)});$('langToggle').textContent=lang==='es'?'EN':'ES';$('replayPlay').textContent=replayTimer||replayStarting?t.replayStop:t.replayStart;applyMapMode()}
function changeIncidentLanguage(next){lang=next;applyLang();if(state)render(state)}
window.cecop?.onLanguageChange(changeIncidentLanguage);
$('langToggle').onclick=()=>{const next=lang==='es'?'en':'es';if(window.cecop)window.cecop.setLang(next);else changeIncidentLanguage(next)};
async function act(action,extra={},loadToken=null){
  if(loadToken===null)loadEpoch++;else if(loadToken!==loadEpoch)return false;
  if(recordingPlayback&&action==='seek'){
    viewEpoch++;
    try{showRecorded(extra.index);clientError='';updateErrors();return true}catch(e){stopReplay();setClientError(e);return false}
  }
  if(recordingPlayback&&!['pause','stop_recording','live','reset'].includes(action)){setClientError(I18N[lang].replayReadOnly);return false}
  if(action==='live'||action==='reset')stopReplay();
  const epoch=++viewEpoch;
  requestsInFlight++;
  try{
    const res=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-Simulator-Request':'1'},body:JSON.stringify({action,...extra})});
    const s=await responseJSON(res,I18N[lang].actionFailed);
    if(epoch!==viewEpoch)return false;
    if(action==='live'||action==='reset')recordingPlayback=null;
    if(action==='reset'){windDirty=false;spreadDirty=false;fleetDirty=false;addingFire=false}
    clientError='';pollingError='';
    if(recordingPlayback)updateErrors();else render(s);
    return true;
  }catch(e){if(epoch===viewEpoch)setClientError(e);return false}
  finally{requestsInFlight--}
}
window.act=act;
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{stopReplay();act(b.dataset.action)});
$('play').onclick=()=>state&&act(state.running?'pause':'play');$('speed').onchange=e=>act('speed',{speed:+e.target.value});
$('timeline').oninput=e=>{stopReplay();act('seek',{index:+e.target.value})};
$('back').onclick=()=>{if(!state)return;stopReplay();act('seek',{index:Math.max(0,state.frame_index-1)})};$('forward').onclick=()=>{if(!state)return;stopReplay();act('seek',{index:Math.min(state.frame_count-1,state.frame_index+1)})};
function stopReplay(){clearInterval(replayTimer);replayTimer=null;replayStarting=false;replayEpoch++;$('replayPlay').textContent=I18N[lang].replayStart}
async function startReplay(){
  if(!state||state.frame_count<2||replayTimer||replayStarting)return;
  const epoch=++replayEpoch;
  replayStarting=true;$('replayPlay').textContent=I18N[lang].replayStop;
  try{
    if((!state.replay||state.frame_index===state.frame_count-1)&&!await act('seek',{index:0})){if(epoch===replayEpoch)stopReplay();return}
    if(epoch!==replayEpoch)return;
    replayTimer=setInterval(async()=>{
      if(epoch!==replayEpoch||pending)return;
      if(state.frame_index>=state.frame_count-1){stopReplay();return}
      pending=true;
      try{if(!await act('seek',{index:state.frame_index+1})&&epoch===replayEpoch)stopReplay()}
      finally{pending=false}
    },250);
  }finally{if(epoch===replayEpoch){replayStarting=false;$('replayPlay').textContent=replayTimer?I18N[lang].replayStop:I18N[lang].replayStart}}
}
$('replayPlay').onclick=()=>{if(replayTimer||replayStarting){stopReplay();return}return startReplay()};

function pixelMap(canvas,s,belief){window.AerialView.draw(canvas,s,belief)}
// District cards live on a separate layer above the truth canvas: AerialView repaints
// its own canvas every animation frame, so anything drawn directly there would flicker.
function renderTruthOverlay(s){
  const canvas=$('truthOverlay'),om=window.ObservationMap;
  if(!canvas||typeof canvas.getContext!=='function'||!om?.districtCards)return;
  if(canvas.width!==1600){canvas.width=1600;canvas.height=1120}
  const c=canvas.getContext('2d');if(!c)return;
  c.setTransform(2,0,0,2,0,0);c.clearRect(0,0,800,560);
  if(!$('truth').hidden)om.districtCards(c,s);
}
function radioKind(source){
  const vehicleSource=/^(drone|scout|engine)-\d+$/.test(source)||source==='scout agent'||source==='scout → central';
  const agent=vehicleSource||['central','edge','drone','drone → truck'].includes(source);
  const kind=vehicleSource?'drone':source==='drone'||source==='edge'||source==='drone → truck'?'drone':['central','system','dispatch','autopilot'].includes(source)?'system':['simulation','weather'].includes(source)?'simulation':'human';
  return {agent,kind};
}
// Transient notifications over the belief map for every new Comunicaciones line.
// History is a sliding window (last 100), so we anchor on the newest previously seen entry
// and fall back to the previous length when that anchor has scrolled out.
const TOAST_MS=5000,TOAST_FADE=1000,TOAST_MAX=3;
let toastCursor=null;
const trailKey=e=>`${e.tick}|${e.source}|${e.message}`;
function firstSentence(text){
  const raw=String(text||'').replace(/\s+/g,' ').trim();
  if(!raw)return '';
  const cut=raw.search(/[.!?](?:\s|$)/);
  return (cut>=0?raw.slice(0,cut+1):raw).trim();
}
function toastHeadline(e){
  const src=e.source||'',msg=String(e.message||'').replace(/\s+/g,' ').trim();
  let m;
  if(/^Fire ignited at the selected location/i.test(msg))return 'Fire ignited';
  if(/^Additional ignition/i.test(msg)&&(m=msg.match(/\((\d+),\s*(\d+)\)/)))return `Ignition (${m[1]}, ${m[2]})`;
  if(src==='farmer'&&(m=msg.match(/\((\d+),\s*(\d+)\)/)))return `Smoke at (${m[1]}, ${m[2]})`;
  if(/^Truck mobilizing/i.test(msg))return 'Truck mobilizing';
  if(/^Loudspeaker warning delivered/i.test(msg)){
    const name=(msg.match(/delivered to ([^:]+)/i)||[])[1]?.trim();
    const count=(msg.match(/(\d[\d,]*)\s+people/i)||[])[1];
    if(name&&count)return `${name} · ${count} moving`;
    if(name)return `${name} moving`;
    return 'Warning delivered';
  }
  if((m=msg.match(/^(\S+) at \((\d+),\s*(\d+)\)/)))return `${m[1]} (${m[2]}, ${m[3]})`;
  if((m=msg.match(/^(\S+): (\d[\d,]*) people reached refuge/)))return `${m[1]} at refuge`;
  if((m=msg.match(/^(\S+) evacuation route blocked/)))return `${m[1]} route blocked`;
  if((m=msg.match(/^(\S+): fire reached the group/)))return `${m[1]} exposed`;
  if(/^Wind vector updated/i.test(msg)&&(m=msg.match(/X=([-\d.]+), Y=([-\d.]+)/)))return `Wind ${m[1]}, ${m[2]}`;
  if(/^Fire spread factor updated/i.test(msg)&&(m=msg.match(/([\d.]+)×/)))return `Spread ${m[1]}×`;
  if(/no fire remains/i.test(msg))return 'Fire out · return to station';
  if(/returned to station/i.test(msg))return 'Vehicles at station';
  if(/confirms fire through shared sensors/i.test(msg))return 'Scout confirms fire';
  if(/separate observed fire/i.test(msg)&&(m=msg.match(/at\s+(\[[^\]]+\]|\([^)]+\))/)))return `New fire ${m[1]}`;
  if(/cannot reach/i.test(msg))return 'Route blocked · new approach';
  if(/replanned its route/i.test(msg))return 'Drone replanned';
  return firstSentence(msg);
}
function renderToasts(s){
  const host=$('beliefToasts');if(!host)return;
  const history=s.history||[];
  const newest=history.length?trailKey(history[history.length-1]):'';
  const incident=s.incident_id;
  // First frame, replay scrubbing and incident resets only seed the cursor: no backlog spam.
  if(s.replay||!toastCursor||toastCursor.incident!==incident){toastCursor={incident,newest,count:history.length,seq:0};return}
  if(newest===toastCursor.newest&&history.length===toastCursor.count)return;
  // Diff by previous length so empty → first farmer/dispatch messages toast.
  // If the 100-entry window slid, take the newest few instead of a stale index.
  const start=history.length<toastCursor.count?Math.max(0,history.length-TOAST_MAX):toastCursor.count;
  toastCursor={incident,newest,count:history.length,seq:toastCursor.seq||0};
  const fresh=history.slice(start).filter(e=>e&&typeof e==='object').slice(-TOAST_MAX);
  for(const e of fresh){
    const source=e.source||'system',{kind}=radioKind(source);
    toastCursor.seq+=1;
    const toast=document.createElement('div');toast.className=`toast source-${kind}`;
    toast.textContent=`${String(toastCursor.seq).padStart(2,'0')} ${toastHeadline(e)}`;
    host.replaceChildren(...[...host.children,toast].slice(-TOAST_MAX));
    setTimeout(()=>{toast.classList.add('is-leaving');setTimeout(()=>toast.remove?.(),TOAST_FADE)},TOAST_MS);
  }
}
function renderRadio(s){
  const t=I18N[lang];
  const history=(s.history||[]).slice().reverse();
  let latestAgent=false;
  const rows=history.map(e=>{
    const source=e.source||'system';
    const {agent,kind}=radioKind(source);
    const row=document.createElement('div');row.className=`entry source-${kind}`;
    if(agent&&!latestAgent){row.classList.add('latest-agent');latestAgent=true}
    const time=document.createElement('time');time.textContent=`T+${e.tick}`;
    const label=document.createElement('b');label.className='entry-source';label.textContent=(Object.hasOwn(t.sources,source)?t.sources[source]:source).toUpperCase();
    const message=document.createElement('span');message.className='entry-message';message.textContent=e.message;
    row.append(time,label,message);return row;
  });
  if(!rows.length){const empty=document.createElement('p');empty.className='radio-empty';empty.textContent=t.radioEmpty;rows.push(empty)}
  $('trail').replaceChildren(...rows);
}
function renderPopulation(s){
  const t=I18N[lang],source=s.geography?.population_source;
  const number=n=>Number(n).toLocaleString(lang==='es'?'es-ES':'en-US');
  $('populationSource').hidden=!source;
  $('populationSource').textContent=source?t.populationSummary.replace('{total}',number(source.official_total)).replace('{year}',source.reference_year).replace('{farm}',number(source.farm_occupancy?.count??Object.values(s.people||{}).filter(g=>g.kind==='farm').reduce((n,g)=>n+g.count,0))):'';
  $('belief').setAttribute('role','img');
  $('belief').setAttribute('aria-label',t.belief+'. '+Object.entries(s.people||{}).map(([name,g])=>`${g.name||name}: ${number(g.count)} ${t.peopleWord}, ${statusText(g.status)}; ${t.refugeArrivals}: ${number(g.status==='safe'?Math.max(0,g.count-(g.burnt||0)):0)}`).join('. '));
}
function render(s){
if((state&&state.incident_id!==s.incident_id)||s.replay){fleetDirty=false;addingFire=false}
state=s;window.state=s;updateErrors();$('workflow').href=s.workflow_url;$('clock').textContent=`T+${s.tick}`;
const t=I18N[lang];
const busy=!!s.busy&&!s.replay;
if(busy&&!busySince)busySince=Date.now();if(!busy)busySince=0;
const wait=busy&&busySince?` · ${Math.round((Date.now()-busySince)/1000)}s`:'';
$('connection').textContent=(busy?t.busy+wait:s.replay?t.replay:s.running?t.live:t.paused);
if(s.reset_pending)$('connection').textContent+=` · ${t.resetPending}`;
if(!s.replay&&s.pending_fires)$('connection').textContent+=` · ${s.pending_fires} ${t.queuedFires}`;
document.body.classList.toggle('is-busy',busy);
document.body.classList.toggle('is-live',!!s.running&&!s.busy&&!s.replay);
document.body.classList.toggle('is-replay',!!s.replay);
document.body.classList.toggle('is-active',!!(s.ignited&&s.burning));
$('threat').textContent=s.ignited&&s.burning?t.active:t.watch;
renderPopulation(s);
const people=Object.values(s.people||{});
const unwarned=people.filter(g=>g.status==='unwarned').reduce((n,g)=>n+g.count,0);
const evac=people.filter(g=>g.status==='evacuating'||g.status==='blocked').reduce((n,g)=>n+g.count,0);
const safe=people.filter(g=>g.status==='safe').reduce((n,g)=>n+g.count,0);
const burnt=people.reduce((n,g)=>n+(g.burnt||0),0);
$('peopleUnwarned').textContent=unwarned.toLocaleString(lang==='es'?'es-ES':'en-US');
$('peopleEvacuating').textContent=evac.toLocaleString(lang==='es'?'es-ES':'en-US');
$('peopleSafe').textContent=safe.toLocaleString(lang==='es'?'es-ES':'en-US');
$('peopleExposed').textContent=burnt.toLocaleString(lang==='es'?'es-ES':'en-US');
$('peopleBoard').classList.toggle('has-unwarned',unwarned>0);
$('peopleBoard').classList.toggle('has-exposed',burnt>0);
$('runs').textContent=`${s.workflow_calls||0}${s.latency?' · '+s.latency+'s':''}`;
$('incidentCode').textContent=s.geography?.id||(s.replay?t.archiveCode:'ES-2026-BRUNETE');
const windSummary=`${t.wind} X ${Number(s.wind[0]).toFixed(2)} · Y ${Number(s.wind[1]).toFixed(2)}`;
const incidentSummary=s.replay?t.replay:s.called?t.incidentActive:t.incidentReady;
$('operatingSummary').textContent=`${incidentSummary} · ${windSummary}`;
$('setupSummary').textContent=`${t.setup} · ${incidentSummary} · ${windSummary}`;
if(s.called&&!setupCollapsed){$('setupPanel').open=false;setupCollapsed=true}
if(!s.called&&setupCollapsed){$('setupPanel').open=true;setupCollapsed=false}
$('play').textContent=s.running?t.pauseBtn:t.playBtn;if(!windDirty||s.replay){$('windX').value=s.wind[0];$('windY').value=s.wind[1];windDirty=false}updateWindPreview();for(const id of ['windX','windY','applyWind','calmWind','spreadFactor'])$(id).disabled=s.busy||s.replay;if(!spreadDirty||s.replay){$('spreadFactor').value=s.rules?.spread_factor??0.5;$('spreadFactorValue').textContent=`${$('spreadFactor').value}×`;}$('speed').value=s.speed;$('mission').textContent=s.mission;$('truthstats').textContent=`${s.burning} ${t.cellsBurning} · ${s.extinguished} ${t.droneWord} · ${s.crew_extinguished} ${t.crewWord}`;const vehicles=fleetVehicles(s);
$('beliefstats').textContent=`${s.observation.length} ${t.firesShared} · ${observedCount(vehicles.extinguishers)} ${t.extinguishersShort} / ${observedCount(vehicles.trucks)} ${t.truckWord} / ${observedCount(vehicles.scouts)} ${t.scoutsShort} · ${t.satellite} ${s.satellite?`t+${s.tick-s.satellite.captured_at}`:t.notYet} · ${t.tealHint}`;$('timeline').max=s.frame_count-1;$('timeline').value=s.frame_index;$('replayPlay').disabled=s.frame_count<2||s.busy;$('back').disabled=$('forward').disabled=$('timeline').disabled=s.busy;document.querySelector('[data-action="live"]').disabled=s.busy;$('frame').textContent=s.replay?`${t.replay} ${s.frame_index+1}/${s.frame_count}`:t.live;$('people').replaceChildren(...Object.entries(s.people||{}).map(([name,g])=>{
  const el=document.createElement('span');
  el.className='person person-'+(g.status||'');
  const zone=(s.geography?.observation_zones||[]).find(z=>z.id===name);
  const label=g.short_name||g.name||zone?.short_name||zone?.name||name;
  el.textContent=`${label} · ${g.count.toLocaleString(lang==='es'?'es-ES':'en-US')} · ${statusText(g.status)}${g.burnt?` · ${g.burnt.toLocaleString(lang==='es'?'es-ES':'en-US')} ${t.exposedLbl}`:''}`;
  return el;
}));renderRadio(s);$('evidence').textContent=s.run_evidence||'';document.querySelectorAll('.toolbar button,.toolbar select').forEach(b=>{if(b.id==='play'||b.id==='addFire')return;b.disabled=s.busy||s.replay});$('resetSim').disabled=!!s.reset_pending;$('resetSim').textContent=s.reset_pending?t.resetQueued:t.reset;renderFleet(s);renderFireControl(s);$('play').disabled=s.replay||s.busy&&!s.running;$('recordRun').disabled=s.busy||s.replay||s.recording;$('stopRecord').disabled=!s.recording;$('downloadRecord').disabled=!s.recorded_frames;$('playRecord').disabled=busy||s.replay||!s.recorded_frames||s.recording;$('openRecording').disabled=s.busy||s.replay;$('recordRun').textContent=s.recording?`${t.recordingLabel} · ${s.recorded_frames} ${t.framesLabel}`:t.recordRun;
applyMapMode();
try{pixelMap($('belief'),s,true);if(!$('truth').hidden)pixelMap($('truth'),s,false);renderTruthOverlay(s);renderToasts(s)}catch(e){console.error('Canvas render failed',e)}}
async function poll(){
  const epoch=viewEpoch;
  try{
    if(recordingPlayback||requestsInFlight)return;
    const s=await responseJSON(await fetch('/api/state'),I18N[lang].serverUnavailable);
    if(epoch!==viewEpoch||recordingPlayback||requestsInFlight)return;
    pollingError='';render(s);
  }catch(e){
    if(epoch===viewEpoch&&!recordingPlayback&&!requestsInFlight){pollingError=I18N[lang].serverUnavailable;updateErrors();$('connection').textContent=pollingError}
  }finally{setTimeout(poll,600)}
}
// Surface any load-time failure instead of leaving an inert console.
window.addEventListener('error',e=>setClientError(I18N[lang].uiError+': '+(e.message||e.error)));
applyLang();
// The simulator must stay usable even if the map cannot start at all.
applyMapMode();poll();

function updateWindPreview(){const t=I18N[lang];const x=+$('windX').value,y=+$('windY').value;$('windXValue').textContent=x.toFixed(2);$('windYValue').textContent=y.toFixed(2);$('windStrength').textContent=`${t.windStrength} ${Math.hypot(x,y).toFixed(2)}${Math.hypot(x,y)>=2?t.windStrong:""}`;$('windPending').textContent=windDirty?t.windPreview:t.windApplied;const px=43+Math.sign(x)*Math.sqrt(Math.abs(x)/3)*30,py=43+Math.sign(y)*Math.sqrt(Math.abs(y)/3)*30;$('windArrow').setAttribute('d',`M43 43 L${px} ${py}`);$('windTip').setAttribute('cx',px);$('windTip').setAttribute('cy',py)}
for(const id of ['windX','windY'])$(id).oninput=()=>{windDirty=true;updateWindPreview()};
$('applyWind').onclick=()=>{const x=+$('windX').value,y=+$('windY').value;windDirty=false;act('wind',{x,y})};
$('calmWind').onclick=()=>{$('windX').value=0;$('windY').value=0;windDirty=true;updateWindPreview()};

$('truth').onclick=e=>{if(!state||state.reset_pending||state.replay||(state.busy&&!(state.ignited&&addingFire))||(state.ignited&&!addingFire))return;const r=e.currentTarget.getBoundingClientRect();const x=Math.floor((e.clientX-r.left)/r.width*state.width),y=Math.floor((e.clientY-r.top)/r.height*state.height);act(state.ignited?'add_fire':'place_fire',{x,y})};
function dragWind(e){if(!state||state.busy||state.replay)return;const r=$('windVector').getBoundingClientRect();const component=(p,start,size)=>{const n=Math.max(-1,Math.min(1,((p-start)/size*86-43)/30));return (Math.round(Math.sign(n)*n*n*3/0.05)*0.05).toFixed(2)};$('windX').value=component(e.clientX,r.left,r.width);$('windY').value=component(e.clientY,r.top,r.height);windDirty=true;updateWindPreview()}
$('windVector').onpointerdown=e=>{e.currentTarget.setPointerCapture(e.pointerId);dragWind(e)};
$('windVector').onpointermove=e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))dragWind(e)};
$('windVector').onpointerup=e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)};
$('recordRun').onclick=async()=>{stopReplay();const ok=await act('record_run',{x:+$('windX').value,y:+$('windY').value});if(ok){windDirty=false;updateWindPreview()}};
$('stopRecord').onclick=()=>act('stop_recording');
$('downloadRecord').onclick=async()=>{try{const r=await fetch('/api/recording');if(!r.ok)throw Error(I18N[lang].downloadFailed);const blob=new Blob([JSON.stringify(await r.json())],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='los-panaderos-recording.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setClientError(e)}};

function showRecorded(index){
  if(!recordingPlayback?.length||!Number.isInteger(index))throw Error(I18N[lang].invalidFrame);
  index=Math.max(0,Math.min(recordingPlayback.length-1,index));
  const frame=recordingPlayback[index],vehicles=fleetVehicles(frame);
  render({...state,...frame,drone:frame.drone??vehicles.extinguishers[0]??null,truck:frame.truck??vehicles.trucks[0]??null,scouts:vehicles.scouts,extinguishers:vehicles.extinguishers,trucks:vehicles.trucks,fleet_counts:frame.fleet_counts??null,geography:frame.geography??null,workflow_url:state?.workflow_url,pending_fires:0,busy:false,reset_pending:false,running:false,replay:true,frame_index:index,frame_count:recordingPlayback.length,run_evidence:'Recorded simulation replay. No new HappyRobot calls.'});
}
async function loadRecording(readData){
  stopReplay();
  const token=++loadEpoch;
  try{
    const data=await readData();
    if(token!==loadEpoch)return false;
    const frames=validateRecording(data);
    if(!await act('pause',{},token)||token!==loadEpoch)return false;
    const previousRecording=recordingPlayback,previousState=state;
    viewEpoch++;recordingPlayback=frames;
    try{showRecorded(0)}catch(e){recordingPlayback=previousRecording;if(previousState)render(previousState);throw e}
    clientError='';updateErrors();
    if(frames.length>1)await startReplay();
    return true;
  }catch(e){if(token===loadEpoch)setClientError(e);return false}
}
$('playRecord').onclick=()=>loadRecording(async()=>responseJSON(await fetch('/api/recording'),I18N[lang].recordingLoadFailed));
$('openRecording').onchange=async e=>{
  const file=e.target.files[0];
  if(!file)return;
  try{
    await loadRecording(async()=>{
      if(file.size>100000000)throw Error(I18N[lang].recordingTooLarge);
      const raw=await file.text();
      try{return JSON.parse(raw)}catch{throw Error(I18N[lang].invalidRecording)}
    });
  }finally{e.target.value=''}
};

for(const role of ['trucks','scouts','extinguishers'])$('fleet-'+role).onchange=()=>{fleetDirty=true};
$('applyFleet').onclick=async()=>{
  const counts=Object.fromEntries(['trucks','scouts','extinguishers'].map(role=>[role,Number($('fleet-'+role).value)]));
  if(await act('fleet',{counts})){fleetDirty=false;render(state)}
};
$('addFire').onclick=()=>{if(!state||$('addFire').disabled)return;addingFire=!addingFire;renderFireControl(state)};
$('spreadFactor').oninput=()=>{spreadDirty=true;$('spreadFactorValue').textContent=`${$('spreadFactor').value}×`};
$('spreadFactor').onchange=async()=>{await act('spread_factor',{value:+$('spreadFactor').value});spreadDirty=false};
