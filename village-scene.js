// Original 3D scenery, with the relative apartment layout from the supplied maps.
export function buildVillage(T, scene, world, uniforms, assets={}) {
    let seed = 63892;
    const rnd = () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296; };
    const textures=[], materials=[], geometries=[], trees=[], buildingGroups=[];
    const colorMats=new Map(), roundedCache=new Map(), batches=new Map();
    let owner=null;
    function texture(draw,w=256,h=256){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;textures.push(t);return t;}
    // Camera-relative curvature gives distant scenery the gently rolling horizon
    // seen in the official gameplay reference. Shadow depth uses the same bend.
    function bend(mat,wind=0){
        mat.onBeforeCompile=shader=>{
            shader.uniforms.villageZ=uniforms.z;shader.uniforms.villageTime=uniforms.time;
            shader.vertexShader='uniform float villageZ;uniform float villageTime;\n'+shader.vertexShader;
            shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
                vec4 villagePosition=vec4(transformed,1.0);
                #ifdef USE_INSTANCING
                    villagePosition=instanceMatrix*villagePosition;
                #endif
                villagePosition=modelMatrix*villagePosition;
                float villageDistance=max(0.0,villageZ-villagePosition.z-12.0);
                villagePosition.y-=villageDistance*villageDistance*0.0075;
                villagePosition.x+=sin(villageTime*1.1+villagePosition.x*0.31+villagePosition.z*0.22)*${wind.toFixed(3)};
                vec4 mvPosition=viewMatrix*villagePosition;
                gl_Position=projectionMatrix*mvPosition;
            `);
        };
        mat.customProgramCacheKey=()=> 'village-bend-v2-'+wind;
        return mat;
    }
    const depth=bend(new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking}));
    function mat(color, options={}){
        const key=color+JSON.stringify(options)+String(owner?.id||'');
        if(colorMats.has(key))return colorMats.get(key);
        const m=bend(new T.MeshStandardMaterial({color,roughness:.88,...options}));materials.push(m);colorMats.set(key,m);return m;
    }
    function customMat(options,wind=0){const m=bend(new T.MeshStandardMaterial(options),wind);materials.push(m);return m;}
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
    grass.colorSpace=T.SRGBColorSpace;grass.wrapS=grass.wrapT=T.RepeatWrapping;grass.repeat.set(44,44);grass.anisotropy=8;textures.push(grass);
    const grassMat=customMat({map:grass,color:'#c6f0b1',roughness:1});
    const terrainGeo=new T.PlaneGeometry(280,280,140,140);terrainGeo.rotateX(-Math.PI/2);geometries.push(terrainGeo);mesh(terrainGeo,grassMat,0,-.08,0).castShadow=false;
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
    const roofColor=['#7d9990','#96a59b','#8ca5a1'];
    for(const b of world.buildings){
        owner={id:String(b.id),group:new T.Group(),bounds:new T.Box3(new T.Vector3(b.x-13.3,0,b.z-4.2),new T.Vector3(b.x+13.3,b.height+1.2,b.z+4.2)),faded:false};scene.add(owner.group);buildingGroups.push(owner);
        const plaster=customMat({color:['#f1e9d1','#eee2cc','#e9e7d4'][b.id%3],roughness:.95,bumpMap:grain,bumpScale:.025});
        rounded(b.x,b.height/2+.14,b.z,b.width,b.height,b.depth,plaster,.12);
        box(b.x,.5,b.z,b.width+.2,1,b.depth+.15,'#c4b7a0');
        box(b.x,b.height+.2,b.z,b.width+.55,.42,b.depth+.55,'#e5e1cb');
        box(b.x,b.height+.45,b.z,b.width-.5,.2,b.depth-.5,roofColor[b.id%3]);
        for(const dx of [-8,8]){box(b.x+dx,b.height+.7,b.z,2.8,.6,2.3,'#d2d7ca');box(b.x+dx,b.height+1.05,b.z,3,.14,2.5,'#aab9ac');}
        const windowMat=customMat({color:'#8faeb3',roughness:.33,metalness:.04});
        const trim=mat('#faf2dc'), rail=mat('#d3d8cb');
        for(const side of [-1,1]){
            const front=b.z+side*(b.depth/2+.06);
            box(b.x,1,front,b.width,1.8,.12,'#c5bba4');
            for(let f=0;f<7;f++){
                const y=2.2+f*(b.height-2.4)/7;
                for(let col=0;col<10;col++){
                    const x=b.x-11+col*2.44;
                    box(x,y,front,1.6,1.6,.2,trim);
                    box(x,y+.04,front+side*.13,1.3,1.31,.08,windowMat);
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
            box(b.x,1.3,front+side*.17,2.2,2.55,.25,'#71928a');
            box(b.x,1.4,front+side*.35,.07,2.3,.08,'#d9dfd2');
            box(b.x,1.4,front+side*.4,.09,.7,.07,'#f0e8cc');
            box(b.x,2.9,front+side*.7,4,.24,2.3,'#718f7b');
            for(const dx of [-1.7,1.7])box(b.x+dx,1.42,front+side*1.25,.12,2.8,.12,'#e6e0c6');
            box(b.x,.15,front+side*1.3,4.2,.3,2.6,'#c2b8a0');
            box(b.x,.07,front+side*2.1,4.8,.14,1.5,'#d9cbb0');
            for(const dx of [-3.7,3.7]){rounded(b.x+dx,.45,front+side*1.4,1.4,.85,1.4,'#bcad8b',.08);for(let j=0;j<4;j++)ball(b.x+dx+(rnd()-.5)*.8,.95+rnd()*.3,front+side*1.4+(rnd()-.5)*.8,.45,.45,.45,'#68955a');}
        }
        for(const side of [-1,1]){
            box(b.x+side*(b.width/2+.025),b.height/2,b.z,.13,b.height-1,1.2,'#d1cdb6');
            const numberTex=texture((c,w,h)=>{c.clearRect(0,0,w,h);c.fillStyle='#718379';c.font='600 130px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(b.id),w/2,h/2);},256,128);
            const numberMat=bend(new T.MeshBasicMaterial({map:numberTex,transparent:true,depthWrite:false}));materials.push(numberMat);
            const number=mesh(new T.PlaneGeometry(2.4,1.2),numberMat,b.x+side*(b.width/2+.11),b.height*.78,b.z);number.rotation.y=side*Math.PI/2;number.castShadow=false;
        }
    }
    owner=null;
    const leafTexture=assets.leaf;leafTexture.colorSpace=T.SRGBColorSpace;leafTexture.anisotropy=8;textures.push(leafTexture);
    const leafGeo=new T.PlaneGeometry(1.7,1.7,4,4);
    const leafPositions=leafGeo.attributes.position;
    for(let i=0;i<leafPositions.count;i++){const x=leafPositions.getX(i),y=leafPositions.getY(i);leafPositions.setZ(i,.17*(1-x*x/.73)+.09*Math.cos(y*2));}
    leafGeo.computeVertexNormals();geometries.push(leafGeo);
    const leafDepth=bend(new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,map:leafTexture,alphaTest:.4,side:T.DoubleSide}),.035);
    materials.push(leafDepth);
    const leafMats=['#d7ecc7','#f1efc9','#c7e1bb','#d9e7c0','#e8efd4'].map(color=>{const m=customMat({map:leafTexture,alphaTest:.4,color,roughness:.94,emissive:'#85a957',emissiveIntensity:.22,side:T.DoubleSide},.035);m.userData.leaf=true;return m;});
    const bark=texture((c,w,h)=>{c.fillStyle='#b69560';c.fillRect(0,0,w,h);for(let i=0;i<180;i++){c.strokeStyle=i%2?'#b18c55':'#bda16a';c.lineWidth=2+rnd()*5;c.beginPath();let x=rnd()*w;c.moveTo(x,0);for(let y=0;y<=h;y+=16)c.lineTo(x+Math.sin(y*.05+i)*4,y);c.stroke();}});bark.wrapS=bark.wrapT=T.RepeatWrapping;
    const barkMat=customMat({map:bark,color:'#ffe5b3',roughness:1});
    const trunkGeo=new T.LatheGeometry([new T.Vector2(.57,0),new T.Vector2(.42,.2),new T.Vector2(.31,.7),new T.Vector2(.28,2),new T.Vector2(.18,3.2),new T.Vector2(.1,4)],16);geometries.push(trunkGeo);
    const rootGeo=new T.ConeGeometry(.24,1.2,8);geometries.push(rootGeo);
    function tree(x,z,s=1){
        trees.push({x,z,r:.55*s});
        batch(trunkGeo,barkMat,x,.02,z,s,s,s);
        for(let j=0;j<5;j++){const a=j*Math.PI*2/5;batch(rootGeo,barkMat,x+Math.sin(a)*.37*s,.16*s,z+Math.cos(a)*.37*s,.8*s,.7*s,s,.75*Math.cos(a),a,-.75*Math.sin(a));}
        // Solid inner crown under four scalloped, independently shaded leaf tiers.
        for(let k=0;k<3;k++)ball(x,(3.45+k*.65)*s,z,(1.4-k*.28)*s,.75*s,(1.4-k*.28)*s,'#649448');
        for(let tier=0;tier<4;tier++){
            const count=22-tier*3,radius=[1.55,1.7,1.4,.8][tier]*s,y=(3.1+tier*.6)*s;
            for(let j=0;j<count;j++){
                const a=(j/count)*Math.PI*2+tier*.34;
                batch(leafGeo,leafMats[(j+tier)%leafMats.length],x+Math.sin(a)*radius,y+(rnd()-.5)*.19,z+Math.cos(a)*radius,s*1.03,s*1.1,s, .42,a,(rnd()-.5)*.16);
            }
        }
        for(let j=0;j<16;j++){const a=j/16*Math.PI*2;batch(leafGeo,leafMats[j%5],x+Math.sin(a)*.65*s,5.25*s,z+Math.cos(a)*.65*s,s*.85,s*.85,s,-.65,a,.1);}
        shadow(x,z,2.2*s,1.8*s,.22);
    }
    const shadowTex=texture((c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(33,49,21,.5)');g.addColorStop(.5,'rgba(33,49,21,.25)');g.addColorStop(1,'rgba(33,49,21,0)');c.fillStyle=g;c.fillRect(0,0,w,h);});
    const shadowMats=new Map(),shadowGeo=new T.PlaneGeometry(1,1);shadowGeo.rotateX(-Math.PI/2);geometries.push(shadowGeo);
    function shadow(x,z,sx,sz,opacity=.22){if(!shadowMats.has(opacity)){const m=bend(new T.MeshBasicMaterial({map:shadowTex,transparent:true,opacity,depthWrite:false}));materials.push(m);shadowMats.set(opacity,m);}batch(shadowGeo,shadowMats.get(opacity),x,.051,z,sx*2,1,sz*2);}
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
        const m=bend(new T.MeshBasicMaterial({map:t}));materials.push(m);mesh(new T.PlaneGeometry(width-.12,.68),m,x,1.9,z+.1).castShadow=false;
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
        inst.castShadow=b.geo!==shadowGeo&&b.geo!==bladeGeo;inst.receiveShadow=true;inst.customDepthMaterial=b.mat.userData.leaf?leafDepth:depth;(b.owner?.group||scene).add(inst);
    }
    return {trees,buildingGroups,shadowTex,bend,materials,textures,geometries,
        dispose(){scene.traverse(o=>{o.geometry?.dispose();});materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());depth.dispose();}
    };
}

export function buildResident(T,scene){
    const character=new T.Group(),torso=new T.Group(),head=new T.Group();scene.add(character);character.add(torso);torso.add(head);head.position.set(0,2.62,0);
    const materials=new Map();const m=c=>{if(!materials.has(c))materials.set(c,new T.MeshStandardMaterial({color:c,roughness:.86}));return materials.get(c);};
    const sphere=new T.SphereGeometry(1,32,24);
    function part(geo,c,x,y,z,sx=1,sy=1,sz=1,parent=torso){const o=new T.Mesh(geo,m(c));o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
    const skin='#f2cba6',hair='#604631';
    part(sphere,skin,0,0,0,.84,.87,.77,head);
    // Rounded cap and individually curved locks form a continuous hairstyle.
    const cap=part(new T.SphereGeometry(.86,32,24,0,Math.PI*2,0,Math.PI*.57),hair,0,.08,-.035,1,1,1,head);cap.rotation.x=-.17;
    for(const [x,y,z,sx,sy,sz,rz] of [[-.65,.04,.12,.24,.55,.45,-.1],[.65,.04,.12,.24,.55,.45,.1],[-.47,.48,.52,.29,.4,.28,-.5],[-.16,.55,.64,.27,.4,.23,-.5],[.2,.56,.63,.3,.3,.23,-.3],[.46,.48,.49,.31,.28,.24,.1]]){const lock=part(sphere,hair,x,y,z,sx,sy,sz,head);lock.rotation.z=rz;}
    for(const side of [-1,1]){
        part(sphere,skin,side*.8,-.09,-.02,.15,.23,.19,head);
        part(sphere,'#e6ac91',side*.82,-.09,.06,.075,.13,.07,head);
        part(sphere,'#fff7e4',side*.29,.02,.68,.21,.285,.06,head);
        part(sphere,'#36382d',side*.27,.035,.735,.135,.22,.042,head);
        part(sphere,'#fffdf0',side*.235,.105,.776,.037,.047,.015,head);
        part(sphere,'#e5a18a',side*.49,-.23,.63,.15,.075,.025,head);
        const brow=part(new T.CapsuleGeometry(.025,.22,3,8),hair,side*.29,.35,.69,1,1,1,head);brow.rotation.z=side*.17+Math.PI/2;
    }
    const nose=part(new T.ConeGeometry(.105,.15,3), '#e4a67e',0,-.12,.81,1,1,1,head);nose.rotation.x=Math.PI/2;nose.rotation.z=Math.PI;
    const smilePath=new T.QuadraticBezierCurve3(new T.Vector3(-.14,-.35,.7),new T.Vector3(0,-.46,.76),new T.Vector3(.14,-.35,.7));
    part(new T.TubeGeometry(smilePath,16,.022,6,false),'#a26853',0,0,0,1,1,1,head);
    // Shirt profile has actual shoulders, a woven check and a stitched collar.
    const clothCanvas=document.createElement('canvas');clothCanvas.width=clothCanvas.height=256;const cc=clothCanvas.getContext('2d');cc.fillStyle='#f0d99b';cc.fillRect(0,0,256,256);cc.fillStyle='#769686';for(let i=0;i<256;i+=48){cc.fillRect(i,0,18,256);cc.fillRect(0,i,256,18);}cc.fillStyle='#fff0c6';for(let i=28;i<256;i+=48){cc.fillRect(i,0,3,256);cc.fillRect(0,i,256,3);}const cloth=new T.CanvasTexture(clothCanvas);cloth.colorSpace=T.SRGBColorSpace;
    const shirtMat=new T.MeshStandardMaterial({map:cloth,roughness:1});
    const bodyGeo=new T.LatheGeometry([new T.Vector2(.4,.85),new T.Vector2(.47,.93),new T.Vector2(.45,1.38),new T.Vector2(.52,1.58),new T.Vector2(.32,1.8),new T.Vector2(.2,1.83)],24);
    const shirt=new T.Mesh(bodyGeo,shirtMat);torso.add(shirt);shirt.castShadow=true;shirt.receiveShadow=true;
    part(new T.CylinderGeometry(.19,.18,.3,16),skin,0,1.92,0);
    for(const side of [-1,1]){const collar=part(new T.SphereGeometry(1,12,8),'#f7edcc',side*.14,1.77,.32,.15,.08,.2);collar.rotation.z=side*.5;}
    const shorts=part(new T.CylinderGeometry(.4,.42,.35,16),'#6d8a8a',0,.82,0,1,1,.85);
    const limbs=[];
    for(const side of [-1,1]){
        const arm=new T.Group();arm.position.set(side*.44,1.56,0);torso.add(arm);arm.rotation.z=side*.12;
        const sleeve=new T.Mesh(new T.CapsuleGeometry(.18,.17,4,12),shirtMat);sleeve.position.y=-.1;arm.add(sleeve);sleeve.castShadow=true;
        part(new T.CapsuleGeometry(.125,.22,4,12),skin,0,-.35,.01,1,1,1,arm);part(sphere,skin,0,-.55,.02,.15,.18,.15,arm);
        const leg=new T.Group();leg.position.set(side*.23,.76,0);character.add(leg);
        part(new T.CapsuleGeometry(.13,.2,4,12),skin,0,-.2,0,1,1,1,leg);part(new T.CylinderGeometry(.135,.14,.18,12),'#f8efda',0,-.36,0,1,1,1,leg);
        part(sphere,'#f3e7cf',0,-.56,.11,.22,.11,.36,leg);part(sphere,'#6c7768',0,-.49,.08,.2,.14,.32,leg);part(new T.BoxGeometry(.25,.03,.12),'#f7edcf',0,-.38,.17,1,1,1,leg);
        limbs.push({arm,leg,side});
    }
    const eyes=head.children.filter(o=>[m('#36382d'),m('#fff7e4'),m('#fffdf0')].includes(o.material));
    return {character,torso,head,limbs,eyes,dispose(){character.traverse(o=>o.geometry?.dispose());materials.forEach(x=>x.dispose());shirtMat.dispose();cloth.dispose();}};
}
