/* Observation overlays: public geography and live group telemetry only. */
window.ObservationMap = (() => {
  const Z=10, W=800, palette={town:'#99bff1',farm:'#edc36e',refuge:'#b5efda'};
  const paths=Object.fromEntries(Object.entries(window.MapIconPaths).map(([k,values])=>[k,values.map(d=>new Path2D(d))]));
  function icon(c,name,x,y,size,color){
    c.save();c.translate(x,y);c.scale(size/16,size/16);c.fillStyle=color;
    for(const p of paths[name]||[])c.fill(p);c.restore();
  }
  function polygon(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x*Z,y*Z):c.moveTo(x*Z,y*Z));c.closePath();}
  function panel(c,x,y,w,h,stroke){
    c.fillStyle='#122e27f2';c.strokeStyle=stroke;c.lineWidth=1.2;
    c.beginPath();c.roundRect(x,y,w,h,8);c.fill();c.stroke();
  }
  function tag(c,x,y,label,color){
    c.font='600 9px system-ui';const w=c.measureText(label).width+12;
    x=Math.max(58,Math.min(W-w-8,x));panel(c,x,y-12,w,19,color);
    c.fillStyle=color;c.fillText(label,x+6,y);
  }
  function zones(c,s){
    if(!s.geography?.observation_zones)return;
    c.save();
    // The public terrain category is safe to show; never read heat/fuel here.
    if(s.geography.map_style!=='illustrated')for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){
      const kind=s.cells?.[y]?.[x]?.terrain;
      c.fillStyle=kind==='woodland'?'#123e2b55':kind==='field'?'#c8bc7520':'#00000000';
      if(kind==='woodland'||kind==='field')c.fillRect(x*Z,y*Z,Z,Z);
    }
    for(const zone of s.geography.observation_zones){
      const color=zone.color||palette[zone.kind]||palette.town;
      polygon(c,zone.polygon);c.fillStyle=color+'20';c.fill();
      c.strokeStyle=color;c.lineWidth=1.2;c.setLineDash(zone.kind==='farm'?[5,4]:[]);c.stroke();c.setLineDash([]);
      c.save();polygon(c,zone.polygon);c.clip();
      for(const [x,y] of zone.homes||[]) {
        icon(c,'house-door-fill',x*Z-1,y*Z+1,14,'#18362b');
        icon(c,'house-door-fill',x*Z,y*Z,12,zone.kind==='farm'?'#fff1d1':'#e4edff');
      }
      c.restore();
    }
    c.restore();
  }
  function labels(c,s){
    if(!s.geography?.observation_zones)return;
    c.save();
    const statusLabels={unwarned:'Unwarned',evacuating:'Evacuating',blocked:'Route blocked',safe:'Safe',burnt:'Burnt'};
    let townIndex=0;
    for(const zone of s.geography.observation_zones){
      const g=s.people?.[zone.id||zone.kind];if(!g)continue;
      const color=zone.color||palette[zone.kind],width=176;
      // Dock summaries in the upper margins; keep the central fire/route area clear.
      const x=zone.kind==='farm'?W-width-10:60;
      const y=zone.kind==='farm'?43:43+townIndex++*42;
      panel(c,x,y,width,35,color);icon(c,'people-fill',x+8,y+10,16,'#f3f5ee');
      c.font='700 10px system-ui';c.fillStyle='#f4f6ed';
      c.fillText((zone.name||'').toUpperCase(),x+31,y+13);
      c.font='600 9px system-ui';c.fillStyle=g.status==='burnt'?'#ffac99':g.status==='safe'?palette.refuge:'#f2d084';
      c.fillText(`${g.count.toLocaleString('en-US')} · ${statusLabels[g.status]||g.status}`,x+31,y+27);
      if(zone.anchor){
        c.font='700 9px system-ui';c.fillStyle=color;
        const labelX=zone.id==='town'?zone.anchor[0]+9:zone.anchor[0];
        const labelY=zone.id==='town'?zone.anchor[1]+4:zone.anchor[1];
        c.fillText(zone.short_name||zone.kind.toUpperCase(),labelX*Z+8,labelY*Z-9);
      }
      // Cards identify the home zone; this marker follows the group on evacuation.
      if(g.status==='evacuating'||g.status==='blocked'){
        icon(c,'people-fill',g.x*Z-9,g.y*Z-9,18,color);
        tag(c,g.x*Z+15,g.y*Z-15,`${zone.short_name||zone.kind} · ${g.count.toLocaleString('en-US')} ${g.status==='blocked'?'blocked':'moving'}`,color);
      }
    }
    const [bx,by]=s.base;
    if(s.geography.map_style!=='illustrated')icon(c,'building-fill',bx*Z-8,by*Z+43,19,'#f18566');
    tag(c,bx*Z+16,by*Z+(s.geography.map_style==='illustrated'?8:59),'Fire station','#fff0e3');
    const refuges=new Map();
    for(const [name,g] of Object.entries(s.people||{})){
      if(!g.refuge)continue;
      const kind=g.kind||(name==='farm'?'farm':'town'),key=g.refuge.join(',');
      const entry=refuges.get(key)||{position:g.refuge,kind,arrived:0};
      if(g.status==='safe')entry.arrived+=Math.max(0,g.count-(g.burnt||0));
      refuges.set(key,entry);
    }
    for(const r of refuges.values()){
      const x=r.position[0]*Z+5,y=r.position[1]*Z+5;
      c.strokeStyle=palette.refuge;c.fillStyle='#153c31';c.lineWidth=2.5;
      c.beginPath();c.moveTo(x,y-8);c.lineTo(x+8,y);c.lineTo(x,y+8);c.lineTo(x-8,y);c.closePath();c.fill();c.stroke();
      tag(c,x+15,y-12,`${r.kind==='town'?'Town':'Farm'} refuge · ${r.arrived.toLocaleString('en-US')} arrived`,palette.refuge);
    }
    c.restore();
  }
  return {zones,labels};
})();
