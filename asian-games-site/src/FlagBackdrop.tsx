'use client';
import {useEffect,useRef} from 'react';
import * as T from 'three';
// The photograph provides the textile detail; the shader moves its folds continuously.
export default function FlagBackdrop(){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const host=ref.current;if(!host)return;
  let renderer:T.WebGLRenderer;try{renderer=new T.WebGLRenderer({alpha:true,antialias:false,powerPreference:'low-power'});}catch{return;}
  host.appendChild(renderer.domElement);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,2);camera.position.z=1;
  const texture=new T.TextureLoader().load('./baseball-assets/taegeukgi-silk-v1.png');texture.colorSpace=T.SRGBColorSpace;
  const material=new T.ShaderMaterial({uniforms:{uMap:{value:texture},uTime:{value:0},uAspect:{value:1}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`uniform sampler2D uMap;uniform float uTime;uniform float uAspect;varying vec2 vUv;void main(){vec2 uv=vUv;float wave=sin(uv.x*9.-uTime*.7+uv.y*3.);uv.y+=wave*.022+sin(uv.x*17.+uTime*.45)*.009;uv.x+=sin(uv.y*8.+uTime*.4)*.012;float aspect=1.5;if(uAspect<aspect)uv.x=(uv.x-.5)*(uAspect/aspect)+.5;else uv.y=(uv.y-.5)*aspect/uAspect+.5;vec3 color=texture2D(uMap,clamp(uv,0.,1.)).rgb;float light=.88+.10*cos(vUv.x*9.-uTime*.7+vUv.y*3.);gl_FragColor=vec4(color*light,1.);}`});
  const geometry=new T.PlaneGeometry(2,2);scene.add(new T.Mesh(geometry,material));
  const resize=()=>{if(!host.clientWidth||!host.clientHeight)return;renderer.setSize(host.clientWidth,host.clientHeight);material.uniforms.uAspect.value=host.clientWidth/host.clientHeight;};resize();const observer=new ResizeObserver(resize);observer.observe(host);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;let visible=false,active=true,raf=0,last=0;
  const message=(event:MessageEvent)=>{if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='enjoy-asian-games-visibility')return;active=event.data.visible===true;if(active)resize();};
  window.addEventListener('message',message);
  const loop=(time:number)=>{raf=requestAnimationFrame(loop);if(!visible||!active||document.hidden||time-last<32)return;last=time;material.uniforms.uTime.value=reduced?0:time*.001;renderer.render(scene,camera);};
  const visibility=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;});visibility.observe(host);raf=requestAnimationFrame(loop);
  return()=>{window.removeEventListener('message',message);cancelAnimationFrame(raf);observer.disconnect();visibility.disconnect();geometry.dispose();material.dispose();texture.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
 },[]);
 return <div ref={ref} className="flag-cloth" style={{backgroundImage:"url(./baseball-assets/taegeukgi-silk-v1.png)"}} aria-hidden="true"/>;
}
