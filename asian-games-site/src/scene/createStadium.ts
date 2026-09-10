import {actionBall,pitcherPose,batterPose,PITCH_BASE,BAT_BASE,PITCH_SIZE,BAT_SIZE} from './actionTimeline';
import {characterSprite} from './characterSprite';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {BASES,CONTACT,RELEASE,phase,smooth,mix,lerp,sampleScene,type V3} from './timeline';

const v=(a:V3)=>new T.Vector3(...a);
const ivory=0xf4f0e6,navy=0x203748;
export function createStadium(canvas:HTMLCanvasElement){
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.4:1.8));renderer.shadowMap.enabled=innerWidth>=700;renderer.shadowMap.type=T.PCFShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
 const scene=new T.Scene();scene.background=new T.Color(0xc5d7da);scene.fog=new T.Fog(0xdce0db,600,1000);
 const camera=new T.PerspectiveCamera(56,1,.05,700);
 scene.add(new T.HemisphereLight(0xeef8ff,0x998269,2.3));
 const sun=new T.DirectionalLight(0xffefd8,3.4);sun.position.set(-45,70,40);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-55,right:55,top:40,bottom:-85,near:1,far:220});sun.shadow.bias=-.0004;sun.shadow.normalBias=.05;scene.add(sun);scene.add(sun.target);sun.target.position.set(0,0,-20);
 const materials:T.Material[]=[],geometries:T.BufferGeometry[]=[],textures:T.Texture[]=[];
 const mat=(color:number,roughness=.7,metalness=.05)=>{const m=new T.MeshStandardMaterial({color,roughness,metalness});materials.push(m);return m;};
 const chalk=mat(ivory),dirt=mat(0xa76a43),grass=mat(0x44734b),darkGrass=mat(0x37623e),trim=mat(0xb6b4a4),concrete=mat(0xc6c2b6),seatMat=mat(0x304c65),blue=mat(navy,.4,.16),red=mat(0xad5b46),gold=mat(0xb68a48,.4,.25);

 // Fine deterministic material grain is applied to the moving 3D field, not only the opening poster.
 function surfaceTexture(grassy:boolean){const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d')!;let seed=7281;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};ctx.fillStyle=grassy?'#a7b29e':'#b5a592';ctx.fillRect(0,0,512,512);for(let i=0;i<40000;i++){const x=rnd()*512,y=rnd()*512,g=Math.floor(80+rnd()*120);ctx.strokeStyle=`rgba(${g},${g},${g},.4)`;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(grassy?1:2),y+(grassy?3:1));ctx.stroke();}const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(grassy?35:22,grassy?35:22);t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.push(t);return t;}
 const grassMap=surfaceTexture(true),dirtMap=surfaceTexture(false);for(const m of [grass,darkGrass]){m.map=grassMap;m.bumpMap=grassMap;m.bumpScale=.08;m.roughness=1;}dirt.map=dirtMap;dirt.bumpMap=dirtMap;dirt.bumpScale=.06;dirt.roughness=1;
 const unitBox=new T.BoxGeometry(1,1,1),unitSphere=new T.SphereGeometry(1,20,14),unitCyl=new T.CylinderGeometry(1,1,1,40);geometries.push(unitBox,unitSphere,unitCyl);
 function mesh(geo:T.BufferGeometry,m:T.Material,parent:T.Object3D=scene){const o=new T.Mesh(geo,m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 function box(pos:V3,size:V3,m:T.Material,parent:T.Object3D=scene){const o=mesh(unitBox,m,parent);o.position.set(...pos);o.scale.set(...size);return o;}
 function sphere(pos:V3,size:V3,m:T.Material,parent:T.Object3D=scene){const o=mesh(unitSphere,m,parent);o.position.set(...pos);o.scale.set(...size);return o;}
 function cylinder(pos:V3,r:number,height:number,m:T.Material,parent:T.Object3D=scene){const o=mesh(unitCyl,m,parent);o.position.set(...pos);o.scale.set(r,height,r);return o;}
 function segment(a:V3,b:V3,r:number,m:T.Material,parent:T.Object3D=scene){const o=mesh(unitCyl,m,parent);setSegment(o,a,b,r);return o;}
 function setSegment(o:T.Mesh,a:V3,b:V3,r:number){const av=v(a),bv=v(b);o.position.copy(av).add(bv).multiplyScalar(.5);o.scale.set(r,av.distanceTo(bv),r);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),bv.sub(av).normalize());}
 function flatShape(points:V3[],m:T.Material){const shape=new T.Shape();shape.moveTo(points[0][0],-points[0][2]);points.slice(1).forEach(p=>shape.lineTo(p[0],-p[2]));shape.closePath();const geo=new T.ShapeGeometry(shape);geometries.push(geo);const o=mesh(geo,m);o.rotation.x=-Math.PI/2;o.position.y=points[0][1];return o;}
 function line(points:V3[],color=0xecead8){const geo=new T.BufferGeometry().setFromPoints(points.map(v)),m=new T.LineBasicMaterial({color});geometries.push(geo);materials.push(m);const o=new T.Line(geo,m);scene.add(o);return o;}
 // A complete original miniature ballpark, built at baseball field scale.
 const base=cylinder([0,-2.4,-42],1,4,concrete);base.scale.set(104,4,85);
 const lawn=cylinder([0,-.025,-42],1,.15,grass);lawn.scale.set(91,.15,73);
 for(let i=0;i<12;i++){const angle=-Math.PI/4+i*Math.PI/24;const points:V3[]=[[0,.08,0]];for(let j=0;j<=8;j++){const a=angle+j*Math.PI/192;points.push([Math.sin(a)*102,.08,-Math.cos(a)*102]);}flatShape(points,i%2?grass:darkGrass);}
 const infield=cylinder([0,.12,-20],29,.08,dirt);infield.scale.z=29;
 flatShape([[0,.18,-4.6],[14.9,.18,-19.4],[0,.18,-34.2],[-14.9,.18,-19.4]],grass);
 const plateArea=cylinder([0,.19,0],3.4,.06,dirt);
 const moundVertices:number[]=[],moundIndices:number[]=[];for(let ring=0;ring<=12;ring++){const r=ring/12*2.8;for(let j=0;j<=64;j++){const a=j/64*Math.PI*2;moundVertices.push(Math.cos(a)*r,.16+.16*Math.pow(1-r/2.8,2),-18.44+Math.sin(a)*r);if(ring<12&&j<64){const n=ring*65+j;moundIndices.push(n,n+65,n+1,n+1,n+65,n+66);}}}const moundGeo=new T.BufferGeometry();moundGeo.setAttribute('position',new T.Float32BufferAttribute(moundVertices,3));moundGeo.setAttribute('uv',new T.Float32BufferAttribute(moundVertices.flatMap((n,i)=>i%3===0?[(n+2.8)/5.6,(moundVertices[i+2]+18.44+2.8)/5.6]:[]),2));moundGeo.setIndex(moundIndices);moundGeo.computeVertexNormals();geometries.push(moundGeo);mesh(moundGeo,dirt);box([0,.33,-18.44],[.61,.02,.16],chalk);
 line([[0,.25,0],[76,.25,-76]]);line([[0,.25,0],[-76,.25,-76]]);
 const bases=BASES.slice(1,4).map(p=>{const o=box([p[0],.25,p[2]],[.52,.16,.52],chalk);o.rotation.y=Math.PI/4;return o;});
 flatShape([[-.24,.26,-.24],[.24,.26,-.24],[.24,.26,.03],[0,.26,.25],[-.24,.26,.03]],chalk);
 for(const x of [-1.15,1.15])line([[x-.45,.27,-.85],[x+.45,.27,-.85],[x+.45,.27,1],[x-.45,.27,1],[x-.45,.27,-.85]]);
 // Photographic stands replace the prototype tiers, seats, crowd and roof entirely.
 const standTexture=new T.TextureLoader().load('./baseball-assets/action/grandstand.png',()=>window.dispatchEvent(new Event('resize')));standTexture.colorSpace=T.SRGBColorSpace;standTexture.wrapS=T.RepeatWrapping;standTexture.repeat.set(8,1);standTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.push(standTexture);
 const standGeo=new T.CylinderGeometry(88,88,22,128,1,true);geometries.push(standGeo);const standMaterial=new T.MeshBasicMaterial({map:standTexture,side:T.DoubleSide,toneMapped:false});materials.push(standMaterial);const standWrap=mesh(standGeo,standMaterial);standWrap.position.set(0,11,-42);standWrap.scale.z=.8;standWrap.castShadow=false;standWrap.receiveShadow=false;
 // Foul poles, floodlights, and a restrained scoreboard.
 for(const x of [-74,74])cylinder([x,9,-74],.15,18,gold);
 const lightMat=new T.MeshBasicMaterial({color:0xfff4d0});materials.push(lightMat);
 for(const a of [-2.35,-.8,.8,2.35]){const x=Math.sin(a)*103,z=-42+Math.cos(a)*83;cylinder([x,15,z],.42,30,trim);const head=box([x,30,z],[10,4,.8],blue);head.lookAt(0,15,-30);for(let k=0;k<6;k++)for(let l=0;l<2;l++){const bulb=box([k*1.45-3.65,l*1.55-.8,.6],[1.15,1.1,.15],lightMat,head);bulb.scale.set(.115,.275,.2);bulb.position.x/=10;bulb.position.y/=4;}}
 function label(text:string,width:number,height:number,color:string,bg:string){const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d')!;ctx.fillStyle=bg;ctx.fillRect(0,0,1024,256);ctx.fillStyle=color;ctx.font='500 95px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,133);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;textures.push(tex);const m=new T.MeshBasicMaterial({map:tex});materials.push(m);const geo=new T.PlaneGeometry(width,height);geometries.push(geo);return mesh(geo,m);}
 const board=label('2026 / ASIAN GAMES',26,6,'#e9e8d9','#203748');board.position.set(0,13,-120);box([0,12.8,-120.6],[28,8,1.1],trim);
 const skyGeo=new T.SphereGeometry(450,24,12);geometries.push(skyGeo);
 const skyMat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{top:{value:new T.Color(0x91bac6)},bottom:{value:new T.Color(0xf1e8d8)}},vertexShader:'varying vec3 dir; void main(){dir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform vec3 top; uniform vec3 bottom; varying vec3 dir; void main(){float h=smoothstep(-0.08,0.85,normalize(dir).y); gl_FragColor=vec4(mix(bottom,top,h),1.0);}'});materials.push(skyMat);const sky=mesh(skyGeo,skyMat);sky.castShadow=false;sky.receiveShadow=false;
 // Batch static architecture by material to keep draw calls low on phones.
 scene.updateMatrixWorld(true);const batches=new Map<T.Material,T.BufferGeometry[]>();const original:T.Mesh[]=[];scene.traverse(o=>{if(o instanceof T.Mesh&&!(o instanceof T.InstancedMesh)&&o.material instanceof T.MeshStandardMaterial){const g=o.geometry.clone().applyMatrix4(o.matrixWorld);const list=batches.get(o.material)||[];list.push(g);batches.set(o.material,list);original.push(o);}});original.forEach(o=>{for(const child of [...o.children]){if(!original.includes(child as T.Mesh))scene.attach(child);}o.removeFromParent();});for(const [material,parts] of batches){const merged=mergeGeometries(parts,false);if(merged){geometries.push(merged);const batch=mesh(merged,material);if(material===grass||material===darkGrass||material===dirt)batch.castShadow=false;}parts.forEach(g=>g.dispose());}
 // Faceless toy robots: lacquered shells, dark visors, articulated mechanical joints.
 function actor(uniform:T.Material,helmetMat:T.Material){
  const root=new T.Group();scene.add(root);const body=sphere([0,1.16,0],[.33,.45,.22],uniform,root);const hips=sphere([0,.8,0],[.29,.17,.2],blue,root);
  const head=new T.Group();head.position.y=1.85;root.add(head);sphere([0,0,0],[.29,.3,.28],helmetMat,head);sphere([0,-.035,.185],[.24,.14,.11],blue,head);const brim=box([0,.08,.25],[.59,.055,.27],helmetMat,head);sphere([-.28,-.025,0],[.07,.11,.11],helmetMat,head);sphere([.28,-.025,0],[.07,.11,.11],helmetMat,head);
  sphere([0,1.28,.215],[.095,.095,.025],helmetMat,root);
  const limbs=Array.from({length:8},()=>mesh(unitCyl,chalk,root));const joints=Array.from({length:8},()=>sphere([0,0,0],[.1,.1,.1],blue,root));const hands=[sphere([0,0,0],[.12,.14,.12],helmetMat,root),sphere([0,0,0],[.12,.14,.12],helmetMat,root)];const shoes=[box([0,0,0],[.22,.16,.39],blue,root),box([0,0,0],[.22,.16,.39],blue,root)];
  function pose(opts:{crouch?:number;run?:number;throw?:number;swing?:number}={}){
   const crouch=opts.crouch||0,run=opts.run||0,thr=opts.throw||0,sw=opts.swing||0,dy=-crouch*.5;
   body.position.y=1.16+dy;hips.position.y=.8+dy;head.position.y=1.85+dy;body.rotation.x=crouch*.25;
   const gait=Math.sin(run),step=run?gait*.45:0;
   let lhand:V3=[-.45,1.05+dy,.16],rhand:V3=[.45,1.05+dy,.16];
   if(crouch){lhand=[-.24,.9,.55];rhand=[.24,.85,.3];}
   if(thr>0){rhand=[.36,lerp(1.14,1.57,smooth(thr))+Math.sin(smooth(thr)*Math.PI)*.7,lerp(.34,.52,smooth(thr))];lhand=[-.35,1.35,.37];}
   if(sw>0){lhand=[-.15,1.28,.45];rhand=[.06,1.28,.48];}
   if(thr>1){rhand=mix([.36,1.57,.52],[.05,.8,.75],Math.min(1,(thr-1)/.6));}
   if(run){lhand=[-.38,1.03,-step];rhand=[.38,1.03,step];}
   const shL:V3=[-.29,1.42+dy,0],shR:V3=[.29,1.42+dy,0],elL:V3=[-.48,1.16+dy,lhand[2]*.5],elR:V3=[.49,1.17+dy,rhand[2]*.5];
   const hipL:V3=[-.17,.8+dy,0],hipR:V3=[.17,.8+dy,0],kneL:V3=[-.2,.43+dy*.4,crouch*.45+step*.6],kneR:V3=[.2,.43+dy*.4,crouch*.45-step*.6],footL:V3=[-.22,.12,step],footR:V3=[.22,.12,-step];
   const lift=thr>0&&thr<1?Math.sin(thr*Math.PI)*.5:0;kneL[1]+=lift;kneL[2]+=.3*lift;footL[1]+=lift;footL[2]+=.25*lift;
   [[shL,elL],[elL,lhand],[shR,elR],[elR,rhand],[hipL,kneL],[kneL,footL],[hipR,kneR],[kneR,footR]].forEach(([a,b],i)=>{setSegment(limbs[i],a,b,i<4?.095:.115);joints[i].position.set(...a);});
   hands[0].position.set(...lhand);hands[1].position.set(...rhand);shoes[0].position.set(...footL);shoes[1].position.set(...footR);
  }
  pose();return {root,head,body,pose};
 }
 const batter=actor(chalk,blue);batter.root.position.set(-1.18,0,.1);batter.root.rotation.y=Math.PI/2;
 const catcher=actor(red,blue);catcher.root.position.set(0,0,1.8);catcher.root.rotation.y=Math.PI;catcher.pose({crouch:1});
 const chest=box([0,1.08,.25],[.51,.6,.08],blue,catcher.root);chest.position.y=.8;
 const glove=sphere([-.24,.9,.55],[.22,.24,.12],gold,catcher.root);
 const pitcher=actor(chalk,red);pitcher.root.position.set(0,.4,-18.44);
 const fielders:ReturnType<typeof actor>[]=[];
 for(const pos of [[20,-22],[-20,-22],[10,-35],[-12,-37],[-42,-65],[0,-83],[43,-65]]){const a=actor(chalk,red);a.root.position.set(pos[0],0,pos[1]);fielders.push(a);}

 const pitchArt=characterSprite('./baseball-assets/action/pitcher16.png',4,4,PITCH_SIZE),batArt=characterSprite('./baseball-assets/action/batter16.png',4,4,BAT_SIZE),catchArt=characterSprite('./baseball-assets/action/catcher.png',1,1,1.8);
 const runArt=characterSprite('./baseball-assets/action/runner16.png',4,4,2.7);scene.add(runArt.mesh);
 const fieldArt=fielders.map(()=>characterSprite('./baseball-assets/action/pitcher16.png',4,4,2.6));
 scene.add(pitchArt.mesh,batArt.mesh,catchArt.mesh,...fieldArt.map(a=>a.mesh));
 const ballRoot=new T.Group();scene.add(ballRoot);
 const ballTexture=new T.TextureLoader().load('./baseball-assets/baseball-leather-v4.png',()=>window.dispatchEvent(new Event('resize')));ballTexture.colorSpace=T.SRGBColorSpace;textures.push(ballTexture);
 const ballMaterial=new T.SpriteMaterial({map:ballTexture,transparent:true,depthWrite:false});materials.push(ballMaterial);
 ballMaterial.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n if(distance(vMapUv,vec2(.5))>.479)discard;');};
 const ball=new T.Sprite(ballMaterial);ball.scale.set(.25,.25,1);ballRoot.add(ball);

 const batRoot=new T.Group();scene.add(batRoot);const batGeo=new T.CylinderGeometry(.082,.035,1.6,16);geometries.push(batGeo);const bat=mesh(batGeo,gold,batRoot);bat.position.y=.8;cylinder([0,.02,0],.065,.06,blue,batRoot);
 const trailGeo=new T.BufferGeometry();const trailArray=new Float32Array(120*3);trailGeo.setAttribute('position',new T.BufferAttribute(trailArray,3));geometries.push(trailGeo);const trailMat=new T.LineBasicMaterial({color:0xffeed1,transparent:true,opacity:.65});materials.push(trailMat);const trail=new T.Line(trailGeo,trailMat);scene.add(trail);
 const haloGeo=new T.RingGeometry(.7,.86,40);geometries.push(haloGeo);const haloMat=new T.MeshBasicMaterial({color:0xeec88b,side:T.DoubleSide,transparent:true,opacity:.8});materials.push(haloMat);const halo=mesh(haloGeo,haloMat);halo.rotation.x=-Math.PI/2;
 const route=line(BASES.map(p=>[p[0],.25,p[2]]),0xe4c498);route.visible=false;
 const portraitScene=new T.Scene();portraitScene.background=new T.Color(0xebe5db);portraitScene.add(new T.HemisphereLight(0xffffff,0x8d7f71,3));const portraitSun=new T.DirectionalLight(0xffe2bd,4);portraitSun.position.set(-3,7,5);portraitScene.add(portraitSun);const portraitFill=new T.DirectionalLight(0xb3d5eb,2);portraitFill.position.set(4,3,-3);portraitScene.add(portraitFill);const podium=cylinder([0,-.15,0],1.25,.2,concrete,portraitScene);
 const globeScene=new T.Scene();globeScene.background=new T.Color(0x211d1b);globeScene.add(new T.HemisphereLight(0xffffff,0x382723,1.4));const globeSun=new T.DirectionalLight(0xffefdd,4);globeSun.position.set(-4,5,3);globeScene.add(globeSun);
 function renderPortrait(t:number){portraitScene.add(batter.root);batter.root.visible=true;batter.root.scale.setScalar(1);batter.root.position.set(0,0,0);batter.root.rotation.y=Math.sin(t*Math.PI*2)*.4+.25;batter.head.rotation.y=0;batter.pose();batter.body.rotation.x=0;camera.position.set(0,1.35,6);camera.lookAt(0,1.08,0);camera.near=.05;camera.fov=width/height<.9?34:26;camera.updateProjectionMatrix();renderer.render(portraitScene,camera);}
 function renderGlobe(t:number){globeScene.add(ballRoot);ballRoot.visible=true;ballRoot.position.set(0,-.13,0);ballRoot.scale.setScalar(8);ballRoot.rotation.set(.3+t*.7,t*2,.5);camera.position.set(0,.05,2.6);camera.lookAt(0,0,0);camera.near=.05;camera.fov=width/height<.9?59:47;camera.updateProjectionMatrix();renderer.render(globeScene,camera);}
 let width=1,height=1;
 function resize(){width=canvas.clientWidth;height=canvas.clientHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
 function render(p:number){
  scene.add(batter.root);scene.add(ballRoot);ballRoot.scale.setScalar(1);const s=sampleScene(p);const mobile=width/height<.9;camera.position.set(...s.camera);if(p>.76){const distance=lerp(1,Math.max(1,.68/(width/height)),smooth(phase(p,.76,.84)));camera.position.sub(v(s.target)).multiplyScalar(distance).add(v(s.target));}if(p>=.84){const t=smooth(phase(p,.84,.89)),followTarget=v([s.run.position[0]*.85,0,s.run.position[2]*.85-3]);camera.position.lerp(followTarget.clone().add(new T.Vector3(0,31,24)),t);camera.lookAt(v(s.target).lerp(followTarget,t));}else camera.lookAt(...s.target);camera.near=lerp(.25,2,smooth(phase(p,.60,.79)));camera.fov=s.fov+(mobile?12:0);camera.updateProjectionMatrix();
  if(p>=.69&&p<=.755){const t=smooth(phase(p,.69,.755)),focus=v(actionBall(p));camera.position.lerp(focus.clone().add(new T.Vector3(-.08,.04, .62)),t);camera.lookAt(focus);camera.near=.02;camera.fov=48;camera.updateProjectionMatrix();}
  ballMaterial.rotation=p*12;ballRoot.position.set(...actionBall(p));ballRoot.rotation.set(s.p*50,s.p*85,s.p*40);ballRoot.visible=s.p>=.38&&s.p<.80;
  const follow=phase(p,.38,.45);pitcher.pose({throw:s.windup+follow*.6});pitcher.body.rotation.x=follow*.32;pitcher.root.rotation.y=0;
  // Exact release: hand and ball meet before the flight phase begins.
  batter.root.visible=!(p>.20&&p<.46);batter.root.scale.setScalar(1);batter.root.position.set(-1.18,.15,.1);batter.root.rotation.y=Math.PI/2+(smooth(s.hit)-.5)*.7;batter.pose({swing:1});batter.head.rotation.y=Math.PI-batter.root.rotation.y;
  batter.root.updateMatrixWorld(true);const gripPoint=batter.root.localToWorld(v([-.045,1.28,.465]));
  const grip:V3=[gripPoint.x,gripPoint.y,gripPoint.z],ready:V3=[-.45,1,.12],contactDirection:V3=[CONTACT[0]-grip[0],CONTACT[1]-grip[1],CONTACT[2]-grip[2]],after:V3=[.15,.5,1];
  const dir=p<=.52?mix(ready,contactDirection,smooth(phase(p,.48,.52))):mix(contactDirection,after,smooth(phase(p,.52,.58)));
  batRoot.position.set(...grip);batRoot.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v(dir).normalize());batRoot.visible=p<.77&&!(p>.20&&p<.46);
  if(p>.7){batRoot.position.set(-1.3,.16,1);batRoot.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(1,0,-.4).normalize());}
  if(p>=.84){const r=s.run;batter.root.scale.setScalar(2.1);batter.root.position.set(r.position[0],Math.abs(Math.sin(r.progress*Math.PI*14))*.12+.18,r.position[2]);const next=BASES[r.segment+1],prev=BASES[r.segment];batter.root.rotation.y=Math.atan2(next[0]-prev[0],next[2]-prev[2]);batter.head.rotation.y=0;batter.pose({run:r.progress*Math.PI*14+.001});}
  else if(p>.80)batter.root.position.lerp(new T.Vector3(0,0,0),smooth(phase(p,.80,.84)));
  halo.visible=p>=.84;halo.scale.setScalar(2.3);halo.position.set(batter.root.position.x,.32,batter.root.position.z);route.visible=p>.77;
  bases.forEach((b,i)=>{const touched=s.run.progress>=i+1;b.material=touched?gold:chalk;});
  trail.visible=p>.39&&p<.765;
  if(trail.visible){const from=Math.max(.38,p-(p<.52?.025:.04));for(let i=0;i<120;i++){const pos=actionBall(lerp(from,p,i/119));trailArray[i*3]=pos[0];trailArray[i*3+1]=pos[1];trailArray[i*3+2]=pos[2];}trailGeo.attributes.position.needsUpdate=true;trailGeo.computeBoundingSphere();}

  // Pose phases are synchronized with the 3D release/contact instants (.38 / .52).
  pitcher.root.visible=false;catcher.root.visible=false;fielders.forEach(a=>a.root.visible=false);batter.root.visible=false;batRoot.visible=false;
  pitchArt.mesh.position.set(...PITCH_BASE);pitchArt.set(pitcherPose(p),camera);
  catchArt.mesh.visible=p<.20;catchArt.mesh.position.set(0,.12,1.8);catchArt.set(0,camera);
  fieldArt.forEach((a,i)=>{a.mesh.position.copy(fielders[i].root.position);a.set(0,camera);});
  batArt.mesh.visible=p<.84&&!(p>.20&&p<.46);batArt.mesh.position.set(...BAT_BASE);batArt.mesh.scale.setScalar(1);batArt.set(batterPose(p),camera);
  runArt.mesh.visible=p>=.84;
  if(p>=.84){runArt.mesh.position.copy(batter.root.position);runArt.mesh.scale.setScalar(2.2);runArt.set((s.run.progress*8%1)*15,camera);const next=BASES[s.run.segment+1],prev=BASES[s.run.segment];const right=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion);const forward=new T.Vector3(next[0]-prev[0],0,next[2]-prev[2]);runArt.mesh.scale.x=right.dot(forward)<0?-2.2:2.2;}
  canvas.dataset.sceneProgress=p.toFixed(4);canvas.dataset.pitchPose=pitcherPose(p).toFixed(2);canvas.dataset.batPose=batterPose(p).toFixed(2);canvas.dataset.ballCount=ballRoot.visible?'1':'0';
  renderer.render(scene,camera);
 }
 resize();render(0);
 return {render,renderPortrait,renderGlobe,resize,dispose(){[pitchArt,batArt,catchArt,runArt,...fieldArt].forEach(a=>a.dispose());renderer.dispose();scene.traverse(o=>{if(o instanceof T.InstancedMesh)o.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.forceContextLoss();canvas.width=canvas.height=1;},stats:()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles})};
}
