'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {type MotionValue} from 'framer-motion';
import {clamp} from './timeline';
type Props={hero:RefObject<HTMLElement>;players:RefObject<HTMLElement>;finale:RefObject<HTMLElement>;progress:MotionValue<number>;playerProgress:MotionValue<number>;finalProgress:MotionValue<number>};
export default function Stage({hero,players,finale,progress,playerProgress,finalProgress}:Props){
 const canvasRef=useRef<HTMLCanvasElement>(null),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 useEffect(()=>{
  let disposed=false,active=true,raf=0,cleanup=()=>{};
  import('./createStadium').then(({createStadium})=>{
   if(disposed||!canvasRef.current)return;
   let world:ReturnType<typeof createStadium>;
   try{world=createStadium(canvasRef.current);}catch{setStatus('error');return;}
   setStatus('ready');const reduced=matchMedia('(prefers-reduced-motion: reduce)');
   let target=window.scrollY,current=target,last=0,dirty=true;
   let metrics={heroTop:0,heroRange:1,playerTop:0,playerRange:1,finalTop:0,finalRange:1};
   const measure=()=>{const h=hero.current,p=players.current,f=finale.current;if(!h||!p||!f)return;metrics={heroTop:h.getBoundingClientRect().top+window.scrollY,heroRange:Math.max(1,h.offsetHeight-innerHeight),playerTop:p.getBoundingClientRect().top+window.scrollY,playerRange:Math.max(1,p.offsetHeight-innerHeight),finalTop:f.getBoundingClientRect().top+window.scrollY,finalRange:Math.max(1,f.offsetHeight-innerHeight)};world.resize();dirty=true;};
   const scroll=()=>{target=window.scrollY;if(Math.abs(target-current)>innerHeight*2)current=target;dirty=true;};
   const message=(e:MessageEvent)=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='enjoy-asian-games-visibility')return;active=e.data.visible===true;if(active){target=window.scrollY;dirty=true;}};
   const contextLost=(e:Event)=>{e.preventDefault();setStatus('error');active=false;};
   canvasRef.current.addEventListener('webglcontextlost',contextLost);
   const observer=new ResizeObserver(measure);[hero.current,players.current,finale.current].forEach(el=>{if(el)observer.observe(el);});
   window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('resize',measure);window.addEventListener('message',message);measure();
   const frame=(time:number)=>{
    raf=requestAnimationFrame(frame);const dt=Math.min((time-last)/1000,.05);last=time;
    if(!active||document.hidden)return;
    if(!dirty&&Math.abs(target-current)<.15)return;
    current=reduced.matches?target:current+(target-current)*(1-Math.exp(-dt*13));
    const hp=clamp((current-metrics.heroTop)/metrics.heroRange),pp=clamp((current-metrics.playerTop)/metrics.playerRange),fp=clamp((current-metrics.finalTop)/metrics.finalRange);
    progress.set(hp);playerProgress.set(pp);finalProgress.set(fp);
    try{if(current<=metrics.heroTop+metrics.heroRange+innerHeight)world.render(Math.min(.755,clamp((hp-.185)/.715)));dirty=false;}catch{setStatus('error');active=false;}
   };
   raf=requestAnimationFrame(frame);
   cleanup=()=>{cancelAnimationFrame(raf);observer.disconnect();window.removeEventListener('scroll',scroll);window.removeEventListener('resize',measure);window.removeEventListener('message',message);canvasRef.current?.removeEventListener('webglcontextlost',contextLost);world.dispose();};
  }).catch(()=>{if(!disposed)setStatus('error');});
  return()=>{disposed=true;cleanup();};
 },[hero,players,finale,progress,playerProgress,finalProgress]);
 return <div className="world-stage" data-renderer-status={status}><canvas ref={canvasRef} aria-label="스크롤로 움직이는 야구장: 심판 시점에서 투구, 타격, 홈런, 베이스 주루까지" role="img"/>{status!=='ready'&&<div className="scene-status" role="status"><span>2026 아시안게임 야구</span><p>{status==='loading'?'그라운드를 준비하고 있습니다.':'이 기기에서는 3D 장면을 표시할 수 없습니다.'}</p><a href="#players">선수와 경기 일정 보기 ↓</a></div>}</div>;
}
