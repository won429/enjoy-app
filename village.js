const $=id=>document.getElementById(id);
const status=$('village-status');
let host;
try{if(parent!==window&&parent.location.origin===location.origin&&parent.document.getElementById('village-game-frame')?.contentWindow===window&&parent.hasDropVillageAccess?.())host=parent;}catch(_){}
const landscape=matchMedia('(orientation: landscape)');
$('village-leave').addEventListener('click',()=>host?.closeDropVillage());
if(!host){status.querySelector('p').textContent='아직 준비 중인 마을이에요. 성원제 계정으로 로그인한 뒤 드롭 게임에서 입장해주세요.';}
else{
    try{
        $('village-root').hidden=false;status.hidden=true;$('village-rotate').hidden=landscape.matches;$('village-canvas').setAttribute('aria-hidden',String(!landscape.matches));
        if(!landscape.matches)await new Promise(resolve=>{const change=()=>{if(landscape.matches){landscape.removeEventListener('change',change);resolve();}};landscape.addEventListener('change',change);});
        if(host.hasDropVillageAccess()){
            $('village-rotate').hidden=true;status.hidden=false;
            const [T,sceneModule,{OrbitControls,GLTFLoader,EffectComposer,RenderPass,SSAOPass,OutputPass}]=await Promise.all([
                import('./vendor/three-0.170.0.module.min.js'),import('./village-scene.js?v=20261103-6'),import('./vendor/village-engine.js?v=20261103-6')
            ]);
            const [grass,leaf,resident]=await Promise.all([new T.TextureLoader().loadAsync('assets/village/grass-albedo.png'),new T.TextureLoader().loadAsync('assets/village/leaf-albedo.png'),new GLTFLoader().loadAsync('assets/village/resident.glb?v=20261103-6')]);
            if(host.hasDropVillageAccess())startVillage(T,sceneModule,{grass,leaf,resident},{OrbitControls,EffectComposer,RenderPass,SSAOPass,OutputPass});
        }
    }catch(error){$('village-root').hidden=true;status.hidden=false;status.querySelector('p').textContent='3D 화면을 열지 못했어요. 브라우저에서 WebGL 사용을 확인하고 다시 입장해주세요.';console.error('Drop Village:',error);}
}
function startVillage(T,{buildVillage,buildResident},assets,{OrbitControls,EffectComposer,RenderPass,SSAOPass,OutputPass}){
    const canvas=$('village-canvas'),world=window.VillageWorld;
    const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.07;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
    const scene=new T.Scene();scene.background=new T.Color('#c7dfeb');scene.fog=new T.Fog('#c7dfeb',150,310);
    const camera=new T.PerspectiveCamera(42,1,.15,650);
    scene.add(new T.HemisphereLight('#f3f7ff','#9b997e',1.35));
    const sunlight=new T.DirectionalLight('#fff0d7',2.6);sunlight.castShadow=true;sunlight.shadow.mapSize.set(2048,2048);
    Object.assign(sunlight.shadow.camera,{left:-32,right:32,top:30,bottom:-30,near:.5,far:100});sunlight.shadow.normalBias=.016;sunlight.shadow.bias=-.00008;sunlight.shadow.radius=3;scene.add(sunlight,sunlight.target);
    let position={...world.spawn};
    const uniforms={time:{value:0}};
    const scenery=buildVillage(T,scene,world,uniforms,assets);
    const resident=buildResident(T,scene,assets.resident),{character}=resident;
    const contactMat=new T.MeshBasicMaterial({map:scenery.shadowTex,transparent:true,opacity:.5,depthWrite:false});
    const contact=new T.Mesh(new T.PlaneGeometry(2,1.55),contactMat);contact.rotation.x=-Math.PI/2;contact.position.y=.059;scene.add(contact);
    // Floating pollen and cloud forms are restrained, with no permanent HUD.
    const pollenGeo=new T.BufferGeometry(),pollenPositions=new Float32Array(40*3);
    for(let i=0;i<40;i++){pollenPositions[i*3]=(Math.sin(i*77.3)*.5+.5)*40-20;pollenPositions[i*3+1]=(Math.cos(i*44.7)*.5+.5)*7+.6;pollenPositions[i*3+2]=(Math.sin(i*11.4)*.5+.5)*40-20;}
    pollenGeo.setAttribute('position',new T.BufferAttribute(pollenPositions,3));
    const pollenMat=new T.PointsMaterial({color:'#fff4cf',size:.035,transparent:true,opacity:.65,depthWrite:false});const pollen=new T.Points(pollenGeo,pollenMat);scene.add(pollen);
    const clouds=new T.Group();scene.add(clouds);const cloudMat=new T.MeshBasicMaterial({color:'#f7fcf4'}),cloudGeo=new T.SphereGeometry(1,20,12);
    for(let i=0;i<7;i++)for(let j=0;j<4;j++){const o=new T.Mesh(cloudGeo,cloudMat);o.position.set(-90+i*29+j*3,21+(i%3)*4+(j%2)*.8,-80-(i%2)*20);o.scale.set(4+j%2,1.2,2.1);clouds.add(o);}
    let active=!host.document.getElementById('village-game-screen').hidden,frameId=0,last=0,elapsed=0,running=false;
    let velocity={x:0,z:0},stick={x:0,z:0,id:null},nearby=null,mapAt=0,frameCounter=0,fpsAt=0;
    const keys=new Set(),dialog=$('village-dialog'),map=$('village-map').getContext('2d');
    const cameraGoal=new T.Vector3(),ray=new T.Ray(),direction=new T.Vector3(),hitPoint=new T.Vector3();
    const cameraUp=new T.Vector3(0,1,0),cameraForward=new T.Vector3(),cameraRight=new T.Vector3();
    const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.085;controls.enablePan=false;
    controls.minDistance=8.5;controls.maxDistance=52;controls.minPolarAngle=.25;controls.maxPolarAngle=1.31;controls.rotateSpeed=.65;controls.zoomSpeed=.9;
    controls.mouseButtons.RIGHT=T.MOUSE.ROTATE;controls.touches.ONE=T.TOUCH.ROTATE;controls.touches.TWO=T.TOUCH.DOLLY_ROTATE;
    canvas.style.cursor='grab';controls.addEventListener('start',()=>{canvas.style.cursor='grabbing';$('village-camera-hint').classList.add('is-hidden');});controls.addEventListener('end',()=>{canvas.style.cursor='grab';});
    function resetView(){controls.target.set(position.x,1.8,position.z);const distance=20.5,phi=1.0,yaw=.46;camera.position.set(position.x+Math.sin(yaw)*Math.sin(phi)*distance,1.8+Math.cos(phi)*distance,position.z+Math.cos(yaw)*Math.sin(phi)*distance);controls.update();}
    resetView();
    const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:4});
    const composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));
    const ao=new SSAOPass(scene,camera,1,1,16);ao.kernelRadius=.8;ao.minDistance=.0015;ao.maxDistance=.085;
    ao.ssaoMaterial.fragmentShader=ao.ssaoMaterial.fragmentShader.replace('1.0 - occlusion','1.0 - occlusion * 0.60');
    const overrideVisibility=ao.overrideVisibility.bind(ao);ao.overrideVisibility=()=>{overrideVisibility();scene.traverse(node=>{if(node.isMesh&&(node.userData.foliage||node.material?.alphaTest>0||node.material?.opacity<.4)){if(!ao._visibilityCache.has(node))ao._visibilityCache.set(node,node.visible);node.visible=false;}});};
    composer.addPass(ao);composer.addPass(new OutputPass());
    const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    function clearInput(){keys.clear();stick.x=stick.z=0;stick.id=null;velocity.x=velocity.z=0;$('village-stick-knob').style.transform='';}
    function isPlayable(){return active&&landscape.matches&&!document.hidden;}
    function pause(){active=false;controls.enabled=false;clearInput();cancelAnimationFrame(frameId);frameId=0;last=0;}
    function resume(){if(!host.hasDropVillageAccess()){host.closeDropVillage();return;}active=true;controls.enabled=landscape.matches&&dialog.hidden;last=0;if(isPlayable()&&!frameId)frameId=requestAnimationFrame(animate);}
    window.pauseVillageGame=pause;window.resumeVillageGame=resume;
    function updateOrientation(){
        $('village-rotate').hidden=landscape.matches;controls.enabled=landscape.matches&&active&&dialog.hidden;
        canvas.setAttribute('aria-hidden',String(!landscape.matches));
        if(!landscape.matches){clearInput();cancelAnimationFrame(frameId);frameId=0;last=0;}
        else{resize();if(active)resume();}
    }
    function updateWorld(){character.position.set(position.x,.07,position.z);contact.position.set(position.x,.06,position.z);canvas.dataset.x=position.x.toFixed(2);canvas.dataset.z=position.z.toFixed(2);}
    function safeMove(dx,dz){
        const p=world.move(position,dx,dz),hits=(x,z)=>scenery.trees.some(t=>Math.hypot(t.x-x,t.z-z)<t.r+.42);
        if(!hits(p.x,p.z))position=p;
        else{if(!hits(p.x,position.z)&&world.canWalk(p.x,position.z))position.x=p.x;if(!hits(position.x,p.z)&&world.canWalk(position.x,p.z))position.z=p.z;}
    }
    function updateNearby(){nearby=world.landmarks.find(p=>Math.hypot(p.x-position.x,p.z-position.z)<5.9)||null;$('village-interact').disabled=!nearby;$('village-action-label').textContent=nearby?'살펴보기':'';}
    function interact(){if(!nearby||!dialog.hidden||!landscape.matches)return;clearInput();$('village-dialog-title').textContent=nearby.title;$('village-dialog-text').textContent=nearby.text;dialog.hidden=false;controls.enabled=false;$('village-dialog-close').focus({preventScroll:true});}
    function closeDialog(){dialog.hidden=true;controls.enabled=isPlayable();canvas.focus({preventScroll:true});}
    function drawMap(){
        const c=map,mx=x=>120+x*1.5,mz=z=>115+z*1.5;c.fillStyle='#8fba70';c.fillRect(0,0,240,240);c.fillStyle='#d9ca9e';[26,-1,-28,-55,55.5].forEach(z=>c.fillRect(mx(-51),mz(z)-3,153,6));c.fillStyle='#819581';c.fillRect(0,mz(65)-6,240,12);c.fillRect(mx(61)-6,10,12,225);c.fillRect(mx(-61)-5,10,10,225);world.buildings.forEach(b=>{c.fillStyle='#f0e5c3';c.fillRect(mx(b.x-b.width/2),mz(b.z-b.depth/2),b.width*1.5,b.depth*1.5);});c.fillStyle='#fff8d3';c.beginPath();c.arc(mx(position.x),mz(position.z),6,0,Math.PI*2);c.fill();c.fillStyle='#4d745b';c.beginPath();c.arc(mx(position.x),mz(position.z),3,0,Math.PI*2);c.fill();
    }
    function updateCamera(blend=1,dt=1/60){
        cameraGoal.set(position.x,1.8,position.z);
        const oldTarget=controls.target.clone();controls.target.lerp(cameraGoal,blend);camera.position.add(direction.copy(controls.target).sub(oldTarget));
        if(dialog.hidden&&(keys.has('j')||keys.has('l')||keys.has('i')||keys.has('k'))){
            const spherical=new T.Spherical().setFromVector3(direction.copy(camera.position).sub(controls.target));
            spherical.theta+=((keys.has('j')?1:0)-(keys.has('l')?1:0))*dt*1.08;spherical.phi=Math.max(controls.minPolarAngle,Math.min(controls.maxPolarAngle,spherical.phi+((keys.has('k')?1:0)-(keys.has('i')?1:0))*dt*.72));
            camera.position.copy(direction.setFromSpherical(spherical).add(controls.target));
        }
        controls.update();
        sunlight.position.set(position.x-17,31,position.z+15);sunlight.target.position.set(position.x,0,position.z-2);
        ray.origin.set(position.x,2.1,position.z);ray.direction.copy(direction.copy(camera.position).sub(ray.origin).normalize());const length=ray.origin.distanceTo(camera.position);
        for(const b of scenery.buildingGroups){const intersection=ray.intersectBox(b.bounds,hitPoint),faded=!!intersection&&intersection.distanceTo(ray.origin)<length;if(faded===b.faded)continue;b.faded=faded;b.group.traverse(node=>{const m=node.material;if(!m)return;if(m.userData.wasTransparent===undefined){m.userData.wasTransparent=m.transparent;m.userData.wasDepthWrite=m.depthWrite;}m.transparent=faded||m.userData.wasTransparent;m.opacity=faded?.18:1;m.depthWrite=faded?false:m.userData.wasDepthWrite;m.needsUpdate=true;});}
        canvas.dataset.cameraYaw=controls.getAzimuthalAngle().toFixed(3);canvas.dataset.cameraPitch=controls.getPolarAngle().toFixed(3);canvas.dataset.cameraDistance=camera.position.distanceTo(controls.target).toFixed(2);
    }
    function resize(){const w=innerWidth,h=innerHeight;if(!w||!h)return;renderer.setSize(w,h,false);composer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();updateCamera();if(landscape.matches)composer.render();}
    function animate(now){
        frameId=0;if(!isPlayable())return;
        const dt=Math.min(last?(now-last)/1000:.016,.05);last=now;elapsed+=dt;uniforms.time.value=elapsed;
        let dx=stick.x,dz=stick.z;
        if(keys.has('w')||keys.has('arrowup'))dz-=1;if(keys.has('s')||keys.has('arrowdown'))dz+=1;if(keys.has('a')||keys.has('arrowleft'))dx-=1;if(keys.has('d')||keys.has('arrowright'))dx+=1;
        if(!dialog.hidden)dx=dz=0;
        const length=Math.hypot(dx,dz),speed=running||keys.has('shift')?6.8:3.6;
        if(length>1){dx/=length;dz/=length;}
        camera.getWorldDirection(cameraForward);cameraForward.y=0;cameraForward.normalize();cameraRight.crossVectors(cameraForward,cameraUp).normalize();const relative=world.relativeInput(dx,dz,cameraForward.x,cameraForward.z),wx=relative.x,wz=relative.z;
        const acceleration=1-Math.exp(-dt*(length>0?16:22));velocity.x+=(wx*speed-velocity.x)*acceleration;velocity.z+=(wz*speed-velocity.z)*acceleration;
        if(Math.abs(velocity.x)<.01)velocity.x=0;if(Math.abs(velocity.z)<.01)velocity.z=0;
        const oldX=position.x,oldZ=position.z;safeMove(velocity.x*dt,velocity.z*dt);
        const moved=Math.hypot(position.x-oldX,position.z-oldZ),walking=moved>.002;
        if(walking){const angle=Math.atan2(velocity.x,velocity.z);const turn=Math.atan2(Math.sin(angle-character.rotation.y),Math.cos(angle-character.rotation.y));character.rotation.y+=turn*Math.min(1,dt*14);}
        resident.update(dt,walking?moved/dt:0,running||keys.has('shift'));
        if(!reducedMotion){pollen.position.set(position.x+Math.sin(elapsed*.2),Math.sin(elapsed*.14)*.3,position.z-8);clouds.position.x=Math.sin(elapsed*.009)*3;}
        if(elapsed>7)$('village-camera-hint').classList.add('is-hidden');
        updateWorld();updateCamera(reducedMotion?1:1-Math.exp(-dt*8),dt);composer.render();
        if(now-mapAt>160){updateNearby();if(!$('village-map').hidden)drawMap();mapAt=now;}
        frameCounter++;if(now-fpsAt>1000){canvas.dataset.fps=String(Math.round(frameCounter*1000/(now-fpsAt)));fpsAt=now;frameCounter=0;}
        frameId=requestAnimationFrame(animate);
    }
    // Analogue movement pad, with pointer capture so lifting a finger anywhere
    // reliably stops movement; DOM buttons keep the directions keyboard accessible.
    const pad=$('village-stick');
    function pointStick(event){const r=pad.getBoundingClientRect(),limit=r.width*.29;let x=event.clientX-r.left-r.width/2,z=event.clientY-r.top-r.height/2;const d=Math.hypot(x,z);if(d>limit){x*=limit/d;z*=limit/d;}stick.x=Math.abs(x/limit)<.08?0:x/limit;stick.z=Math.abs(z/limit)<.08?0:z/limit;$('village-stick-knob').style.transform=`translate(${x}px,${z}px)`;}
    pad.addEventListener('pointerdown',e=>{if(!dialog.hidden||!isPlayable())return;e.preventDefault();pad.setPointerCapture(e.pointerId);stick.id=e.pointerId;pointStick(e);});
    pad.addEventListener('pointermove',e=>{if(stick.id===e.pointerId)pointStick(e);});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(name,e=>{if(stick.id===e.pointerId){stick.id=null;stick.x=stick.z=0;$('village-stick-knob').style.transform='';}});
    pad.querySelectorAll('button').forEach(button=>button.addEventListener('click',event=>{if(event.detail||!dialog.hidden||!isPlayable())return;const d=button.dataset.dir;safeMove(d==='left'?-1:d==='right'?1:0,d==='up'?-1:d==='down'?1:0);updateWorld();updateNearby();}));
    window.addEventListener('keydown',event=>{
        const key=event.key.toLowerCase();
        if(key==='escape'){event.preventDefault();if(!dialog.hidden)closeDialog();else host.closeDropVillage();return;}
        if(!landscape.matches)return;
        if(!dialog.hidden){if(key==='enter'||key==='e'||key===' '){event.preventDefault();closeDialog();}else if(key==='tab'){event.preventDefault();$('village-dialog-close').focus();}return;}
        if(/^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright|shift|i|j|k|l)$/.test(key)){event.preventDefault();keys.add(key);}
        if(key==='r')resetView();if(key==='+'||key==='='||key==='-'){direction.copy(camera.position).sub(controls.target).multiplyScalar(key==='-'?1.15:1/1.15).clampLength(controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(direction);controls.update();}
        if(event.repeat)return;if(key==='e'||(key==='enter'&&event.target===canvas)){event.preventDefault();interact();}if(key==='m'){$('village-map').hidden=!$('village-map').hidden;drawMap();}
    });
    window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',clearInput);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();cancelAnimationFrame(frameId);frameId=0;last=0;}else if(active)resume();});
    landscape.addEventListener('change',updateOrientation);window.addEventListener('resize',resize);
    $('village-run').addEventListener('click',()=>{running=!running;$('village-run').setAttribute('aria-pressed',String(running));});
    $('village-interact').addEventListener('click',interact);$('village-dialog-close').addEventListener('click',closeDialog);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();$('village-root').hidden=true;status.hidden=false;status.querySelector('p').textContent='3D 연결이 끊겼어요. 돌아간 뒤 다시 입장해주세요.';status.querySelector('a').onclick=event=>{event.preventDefault();host.closeDropVillage();};});
    canvas.addEventListener('dblclick',resetView);
    window.addEventListener('pagehide',()=>{pause();controls.dispose();ao.dispose();composer.dispose();scenery.dispose();resident.dispose();contactMat.dispose();pollenGeo.dispose();pollenMat.dispose();cloudGeo.dispose();cloudMat.dispose();renderer.dispose();});
    status.hidden=true;updateWorld();updateNearby();resize();updateOrientation();canvas.focus({preventScroll:true});if(active)resume();
}
