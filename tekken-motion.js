(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TekkenMotion=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const lerp=(a,b,t)=>a+(b-a)*t,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 class Timeline{
  constructor(delay=65){this.delay=delay;this.frames=[];}
  clear(){this.frames=[];}
  push(state,at){if(!state)return;const frame={at,phase:state.phase,round:state.round,freeze:state.freeze,players:state.players.map(p=>({...p,attack:p.attack?{...p.attack}:null}))};if(this.frames.at(-1)?.round!==frame.round||this.frames.at(-1)?.phase!==frame.phase)this.frames=[];this.frames.push(frame);this.frames=this.frames.slice(-10);}
  sample(now,ownUid,intent){if(!this.frames.length)return null;const last=this.frames.at(-1);return last.players.map((p,i)=>{
   const time=p.uid===ownUid?now:now-this.delay;let a=this.frames[0],b=last;for(let j=0;j<this.frames.length;j++){if(this.frames[j].at<=time)a=this.frames[j];if(this.frames[j].at>=time){b=this.frames[j];break;}}
   const span=b.at-a.at,t=span>0?clamp((time-a.at)/span,0,1):1,pa=a.players[i]||p,pb=b.players[i]||p,display={...pb};for(const key of ['x','y','vx','vy','poseTime'])display[key]=lerp(pa[key]||0,pb[key]||0,t);
   let phaseA=pa.walkPhase||0,phaseB=pb.walkPhase||0;if(phaseB<phaseA-.5)phaseB++;display.walkPhase=lerp(phaseA,phaseB,t)%1;
   if(pa.attack&&pb.attack&&pa.attack.id===pb.attack.id)display.attack={...pb.attack,t:lerp(pa.attack.t,pb.attack.t,t)};
   const extra=clamp((time-last.at)/1000,0,.065);if(time>last.at&&last.phase==='playing'&&!last.freeze){display.x=clamp(p.x+(p.vx||0)*extra,62,1038);display.y=Math.max(0,(p.y||0)+(p.vy||0)*extra-775*extra*extra);if(display.attack)display.attack={...display.attack,t:Math.min(display.attack.duration,display.attack.t+extra)};display.poseTime=(p.poseTime||0)+extra;display.walkPhase=((p.walkPhase||0)+Math.abs(p.vx||0)*extra/100)%1;}
   if(p.uid===ownUid&&intent?.axis&&!intent.guard&&!p.attack&&!p.stun&&last.phase==='playing')display.x=clamp(display.x+intent.axis*8,62,1038);
   return display;
  });}
 }
 function sequence(p){
  const a=p.attack;if(a){
   const t=clamp(a.t/a.duration,0,.999),attack=(index)=>({sheet:'attack',index,loop:false});
   if(a.move==='special'){
    const charge=.11;if(a.t<charge)return{sheet:'reaction',index:4+a.t/charge,loop:false};
    const hits=[[.28,.47],[.25,.4,.56],[.43],[.26,.48]][p.character],kick=p.character===1||p.character===3;
    let cycle=0;while(cycle<hits.length-1&&a.t>(hits[cycle]+hits[cycle+1])/2)cycle++;
    const from=cycle?(hits[cycle-1]+hits[cycle])/2:charge,to=cycle<hits.length-1?(hits[cycle]+hits[cycle+1])/2:a.duration,contact=kick?6:5;
    const index=a.t<hits[cycle]?clamp((a.t-from)/(hits[cycle]-from),0,1)*contact:contact+clamp((a.t-hits[cycle])/(to-hits[cycle]),0,.999)*(11.99-contact);
    return attack((kick?12:0)+index);
   }
   if(a.move==='launcher')return{sheet:'launcher',index:t<.305?t/.305*3:3+(t-.305)/.695*2.99,loop:false};
   if(a.move==='kick'){const contact=.24/.63;return attack(12+(t<contact?t/contact*6:6+(t-contact)/(1-contact)*5.99));}
   return attack(t*11.99);
  }
  if(p.pose==='guard')return{sheet:'reaction',index:Math.min(.99,(p.poseTime||0)*4),loop:false};
  if(p.pose==='hurt')return{sheet:'reaction',index:2+Math.min(.99,(p.poseTime||0)*6),loop:false};
  if(p.pose==='jump')return{sheet:'air',index:p.vy>80?1+clamp((565-p.vy)/485,0,1)*2:p.vy> -80?3:4+clamp(1-(p.y||0)/75,0,.99),loop:false};
  if(p.pose==='land')return{sheet:'air',index:5,loop:false};
  if(p.pose==='dash')return{sheet:'reaction',index:5,loop:false};
  if(p.pose==='walk')return{sheet:'base',index:6+(p.walkPhase||0)*5.99,loop:true};
  return{sheet:'base',index:((p.poseTime||0)*5)%6,loop:true};
 }
 function silhouettes(data,w,h,cols,rows){
  const n=w*h,labels=new Int32Array(n),queue=new Int32Array(n),parts=[],seams=new Uint8Array(n);let label=0;
  // A few generated cels touch across rows. Split at the sparsest horizontal
  // gap near each boundary, preserving the shoes that extend below the grid.
  for(let row=1;row<rows;row++)for(let col=0;col<cols;col++){
   const x0=Math.floor(col*w/cols),x1=Math.floor((col+1)*w/cols),boundary=Math.floor(row*h/rows);let best=Infinity,seam=boundary;
   for(let y=Math.max(0,boundary-8);y<Math.min(h,boundary+64);y++){let count=0;for(let x=x0;x<x1;x++)if(data[(y*w+x)*4+3]>=180)count++;if(count<best){best=count;seam=y;}}
   for(let x=x0;x<x1;x++)seams[seam*w+x]=1;
  }
  for(let index=0;index<n;index++){if(labels[index]||seams[index]||data[index*4+3]<180)continue;label++;let head=0,tail=1,minX=w,minY=h,maxX=0,maxY=0;queue[0]=index;labels[index]=label;
   while(head<tail){const q=queue[head++],x=q%w,y=Math.floor(q/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(const next of [x>0?q-1:-1,x<w-1?q+1:-1,y>0?q-w:-1,y<h-1?q+w:-1])if(next>=0&&!labels[next]&&!seams[next]&&data[next*4+3]>=180){labels[next]=label;queue[tail++]=next;}}
   parts.push({label,count:tail,minX,minY,maxX,maxY});
  }
  const frames=Array(cols*rows).fill(null);for(const part of parts){const col=clamp(Math.floor((part.minX+part.maxX)/2/(w/cols)),0,cols-1),row=clamp(Math.floor((part.minY+part.maxY)/2/(h/rows)),0,rows-1),index=row*cols+col;if(part.count>(frames[index]?.count||0))frames[index]=part;}
  // Grow each silhouette only through its soft alpha edge. Separate body parts
  // remain attached across grid boundaries instead of being cut at a row seam.
  const distance=new Uint8Array(n);distance.fill(255);let head=0,tail=0;for(let i=0;i<n;i++)if(labels[i]){distance[i]=0;queue[tail++]=i;}
  while(head<tail){const q=queue[head++];if(distance[q]>=4)continue;const x=q%w,y=Math.floor(q/w);for(const next of [x>0?q-1:-1,x<w-1?q+1:-1,y>0?q-w:-1,y<h-1?q+w:-1])if(next>=0&&distance[next]===255){distance[next]=distance[q]+1;labels[next]=labels[q];queue[tail++]=next;}}
  return{frames,labels};
 }
 function createRenderer(canvas,E,onLoad){
  const ctx=canvas.getContext('2d',{alpha:false}),assets={},atlases={},smooth=new Map(),effects=[],particles=[],trail=[],roster=E.ROSTER;
  let width=0,height=0,dpr=1,last=0,cameraX=550,zoom=1,shake=0,flash=0,flashColor='#fff',lastEvent=0,freezeUntil=0,loaded=0,total=14;
  const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  function metrics(im,cols,rows){
   const w=im.naturalWidth,h=im.naturalHeight,off=document.createElement('canvas');off.width=w;off.height=h;const oc=off.getContext('2d',{willReadFrequently:true});oc.drawImage(im,0,0);const pixels=oc.getImageData(0,0,w,h),data=pixels.data,parts=silhouettes(data,w,h,cols,rows);
   const frames=parts.frames.map(part=>{
    if(!part||part.count<100)throw Error('Missing fighter cel');
    const x=Math.max(0,part.minX-4),y=Math.max(0,part.minY-4),fw=Math.min(w-1,part.maxX+4)-x+1,fh=Math.min(h-1,part.maxY+4)-y+1,cel=document.createElement('canvas');cel.width=fw;cel.height=fh;const c=cel.getContext('2d'),image=c.createImageData(fw,fh);let sum=0,count=0;
    for(let py=0;py<fh;py++)for(let px=0;px<fw;px++){const q=(y+py)*w+x+px;if(parts.labels[q]!==part.label)continue;const a=q*4,b=(py*fw+px)*4;image.data[b]=data[a];image.data[b+1]=data[a+1];image.data[b+2]=data[a+2];image.data[b+3]=data[a+3];if(data[a+3]>180&&py>=(part.maxY-part.minY)*.48&&py<=(part.maxY-part.minY)*.66){sum+=px;count++;}}
    c.putImageData(image,0,0);return{im:cel,sx:0,sy:0,cw:fw,ch:fh,root:count?sum/count:fw/2,foot:part.maxY-y,bodyHeight:part.maxY-part.minY};
   });return{cols,rows,frames,baseHeight:frames.slice(0,6).map(f=>f.bodyHeight).sort((a,b)=>a-b)[3]||h/rows*.8};
  }
  function load(key,path,cols,rows){return new Promise(resolve=>{const im=new Image();im.onload=()=>{try{if(cols)atlases[key]=metrics(im,cols,rows);else assets[key]=im;loaded++;onLoad?.(loaded,total);resolve(true);}catch(_){loaded++;onLoad?.(loaded,total,key);resolve(false);}};im.onerror=()=>{loaded++;onLoad?.(loaded,total,key);resolve(false);};im.src=path;});}
  const ready=Promise.all([...roster.flatMap(c=>[load(c.id,'assets/tekken/v2/'+c.id+'.png',6,4),load(c.id+'-attack','assets/tekken/v2/'+c.id+'-attacks.png',4,6)]),load('air','assets/tekken/v2/air.png',6,4),load('launcher','assets/tekken/v2/launcher.png',6,4),load('reaction','assets/tekken/v2/reactions.png',6,4),load('vfx','assets/tekken/v2/vfx.png'),load('arena','assets/tekken/arena.png'),load('portraits','assets/tekken/v2/portraits.png')]);
  function reset(){lastEvent=0;smooth.clear();effects.length=0;particles.length=0;trail.length=0;freezeUntil=0;cameraX=550;zoom=1;}
  function emit(event,now){if(event.id<=lastEvent)return;lastEvent=event.id;const color=roster[event.character??0]?.color||'#fff';if(['hit','block'].includes(event.kind)){const special=event.move==='special';effects.push({...event,born:now,color,duration:event.kind==='block'?.28:special?.52:.35});if(!reduced){shake=Math.max(shake,event.kind==='block'?1:special?7:3.5);flash=event.kind==='block'?.025:special?.1:.045;flashColor=color;freezeUntil=now+(special?50:28);}for(let j=0;j<(special?24:12);j++){const angle=(j*2.399)+(event.id%5),speed=(special?230:140)*(0.55+(j%5)/7);particles.push({x:event.x,y:365-(event.y||0),vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-50,born:now,life:.25+(j%4)*.075,color,size:1.5+(j%3)});}}
   if(event.kind==='land')for(let j=0;j<9;j++)particles.push({x:event.x,y:515,vx:(j-4)*20,vy:-15-j%3*12,born:now,life:.3,color:'#e5c69b',size:1.5});
  }
  function sprite(p,frame,alpha,offset=0){const c=roster[p.character],seq=sequence(p);let sheet=atlases[c.id],index=frame;if(seq.sheet==='attack'&&atlases[c.id+'-attack'])sheet=atlases[c.id+'-attack'];else if(['reaction','air','launcher'].includes(seq.sheet)&&atlases[seq.sheet]){sheet=atlases[seq.sheet];index=p.character*6+frame;}
   const f=sheet?.frames[index];if(!f||alpha<.01)return;const base=seq.sheet==='attack'?sheet.frames[0].bodyHeight:['reaction','air','launcher'].includes(seq.sheet)?(seq.sheet==='air'?atlases.reaction?.frames[p.character*6].bodyHeight:seq.sheet==='launcher'?sheet.frames[p.character*6+5].bodyHeight:sheet.frames[p.character*6].bodyHeight):atlases[c.id]?.baseHeight||f.bodyHeight,h=330*c.size,scale=h/base;ctx.globalAlpha=alpha;
   ctx.drawImage(f.im,f.sx,f.sy,f.cw,f.ch,-f.root*scale+offset,-f.foot*scale,f.cw*scale,f.ch*scale);
  }
  function fighter(p,index,now,dt,preview=false,ghostAlpha=0){const c=roster[p.character];if(!atlases[c.id])return;const key=preview?'preview':p.uid;let r=ghostAlpha?{x:p.x,y:p.y||0}:smooth.get(key);if(!r){r={x:p.x,y:p.y||0};smooth.set(key,r);}const amount=1-Math.exp(-dt*(preview?16:24));r.x=lerp(r.x,p.x,amount);r.y=lerp(r.y,p.y||0,amount);
   ctx.save();ctx.translate(r.x,515);const shadowScale=clamp(1-(p.y||0)/260,.35,1);if(!ghostAlpha){ctx.fillStyle='#08091170';ctx.beginPath();ctx.ellipse(0,0,55*shadowScale,9*shadowScale,0,0,Math.PI*2);ctx.fill();}ctx.translate(0,-r.y);ctx.scale(p.facing||1,1);
   const breath=Math.sin((p.poseTime||0)*4)*.004,bob=p.pose==='walk'?Math.sin((p.walkPhase||0)*Math.PI*2)*2:0;ctx.translate(0,bob);if(preview)ctx.scale(1.22,1.22);ctx.scale(1+breath,1-breath);if(p.pose==='dash')ctx.transform(1,0,-.13,1,0,0);if(p.pose==='hurt')ctx.rotate(-Math.min(.075,(p.stun||0)*.16));
   // Preserve a crisp silhouette: blending complete generated poses produces
   // duplicate heads and limbs. Translation and root motion remain continuous.
   const seq=sequence(p);sprite(p,Math.floor(seq.index),ghostAlpha||1);
   if(p.attack?.move==='special'&&p.attack.t<.28){ctx.globalAlpha=.3+Math.sin(now/30)*.1;ctx.strokeStyle=c.color;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,-115,68,150,0,0,Math.PI*2);ctx.stroke();}
   ctx.restore();
  }
  function draw(state,display,selected,now){const dt=last?Math.min((now-last)/1000,.05):1/60;last=now;const rect=canvas.getBoundingClientRect();if(rect.width!==width||rect.height!==height||dpr!==Math.min(devicePixelRatio||1,2)){width=rect.width;height=rect.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle='#14121c';ctx.fillRect(0,0,width,height);
   if(assets.arena){const im=assets.arena,scale=Math.max(width/im.width,height/im.height),w=im.width*scale,h=im.height*scale;ctx.drawImage(im,(width-w)/2-(cameraX-550)*.025,(height-h)/2,w,h);}
   const shade=ctx.createLinearGradient(0,0,0,height);shade.addColorStop(0,'#080b1c88');shade.addColorStop(.38,'#080b1c00');shade.addColorStop(1,'#080b1c70');ctx.fillStyle=shade;ctx.fillRect(0,0,width,height);
   const active=!!state,ps=display||state?.players,target=active?(ps[0].x+ps[1].x)/2:550;cameraX=lerp(cameraX,clamp(target,450,650),1-Math.exp(-dt*3));zoom=lerp(zoom,active?clamp(1.19-Math.abs(ps[0].x-ps[1].x)/2100,1,1.13):1,1-Math.exp(-dt*3));const scale=height/620*zoom;
   ctx.save();ctx.translate(width/2-cameraX*scale,height*.831-515*scale);ctx.scale(scale,scale);if(shake>.15&&!reduced)ctx.translate(Math.sin(now*1.7)*shake,Math.cos(now*.91)*shake*.45);shake*=Math.exp(-dt*22);
   if(active){const frozen=now<freezeUntil;const rendered=frozen&&trail.length?trail.at(-1).players:ps;
    if(!reduced){for(const old of trail){const age=(now-old.at)/120;if(age>1)continue;old.players.forEach((p,i)=>{if(p.pose==='dash'||p.attack?.move==='special')fighter(p,i,now,dt,false,(1-age)*.08);});}}
    rendered.forEach((p,i)=>fighter(p,i,now,dt));if(!frozen&&(!trail.length||now-trail.at(-1).at>=20)){trail.push({at:now,players:ps.map(p=>({...p,attack:p.attack?{...p.attack}:null}))});while(trail.length&&now-trail[0].at>120)trail.shift();}
   }else{const phase=(now/1000)%2;fighter({uid:'preview',character:selected,x:width/height>1.9?960:870,y:0,facing:-1,pose:'idle',poseTime:now/1000,walkPhase:0,attack:null},0,now,dt,true);}
   for(let i=effects.length-1;i>=0;i--){const e=effects[i],age=(now-e.born)/1000;if(age>=e.duration){effects.splice(i,1);continue;}const f=clamp(age/e.duration,0,.999),im=assets.vfx,sz=e.move==='special'?260:e.kind==='block'?105:165;if(im){const cw=im.width/6,ch=im.height/4,index=Math.min(5,Math.floor(f*6));ctx.save();ctx.globalAlpha=(1-f*.7)*(e.kind==='block'?.65:1);ctx.globalCompositeOperation='screen';ctx.drawImage(im,index*cw,(e.character??0)*ch,cw,ch,e.x-sz/2,350-(e.y||0)-sz/2,sz,sz);ctx.restore();}
    ctx.font='italic 900 '+(e.move==='special'?29:23)+'px system-ui';ctx.textAlign='center';ctx.fillStyle=e.kind==='block'?'#b8e8ff':'#fff5d9';ctx.globalAlpha=Math.max(0,1-f*1.2);ctx.fillText(e.kind==='block'?'GUARD':String(e.damage),e.x+(e.actor===0?30:-30),315-(e.y||0)-f*45);ctx.globalAlpha=1;}
   for(let i=particles.length-1;i>=0;i--){const p=particles[i],age=(now-p.born)/1000;if(age>p.life){particles.splice(i,1);continue;}ctx.globalAlpha=(1-age/p.life)*.9;ctx.fillStyle=p.color;ctx.fillRect(p.x+p.vx*age,p.y+p.vy*age+260*age*age,p.size*(1-age/p.life),p.size);}
   ctx.globalAlpha=1;ctx.restore();if(flash>.002&&!reduced){ctx.globalAlpha=flash;ctx.fillStyle=flashColor;ctx.fillRect(0,0,width,height);flash*=Math.exp(-dt*24);ctx.globalAlpha=1;}
  }
  return{ready,draw,emit,reset,assets,atlases,get loaded(){return loaded;},get total(){return total;}};
 }
 return{Timeline,sequence,silhouettes,createRenderer,lerp};
});
