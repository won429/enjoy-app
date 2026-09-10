'use client';
import {useId} from 'react';
import {motion,useTransform,type MotionValue} from 'framer-motion';
function Medal({index,progress}:{index:number;progress:MotionValue<number>}){
 const ribbonId=useId().replace(/:/g,'');
 const lead=index===0,start=.826+index*.00065;
 const opacity=useTransform(progress,lead?[.738,.770,.876,.905]:[start,start+.008,.885,.91],lead?[0,1,1,0]:[0,.8,.65,0]);
 const scale=useTransform(progress,lead?[.738,.770,.87]:[start,start+.034],lead?[1,1,.84]:[.025,.25]);
 const x=useTransform(progress,[start,start+.04],['0px',lead?'0px':`${Math.cos(index*2.4)*(22+index*.5)}vmin`]);
 const y=useTransform(progress,[start,start+.04],['0px',lead?'0px':`${Math.sin(index*2.4)*(22+index*.5)}vmin`]);
 const shine=useTransform(progress,[.766,.784,.805,.831],['-120%','140%','-120%','140%']);
 const rotateY=useTransform(progress,lead?[.774,.824]:[start,start+.04],lead?[0,360]:[0,index%2?35:-35]);
 return <motion.div className={'gold-medal generated-medal '+(lead?'lead-medal':'')} data-medal={index} style={{opacity,scale,x,y,zIndex:lead?30:24-index}}><motion.div className="medal-solid" style={{rotateY}}><svg className="medal-ribbon" viewBox="0 0 560 560" fill="none" aria-hidden="true"><defs><linearGradient id={ribbonId+'blue'}><stop stopColor="#0c2257"/><stop offset=".3" stopColor="#2559ae"/><stop offset=".53" stopColor="#568ad1"/><stop offset=".64" stopColor="#234f9d"/><stop offset="1" stopColor="#101e4b"/></linearGradient><linearGradient id={ribbonId+'red'}><stop stopColor="#641123"/><stop offset=".3" stopColor="#b82c49"/><stop offset=".53" stopColor="#ec5d74"/><stop offset=".64" stopColor="#b12240"/><stop offset="1" stopColor="#72142d"/></linearGradient></defs><path d="M126 -160 L220 -160 L320 48 L288 86 Z" fill={`url(#${ribbonId}blue)`}/><path d="M140 -160 L152 -160 L299 66 L292 74 Z" fill="#779de3"/><path d="M340 -160 L434 -160 L292 88 L250 48 Z" fill={`url(#${ribbonId}red)`}/><path d="M406 -160 L418 -160 L283 77 L277 69 Z" fill="#ff8b91"/><path d="M256 44 L280 59 L304 44 L290 84 L270 84 Z" fill="#153371"/><rect x="267" y="32" width="26" height="35" rx="10" fill="#d5a23c" stroke="#ffe8a0" strokeWidth="5"/></svg><div className="medal-front"><div className="medal-face"><img src="./baseball-assets/gold-medal-v3.png" alt=""/>{lead&&<motion.span className="medal-sheen" style={{x:shine}}/>}</div></div><div className="medal-back"><img src="./baseball-assets/gold-medal-v3.png" alt=""/></div>{Array.from({length:64},(_,edge)=><span key={edge} className="medal-edge" style={{transform:`rotateZ(${edge*360/64}deg) translateY(calc(var(--medal-size) * .41)) rotateX(-90deg)`,background:`linear-gradient(0deg,#715014,hsl(42 66% ${43+Math.sin(edge*.098)*15}%) 18%,#e1bf6d 50%,#b88d35 82%,#fff0b2)`}}/>)}</motion.div></motion.div>;

}
export function FlyingLetter({letter,index,progress}:{letter:string;index:number;progress:MotionValue<number>}){
 const start=.948+(index%5)*.002;
 const x=useTransform(progress,[start,1],[0,(index%2?-1:1)*(100+index*25)]);
 const y=useTransform(progress,[start,1],[0,Math.sin(index*2.1)*260]);
 const scale=useTransform(progress,[start,.975,1],[1,2.2,.02]);
 const rotate=useTransform(progress,[start,1],[0,(index%2?-1:1)*70]);
 const opacity=useTransform(progress,[start,.982,1],[1,1,0]);
 return <motion.span className="flying-letter" style={{x,y,scale,rotate,opacity}}>{letter===' '?'\u00a0':letter}</motion.span>;
}
function Energy({index,progress}:{index:number;progress:MotionValue<number>}){
 const angle=index*2.399;
 const x=useTransform(progress,[.733,.753,.780],[Math.cos(angle)*330,0,Math.cos(angle)*650]);
 const y=useTransform(progress,[.733,.753,.780],[Math.sin(angle)*330,0,Math.sin(angle)*650]);
 const opacity=useTransform(progress,[.730,.745,.759,.785],[0,1,1,0]);
 const scale=useTransform(progress,[.733,.753,.780],[.3,1.5,.1]);
 return <motion.i className="medal-spark" style={{x,y,opacity,scale}}/>;
}
export default function MedalTransition({progress}:{progress:MotionValue<number>}){
 const opacity=useTransform(progress,[.724,.735,.892,.918],[0,1,1,0]);
 const flashOpacity=useTransform(progress,[.742,.752,.758,.778],[0,.98,.9,0]);
 const auraOpacity=useTransform(progress,[.731,.749,.764,.792],[0,1,1,0]);
 const auraScale=useTransform(progress,[.731,.751,.778,.792],[1.5,.35,2.8,3.6]);
 const ringScale=useTransform(progress,[.750,.79],[.1,3.6]);
 const ringOpacity=useTransform(progress,[.746,.755,.790],[0,1,0]);
 const ballOpacity=useTransform(progress,[.730,.741,.771],[1,1,0]);
 const stageDim=useTransform(progress,[.724,.76,.89],[0,.82,.9]);
 const gloryOpacity=useTransform(progress,[.758,.782,.855,.88],[0,.8,.5,0]);
 const gloryRotate=useTransform(progress,[.75,.89],[-15,25]);
 const captionOpacity=useTransform(progress,[.785,.818,.862,.884],[0,1,1,0]);
 const backgroundScale=useTransform(progress,[.724,.82],[1.1,1.5]);
 const blur=useTransform(progress,[.724,.78],['blur(5px)','blur(18px)']);
 return <motion.div className="medal-transition" style={{opacity}} aria-label="홈런 공이 하나의 큰 금메달과 23개의 금메달로 변하는 장면"><motion.img className="medal-stadium" src="./baseball-assets/asian-stadium-v2.png" alt="" style={{scale:backgroundScale,filter:blur}}/><motion.div className="medal-dim" style={{opacity:stageDim}}/><motion.div className="medal-rays" style={{opacity:gloryOpacity,rotate:gloryRotate}}/><motion.div className="medal-award-copy" style={{opacity:captionOpacity}}><strong>다시, 정상으로.</strong></motion.div><motion.img className="medal-ball" src="./baseball-assets/baseball-leather-v4.png" alt="" style={{opacity:ballOpacity}}/><motion.div className="medal-aura" style={{opacity:auraOpacity,scale:auraScale}}/><motion.div className="medal-shockwave" style={{opacity:ringOpacity,scale:ringScale}}/>{Array.from({length:32},(_,index)=><Energy key={index} {...{index,progress}}/>)}<motion.div className="medal-flash" style={{opacity:flashOpacity}}/>{Array.from({length:24},(_,i)=><Medal key={i} index={i} progress={progress}/>)}</motion.div>;
}
