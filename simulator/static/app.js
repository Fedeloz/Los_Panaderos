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
let state, replayTimer, pending=false, windDirty=false, recordingPlayback=null;
const $=id=>document.getElementById(id);
async function act(action,extra={}){if(recordingPlayback&&action==='seek'){showRecorded(extra.index);return true}if(action==='live')recordingPlayback=null;try{const res=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-Simulator-Request':'1'},body:JSON.stringify({action,...extra})});const s=await res.json();if(!res.ok)throw Error(s.error);if(action==='reset'){recordingPlayback=null;windDirty=false}render(s);return true;}catch(e){$('error').hidden=false;$('error').textContent=e.message;return false;}}
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{stopReplay();act(b.dataset.action)});
$('play').onclick=()=>act(state.running?'pause':'play');$('speed').onchange=e=>act('speed',{speed:+e.target.value});
$('timeline').oninput=e=>{stopReplay();act('seek',{index:+e.target.value})};
$('back').onclick=()=>{stopReplay();act('seek',{index:Math.max(0,state.frame_index-1)})};$('forward').onclick=()=>act('seek',{index:Math.min(state.frame_count-1,state.frame_index+1)});
function stopReplay(){clearInterval(replayTimer);replayTimer=null;$('replayPlay').textContent='▶ Replay'}
$('replayPlay').onclick=async()=>{if(replayTimer){stopReplay();return}if(!state.replay||state.frame_index===state.frame_count-1)await act('seek',{index:0});$('replayPlay').textContent='Ⅱ Replay';replayTimer=setInterval(async()=>{if(pending)return;if(state.frame_index>=state.frame_count-1){stopReplay();return}pending=true;await act('seek',{index:state.frame_index+1});pending=false},250)};
function pixelMap(canvas,s,belief){window.AerialView.draw(canvas,s,belief)}
let addingFire=false;
$('addFire').onclick=()=>{addingFire=!addingFire;$('truth').classList.toggle('fire-placement',addingFire);$('addFire').setAttribute('aria-pressed',String(addingFire));$('addFire').textContent=addingFire?'🔥 Click map to ignite · ON':'🔥 Add fire on map'};
let fleetDirty=false;
for(const role of ['trucks','scouts','extinguishers'])$('fleet-'+role).onchange=()=>{fleetDirty=true};
$('applyFleet').onclick=async()=>{await act('fleet',{counts:Object.fromEntries(['trucks','scouts','extinguishers'].map(role=>[role,Number($('fleet-'+role).value)]))});fleetDirty=false};
function render(s){state=s;const counts=s.fleet_counts||{trucks:s.truck?1:0,extinguishers:s.drone?1:0,scouts:(s.scouts||[]).length};if(!fleetDirty||s.replay)for(const role of Object.keys(counts))$('fleet-'+role).value=counts[role];$('fleetSummary').textContent=`${counts.trucks} trucks · ${counts.scouts} scouts · ${counts.extinguishers} extinguisher drones`;const source=s.geography?.population_source;$('populationSource').hidden=!source;if(source)$('populationSource').textContent=`Brunete: ${source.official_total.toLocaleString('en-US')} residents (${source.reference_year} municipal census). District split is estimated; farm: ${source.farm_occupancy.count.toLocaleString('en-US')} assumed occupants. Illustrated map, not official district boundaries.`;$('belief').setAttribute('role','img');$('belief').setAttribute('aria-label','Observation map. '+Object.entries(s.people||{}).map(([name,g])=>`${g.name||name}: ${g.count} people, ${g.status}; refuge: ${g.status==='safe'?Math.max(0,g.count-(g.burnt||0)):0} arrived`).join('. '));$('error').hidden=!s.error;if(s.error)$('error').textContent=s.error;$('workflow').href=s.workflow_url;$('clock').textContent=`T+${s.tick} steps`;$('connection').textContent=s.reset_pending?'Reset queued · waiting for HappyRobot':s.busy?'HappyRobot deliberating · clock paused':s.replay?'Viewing recorded history':s.running?'Live · simulation running':'Paused';$('crew').textContent=s.truck?`Truck 1 · ${s.truck.status} · (${s.truck.x}, ${s.truck.y})`:'Truck at station';$('runs').textContent=`${s.workflow_calls} HappyRobot runs${s.latency?' · last '+s.latency+'s':''}`;$('play').textContent=s.running?'Ⅱ Pause':'▶ Play';if(!windDirty||s.replay){$('windX').value=s.wind[0];$('windY').value=s.wind[1];windDirty=false}updateWindPreview();for(const id of ['windX','windY','applyWind','calmWind','spreadFactor'])$(id).disabled=s.busy||s.replay;if(!spreadDirty||s.replay){$('spreadFactor').value=s.rules?.spread_factor??1;$('spreadFactorValue').textContent=`${$('spreadFactor').value}×`;}$('speed').value=s.speed;$('mission').textContent=s.mission;$('truthstats').textContent=`${s.burning} burning cells · ${s.extinguished} extinguished by drone · ${s.crew_extinguished} by crew`;$('beliefstats').textContent=`${s.observation.length} fires in shared view · ${s.drone?.observed_fire?.length||0} drone / ${s.truck?.observed_fire?.length||0} truck / ${(s.scouts||[]).reduce((n,d)=>n+(d.observed_fire?.length||0),0)} scouts · satellite ${s.satellite?`age ${s.tick-s.satellite.captured_at} steps, 8×8-cell blocks`:'not yet available'} · teal dots = safe flight positions`;$('timeline').max=s.frame_count-1;$('timeline').value=s.frame_index;$('replayPlay').disabled=s.frame_count<2;$('frame').textContent=s.replay?`Replay ${s.frame_index+1}/${s.frame_count}`:'Live';$('people').replaceChildren(...Object.entries(s.people).map(([name,g])=>{const el=document.createElement('span');el.className='person';el.textContent=`${g.name||name.toUpperCase()} · ${g.count.toLocaleString('en-US')} people · ${g.status==='burnt'?'0 unwarned':g.status} · Burnt: ${g.burnt||0}`;return el}));$('trail').replaceChildren(...s.history.slice().reverse().map(e=>{const row=document.createElement('div');row.className='entry';const b=document.createElement('b');b.textContent=`T+${e.tick} ${e.source==='drone-1'?'SQUIRTLE':e.source.toUpperCase()}`;const t=document.createElement('span');t.textContent=e.message;row.append(b,t);return row}));$('evidence').textContent=s.run_evidence||'No platform run yet.';document.querySelectorAll('.toolbar button,.toolbar select').forEach(b=>{b.disabled=(s.busy||s.replay)&&b.id!=='play'});for(const role of ['trucks','scouts','extinguishers'])$('fleet-'+role).disabled=s.ignited||s.busy||s.replay;$('applyFleet').disabled=s.ignited||s.busy||s.replay;$('addFire').disabled=s.replay||s.reset_pending;$('truth').classList.toggle('fire-placement',addingFire&&!s.replay&&!s.reset_pending);$('addFire').textContent=(addingFire?'🔥 Click map to ignite · ON':'🔥 Add fire on map')+(s.pending_fires?` · ${s.pending_fires} queued`:'');$('resetSim').disabled=!!s.reset_pending;$('resetSim').textContent=s.reset_pending?'↺ Reset queued…':'↺ Reset simulation';$('play').disabled=s.replay||s.busy&&!s.running;$('recordRun').disabled=s.busy||s.replay||s.recording;$('stopRecord').disabled=!s.recording;$('downloadRecord').disabled=!s.recorded_frames;$('playRecord').disabled=!s.recorded_frames||s.recording;$('recordRun').textContent=s.recording?`● Recording · ${s.recorded_frames} frames`:'● Run & record';pixelMap($('truth'),s,false);pixelMap($('belief'),s,true)}
async function poll(){try{if(recordingPlayback)return;const r=await fetch('/api/state');if(r.ok)render(await r.json())}catch(e){$('connection').textContent='Local server unavailable'}finally{setTimeout(poll,600)}}poll();

function updateWindPreview(){const x=+$('windX').value,y=+$('windY').value;$('windStrength').textContent=`Strength ${Math.hypot(x,y).toFixed(2)}${Math.hypot(x,y)>=2?" · strong":""}`;$('windPending').textContent=windDirty?'Preview · press Apply wind':'Applied wind';const px=43+Math.sign(x)*Math.sqrt(Math.abs(x)/3)*30,py=43+Math.sign(y)*Math.sqrt(Math.abs(y)/3)*30;$('windArrow').setAttribute('d',`M43 43 L${px} ${py}`);$('windTip').setAttribute('cx',px);$('windTip').setAttribute('cy',py)}
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
$('downloadRecord').onclick=async()=>{try{const r=await fetch('/api/recording');if(!r.ok)throw Error('Download failed');const blob=new Blob([JSON.stringify(await r.json())],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='los-panaderos-recording.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){$('error').hidden=false;$('error').textContent=e.message}};

function showRecorded(index){index=Math.max(0,Math.min(recordingPlayback.length-1,index));render({...state,...recordingPlayback[index],geography:recordingPlayback[index].geography??null,busy:false,running:false,replay:true,frame_index:index,frame_count:recordingPlayback.length,run_evidence:'Recorded simulation replay. No new HappyRobot calls.'})}
$('playRecord').onclick=async()=>{stopReplay();await act('pause');const r=await fetch('/api/recording');const recording=await r.json();if(!recording.frames?.length)return;recordingPlayback=recording.frames;showRecorded(0);$('replayPlay').click()};

$('openRecording').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>100000000)throw Error('Recording must be under 100 MB.');const data=JSON.parse(await file.text());if(data.format!=='los-panaderos-recording-v1'||!Array.isArray(data.frames)||!data.frames.length||data.frames.length>1500||data.frames.some(f=>f.width!==80||f.height!==56||!Array.isArray(f.cells)||f.cells.length!==56||f.cells.some(row=>!Array.isArray(row)||row.length!==80)||(!f.drone&&!Array.isArray(f.extinguishers))||!f.people||!Array.isArray(f.history)))throw Error('Invalid simulation recording.');stopReplay();await act('pause');recordingPlayback=data.frames;showRecorded(0);$('replayPlay').click()}catch(err){$('error').hidden=false;$('error').textContent=err.message}finally{e.target.value=''}};

$('spreadFactor').oninput=()=>{spreadDirty=true;$('spreadFactorValue').textContent=`${$('spreadFactor').value}×`};
$('spreadFactor').onchange=async()=>{await act('spread_factor',{value:+$('spreadFactor').value});spreadDirty=false};
