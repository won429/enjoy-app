// Original 3D scenery, with the relative apartment layout from the supplied maps.
export function buildVillage(T, scene, world, uniforms, assets={}) {
    let seed = 63892;
    const rnd = () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296; };
    const textures=[], materials=[], geometries=[], trees=[], buildingGroups=[];
    const colorMats=new Map(), roundedCache=new Map(), batches=new Map();
    let owner=null,woodTexture=null;
    function texture(draw,w=256,h=256){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;textures.push(t);return t;}
    // World positions stay on a flat plane. Only leaves receive a small
    // local-space wind displacement; terrain, roads and buildings never bend.
    function surface(mat,wind=0){
        if(!wind)return mat;
        mat.onBeforeCompile=shader=>{
            shader.uniforms.villageTime=uniforms.time;
            shader.vertexShader='uniform float villageTime;\n'+shader.vertexShader;
            shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
                float windPhase=position.y;
                #ifdef USE_INSTANCING
                    windPhase+=instanceMatrix[3].x*.37+instanceMatrix[3].z*.29;
                #endif
                transformed.x+=sin(villageTime*1.2+windPhase)*${wind.toFixed(3)};
            `);
        };
        mat.customProgramCacheKey=()=> 'village-local-wind-v3-'+wind;
        return mat;
    }
    const depth=surface(new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking}));
    function mat(color, options={}){
        if(woodTexture&&['#b48959','#b99161','#b69966'].includes(color))options={map:woodTexture,roughness:.86,...options};
        const key=color+JSON.stringify(options)+String(owner?.id||'');
        if(colorMats.has(key))return colorMats.get(key);
        const m=surface(new T.MeshStandardMaterial({color,roughness:.88,...options}));materials.push(m);colorMats.set(key,m);return m;
    }
    function customMat(options,wind=0){const m=surface(new T.MeshStandardMaterial(options),wind);materials.push(m);return m;}
    const boxGeo=new T.BoxGeometry(1,1,1), sphere=new T.SphereGeometry(1,20,14), cylinder=new T.CylinderGeometry(1,1,1,12);
    geometries.push(boxGeo,sphere,cylinder);
    function batch(geo,m,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){
        const key=(owner?.id||'')+geo.uuid+m.uuid;
        if(!batches.has(key))batches.set(key,{geo,mat:m,owner,items:[]});
        batches.get(key).items.push([x,y,z,sx,sy,sz,rx,ry,rz]);
    }
    const box=(x,y,z,w,h,d,c,ry=0)=>batch(boxGeo,typeof c==='string'?mat(c):c,x,y,z,w,h,d,0,ry);
    const ball=(x,y,z,sx,sy,sz,c)=>batch(sphere,typeof c==='string'?mat(c):c,x,y,z,sx,sy,sz);
    function roundGeo(w,h,d,r=.09){
        const key=[w,h,d,r].join(',');if(roundedCache.has(key))return roundedCache.get(key);
        const shape=new T.Shape(),x=-w/2+r,y=-h/2+r;
        shape.moveTo(x,y);shape.lineTo(-x,y);shape.lineTo(-x,-y);shape.lineTo(x,-y);shape.closePath();
        const g=new T.ExtrudeGeometry(shape,{depth:d-r*2,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:3,steps:1});g.translate(0,0,-d/2+r);roundedCache.set(key,g);geometries.push(g);return g;
    }
    function mesh(geo,m,x,y,z,parent=owner?.group||scene){const o=new T.Mesh(geo,typeof m==='string'?mat(m):m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;o.customDepthMaterial=depth;parent.add(o);return o;}
    function rounded(x,y,z,w,h,d,c,r=.09){return mesh(roundGeo(w,h,d,r),c,x,y,z);}
    const grass=assets.grass||new T.TextureLoader().load('assets/village/grass-albedo.png');
    grass.colorSpace=T.SRGBColorSpace;grass.wrapS=grass.wrapT=T.RepeatWrapping;grass.repeat.set(156,156);grass.anisotropy=8;textures.push(grass);
    const grassMat=customMat({map:grass,color:'#eef2d5',roughness:1});
    const terrainGeo=new T.PlaneGeometry(1000,1000,1,1);terrainGeo.rotateX(-Math.PI/2);geometries.push(terrainGeo);mesh(terrainGeo,grassMat,0,-.08,0).castShadow=false;
    const grain=texture((c,w,h)=>{c.fillStyle='#aaaaaa';c.fillRect(0,0,w,h);for(let i=0;i<15000;i++){c.fillStyle=rnd()>.5?'#b0b0b0':'#a3a3a3';c.fillRect(rnd()*w,rnd()*h,1,1);}});grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.colorSpace=T.NoColorSpace;
    const pavement=customMat({color:'#e7d4ad',roughness:1,bumpMap:grain,bumpScale:.035});
    const asphalt=customMat({color:'#75867c',roughness:1,bumpMap:grain,bumpScale:.025});
    function strip(x,z,w,d,m,y=.01){const g=new T.PlaneGeometry(w,d,Math.max(1,Math.ceil(w/3)),Math.max(1,Math.ceil(d/3)));g.rotateX(-Math.PI/2);geometries.push(g);const o=mesh(g,m,x,y,z);o.castShadow=false;return o;}
    strip(0,65,176,10.5,asphalt);strip(61,0,10,140,asphalt);strip(-61,-3,9,125,asphalt);
    strip(0,55.5,109,4.2,pavement,.03);strip(51.5,0,4,117,pavement,.03);strip(-51.5,0,4,117,pavement,.03);
    for(const z of [26,-1,-28,-55])strip(0,z,101,3.7,pavement,.03);
    for(const x of [-17,17])strip(x,-3,2.2,112,pavement,.03);
    // Subtle individual pavers, with moss seams instead of a featureless plane.
    for(const z of [26,-1,-28,-55,55.5])for(let x=-49;x<50;x+=1.6){box(x,.045,z,.032,.02,3.6,'#c7ba99');}
    for(let x=-80;x<82;x+=7)box(x,.027,65,3,.012,.16,'#eee7c7');
    for(let z=-60;z<62;z+=7)box(61,.027,z,.16,.012,3,'#eee7c7');
    for(let z=61;z<=69;z+=1.3)box(0,.035,z,4.2,.015,.65,'#f5ecd0');
    // Warm, softly worn facade microtexture. Geometry handles every window,
    // recessed door, balcony rail, sill and rooftop cap rather than flat cards.
    woodTexture=texture((c,w,h)=>{
        c.fillStyle='#e8e1cf';c.fillRect(0,0,w,h);
        for(let i=0;i<90;i++){c.strokeStyle=i%3?'#d7ccb640':'#b7a58d40';c.lineWidth=.7+rnd()*1.5;c.beginPath();const y=i*h/90;for(let x=0;x<=w;x+=8){const yy=y+Math.sin(x*.035+i)*2;if(x)c.lineTo(x,yy);else c.moveTo(x,yy);}c.stroke();}
    });woodTexture.wrapS=woodTexture.wrapT=T.RepeatWrapping;woodTexture.repeat.set(2,1);
    const windowMats=Array.from({length:4},(_,variant)=>{
        const glass=texture((c,w,h)=>{
            const g=c.createLinearGradient(0,0,w*.3,h);g.addColorStop(0,['#819caa','#78929d','#879fa6','#c7c8a6'][variant]);g.addColorStop(1,['#a7bbb4','#92ada9','#b6c4b6','#d5cfaa'][variant]);c.fillStyle=g;c.fillRect(0,0,w,h);
            c.fillStyle='#384e5026';c.fillRect(0,h*.72,w,h*.28);
            if(variant!==1){for(let i=0;i<8;i++){c.fillStyle=i%2?'#e9dfbf91':'#f3e9c99c';c.fillRect(i*8,0,8,h);c.fillRect(w-64+i*8,0,8,h);}}
            c.fillStyle='#f4ffed22';c.beginPath();c.moveTo(0,h*.1);c.lineTo(w*.9,0);c.lineTo(w,h*.14);c.lineTo(0,h*.55);c.fill();
            c.fillStyle='#485e5b35';c.fillRect(0,0,w,9);c.fillRect(0,h-7,w,7);
        },256,256);
        return customMat({map:glass,color:'#fffbea',roughness:.28,metalness:.08});
    });
    const brick=texture((c,w,h)=>{
        c.fillStyle='#c9bba3';c.fillRect(0,0,w,h);
        for(let row=0;row<8;row++)for(let col=-1;col<5;col++){
            const x=col*w/4+(row%2)*w/8,y=row*h/8;
            c.fillStyle=['#bda78d','#b59d82','#b6a089','#c2ad94'][(col+row+8)%4];c.fillRect(x+2,y+2,w/4-4,h/8-4);
            c.fillStyle='#e3d1ae1c';c.fillRect(x+4,y+4,w/4-8,2);
        }
    },512,256);brick.wrapS=brick.wrapT=T.RepeatWrapping;brick.repeat.set(8,1);
    const brickMaterial=customMat({map:brick,color:'#f2e6cf',roughness:.96,bumpMap:grain,bumpScale:.045});
    const roofColor=['#7d9990','#96a59b','#8ca5a1'];
    for(const b of world.buildings){
        owner={id:String(b.id),group:new T.Group(),bounds:new T.Box3(new T.Vector3(b.x-13.3,0,b.z-4.2),new T.Vector3(b.x+13.3,b.height+1.2,b.z+4.2)),faded:false};scene.add(owner.group);buildingGroups.push(owner);
        const plaster=customMat({color:['#f1e9d1','#eee2cc','#e9e7d4'][b.id%3],roughness:.95,bumpMap:grain,bumpScale:.025});
        rounded(b.x,b.height/2+.14,b.z,b.width,b.height,b.depth,plaster,.12);
        box(b.x,.5,b.z,b.width+.2,1,b.depth+.15,'#c4b7a0');
        box(b.x,b.height+.2,b.z,b.width+.55,.42,b.depth+.55,'#e5e1cb');
        box(b.x,b.height+.45,b.z,b.width-.5,.2,b.depth-.5,roofColor[b.id%3]);
        for(const dx of [-8,8]){box(b.x+dx,b.height+.7,b.z,2.8,.6,2.3,'#d2d7ca');box(b.x+dx,b.height+1.05,b.z,3,.14,2.5,'#aab9ac');}
        const trim=mat('#faf2dc'), rail=mat('#d3d8cb');
        for(const side of [-1,1]){
            const front=b.z+side*(b.depth/2+.06);
            box(b.x,1,front,b.width,1.8,.12,brickMaterial);
            for(let f=0;f<7;f++){
                const y=2.2+f*(b.height-2.4)/7;
                for(let col=0;col<10;col++){
                    if(f<2&&(col===4||col===5))continue; // clear entrance lobby bay
                    const x=b.x-11+col*2.44;
                    box(x,y,front,1.6,1.6,.2,trim);
                    box(x,y+.04,front+side*.13,1.3,1.31,.08,windowMats[(f*3+col*7+b.id)%4]);
                    box(x,y+.04,front+side*.19,.055,1.31,.035,trim);
                    box(x,y-.7,front+side*.22,1.85,.14,.58,trim);
                    if((col+f+b.id)%7===0)box(x+.4,y,front+side*.2,.2,1.25,.04,'#e0d8bc');
                    if(col%3===0){
                        box(x,y-.71,front+side*.54,1.95,.18,1,trim);
                        box(x,y-.32,front+side*.98,1.9,.08,.08,rail);
                        for(let k=0;k<5;k++)box(x-.85+k*.42,y-.52,front+side*.98,.045,.42,.045,rail);
                        if((f+col)%4===0){box(x-.5,y-.54,front+side*.55,.36,.27,.38,'#a77e60');ball(x-.5,y-.32,front+side*.55,.3,.2,.25,'#618e51');}
                    }
                }
            }
            // Central glazed entrance and tiled porch.
            box(b.x,1.7,front+side*.17,2.2,3.25,.25,'#71928a');
            box(b.x,1.7,front+side*.35,.07,3.1,.08,'#d9dfd2');
            for(const dx of [-.18,.18])box(b.x+dx,1.25,front+side*.4,.05,.45,.05,'#d1bb87');
            box(b.x+1.45,1.5,front+side*.18,.24,.45,.13,'#7f8b81');
            for(let row=0;row<3;row++)for(let col=0;col<3;col++){
                box(b.x-2.5+col*.3,.85+row*.24,front+side*.2,.27,.2,.19,'#9ca18c');
                box(b.x-2.5+col*.3,.9+row*.24,front+side*.31,.18,.015,.012,'#4d6459');
            }
            box(b.x,3.95,front+side*.7,4,.24,2.3,'#718f7b');
            for(const dx of [-1.7,1.7])box(b.x+dx,1.96,front+side*1.25,.12,3.85,.12,'#e6e0c6');
            box(b.x,.15,front+side*1.3,4.2,.3,2.6,'#c2b8a0');
            box(b.x,.07,front+side*2.1,4.8,.14,1.5,'#d9cbb0');
            for(const dx of [-3.7,3.7]){rounded(b.x+dx,.45,front+side*1.4,1.4,.85,1.4,'#bcad8b',.08);for(let j=0;j<4;j++)ball(b.x+dx+(rnd()-.5)*.8,.95+rnd()*.3,front+side*1.4+(rnd()-.5)*.8,.45,.45,.45,'#68955a');}
        }
        for(const dz of [-b.depth/2,b.depth/2]){
            box(b.x,b.height+.85,b.z+dz,b.width,.07,.07,'#8c9b8d');
            for(let i=-12;i<=12;i+=3)box(b.x+i,b.height+.6,b.z+dz,.05,.5,.05,'#8c9b8d');
        }
        for(const side of [-1,1]){
            for(let f=0;f<7;f++)for(const dz of [-1.7,1.7]){
                const y=2.15+f*(b.height-2.4)/7;
                box(b.x+side*(b.width/2+.08),y,b.z+dz,.16,1.4,1.24,'#f5eedb');
                box(b.x+side*(b.width/2+.18),y+.03,b.z+dz,.08,1.13,.99,windowMats[(f+b.id)%4]);
                box(b.x+side*(b.width/2+.23),y+.03,b.z+dz,.04,1.13,.05,'#f5eedb');
            }
            box(b.x+side*(b.width/2+.025),b.height/2,b.z,.13,b.height-1,1.2,'#d1cdb6');
            const numberTex=texture((c,w,h)=>{c.clearRect(0,0,w,h);c.fillStyle='#718379';c.font='600 130px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(b.id),w/2,h/2);},256,128);
            const numberMat=surface(new T.MeshBasicMaterial({map:numberTex,transparent:true,depthWrite:false}));materials.push(numberMat);
            const number=mesh(new T.PlaneGeometry(2.4,1.2),numberMat,b.x+side*(b.width/2+.11),b.height*.78,b.z);number.rotation.y=side*Math.PI/2;number.castShadow=false;
        }
    }
    owner=null;
    const leafTexture=assets.leaf;leafTexture.colorSpace=T.SRGBColorSpace;leafTexture.anisotropy=8;textures.push(leafTexture);
    const leafGeo=new T.PlaneGeometry(1.7,1.7,4,4);
    const leafPositions=leafGeo.attributes.position;
    for(let i=0;i<leafPositions.count;i++){const x=leafPositions.getX(i),y=leafPositions.getY(i);leafPositions.setZ(i,.17*(1-x*x/.73)+.09*Math.cos(y*2));}
    leafGeo.computeVertexNormals();geometries.push(leafGeo);
    const leafDepth=surface(new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,map:leafTexture,alphaTest:.4,side:T.DoubleSide}),.035);
    materials.push(leafDepth);
    const leafMats=['#d7ecc7','#f1efc9','#c7e1bb','#d9e7c0','#e8efd4'].map(color=>{const m=customMat({map:leafTexture,alphaTest:.4,color,roughness:.94,emissive:'#85a957',emissiveIntensity:.075,side:T.DoubleSide},.035);m.userData.leaf=true;return m;});
    const bark=texture((c,w,h)=>{c.fillStyle='#b69560';c.fillRect(0,0,w,h);for(let i=0;i<180;i++){c.strokeStyle=i%2?'#b18c55':'#bda16a';c.lineWidth=2+rnd()*5;c.beginPath();let x=rnd()*w;c.moveTo(x,0);for(let y=0;y<=h;y+=16)c.lineTo(x+Math.sin(y*.05+i)*4,y);c.stroke();}});bark.wrapS=bark.wrapT=T.RepeatWrapping;
    const barkMat=customMat({map:bark,color:'#ffe5b3',roughness:1});
    const trunkGeo=new T.LatheGeometry([new T.Vector2(.57,0),new T.Vector2(.42,.2),new T.Vector2(.31,.7),new T.Vector2(.28,2),new T.Vector2(.18,3.2),new T.Vector2(.1,4)],16);geometries.push(trunkGeo);
    const rootGeo=new T.ConeGeometry(.24,1.2,8);geometries.push(rootGeo);
    function tree(x,z,s=1){
        trees.push({x,z,r:.55*s});
        batch(trunkGeo,barkMat,x,.02,z,s,s,s);
        for(let j=0;j<5;j++){const a=j*Math.PI*2/5;batch(rootGeo,barkMat,x+Math.sin(a)*.37*s,.16*s,z+Math.cos(a)*.37*s,.8*s,.7*s,s,.75*Math.cos(a),a,-.75*Math.sin(a));}
        // A broad irregular crown sampled over a sphere, not stacked rings.
        // Every side has the same foliage density when the camera orbits it.
        ball(x,4.05*s,z,1.8*s,1.3*s,1.65*s,'#668e4d');
        ball(x-.9*s,3.8*s,z+.15*s,1.15*s,1.05*s,1.2*s,'#668e4d');
        ball(x+.75*s,4.55*s,z-.25*s,1.25*s,1.05*s,1.2*s,'#668e4d');
        const count=144;
        for(let j=0;j<count;j++){
            const ny=1-2*(j+.5)/count,a=j*2.399963229728653,r=Math.sqrt(1-ny*ny),nx=Math.cos(a)*r,nz=Math.sin(a)*r;
            const variation=1+.07*Math.sin(a*3)+.04*Math.cos(a*7);
            const px=x+nx*1.95*s*variation,pz=z+nz*1.78*s*variation,py=(4.1+ny*1.48)*s;
            const yaw=Math.atan2(nx,nz),tilt=-Math.asin(ny)*.7;
            batch(leafGeo,leafMats[j%5],px,py,pz,s*.85,s*.88,s,tilt,yaw,(rnd()-.5)*.35);
        }
        shadow(x,z,2.2*s,1.8*s,.22);
    }
    const shadowTex=texture((c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(33,49,21,.5)');g.addColorStop(.5,'rgba(33,49,21,.25)');g.addColorStop(1,'rgba(33,49,21,0)');c.fillStyle=g;c.fillRect(0,0,w,h);});
    const shadowMats=new Map(),shadowGeo=new T.PlaneGeometry(1,1);shadowGeo.rotateX(-Math.PI/2);geometries.push(shadowGeo);
    function shadow(x,z,sx,sz,opacity=.22){if(!shadowMats.has(opacity)){const m=surface(new T.MeshBasicMaterial({map:shadowTex,transparent:true,opacity,depthWrite:false}));materials.push(m);shadowMats.set(opacity,m);}batch(shadowGeo,shadowMats.get(opacity),x,.051,z,sx*2,1,sz*2);}
    // Dense plantings close to the paths make the world read at walking scale.
    const bushMat=customMat({color:'#659854',roughness:1},.015);
    function bush(x,z,s=1){ball(x,.58*s,z,.95*s,.6*s,.8*s,bushMat);for(let i=0;i<13;i++){const a=i*2.4;batch(leafGeo,leafMats[i%5],x+Math.cos(a)*.65*s,.65*s+Math.sin(i)*.2,z+Math.sin(a)*.5*s,.35*s,.46*s,.4*s,-.9,a,0);}shadow(x,z,s,.75*s,.2);}
    function flower(x,z,color,s=.6){
        batch(cylinder,mat('#6b974f'),x,.4*s,z,.025*s,.8*s,.025*s);
        for(let k=0;k<5;k++){const a=k*Math.PI*2/5;ball(x+Math.cos(a)*.19*s,.85*s,z+Math.sin(a)*.19*s,.19*s,.1*s,.13*s,color);}
        ball(x,.87*s,z,.1*s,.1*s,.1*s,'#edc85d');
        batch(leafGeo,leafMats[0],x+.13*s,.3*s,z,.17*s,.25*s,.17*s,-1.2,1,.3);
    }
    for(const b of world.buildings){
        tree(b.x-9.8,b.z+9,.88);tree(b.x+10,b.z+9,.95);
        for(let x=-10;x<=10;x+=2.2){if(Math.abs(x)<3)continue;bush(b.x+x,b.z-5.5,.65);}
        for(const side of [-1,1]){
            box(b.x+side*6.3,.06,b.z+6.1,5.4,.1,1.1,'#a99472');
            for(const dz of [-.63,.63])box(b.x+side*6.3,.12,b.z+6.1+dz,5.7,.17,.14,'#c5bba2');
        }
        for(const side of [-1,1])for(let i=0;i<7;i++)flower(b.x+side*(4.2+i*.65),b.z+6.1,['#f4e9d2','#d7a6b9','#efe09b'][b.id%3],.85);
        shadow(b.x,b.z,14,4,.34);
        strip(b.x,b.z+9,3.1,12,pavement,.04);
    }
    // Front garden frames the initial play camera rather than a distant map view.
    for(const x of [-24,-11,11,24,42,-43])tree(x,51,.95+rnd()*.12);
    for(let x=-46;x<=46;x+=2.4){if(Math.abs(x)<6||Math.abs(x+11)<2.3||Math.abs(x-11)<2.3)continue;bush(x,58.2,.6);}
    for(let z=-54;z<48;z+=13){tree(53,z,1);tree(-52,z+4,.92);}
    for(let x=-78;x<82;x+=7)tree(x,-64-rnd()*10,1.05+rnd()*.25);
    // Clipped grass tufts, clover and small fallen leaves, rendered as instances.
    const bladeShape=new T.Shape();bladeShape.moveTo(-.035,0);bladeShape.quadraticCurveTo(.07,.25,.13,.45);bladeShape.quadraticCurveTo(.03,.22,.035,0);bladeShape.closePath();
    const bladeGeo=new T.ShapeGeometry(bladeShape);geometries.push(bladeGeo);
    const bladeMat=customMat({color:'#79ab54',side:T.DoubleSide,roughness:1},.025);
    for(let i=0;i<6000;i++){
        const x=rnd()*108-54,z=rnd()*117-59;
        if(!world.canWalk(x,z,1))continue;
        if(world.buildings.some(b=>Math.abs(x-b.x)<1.8&&z>b.z+3.8&&z<b.z+15))continue;
        if([26,-1,-28,-55,55.5].some(p=>Math.abs(z-p)<2.3)||Math.abs(x-17)<1.3||Math.abs(x+17)<1.3)continue;
        batch(bladeGeo,bladeMat,x,.045,z,.6+rnd()*.5,.6+rnd()*.5,1,0,rnd()*Math.PI*2,0);
    }
    for(let i=0;i<110;i++){const x=(rnd()>.5?1:-1)*(5+rnd()*39),z=47+rnd()*5;flower(x,z,['#faf0da','#e4c869','#e1a5ac'][i%3],.6+rnd()*.25);}
    function bench(x,z){
        for(let j=0;j<4;j++)box(x,.85,z-.46+j*.3,3.2,.13,.24,'#b48959');
        for(let j=0;j<3;j++)box(x,1.35+j*.2,z-.7,3.2,.15,.16,'#b99161');
        for(const dx of [-1.1,1.1]){box(x+dx,.4,z,.14,.8,.9,'#50685c');box(x+dx,1,z-.7,.14,1.65,.14,'#50685c');}
        shadow(x,z,2,.9,.22);
    }
    bench(-16,26);bench(18,-1);bench(15,-57);bench(-18,-28);bench(-6,51);
    for(const z of [26,-1,-28,-55])for(const x of [-46.5,46.5]){
        batch(cylinder,mat('#657970'),x,2.6,z,.085,5.2,.085);box(x,5.2,z,.7,.12,.7,'#486357');rounded(x,4.9,z,.5,.55,.5,'#eddfac',.06);box(x,4.55,z,.65,.1,.65,'#486357');
    }
    function sign(text,x,z,width=3){
        box(x,1,z,.15,2,.15,'#9a774d');rounded(x,1.9,z,width,.8,.17,'#b69966',.07);
        const t=texture((c,w,h)=>{c.fillStyle='#b69966';c.fillRect(0,0,w,h);c.fillStyle='#fff1c9';c.font='650 47px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,w/2,h/2,w-20);},512,128);
        const m=surface(new T.MeshBasicMaterial({map:t}));materials.push(m);mesh(new T.PlaneGeometry(width-.12,.68),m,x,1.9,z+.1).castShadow=false;
    }
    sign('마을 입구',5,54,4.1);sign('유학로',-37,68);sign('동중리1길',61,26,4);sign('북중리3길',-58,-32,4);sign('산책로',14,-57);
    function house(x,z,i){const h=3.2+(i%3)*.8;rounded(x,h/2,z,7,h,7,['#ddceb4','#e6dac0','#cecdb8'][i%3],.1);box(x,h+.18,z,7.5,.35,7.5,'#8c9d91');for(let k=-1;k<=1;k++)box(x+k*2,h*.6,z+3.55,1.1,1.3,.12,'#86a1a0');box(x,.9,z+3.6,1.3,1.8,.15,'#617e73');}
    for(let i=0;i<11;i++)for(let row=0;row<2;row++)house(-65+i*13,82+row*13,i+row);
    for(let i=0;i<8;i++)for(let col=0;col<2;col++)house(-77-col*13,-48+i*14,i+col);
    function car(x,z,color){rounded(x,.67,z,4.2,1.05,1.85,color,.22);rounded(x+.1,1.42,z,2.3,.8,1.55,'#62827e',.18);box(x+.1,1.89,z,2.15,.11,1.5,color);for(const dx of [-1.25,1.25])for(const dz of [-.95,.95])batch(cylinder,mat('#3f4940'),x+dx,.38,z+dz,.34,.2,.34,Math.PI/2);for(const dx of [-2.13,2.13])box(x+dx,.75,z,.06,.2,1.3,'#e9e6cd');shadow(x,z,2.5,1.2,.35);}
    car(31,62.3,'#e8e3d1');car(-30,67.5,'#9eafb0');
    const temporary=new T.Object3D();
    for(const b of batches.values()){
        const inst=new T.InstancedMesh(b.geo,b.mat,b.items.length);
        b.items.forEach((p,i)=>{temporary.position.set(p[0],p[1],p[2]);temporary.scale.set(p[3],p[4],p[5]);temporary.rotation.set(p[6],p[7],p[8]);temporary.updateMatrix();inst.setMatrixAt(i,temporary.matrix);});
        inst.userData.foliage=b.mat.userData.leaf||b.geo===bladeGeo;inst.castShadow=b.geo!==shadowGeo&&b.geo!==bladeGeo;inst.receiveShadow=true;inst.customDepthMaterial=b.mat.userData.leaf?leafDepth:depth;(b.owner?.group||scene).add(inst);
    }
    return {trees,buildingGroups,shadowTex,surface,materials,textures,geometries,
        dispose(){scene.traverse(o=>{o.geometry?.dispose();});materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());depth.dispose();}
    };
}

// Sculpted and skinned offline in Blender; runtime loads the exported GLB.
export function buildResident(T,scene,asset){
    const character=new T.Group();character.name='VillageResident';scene.add(character);
    const model=asset.scene;character.add(model);
    model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;node.frustumCulled=false;}});
    model.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(model);model.position.y-=bounds.min.y;
    const mixer=new T.AnimationMixer(model),actions={};
    for(const name of ['Idle','Walk','Run']){
        const source=asset.animations.find(c=>c.name===name||c.name.endsWith('|'+name));
        if(!source)throw Error('Missing resident animation: '+name);
        const clip=source.clone();clip.tracks=clip.tracks.filter(track=>!track.name.includes('Eye'));
        actions[name]=mixer.clipAction(clip);actions[name].play();actions[name].setEffectiveWeight(name==='Idle'?1:0);
    }
    const blinkSource=asset.animations.find(c=>c.name==='Blink');
    if(blinkSource){const blink=blinkSource.clone();blink.tracks=blink.tracks.filter(track=>track.name.includes('Eye')&&track.name.endsWith('.scale'));if(blink.tracks.length)mixer.clipAction(blink).play();}
    let movement=0,sprint=0;
    return {character,model,mixer,update(dt,speed,isRunning){
        const a=1-Math.exp(-dt*12);movement+=(Math.min(1,speed/.4)-movement)*a;sprint+=((isRunning?1:0)-sprint)*a;
        actions.Idle.setEffectiveWeight(1-movement);actions.Walk.setEffectiveWeight(movement*(1-sprint));actions.Run.setEffectiveWeight(movement*sprint);
        actions.Walk.timeScale=Math.max(.6,speed/2.2);actions.Run.timeScale=Math.max(.6,speed/4.1);mixer.update(dt);
    },dispose(){mixer.stopAllAction();const materials=new Set();model.traverse(node=>{node.geometry?.dispose();for(const m of (Array.isArray(node.material)?node.material:node.material?[node.material]:[]))materials.add(m);});for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}}};
}
