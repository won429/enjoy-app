'use client';
import {motion,useTransform,useMotionValueEvent,type MotionValue} from 'framer-motion';
import {useState} from 'react';
const clubs=[['KIA','kia_logoo.png'],['삼성','samsung_logo.png'],['LG','lgtwins.png'],['두산','doosa.png'],['KT','kt_logo.png'],['SSG','ssglan.png'],['롯데','lotteegi.png'],['한화','hanwha_logo.png'],['NC','ncdin.png'],['키움','kiwoom.png']];
function Fragment({index,piece,file,progress}:{index:number;piece:number;file:string;progress:MotionValue<number>}){
 const start=index*.014,end=start+.014;
 const opacity=useTransform(progress,[start+.009,start+.0091,start+.011,end],[0,1,1,0]);
 const scale=useTransform(progress,[start,start+.004,start+.009,end],[.88,1,1.04,2.5]);
 const angle=piece*Math.PI/6+.3;
 const x=useTransform(progress,[start+.009,end],[0,Math.cos(angle)*(240+piece*19)]);
 const y=useTransform(progress,[start+.009,end],[0,Math.sin(angle)*(240+piece*19)]);
 const rotate=useTransform(progress,[start+.009,end],[0,(piece%2?1:-1)*(28+piece*9)]);
 const a=piece*30,b=(piece+1)*30,point=(degrees:number)=>`${50+Math.cos(degrees*Math.PI/180)*74}% ${50+Math.sin(degrees*Math.PI/180)*74}%`;
 return <motion.img className="club-logo logo-fragment" src={'./baseball-assets/clubs/'+file} alt="" aria-hidden="true" style={{x,y,rotate,scale,opacity,clipPath:`polygon(50% 50%,${point(a)},${point(b)})`}}/>;
}
function Club({index,name,file,progress}:{index:number;name:string;file:string;progress:MotionValue<number>}){
 const start=index*.014;
 const opacity=useTransform(progress,[start,start+.0015,start+.009,start+.0091],[index===0?1:0,1,1,0]);
 const scale=useTransform(progress,[start,start+.004,start+.009],[.88,1,1.04]);
 const y=useTransform(progress,[start,start+.004],[24,0]);
 return <div role="img" aria-label={name}><motion.img className="club-logo club-intact" src={'./baseball-assets/clubs/'+file} alt="" style={{opacity,scale,y}}/>{Array.from({length:12},(_,piece)=><Fragment key={piece} {...{index,piece,file,progress}}/>)}</div>;
}
function Smoke({index,progress}:{index:number;progress:MotionValue<number>}){
 const angle=index*2.399;
 const x=useTransform(progress,[.130,.162,.185],[Math.cos(angle)*40,Math.cos(angle)*230,Math.cos(angle)*470]);
 const y=useTransform(progress,[.130,.162,.185],[30,Math.sin(angle)*160-50,-260+Math.sin(angle)*230]);
 const scale=useTransform(progress,[.130,.155,.185],[.1,1.5,3]);
 const opacity=useTransform(progress,[.130,.144,.162,.185],[0,.65,.45,0]);
 return <motion.div className="opening-smoke" style={{x,y,scale,opacity}}/>;
}
export default function Opening({progress}:{progress:MotionValue<number>}){
 const [clubIndex,setClubIndex]=useState(()=>Math.max(0,Math.min(9,Math.floor(progress.get()/.014))));
 useMotionValueEvent(progress,'change',p=>setClubIndex(Math.max(0,Math.min(9,Math.floor(p/.014)))));
 const captionOpacity=useTransform(progress,[.128,.142],[1,0]);
 const hintOpacity=useTransform(progress,[0,.006],[1,0]);
 const revealOpacity=useTransform(progress,[.145,.16,.176,.185],[0,1,1,0]);
 const opacity=useTransform(progress,[0,.175,.19],[1,1,0]);
 const koreaOpacity=useTransform(progress,[.142,.158,.176,.19],[0,1,1,0]);
 const koreaScale=useTransform(progress,[.142,.16,.176,.19],[.65,1,1.12,15]);
 return <motion.div className="opening" style={{opacity}} aria-label="10개 구단 로고가 하나씩 확대되어 부서지고 연기 속에서 대한민국 로고가 등장하는 장면"><svg className="effect-definitions" aria-hidden="true"><defs><filter id="opening-vapor" x="-50%" y="-50%" width="200%" height="200%"><feTurbulence type="fractalNoise" baseFrequency=".014" numOctaves="3" seed="9" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="65"/><feGaussianBlur stdDeviation="5"/></filter></defs></svg><div className="opening-grain"/><div className="club-grid">{clubs.map(([name,file],index)=>Math.abs(index-clubIndex)<=1?<Club key={name} {...{index,name,file,progress}}/>:null)}</div><motion.div className="club-caption" style={{opacity:captionOpacity}}><span className="club-counter">{String(clubIndex+1).padStart(2,'0')} <i>/ 10</i></span><strong>{clubs[clubIndex][0]}</strong><span className="club-steps">{clubs.map(([name],i)=><i key={name} className={i===clubIndex?'active':''}/>)}</span></motion.div><motion.div className="opening-hint" style={{opacity:hintOpacity}}>스크롤해서 시작<span>↓</span></motion.div><motion.p className="korea-caption" style={{opacity:revealOpacity}}>열 개의 이름. 하나의 대한민국.</motion.p><div className="opening-smoke-field" aria-hidden="true">{Array.from({length:14},(_,index)=><Smoke key={index} {...{index,progress}}/>)}</div><motion.img className="korea-mark" src="./baseball-assets/korea-wordmark.png" alt="Korea" style={{opacity:koreaOpacity,scale:koreaScale}}/></motion.div>;
}
