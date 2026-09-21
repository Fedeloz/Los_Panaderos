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
  const statusLabels={unwarned:'Unwarned',evacuating:'Evacuating',blocked:'Route blocked',safe:'Safe',burnt:'Burnt'};
  // Docked population cards: painted on the truth overlay only, so the real view names
  // each housing area while belief keeps its telemetry markers uncluttered.
  function districtCards(c,s){
    if(!s.geography?.observation_zones)return;
    c.save();
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
    }
    c.restore();
  }
  // Breadcrumbs per district so evacuation reads as a path rather than a teleport.
  // Positions arrive discretely per tick; a jump larger than a few cells means a reset or scrub.
  const trails=new Map();
  function breadcrumbs(key,g){
    if(g.status!=='evacuating'&&g.status!=='blocked'){trails.delete(key);return[]}
    let trail=trails.get(key);
    const last=trail?.[trail.length-1];
    if(last&&Math.hypot(last[0]-g.x,last[1]-g.y)>6)trail=null;
    if(!trail){trail=[];trails.set(key,trail)}
    if(!last||!trail.length||Math.hypot(last[0]-g.x,last[1]-g.y)>.3)trail.push([g.x,g.y]);
    if(trail.length>28)trail.splice(0,trail.length-28);
    return trail;
  }
  function evacuationPath(c,g,color,trail){
    const [hx,hy]=g.home||trail[0]||[g.x,g.y],[rx,ry]=g.refuge||[g.x,g.y];
    c.save();
    // Planned route: home to refuge, dashed in the district colour.
    c.strokeStyle=color;c.globalAlpha=.55;c.lineWidth=1.4;c.setLineDash([6,5]);
    c.beginPath();c.moveTo(hx*Z+5,hy*Z+5);c.lineTo(rx*Z+5,ry*Z+5);c.stroke();c.setLineDash([]);
    // Ground covered so far: brightening crumbs behind the group.
    for(let i=0;i<trail.length;i++){
      const [tx,ty]=trail[i],a=.15+.6*(i/Math.max(1,trail.length-1));
      c.globalAlpha=a;c.fillStyle=color;c.beginPath();c.arc(tx*Z+5,ty*Z+5,1.8,0,Math.PI*2);c.fill();
    }
    if(g.status==='blocked'){c.globalAlpha=.9;c.strokeStyle='#ffac99';c.lineWidth=2;c.beginPath();c.moveTo(g.x*Z-6,g.y*Z-6);c.lineTo(g.x*Z+16,g.y*Z+16);c.moveTo(g.x*Z+16,g.y*Z-6);c.lineTo(g.x*Z-6,g.y*Z+16);c.stroke()}
    c.restore();
  }
  function labels(c,s){
    if(!s.geography?.observation_zones)return;
    c.save();
    for(const zone of s.geography.observation_zones){
      const key=zone.id||zone.kind,g=s.people?.[key];if(!g)continue;
      const color=zone.color||palette[zone.kind];
      if(zone.anchor){
        c.font='700 9px system-ui';c.fillStyle=color;
        const [labelX,labelY]=zone.map_label||zone.anchor;
        c.fillText(zone.short_name||zone.kind.toUpperCase(),labelX*Z+8,labelY*Z-9);
      }
      // The truth-side cards identify the home zone; this marker follows the group on evacuation.
      const trail=breadcrumbs(key,g);
      if(g.status==='evacuating'||g.status==='blocked'){
        evacuationPath(c,g,color,trail);
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
      const entry=refuges.get(key)||{position:g.refuge,kind,arrived:0,districts:[]};
      if(g.status==='safe')entry.arrived+=Math.max(0,g.count-(g.burnt||0));
      entry.districts.push(g.name||name);
      refuges.set(key,entry);
    }
    for(const r of refuges.values()){
      const x=r.position[0]*Z+5,y=r.position[1]*Z+5;
      c.strokeStyle=palette.refuge;c.fillStyle='#153c31';c.lineWidth=2.5;
      c.beginPath();c.moveTo(x,y-8);c.lineTo(x+8,y);c.lineTo(x,y+8);c.lineTo(x-8,y);c.closePath();c.fill();c.stroke();
      // One muster point per district now, so name it instead of four identical "Town refuge" tags.
      const who=`Refugio · ${r.districts.length===1?r.districts[0]:r.kind==='town'?'Pueblo':'Granja'}`;
      tag(c,x+15,y-12,`${who} · ${r.arrived.toLocaleString('en-US')} arrived`,palette.refuge);
    }
    c.restore();
  }
  return {zones,labels,districtCards};
})();
