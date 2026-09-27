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
  function charredGround(c,x,y,burned,stale=false){
    if(!(burned>0))return;
    const severity=Math.min(1,Math.sqrt(burned)),px=x*Z,py=y*Z;
    c.save();c.globalAlpha=stale?.55:1;
    // Opaque charcoal patches replace the green terrain; fixed texture also replays cleanly.
    c.fillStyle=`rgba(21,19,18,${.45+severity*.5})`;c.fillRect(px,py,Z,Z);
    c.fillStyle=`rgba(5,6,6,${.25+severity*.4})`;
    c.fillRect(px+Math.floor(noise(x,y,31)*4),py+Math.floor(noise(x,y,32)*4),5,4);
    if(burned>.12){
      c.fillStyle=`rgba(162,153,139,${.2+severity*.3})`;
      c.fillRect(px+1+Math.floor(noise(x,y,33)*7),py+1+Math.floor(noise(x,y,34)*7),2,1);
      c.strokeStyle='#090a09';c.lineWidth=.8;c.beginPath();
      c.moveTo(px+2,py+2);c.lineTo(px+4,py+5);c.lineTo(px+3,py+8);c.stroke();
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
      for(const o of s.observed_cells||[]){charredGround(c,o.x,o.y,o.burned_fraction||0,o.observed_at!==s.tick);if(o.burning)fire(o.x,o.y,o.observed_at!==s.tick,o.intensity??1);else{c.fillStyle=o.observed_at===s.tick?'#aecfac0a':'#aecfac04';c.fillRect(o.x*Z,o.y*Z,Z,Z)}}
      for(const f of s.truck?.observed_fire||[]){const key=f.x+','+f.y;const old=fires.find(p=>p.x===f.x&&p.y===f.y);if(old)old.stale=false;else fire(f.x,f.y)}
      for(const [x,y] of s.satellite?.blocks||[]){c.fillStyle='#e0ae5b22';c.fillRect(x*Z,y*Z,80,80);c.strokeStyle='#d8b06977';c.strokeRect(x*Z,y*Z,80,80)}
    }else{
      for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){
        const cell=s.cells[y][x];const burned=cell.burned??(!cell.fuel?1:0);
        charredGround(c,x,y,burned);
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
    for(const [name,g] of Object.entries(s.people||{})){ellipse(c,g.x*Z+2,g.y*Z+3,4,2,'#182f2477');ellipse(c,g.x*Z,g.y*Z,2.5,3.2,g.status==='burnt'?'#a64335':g.status==='safe'?'#c1e99c':'#f5ead2');if(!belief&&g.status!=='unwarned')text(c,g.x*Z+7,g.y*Z,name.toUpperCase()+': '+(g.status==='safe'?'REFUGIO':g.status.toUpperCase()))}
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
let state, replayTimer, pollTimer, pending=false, windDirty=false, recordingPlayback=null, playbackMode=null, recording=false, lang=window.cecop?.lang||'es', busySince=0, setupCollapsed=false;
let frames=[],fleetDirty=false,addingFire=false,paintMode=false,expectedReset=false,sessionNotice='',sessionNoticeTimer;
let viewEpoch=0,requestsInFlight=0,loadEpoch=0,replayEpoch=0,replayStarting=false,clientError='',pollingError='';
// Simulacro presets (scenarios.js): label shown in the room header, runner state for the launch hero.
let scenarioLabel='',presetRunning=null,presetChecked=false,heroWind={x:1,y:0},heroSpread=0.5,heroFleet='1,1,1';
const $=id=>document.getElementById(id);
const I18N={
es:{eyebrow:'CENTRAL DE OPERACIONES · CECOP',subhead:'PROTECCIÓN CIVIL · EXTINCIÓN',setup:'Configuración avanzada',hint:'Configura la flota antes de empezar. Clic en el mapa para el origen, ignición, viento y aviso de humo. Durante el incidente, activa Añadir fuego para nuevos focos; la política de decisión los atiende en el siguiente ciclo.',truth:'Situación real',truthTag:'BRUNETE · TERRENO ILUSTRADO',truthCesiumTag:'BRUNETE · TERRENO ILUSTRADO',truthIllustratedTag:'BRUNETE · TERRENO ILUSTRADO',belief:'Lo que el sistema ve',beliefTag:'SENSORES + SATÉLITE RETARDADO',mission:'MISIÓN / ORDEN',trail:'COMUNICACIONES',inspect:'Registro técnico de la política de decisión',explain:'La política de decisión elige explorar, contener o avisar a cada distrito. Terreno ilustrado, fuego y satélite simulados. No es una predicción operativa.',footerNote:'Política de decisión determinista. Ilustración inspirada en Brunete; rejilla educativa, no Rothermel/Catastro. La reproducción no ejecuta la política.',workflow:'Flujo',watch:'Vigilancia',active:'Activo',busy:'POLÍTICA DE DECISIÓN EN CURSO · RELOJ EN PAUSA',live:'En curso',
launchEyebrow:'SIMULACRO CON DRONES',launchTitle:'Prepara el simulacro',launchText:'Elige las condiciones y pinta el origen del fuego sobre el terreno.',launchWind:'Viento',launchSpread:'Propagación',launchFleet:'Flota',launchStart:'Lanzar simulacro',launchManual:'Prefiero configurarlo a mano',windEast:'Este',windNorth:'Norte',windWest:'Oeste',windCalm:'Calma',spreadSlow:'Lenta 0.5×',spreadMedium:'Media 1×',spreadFast:'Rápida 2×',fleetBasic:'Básica 1·1·1',fleetReinforced:'Reforzada 2·1·1',fleetMaximum:'Máxima 2·2·1',callAlert:'📞 Llamada de aviso',paintHint:'🔥 Haz clic en el mapa para empezar el fuego',callingFarm:'Llamando · Granja El Álamo',preparing:'Preparando simulacro: {name}…',terrainNote:'terreno de simulación: Brunete · escenario ilustrado',paused:'Pausado',replay:'Reproducción',mapFallback:'Ilustración no georreferenciada · escala aproximada',firmsDown:'FIRMS no disponible',
kClock:'Reloj',kThreat:'Amenaza',kPeople:'PERSONAS EN RIESGO',kDrone:'Drones',kCrew:'Camiones',kAgents:'Agentes',
recordRun:'Iniciar grabación',stopRec:'Detener',playRec:'Reproducir grabación',download:'Descargar',openRec:'Abrir',ignite:'1 · Ignición',call:'2 · Aviso de humo',step:'+1',speed:'Velocidad',wind:'VIENTO',windHelp:'X este · Y sur · unidades demo',applyWind:'Aplicar',calmWind:'Calma',ask:'Preguntar a los agentes',reset:'↺ Reiniciar',liveBtn:'En vivo',spread:'Propagación',
windStrength:'Fuerza',windStrong:' · fuerte',windPreview:'Vista previa · pulsa Aplicar viento',windApplied:'Viento aplicado',
replayStart:'▶ Repetir',replayStop:'Ⅱ Repetir',playBtn:'Reproducir',pauseBtn:'Pausar',
legendSim:'Frente simulado (rejilla educativa)',legendFirms:'FIRMS · focos reales 24 h (NASA)',legendDrone:'Squirtle',legendScout:'Explorador',legendTruck:'Camión',legendArea:'Distritos ilustrados',
lblIgnition:'IGNICIÓN',lblRefuge:'REFUGIO',lblSmoke:'AVISO DE HUMO',lblEngine:'DOTACIÓN 1',lblDrone:'DRON 01',lblWind:'VIENTO',
viewTruth:'VISTA AÉREA · TERRENO SIMULADO',viewBelief:'OBSERVACIÓN / CAPA TÉRMICA',
cellsBurning:'celdas ardiendo',crewWord:'dotación',firesDrone:'fuegos (dron)',firesShared:'fuegos en vista compartida',droneWord:'dron',truckWord:'camión',satellite:'satélite',notYet:'aún no',tealHint:'puntos turquesa = posiciones seguras',
unwarnedLbl:'sin aviso',evacLbl:'evacuando',safeLbl:'a salvo',exposedLbl:'expuestos',
agentChain:'Política de decisión · Central → Exploración / Extinción',orderChannel:'POLÍTICA DE DECISIÓN · CENTRAL',mapPaused:'RELOJ EN PAUSA',
incidentActive:'Incidente en curso',incidentReady:'Incidente preparado',recordTools:'Archivo y reproducción',
radioChannel:'CANAL OPERATIVO',radioEmpty:'A la espera de comunicaciones.',
knowledgeNote:'Observaciones locales y satélite simulado retardado. No es el frente real.',
backFrame:'Fotograma anterior',forwardFrame:'Fotograma siguiente',recordedFrame:'Fotograma grabado',changeLanguage:'Switch to English',
serverUnavailable:'Servidor local no disponible',uiError:'Error de interfaz',downloadFailed:'No se pudo descargar',
recordingTooLarge:'La grabación debe ocupar menos de 100 MB.',invalidRecording:'Grabación de simulación no válida.',actionFailed:'No se pudo completar la solicitud.',recordingLoadFailed:'No se pudo cargar la grabación.',replayReadOnly:'Vuelve a En vivo para cambiar la simulación.',invalidFrame:'Fotograma no válido.',
recordingLabel:'Grabando',framesLabel:'fotogramas',resetQueued:'Reinicio en cola',resetPending:'reinicio al terminar la deliberación',sessionReset:'Sesión reiniciada por el servidor',resumeSim:'Reanudar simulacro',decisionsTitle:'DECISIONES DE LOS AGENTES',decisionsSubtitle:'Política de decisión determinista · validada por el simulador',accepted:'ACEPTADA',rejected:'RECHAZADA',missionLine:'Misión',reasonLine:'Motivo',noDecisions:'A la espera de decisiones.',
triggers:{farmer_call:'Aviso de humo',forecast_update:'Cambio de viento',local_observation:'Observación periódica',scout_fire_confirmation:'Explorador confirma fuego',scout_fire_report:'Nuevo foco observado',route_blocked:'Ruta bloqueada',manual_decision:'Petición manual',automatic_mode:'Modo automático',evacuation_warning_delivered:'Aviso entregado',command_rejected:'Corrección'},
populationSummary:'Brunete: {total} habitantes (padrón municipal {year}). Reparto por distritos estimado; granja: {farm} ocupantes supuestos, aparte del padrón. Ilustración no georreferenciada; límites no oficiales.',
peopleWord:'personas',refugeArrivals:'llegadas al refugio',
legendTown:'Viviendas urbanas',legendFarm:'Viviendas de granja',legendFields:'Cultivos',legendWoodland:'Bosque',legendRefuge:'Refugio',legendDistricts:'Distritos ficticios · terreno ilustrado',observationLegend:'Leyenda del mapa de observación',
archiveHeadline:'Reproducción · escenario histórico',archiveTag:'ARCHIVO · TERRENO DE LA GRABACIÓN',archiveNote:'Escenario histórico de la grabación; no representa el incidente actual de Brunete.',archiveCode:'ARCHIVO',
censusLink:'Ayuntamiento de Brunete · padrón 2025',censusAssumptions:'Distribución por distritos estimada; ocupación de granja y refugios supuestos.',pnoaIntro:'Ilustración adaptada de una referencia',
fleetTitle:'Medios de respuesta',fleetTrucks:'camiones',fleetScouts:'exploradores',fleetExtinguishers:'drones Squirtle',scoutsShort:'exploración',extinguishersShort:'Squirtle',applyFleet:'Aplicar flota',fleetHelp:'Configura antes de la ignición. Reinicia para cambiar los medios; los recuentos se conservan.',noVehicles:'Sin vehículos',addFire:'Añadir fuego en el mapa',addFireArmed:'Añadir fuego · ACTIVADO',addFireHint:'Modo ignición activado: clic en el mapa. Durante la deliberación, el fuego queda en cola.',queuedFires:'igniciones en cola',dispatchLabel:'DESPACHO',patrolAround:'alrededores',smokeAt:'Humo en',truckMobilizing:'Camión movilizándose',warningMoving:'en evacuación',warningDelivered:'Aviso entregado',scoutConfirms:'Explorador confirma fuego',newFire:'Nuevo foco',atRefuge:'en refugio',routeBlocked:'Ruta bloqueada · nueva aproximación',groupExposed:'Grupo alcanzado por el fuego',spreadingTitle:'🔥 Incendio en expansión',spreadingDetail:'{burning} celdas ardiendo · T+{tick}',extinguishedTitle:'✅ Incendio extinguido',extinguishedDetail:'T+{tick} · {extinguished} celdas por drones · {crew} por camiones · {safe} personas a salvo',exposedTitle:'⚠️ Población expuesta',exposedDetail:'{n} personas alcanzadas por el fuego',fireOutConnection:'Incendio extinguido · T+{tick}',
sources:{central:'Central',edge:'Agente dron',drone:'Dron','drone → truck':'Dron → Dotación','scout agent':'Agente explorador','scout → central':'Explorador → Central','drone-1':'Squirtle',system:'Sistema',simulation:'Simulación',dispatch:'Despacho',autopilot:'Navegación',weather:'Meteorología',farmer:'Avisante',people:'Población'}},
en:{eyebrow:'OPERATIONS CENTER · CECOP',subhead:'CIVIL PROTECTION · WILDLAND RESPONSE',setup:'Advanced setup',hint:'Configure the fleet before starting. Click the map for the origin, ignite, apply wind and send the smoke report. During the incident, enable Add fire for new ignitions; the decision policy handles them on the next cycle.',truth:'Actual situation',truthTag:'BRUNETE · ILLUSTRATED TERRAIN',truthCesiumTag:'BRUNETE · ILLUSTRATED TERRAIN',truthIllustratedTag:'BRUNETE · ILLUSTRATED TERRAIN',belief:'What the system sees',beliefTag:'SENSORS + DELAYED SATELLITE',mission:'MISSION / ORDER',trail:'COMMUNICATIONS',inspect:'Decision policy technical record',explain:'The decision policy chooses scouting, containment or district warnings. Illustrated terrain, simulated fire and satellite. Not an operational forecast.',footerNote:'Deterministic decision policy. Illustration inspired by Brunete; educational grid, not Rothermel/Catastro. Replay never runs the policy.',workflow:'Workflow',watch:'Watch',active:'Active',busy:'DECISION POLICY RUNNING · CLOCK PAUSED',live:'Live',
launchEyebrow:'DRONE SIMULATION',launchTitle:'Prepare the drill',launchText:'Choose the conditions and paint the fire origin on the terrain.',launchWind:'Wind',launchSpread:'Spread',launchFleet:'Fleet',launchStart:'Launch drill',launchManual:"I'd rather set it up manually",windEast:'East',windNorth:'North',windWest:'West',windCalm:'Calm',spreadSlow:'Slow 0.5×',spreadMedium:'Medium 1×',spreadFast:'Fast 2×',fleetBasic:'Basic 1·1·1',fleetReinforced:'Reinforced 2·1·1',fleetMaximum:'Maximum 2·2·1',callAlert:'📞 Alert call',paintHint:'Click the map to start the fire',callingFarm:'Calling · El Álamo Farm',preparing:'Preparing drill: {name}…',terrainNote:'simulation terrain: Brunete · illustrated scenario',paused:'Paused',replay:'Replay',mapFallback:'Non-georeferenced illustration · approximate scale',firmsDown:'FIRMS unavailable',
kClock:'Clock',kThreat:'Threat',kPeople:'PEOPLE AT RISK',kDrone:'Drones',kCrew:'Trucks',kAgents:'Agents',
recordRun:'Start recording',stopRec:'Stop',playRec:'Play recording',download:'Download',openRec:'Open',ignite:'1 · Ignite',call:'2 · Smoke report',step:'+1',speed:'Speed',wind:'WIND',windHelp:'X east · Y south · demo units',applyWind:'Apply',calmWind:'Calm',ask:'Ask agents',reset:'↺ Reset',liveBtn:'Live',spread:'Fire spread',
windStrength:'Strength',windStrong:' · strong',windPreview:'Preview · press Apply wind',windApplied:'Applied wind',
replayStart:'▶ Replay',replayStop:'Ⅱ Replay',playBtn:'Play',pauseBtn:'Pause',
legendSim:'Simulated front (educational grid)',legendFirms:'FIRMS · real 24 h hotspots (NASA)',legendDrone:'Squirtle',legendScout:'Scout',legendTruck:'Engine',legendArea:'Illustrated districts',
lblIgnition:'IGNITION',lblRefuge:'REFUGE',lblSmoke:'SMOKE REPORT',lblEngine:'ENGINE 1',lblDrone:'DRONE 01',lblWind:'WIND',
viewTruth:'AERIAL VIEW · SIMULATED TERRAIN',viewBelief:'OBSERVATION / THERMAL OVERLAY',
cellsBurning:'burning',crewWord:'crew',firesDrone:'fires (drone)',firesShared:'fires in shared view',droneWord:'drone',truckWord:'truck',satellite:'satellite',notYet:'n/a',tealHint:'teal dots = safe flight positions',
unwarnedLbl:'unwarned',evacLbl:'evacuating',safeLbl:'safe',exposedLbl:'exposed',
agentChain:'Decision policy · Central → Scout / Extinguisher',orderChannel:'DECISION POLICY · CENTRAL',mapPaused:'CLOCK PAUSED',
incidentActive:'Incident in progress',incidentReady:'Incident prepared',recordTools:'Archive and replay',
radioChannel:'OPERATIONS CHANNEL',radioEmpty:'Awaiting communications.',
knowledgeNote:'Local observations and delayed simulated satellite. Not the actual fire front.',
backFrame:'Previous frame',forwardFrame:'Next frame',recordedFrame:'Recorded frame',changeLanguage:'Cambiar a español',
serverUnavailable:'Local server unavailable',uiError:'UI error',downloadFailed:'Download failed',
recordingTooLarge:'Recording must be under 100 MB.',invalidRecording:'Invalid simulation recording.',actionFailed:'The request could not be completed.',recordingLoadFailed:'The recording could not be loaded.',replayReadOnly:'Return to Live to change the simulation.',invalidFrame:'Invalid frame.',
recordingLabel:'Recording',framesLabel:'frames',resetQueued:'Reset queued',resetPending:'reset after deliberation',sessionReset:'Session reset by the server',resumeSim:'Resume drill',decisionsTitle:'AGENT DECISIONS',decisionsSubtitle:'Deterministic decision policy · validated by the simulator',accepted:'ACCEPTED',rejected:'REJECTED',missionLine:'Mission',reasonLine:'Reason',noDecisions:'Awaiting decisions.',
triggers:{farmer_call:'Smoke report',forecast_update:'Wind change',local_observation:'Periodic observation',scout_fire_confirmation:'Scout confirms fire',scout_fire_report:'New fire observed',route_blocked:'Route blocked',manual_decision:'Manual request',automatic_mode:'Automatic mode',evacuation_warning_delivered:'Warning delivered',command_rejected:'Correction'},
populationSummary:'Brunete: {total} residents ({year} municipal census). District split is estimated; farm: {farm} assumed occupants, separate from the census. Illustration is not georeferenced; boundaries are not official.',
peopleWord:'people',refugeArrivals:'refuge arrivals',
legendTown:'Town homes',legendFarm:'Farm homes',legendFields:'Fields',legendWoodland:'Woodland',legendRefuge:'Refuge',legendDistricts:'Fictional districts · illustrated terrain',observationLegend:'Observation map legend',
archiveHeadline:'Replay · historical scenario',archiveTag:'ARCHIVE · RECORDED TERRAIN',archiveNote:'Historical recording scenario; not the current Brunete incident.',archiveCode:'ARCHIVE',
censusLink:'Brunete Town Council · 2025 census',censusAssumptions:'Estimated district allocations; assumed farm occupancy and refuges.',pnoaIntro:'Illustration adapted from a reference',
fleetTitle:'Response assets',fleetTrucks:'trucks',fleetScouts:'scouts',fleetExtinguishers:'Squirtle drones',scoutsShort:'scout',extinguishersShort:'Squirtle',applyFleet:'Apply fleet',fleetHelp:'Configure before ignition. Reset to change assets; counts are preserved.',noVehicles:'No vehicles',addFire:'Add fire on map',addFireArmed:'Add fire · ON',addFireHint:'Ignition mode on: click the map. Fires are queued during deliberation.',queuedFires:'queued ignitions',dispatchLabel:'DISPATCH',patrolAround:'surroundings',smokeAt:'Smoke at',truckMobilizing:'Truck mobilizing',warningMoving:'moving',warningDelivered:'Warning delivered',scoutConfirms:'Scout confirms fire',newFire:'New fire',atRefuge:'at refuge',routeBlocked:'Route blocked · new approach',groupExposed:'Group reached by fire',spreadingTitle:'🔥 Fire spreading',spreadingDetail:'{burning} cells burning · T+{tick}',extinguishedTitle:'✅ Fire out',extinguishedDetail:'T+{tick} · {extinguished} cells by drones · {crew} by trucks · {safe} people safe',exposedTitle:'⚠️ People exposed',exposedDetail:'{n} people reached by the fire',fireOutConnection:'Fire out · T+{tick}',
sources:{central:'Central',edge:'Drone agent',drone:'Drone','drone → truck':'Drone → Engine','scout agent':'Scout agent','scout → central':'Scout → Central','drone-1':'Squirtle',system:'System',simulation:'Simulation',dispatch:'Dispatch',autopilot:'Navigation',weather:'Weather',farmer:'Caller',people:'People'}}
};
const STATUS_I18N={
es:{at_station:'en base',mobilizing:'movilizando',en_route:'en ruta',suppressing:'suprimiendo',returning:'regresando',retreating:'replegando',blocked:'bloqueado',trapped:'atrapado',holding:'en espera',awaiting_assignment:'esperando misión',hold:'mantener',scout:'explorar',contain:'contener',warn:'avisar',patrol:'patrullando',continue:'continuar',on_scene:'en zona',evacuate_town:'avisar distrito',evacuate_farm:'avisar granja',attack_sector:'atacar sector',unwarned:'sin aviso',evacuating:'evacuando',safe:'a salvo',burnt:'expuestos'},
en:{at_station:'at station',mobilizing:'mobilizing',en_route:'en route',suppressing:'suppressing',returning:'returning',retreating:'retreating',blocked:'blocked',trapped:'trapped',holding:'holding',awaiting_assignment:'awaiting assignment',hold:'hold',scout:'scout',contain:'contain',warn:'warn',patrol:'patrolling',continue:'continue',on_scene:'on scene',evacuate_town:'warn district',evacuate_farm:'warn farm',attack_sector:'attack sector',unwarned:'unwarned',evacuating:'evacuating',safe:'safe',burnt:'exposed'}
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
function setPaintMode(on){
  paintMode=!!on;document.body.classList.toggle('is-painting',paintMode);
  const hint=$('paintHint');if(hint){hint.hidden=!paintMode;hint.textContent=I18N[lang].paintHint}
}
window.setPaintMode=setPaintMode;
function renderFireControl(s){
  const t=I18N[lang],queued=s.replay?0:(s.pending_fires||0);
  $('addFire').disabled=!!(s.replay||s.reset_pending||(s.ignited&&s.phase!=='active'));
  const placing=addingFire&&!$('addFire').disabled;
  $('addFire').setAttribute('aria-pressed',String(addingFire));
  $('addFire').textContent=(addingFire?t.addFireArmed:t.addFire)+(queued?` · ${queued} ${t.queuedFires}`:'');
  $('firePlacementHint').hidden=!placing;
  $('firePlacementHint').textContent=t.addFireHint;
  document.body.classList.toggle('is-adding-fire',placing);
  const call=$('callAlert');if(call){call.hidden=!(s.ignited&&!s.called&&!s.replay);call.disabled=!!s.busy;call.textContent=t.callAlert}
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
  $('headline').textContent=archived?t.archiveHeadline:(scenarioLabel||'Brunete · Madrid');
  const note=$('terrainNote');if(note){note.textContent=t.terrainNote;note.hidden=archived||!scenarioLabel}
  if (st.ready && window.AerialView && window.AerialView.forget) window.AerialView.forget($('truth'));
  if (st.ready) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  $('wx').hidden=true;
}
function applyLang(){window.cecop?.applyLang();const t=I18N[lang];document.documentElement.lang=lang;window.uiLang=lang;document.querySelectorAll('[data-i18n]').forEach(el=>{const v=t[el.dataset.i18n];if(v!==undefined)el.textContent=v});document.querySelectorAll('[data-i18n-aria-label]').forEach(el=>{const value=t[el.dataset.i18nAriaLabel];if(value)el.setAttribute('aria-label',value)});$('langToggle').textContent=lang==='es'?'EN':'ES';$('replayPlay').textContent=replayTimer||replayStarting?t.replayStop:t.replayStart;applyMapMode()}
function changeIncidentLanguage(next){lang=next;applyLang();if(state)render(state)}
window.cecop?.onLanguageChange(changeIncidentLanguage);
$('langToggle').onclick=()=>{const next=lang==='es'?'en':'es';if(window.cecop)window.cecop.setLang(next);else changeIncidentLanguage(next)};
function replayFrames(){return playbackMode==='imported'?recordingPlayback:frames}
function leaveReplay(){stopReplay();playbackMode=null;recordingPlayback=null;viewEpoch++}
async function goLive(){
  const previousMode=playbackMode,previousRecording=recordingPlayback,previousState=state;
  loadEpoch++;leaveReplay();
  try{const s=await responseJSON(await fetch('/api/state'),I18N[lang].serverUnavailable);pollingError='';clientError='';render(s);schedulePoll();return true}
  catch(e){playbackMode=previousMode;recordingPlayback=previousRecording;if(previousState)render(previousState);setClientError(e);return false}
}
let callEffectTimer;
function showCallEffect(s){
  const effect=$('callEffect'),farm=s?.farm;if(!effect||!Array.isArray(farm))return;
  clearTimeout(callEffectTimer);effect.style.left=`${farm[0]/80*100}%`;effect.style.top=`${farm[1]/56*100}%`;effect.hidden=false;effect.classList.remove?.('is-leaving');
  const label=effect.querySelector?.('span');if(label)label.textContent=I18N[lang].callingFarm;
  callEffectTimer=setTimeout(()=>{effect.classList.add('is-leaving');setTimeout(()=>{effect.hidden=true;effect.classList.remove?.('is-leaving')},800)},5200);
}
async function act(action,extra={},loadToken=null){
  if(action==='seek'){
    try{showRecorded(extra.index);clientError='';updateErrors();return true}catch(e){stopReplay();setClientError(e);return false}
  }
  if(action==='live')return goLive();
  if(loadToken===null)loadEpoch++;else if(loadToken!==loadEpoch)return false;
  if(state?.replay&&action!=='reset'){setClientError(I18N[lang].replayReadOnly);return false}
  if(action==='reset'){leaveReplay();frames=[];expectedReset=true;setPaintMode(false)}
  const epoch=++viewEpoch;
  requestsInFlight++;
  try{
    const res=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-Simulator-Request':'1'},body:JSON.stringify({action,...extra})});
    const s=await responseJSON(res,I18N[lang].actionFailed);
    if(epoch!==viewEpoch)return false;
    if(action==='reset'){windDirty=false;spreadDirty=false;fleetDirty=false;addingFire=false;if(!presetRunning)scenarioLabel=''}
    clientError='';pollingError='';render(s);
    if(action==='call')showCallEffect(s);
    if(typeof CustomEvent!=='undefined')window.dispatchEvent?.(new CustomEvent('cecop:action',{detail:{action,extra,ok:true}}));
    if(action==='play'){clearTimeout(pollTimer);pollTimer=setTimeout(poll,0)}else schedulePoll();
    return true;
  }catch(e){if(action==='reset')expectedReset=false;if(epoch===viewEpoch)setClientError(e);if(typeof CustomEvent!=='undefined')window.dispatchEvent?.(new CustomEvent('cecop:action',{detail:{action,extra,ok:false}}));return false}
  finally{requestsInFlight--}
}
window.act=act;
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>b.dataset.action==='live'?goLive():act(b.dataset.action));
$('play').onclick=()=>state&&act(state.running?'pause':'play');$('speed').onchange=e=>act('speed',{speed:+e.target.value});
$('timeline').oninput=e=>{stopReplay();showRecorded(+e.target.value)};
$('back').onclick=()=>{if(!state)return;stopReplay();showRecorded(Math.max(0,state.frame_index-1))};$('forward').onclick=()=>{if(!state)return;stopReplay();showRecorded(Math.min(replayFrames().length-1,state.frame_index+1))};
function stopReplay(){clearInterval(replayTimer);replayTimer=null;replayStarting=false;replayEpoch++;$('replayPlay').textContent=I18N[lang].replayStart}
async function startReplay(){
  const source=replayFrames();if(source.length<2||replayTimer||replayStarting)return;
  const epoch=++replayEpoch;
  replayStarting=true;$('replayPlay').textContent=I18N[lang].replayStop;
  if(!state?.replay||state.frame_index===source.length-1)showRecorded(0);
  if(epoch!==replayEpoch)return;
  replayTimer=setInterval(()=>{
    if(epoch!==replayEpoch)return;
    if(state.frame_index>=replayFrames().length-1){stopReplay();return}
    showRecorded(state.frame_index+1);
  },250);
  replayStarting=false;$('replayPlay').textContent=I18N[lang].replayStop;
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
// Transient notifications over the belief map for selected operational milestones.
// History is a sliding window (last 100), so we anchor on the newest previously seen entry
// and fall back to the previous length when that anchor has scrolled out.
const TOAST_MS=4500,TOAST_FADE=700,TOAST_MAX=3;
let toastCursor=null;
const trailKey=e=>`${e.tick}|${e.source}|${e.message}`;
function firstSentence(text){
  const raw=String(text||'').replace(/\s+/g,' ').trim();
  if(!raw)return '';
  const cut=raw.search(/[.!?](?:\s|$)/);
  return (cut>=0?raw.slice(0,cut+1):raw).trim();
}
function toastEvent(e){
  const src=e.source||'',msg=String(e.message||'').replace(/\s+/g,' ').trim();
  if(src==='farmer')return {icon:'📞',type:'farmer'};
  if(/confirms fire through shared sensors/i.test(msg))return {icon:'🔥',type:'confirmed'};
  if(/separate observed fire/i.test(msg))return {icon:'🔥',type:'newFire'};
  if(/Loudspeaker warning delivered/i.test(msg))return {icon:'📣',type:'warning'};
  if(/reached refuge/i.test(msg))return {icon:'🏠',type:'refuge'};
  if(/evacuation route blocked|cannot reach/i.test(msg))return {icon:'⛔',type:'blocked'};
  if(/fire reached the group/i.test(msg))return {icon:'⚠️',type:'exposed'};
  if(/Truck mobilizing/i.test(msg))return {icon:'🚒',type:'truck'};
  return null;
}
function toastHeadline(e,event=toastEvent(e)){
  if(!event)return '';
  const t=I18N[lang],msg=String(e.message||'').replace(/\s+/g,' ').trim();let m;
  if(event.type==='farmer')return (m=msg.match(/\((\d+),\s*(\d+)\)/))?`${t.smokeAt} (${m[1]}, ${m[2]})`:firstSentence(msg);
  if(event.type==='truck')return t.truckMobilizing;
  if(event.type==='warning'){
    const name=(msg.match(/delivered to ([^:]+)/i)||[])[1]?.trim(),count=(msg.match(/(\d[\d,]*)\s+people/i)||[])[1];
    return name?`${name}${count?` · ${count}`:''} ${t.warningMoving}`:t.warningDelivered;
  }
  if(event.type==='refuge')return (m=msg.match(/^(\S+):/))?`${m[1]} ${t.atRefuge}`:t.atRefuge;
  if(event.type==='blocked')return t.routeBlocked;
  if(event.type==='exposed')return (m=msg.match(/^(\S+):/))?`${m[1]} · ${t.groupExposed}`:t.groupExposed;
  if(event.type==='confirmed')return t.scoutConfirms;
  if((m=msg.match(/at\s+(\[[^\]]+\]|\([^)]+\))/)))return `${t.newFire} ${m[1]}`;
  return t.newFire;
}
function addToast(toast,lifetime=TOAST_MS){
  const host=$('beliefToasts');if(!host)return;
  host.replaceChildren(...[...host.children,toast].slice(-TOAST_MAX));
  setTimeout(()=>{toast.classList.add('is-leaving');setTimeout(()=>toast.remove?.(),TOAST_FADE)},lifetime);
}
function renderToasts(s){
  const host=$('beliefToasts');if(!host)return;
  const history=s.history||[];
  const newest=history.length?trailKey(history[history.length-1]):'';
  const incident=s.incident_id;
  // Recorded decisions follow simulation time, so pausing/scrubbing never loses
  // the explanation to a wall-clock timeout. Rebuild from this frame only.
  if(s.replay){
    const recent=history.filter(e=>e&&e.tick<=s.tick&&s.tick-e.tick<=10&&toastEvent(e)).slice(-TOAST_MAX);
    const key=JSON.stringify([incident,recent.map(trailKey)]);
    if(host.dataset.replayKey!==key){
      host.replaceChildren(...recent.map(e=>{
        const event=toastEvent(e),toast=document.createElement('div');toast.className=`toast source-${radioKind(e.source||'').kind}`;
        toast.textContent=`${event.icon} ${toastHeadline(e,event)}`;
        return toast;
      }));
      host.dataset.replayKey=key;
    }
    toastCursor=null;
    return;
  }
  if(host.dataset.replayKey){host.replaceChildren();delete host.dataset.replayKey}
  // First live frame and incident resets seed the cursor without replaying backlog.
  if(!toastCursor||toastCursor.incident!==incident){toastCursor={incident,newest,count:history.length};return}
  if(newest===toastCursor.newest&&history.length===toastCursor.count)return;
  // Diff by previous length so empty → first farmer/dispatch messages toast.
  // If the 100-entry window slid, take the newest few instead of a stale index.
  const start=history.length<toastCursor.count?Math.max(0,history.length-TOAST_MAX):toastCursor.count;
  toastCursor={incident,newest,count:history.length};
  for(const e of history.slice(start).filter(e=>e&&typeof e==='object')){
    const event=toastEvent(e);if(!event)continue;
    const toast=document.createElement('div');toast.className=`toast source-${radioKind(e.source||'').kind}`;toast.textContent=`${event.icon} ${toastHeadline(e,event)}`;addToast(toast);
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
function decisionList(s){
  if(Array.isArray(s.decisions))return s.decisions;
  return (s.mission_context||[]).map(item=>{const d=item.decision||{};return {tick:item.issued_at??0,trigger:d.trigger||'manual_decision',status:'accepted',mission:d.mission||'',reason:d.reason||'',orders:{extinguishers:d.extinguisher_orders||[],scouts:d.scout_orders||[],trucks:d.truck_orders||[]}}});
}
let decisionToastCursor=null,dispatchSeq=0;
function orderIdentity(order){return [order.command||'',Number.isFinite(order.target_x)?order.target_x:'',Number.isFinite(order.target_y)?order.target_y:'',order.district_id||''].join('|')}
function orderVehicle(order){return order.drone_id||order.truck_id||''}
function vehicleLabel(role,id,s){
  if(role==='extinguishers')return fleetVehicles(s).extinguishers.find(v=>v.drone_id===id)?.name||id||'Squirtle';
  return String(id||(role==='trucks'?'Engine-1':'Scout')).replace(/^(scout|engine|drone)-/i,(_,name)=>name[0].toUpperCase()+name.slice(1).toLowerCase()+'-');
}
function dispatchToastText(d,changed,s){
  const t=I18N[lang],groups=new Map();
  for(const {role,order} of changed){
    const target=Number.isFinite(order.target_x)&&Number.isFinite(order.target_y)?`(${order.target_x}, ${order.target_y})`:order.district_id||'';
    const key=[role,orderIdentity(order)].join('|');
    if(!groups.has(key))groups.set(key,{role,command:order.command||'',target,names:[]});
    groups.get(key).names.push(vehicleLabel(role,orderVehicle(order),s));
  }
  const icons={extinguishers:'🛸',scouts:'🔎',trucks:'🚒'};
  const lines=[...groups.values()].slice(0,3).map(group=>`${icons[group.role]} ${group.names.join(', ')} → ${statusText(group.command)}${group.command==='patrol'&&group.target===''?' '+t.patrolAround:''}${group.target?' '+group.target:''}`);
  return `${t.dispatchLabel} · T+${d.tick??0}\n${lines.join('\n')}`;
}
function showDispatchToast(text,delay=0){
  const host=$('beliefToasts');if(!host)return;
  const show=()=>{const toast=document.createElement('div');toast.className='toast toast-dispatch';toast.textContent=text;addToast(toast,6000);dispatchSeq+=1;if(typeof CustomEvent!=='undefined')window.dispatchEvent?.(new CustomEvent('cecop:dispatch',{detail:{text,seq:dispatchSeq}}))};
  if(delay)setTimeout(show,delay);else show();
}
function renderDispatchToasts(s){
  if(s.replay)return;const decisions=decisionList(s),incident=s.incident_id;
  if(!decisionToastCursor||decisionToastCursor.incident!==incident){decisionToastCursor={incident,count:decisions.length,lastTick:decisions.at(-1)?.tick??-1};return}
  const newestTick=decisions.at(-1)?.tick??-1;if(decisions.length<decisionToastCursor.count){decisionToastCursor={incident,count:decisions.length,lastTick:newestTick};return}
  const start=decisions.length>decisionToastCursor.count?decisionToastCursor.count:decisions.findIndex(d=>(d.tick??-1)>decisionToastCursor.lastTick),fresh=start>=0?decisions.slice(start):[];if(!fresh.length)return;
  decisionToastCursor={incident,count:decisions.length,lastTick:fresh.at(-1)?.tick??decisionToastCursor.lastTick};
  for(let i=0;i<fresh.length;i++){
    const index=start+i,previous=decisions[index-1],old=new Map();
    for(const role of ['extinguishers','scouts','trucks'])for(const order of previous?.orders?.[role]||[])old.set(orderVehicle(order),orderIdentity(order));
    const changed=[];for(const role of ['extinguishers','scouts','trucks'])for(const order of fresh[i].orders?.[role]||[])if(old.get(orderVehicle(order))!==orderIdentity(order))changed.push({role,order});
    if(changed.length)showDispatchToast(dispatchToastText(fresh[i],changed,s));
  }
}
function renderDecisions(s){
  const t=I18N[lang],decisions=decisionList(s).slice(-20).reverse(),rows=[];
  for(const d of decisions){
    const card=document.createElement('section');card.className='decision-card'+(d.status==='rejected'?' is-rejected':'');
    const head=document.createElement('div');head.className='decision-head';
    const title=document.createElement('strong');title.textContent=`T+${d.tick??0} · ${Object.hasOwn(t.triggers,d.trigger)?t.triggers[d.trigger]:d.trigger||''}`;
    const badge=document.createElement('span');badge.className='decision-badge';badge.textContent=d.status==='rejected'?t.rejected:t.accepted;head.append(title,badge);
    const mission=document.createElement('p');mission.className='decision-mission';mission.textContent=`${t.missionLine}: ${d.mission||'—'}`;
    const reason=document.createElement('p');reason.className='decision-reason';reason.textContent=`${t.reasonLine}: ${d.reason||'—'}`;
    card.append(head,mission,reason);
    const orders=d.orders||{};
    for(const order of [...(orders.extinguishers||[]),...(orders.scouts||[]),...(orders.trucks||[])]){
      const row=document.createElement('div');row.className='decision-order';
      const id=document.createElement('b');id.textContent=order.drone_id||order.truck_id||'—';
      const command=document.createElement('span');command.textContent=statusText(order.command||'');
      const target=document.createElement('span');target.textContent=Number.isFinite(order.target_x)&&Number.isFinite(order.target_y)?`(${order.target_x}, ${order.target_y})`:(order.district_id||'');
      const why=document.createElement('small');why.textContent=order.reason||'';row.append(id,command,target,why);card.append(row);
    }
    rows.push(card);
  }
  if(!rows.length){const empty=document.createElement('p');empty.className='radio-empty';empty.textContent=t.noDecisions;rows.push(empty)}
  $('decisions').replaceChildren(...rows);
}
const milestoneSeen=new Set();
let milestoneIncident=null,burningAtCall=null,tickAtCall=null,previousBurning=0,previousPhase='',previousIgnited=false,hadBurned=false,zeroBurningRenders=0,bannerTimer,bannerHideTimer;
function showBeliefBanner(title,detail){
  const host=$('beliefBanner');if(!host)return;
  clearTimeout(bannerTimer);clearTimeout(bannerHideTimer);host.replaceChildren();const heading=document.createElement('strong'),line=document.createElement('span');heading.textContent=title;line.textContent=detail;host.append(heading,line);host.hidden=false;host.classList.toggle('is-leaving',false);
  bannerTimer=setTimeout(()=>{host.classList.add('is-leaving');bannerHideTimer=setTimeout(()=>{host.hidden=true;host.classList.toggle('is-leaving',false)},TOAST_FADE)},6000);
}
function renderMilestones(s){
  const incident=s.incident_id||'',host=$('beliefBanner');
  if(milestoneIncident!==incident){milestoneIncident=incident;burningAtCall=null;tickAtCall=null;previousBurning=0;previousPhase='';previousIgnited=false;hadBurned=false;zeroBurningRenders=0;clearTimeout(bannerTimer);clearTimeout(bannerHideTimer);if(host){host.hidden=true;host.classList.toggle('is-leaving',false)}}
  if(s.replay){clearTimeout(bannerTimer);clearTimeout(bannerHideTimer);document.body.classList.toggle('is-spreading',false);if(host)host.hidden=true;return false}
  if(s.called&&burningAtCall===null){burningAtCall=Math.max(6,s.burning||0);tickAtCall=s.tick}
  if((s.burning||0)>0)hadBurned=true;
  zeroBurningRenders=s.burning===0&&hadBurned?zeroBurningRenders+1:0;
  const spreadByFire=(s.burning||0)>=40||burningAtCall!==null&&(s.burning||0)>=3*burningAtCall;
  const spreadByTime=s.called&&tickAtCall!==null&&s.tick-tickAtCall>=150;
  const spreading=!!(s.ignited&&s.phase==='active'&&(spreadByFire||spreadByTime));
  document.body.classList.toggle('is-spreading',!!(s.ignited&&s.phase==='active'&&spreadByFire));
  const burnt=Object.values(s.people||{}).reduce((n,g)=>n+(g.burnt||0),0);
  const safe=Object.values(s.people||{}).filter(g=>g.status==='safe').reduce((n,g)=>n+g.count,0);
  const extinguished=s.burning===0&&(((previousBurning>0||previousIgnited&&previousPhase==='active')&&s.phase!=='active')||hadBurned&&zeroBurningRenders>=2);
  const t=I18N[lang],key=type=>`${incident}:${type}`;let milestone;
  if(extinguished&&!milestoneSeen.has(key('extinguished')))milestone=['extinguished',t.extinguishedTitle,t.extinguishedDetail.replace('{tick}',s.tick).replace('{extinguished}',s.extinguished||0).replace('{crew}',s.crew_extinguished||0).replace('{safe}',safe)];
  else if(burnt>0&&!milestoneSeen.has(key('exposed')))milestone=['exposed',t.exposedTitle,t.exposedDetail.replace('{n}',burnt)];
  else if(spreading&&!milestoneSeen.has(key('spreading')))milestone=['spreading',t.spreadingTitle,t.spreadingDetail.replace('{burning}',s.burning||0).replace('{tick}',s.tick)];
  if(milestone){milestoneSeen.add(key(milestone[0]));showBeliefBanner(milestone[1],milestone[2])}
  previousBurning=s.burning||0;previousPhase=s.phase||'';previousIgnited=!!s.ignited;
  return milestoneSeen.has(key('extinguished'))&&s.burning===0;
}
function saveFrame(s){
  if(s.replay)return;
  const last=frames[frames.length-1];if(last&&last.tick===s.tick&&last.incident_id===s.incident_id)return;
  frames.push(JSON.parse(JSON.stringify(s)));if(frames.length>1500)frames.shift();
}
function render(s){
const changed=state&&state.incident_id!==s.incident_id;
if(changed&&!s.replay){
  frames=[];leaveReplay();
  if(!expectedReset){sessionNotice=I18N[lang].sessionReset;clearTimeout(sessionNoticeTimer);sessionNoticeTimer=setTimeout(()=>{sessionNotice='';if(state)render(state)},5000)}
}
if(expectedReset&&!s.replay){frames=[];expectedReset=false}
if(changed||s.replay){fleetDirty=false;addingFire=false}
saveFrame(s);state=s;window.state=s;updateErrors();$('clock').textContent=`T+${s.tick}`;
const t=I18N[lang],fireOut=renderMilestones(s);
const busy=!!s.busy&&!s.replay;
if(busy&&!busySince)busySince=Date.now();if(!busy)busySince=0;
const wait=busy&&busySince?` · ${Math.round((Date.now()-busySince)/1000)}s`:'';
$('connection').textContent=(fireOut&&t.fireOutConnection.replace('{tick}',s.tick)||sessionNotice||presetRunning&&t.preparing.replace('{name}',presetRunning)||busy&&t.busy+wait||s.replay&&t.replay||s.running&&t.live||t.paused);
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
const decisions=decisionList(s);$('runs').textContent=decisions.length||s.workflow_calls||0;
$('incidentCode').textContent=s.geography?.id||(s.replay?t.archiveCode:'ES-2026-BRUNETE');
const windSummary=`${t.wind} X ${Number(s.wind[0]).toFixed(2)} · Y ${Number(s.wind[1]).toFixed(2)}`;
const incidentSummary=s.replay?t.replay:s.called?t.incidentActive:t.incidentReady;
$('operatingSummary').textContent=`${incidentSummary} · ${windSummary}`;
$('setupSummary').textContent=`${t.setup} · ${incidentSummary} · ${windSummary}`;
// Advanced setup starts closed and only auto-closes on call; it never force-opens an empty room.
if(s.called&&!setupCollapsed){$('setupPanel').open=false;setupCollapsed=true}
if(!s.called&&setupCollapsed)setupCollapsed=false;
renderLaunchHero(s);
$('play').textContent=s.running?t.pauseBtn:t.playBtn;if(!windDirty||s.replay){$('windX').value=s.wind[0];$('windY').value=s.wind[1];windDirty=false}updateWindPreview();for(const id of ['windX','windY','applyWind','calmWind','spreadFactor'])$(id).disabled=s.busy||s.replay;if(!spreadDirty||s.replay){$('spreadFactor').value=s.rules?.spread_factor??0.5;$('spreadFactorValue').textContent=`${$('spreadFactor').value}×`;}$('speed').value=s.speed;$('mission').textContent=s.mission;$('truthstats').textContent=`${s.burning} ${t.cellsBurning} · ${s.extinguished} ${t.droneWord} · ${s.crew_extinguished} ${t.crewWord}`;const vehicles=fleetVehicles(s);
const source=replayFrames(),frameIndex=s.replay?s.frame_index:Math.max(0,source.length-1),frameCount=source.length;
$('beliefstats').textContent=`${s.observation.length} ${t.firesShared} · ${observedCount(vehicles.extinguishers)} ${t.extinguishersShort} / ${observedCount(vehicles.trucks)} ${t.truckWord} / ${observedCount(vehicles.scouts)} ${t.scoutsShort} · ${t.satellite} ${s.satellite?`t+${s.tick-s.satellite.captured_at}`:t.notYet} · ${t.tealHint}`;$('timeline').max=Math.max(0,frameCount-1);$('timeline').value=frameIndex;$('replayPlay').disabled=frameCount<2;$('back').disabled=$('forward').disabled=$('timeline').disabled=!frameCount;document.querySelector('[data-action="live"]').disabled=!s.replay;$('frame').textContent=s.replay?`${t.replay} ${frameIndex+1}/${frameCount}`:(recording?`${t.recordingLabel} · ${frames.length} ${t.framesLabel}`:t.live);$('people').replaceChildren(...Object.entries(s.people||{}).map(([name,g])=>{
  const el=document.createElement('span');
  el.className='person person-'+(g.status||'');
  const zone=(s.geography?.observation_zones||[]).find(z=>z.id===name);
  const label=g.short_name||g.name||zone?.short_name||zone?.name||name;
  el.textContent=`${label} · ${g.count.toLocaleString(lang==='es'?'es-ES':'en-US')} · ${statusText(g.status)}${g.burnt?` · ${g.burnt.toLocaleString(lang==='es'?'es-ES':'en-US')} ${t.exposedLbl}`:''}`;
  return el;
}));renderRadio(s);renderDecisions(s);document.querySelectorAll('.toolbar button,.toolbar select').forEach(b=>{if(b.id==='play'||b.id==='addFire'||b.id==='resetSim')return;b.disabled=s.replay});$('resetSim').disabled=!!s.reset_pending;$('resetSim').textContent=s.reset_pending?t.resetQueued:t.reset;renderFleet(s);renderFireControl(s);$('play').disabled=s.replay;$('recordRun').disabled=s.replay||recording;$('stopRecord').disabled=!recording;$('downloadRecord').disabled=!frames.length;$('playRecord').disabled=s.replay||!frames.length||recording;$('openRecording').disabled=s.replay;$('recordRun').textContent=recording?`${t.recordingLabel} · ${frames.length} ${t.framesLabel}`:t.recordRun;$('resumeSim').hidden=!(s.error&&!s.running);$('resumeSim').textContent=t.resumeSim;
applyMapMode();
try{pixelMap($('belief'),s,true);if(!$('truth').hidden)pixelMap($('truth'),s,false);renderTruthOverlay(s);renderToasts(s);renderDispatchToasts(s)}catch(e){console.error('Canvas render failed',e)}
if(typeof CustomEvent!=='undefined')window.dispatchEvent?.(new CustomEvent('cecop:state',{detail:s}))}
function inReplay(){return !!state?.replay}
function schedulePoll(){
  clearTimeout(pollTimer);pollTimer=null;
  if(state?.running&&!inReplay()&&!document.hidden&&!presetRunning)pollTimer=setTimeout(poll,1000);
}
async function poll(){
  clearTimeout(pollTimer);pollTimer=null;
  const epoch=viewEpoch;
  try{
    if(inReplay()||requestsInFlight)return;
    const s=await responseJSON(await fetch('/api/state'),I18N[lang].serverUnavailable);
    if(epoch!==viewEpoch||inReplay()||requestsInFlight)return;
    pollingError='';render(s);
    if(!presetChecked)startPresetFromQuery(s);
  }catch(e){
    if(epoch===viewEpoch&&!inReplay()&&!requestsInFlight){pollingError=I18N[lang].serverUnavailable;updateErrors();$('connection').textContent=pollingError}
  }finally{schedulePoll()}
}
document.addEventListener?.('visibilitychange',()=>{clearTimeout(pollTimer);pollTimer=null;if(!document.hidden&&!inReplay()&&state?.running&&!presetRunning)poll()});
// ── Simulacro presets ─────────────────────────────────────────────────────────
// A preset is a short ordered list of primitive actions (see scenarios.js). Optional steps
// (place_fire) may fail without aborting; any other failure stops and leaves act()'s error visible.
function stripScenarioQuery(){
  if(typeof location==='undefined'||!location.search)return;
  try{history?.replaceState?.(null,'',location.pathname)}catch{}
}
async function runPreset(preset){
  if(!preset||presetRunning)return false;
  presetRunning=preset.name||preset.id||'';stopReplay();addingFire=false;
  $('connection').textContent=I18N[lang].preparing.replace('{name}',presetRunning);
  renderLaunchHero(state);
  let ok=true;
  try{
    for(const step of window.Scenarios?.steps(preset)||[]){
      const done=await act(step.action,step.extra||{});
      if(!done&&!step.optional){ok=false;break}
    }
  }finally{
    presetRunning=null;
    if(ok)scenarioLabel=preset.name||preset.id||'';
    stripScenarioQuery();
    if(state)render(state);
    schedulePoll();
    if(ok)document.querySelector?.('.maps')?.scrollIntoView?.({behavior:'smooth',block:'start'});
  }
  return ok;
}
window.runPreset=runPreset;
async function runConditions(preset){
  if(!preset||presetRunning)return false;
  presetRunning=preset.name||preset.id||'';stopReplay();addingFire=false;setPaintMode(false);$('connection').textContent=I18N[lang].preparing.replace('{name}',presetRunning);renderLaunchHero(state);
  let ok=true;
  try{for(const step of (window.Scenarios?.steps(preset)||[]).filter(step=>['reset','fleet','wind','spread_factor'].includes(step.action))){if(!await act(step.action,step.extra||{})){ok=false;break}}}
  finally{presetRunning=null;if(ok){scenarioLabel='Brunete · Madrid';setPaintMode(true)}if(state)render(state);schedulePoll();if(ok){document.querySelector?.('.maps')?.scrollIntoView?.({behavior:'smooth',block:'start'});if(typeof CustomEvent!=='undefined')window.dispatchEvent?.(new CustomEvent('cecop:action',{detail:{action:'conditions',ok:true}}))}}
  return ok;
}
window.runConditions=runConditions;
function startPresetFromQuery(s){
  presetChecked=true;
  const search=typeof location!=='undefined'?location.search:'';
  const preset=window.Scenarios?.fromQuery?.(search);
  if(preset){runPreset(preset);return}
  // Every visit to the room starts a fresh incident: a previous fire is never carried over.
  if(s.ignited||s.called)act('reset');
}
function renderLaunchHero(s){
  const hero=$('launchHero');if(!hero)return;
  const empty=!!s&&!s.ignited&&!s.called&&!s.replay&&!presetRunning;
  hero.hidden=!empty;
  document.body.classList.toggle('is-empty-room',empty);
  for(const [selector,value] of [['[data-spread]',String(heroSpread)],['[data-fleet]',heroFleet]])document.querySelectorAll('#launchHero '+selector).forEach(b=>{const on=(b.dataset.spread||b.dataset.fleet)===value;b.classList.toggle('is-selected',on);b.setAttribute('aria-checked',String(on))});
  renderHeroCompass();
  const start=$('launchStart');if(start)start.disabled=presetRunning||!window.Scenarios;
}
// Hero compass: same drag maths as the advanced wind panel, but writes to heroWind {x,y}.
function renderHeroCompass(){
  const arrow=$('heroWindArrow'),tip=$('heroWindTip'),out=$('heroWindReadout');if(!arrow||!tip)return;
  const {x,y}=heroWind,px=43+Math.sign(x)*Math.sqrt(Math.abs(x)/3)*30,py=43+Math.sign(y)*Math.sqrt(Math.abs(y)/3)*30;
  arrow.setAttribute('d',`M43 43 L${px} ${py}`);tip.setAttribute('cx',px);tip.setAttribute('cy',py);
  if(out)out.textContent=`X ${x.toFixed(2)} · Y ${y.toFixed(2)} · ${I18N[lang].windStrength} ${Math.hypot(x,y).toFixed(2)}`;
  $('heroWindVector')?.setAttribute?.('aria-valuetext',`${x.toFixed(2)}, ${y.toFixed(2)}`);
}
function dragHeroWind(e){
  const svg=$('heroWindVector');if(!svg)return;const r=svg.getBoundingClientRect();
  const component=(p,start,size)=>{const n=Math.max(-1,Math.min(1,((p-start)/size*86-43)/30));return Math.round(Math.sign(n)*n*n*3/0.05)*0.05};
  heroWind={x:+component(e.clientX,r.left,r.width).toFixed(2),y:+component(e.clientY,r.top,r.height).toFixed(2)};renderHeroCompass();
}
if($('heroWindVector')){
  const svg=$('heroWindVector');
  let dragging=false;
  svg.onpointerdown=e=>{dragging=true;try{svg.setPointerCapture?.(e.pointerId)}catch{}dragHeroWind(e)};
  svg.onpointermove=e=>{if(dragging)dragHeroWind(e)};
  svg.onpointerup=svg.onpointercancel=e=>{dragging=false;try{svg.releasePointerCapture?.(e.pointerId)}catch{}};
  svg.onkeydown=e=>{const step={ArrowLeft:[-.25,0],ArrowRight:[.25,0],ArrowUp:[0,-.25],ArrowDown:[0,.25]}[e.key];if(!step)return;e.preventDefault?.();heroWind={x:Math.max(-3,Math.min(3,+(heroWind.x+step[0]).toFixed(2))),y:Math.max(-3,Math.min(3,+(heroWind.y+step[1]).toFixed(2)))};renderHeroCompass()};
}
if($('heroWindCalm'))$('heroWindCalm').onclick=()=>{heroWind={x:0,y:0};renderHeroCompass()};
document.querySelectorAll('#launchHero [data-spread]').forEach(b=>b.onclick=()=>{heroSpread=+b.dataset.spread;renderLaunchHero(state)});
document.querySelectorAll('#launchHero [data-fleet]').forEach(b=>b.onclick=()=>{heroFleet=b.dataset.fleet;renderLaunchHero(state)});
if($('launchStart'))$('launchStart').onclick=()=>{
  const p=window.Scenarios?.get('ES-2026-BRUNETE');if(!p)return;
  p.wind=[heroWind.x,heroWind.y];p.spread=heroSpread;const [trucks,scouts,extinguishers]=heroFleet.split(',').map(Number);p.fleet={trucks,scouts,extinguishers};
  runConditions(p);
};
if($('launchManual'))$('launchManual').onclick=e=>{e?.preventDefault?.();const panel=$('setupPanel');if(!panel)return;panel.open=true;panel.scrollIntoView?.({behavior:'smooth',block:'start'})};
// Surface any load-time failure instead of leaving an inert console.
window.addEventListener('error',e=>setClientError(I18N[lang].uiError+': '+(e.message||e.error)));
applyLang();
// The simulator must stay usable even if the map cannot start at all.
applyMapMode();poll();

function updateWindPreview(){const t=I18N[lang];const x=+$('windX').value,y=+$('windY').value;$('windXValue').textContent=x.toFixed(2);$('windYValue').textContent=y.toFixed(2);$('windStrength').textContent=`${t.windStrength} ${Math.hypot(x,y).toFixed(2)}${Math.hypot(x,y)>=2?t.windStrong:""}`;$('windPending').textContent=windDirty?t.windPreview:t.windApplied;const px=43+Math.sign(x)*Math.sqrt(Math.abs(x)/3)*30,py=43+Math.sign(y)*Math.sqrt(Math.abs(y)/3)*30;$('windArrow').setAttribute('d',`M43 43 L${px} ${py}`);$('windTip').setAttribute('cx',px);$('windTip').setAttribute('cy',py)}
for(const id of ['windX','windY'])$(id).oninput=()=>{windDirty=true;updateWindPreview()};
$('applyWind').onclick=()=>{const x=+$('windX').value,y=+$('windY').value;windDirty=false;act('wind',{x,y})};
$('calmWind').onclick=()=>{$('windX').value=0;$('windY').value=0;windDirty=true;updateWindPreview()};

async function paintFire(x,y){if(!await act('place_fire',{x,y})||!await act('ignite'))return false;setPaintMode(false);if(typeof CustomEvent!=='undefined')window.dispatchEvent?.(new CustomEvent('cecop:action',{detail:{action:'paint',extra:{x,y},ok:true}}));return true}
window.paintFire=paintFire;
$('truth').onclick=e=>{if(!state||state.reset_pending||state.replay||(state.busy&&!(state.ignited&&addingFire))||(state.ignited&&!addingFire))return;const r=e.currentTarget.getBoundingClientRect();const x=Math.floor((e.clientX-r.left)/r.width*state.width),y=Math.floor((e.clientY-r.top)/r.height*state.height);if(paintMode){paintFire(x,y);return}act(state.ignited?'add_fire':'place_fire',{x,y})};
if($('callAlert'))$('callAlert').onclick=()=>act('call');
function dragWind(e){if(!state||state.busy||state.replay)return;const r=$('windVector').getBoundingClientRect();const component=(p,start,size)=>{const n=Math.max(-1,Math.min(1,((p-start)/size*86-43)/30));return (Math.round(Math.sign(n)*n*n*3/0.05)*0.05).toFixed(2)};$('windX').value=component(e.clientX,r.left,r.width);$('windY').value=component(e.clientY,r.top,r.height);windDirty=true;updateWindPreview()}
$('windVector').onpointerdown=e=>{e.currentTarget.setPointerCapture(e.pointerId);dragWind(e)};
$('windVector').onpointermove=e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))dragWind(e)};
$('windVector').onpointerup=e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)};
$('recordRun').onclick=async()=>{
  leaveReplay();frames=[];recording=true;
  if(windDirty&&!await act('wind',{x:+$('windX').value,y:+$('windY').value})){recording=false;return}
  windDirty=false;updateWindPreview();
  if(!await act('ignite')||!await act('call'))recording=false;
};
$('stopRecord').onclick=async()=>{if(await act('pause'))recording=false;if(state)render(state)};
$('downloadRecord').onclick=()=>{try{const blob=new Blob([JSON.stringify({format:'los-panaderos-recording-v1',frames})],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='los-panaderos-recording.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setClientError(e)}};
$('resumeSim').onclick=()=>{clientError='';updateErrors();act('play')};

function showRecorded(index){
  const source=replayFrames();if(!source.length||!Number.isInteger(index))throw Error(I18N[lang].invalidFrame);
  playbackMode=playbackMode||'local';index=Math.max(0,Math.min(source.length-1,index));
  const frame=source[index],vehicles=fleetVehicles(frame);
  render({...frame,drone:frame.drone??vehicles.extinguishers[0]??null,truck:frame.truck??vehicles.trucks[0]??null,scouts:vehicles.scouts,extinguishers:vehicles.extinguishers,trucks:vehicles.trucks,fleet_counts:frame.fleet_counts??null,geography:frame.geography??null,pending_fires:0,busy:false,reset_pending:false,running:false,replay:true,frame_index:index,frame_count:source.length});
}
async function loadRecording(readData){
  stopReplay();
  const token=++loadEpoch;
  try{
    const data=await readData();
    if(token!==loadEpoch)return false;
    const frames=validateRecording(data);
    if(!await act('pause',{},token)||token!==loadEpoch)return false;
    const previousRecording=recordingPlayback,previousMode=playbackMode,previousState=state;
    viewEpoch++;recordingPlayback=frames;playbackMode='imported';
    try{showRecorded(0)}catch(e){recordingPlayback=previousRecording;playbackMode=previousMode;if(previousState)render(previousState);throw e}
    clientError='';updateErrors();
    if(frames.length>1)await startReplay();
    return true;
  }catch(e){if(token===loadEpoch)setClientError(e);return false}
}
$('playRecord').onclick=()=>{if(!frames.length){setClientError(I18N[lang].recordingLoadFailed);return false}stopReplay();playbackMode='local';showRecorded(0);return startReplay()};
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
