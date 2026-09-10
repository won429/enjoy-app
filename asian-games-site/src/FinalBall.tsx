'use client';
import {motion,useTransform,type MotionValue} from 'framer-motion';
const ball='./baseball-assets/baseball-leather-v4.png';
function ThreadLayer({progress,side}:{progress:MotionValue<number>;side:number}){
 const x=useTransform(progress,[.62,.79,.96],[0,side*120,side*700]);
 const y=useTransform(progress,[.62,.79,.96],[0,side*100,side*360]);
 const rotate=useTransform(progress,[.62,.96],[0,side*110]);
 const scale=useTransform(progress,[.62,.96],[1,2.6]);
 const opacity=useTransform(progress,[.605,.63,.86,.97],[0,1,1,0]);
 const id=side<0?'upper-thread':'lower-thread';
 return <motion.svg className="loose-threads" viewBox="0 0 1000 1000" style={{x,y,rotate,scale,opacity}} aria-hidden="true"><defs><filter id={id+'-red'} colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  4 -4 0 0 -.25"/></filter><clipPath id={id+'-half'}><rect x="0" y={side<0?0:500} width="1000" height="500"/></clipPath></defs><image href={ball} width="1000" height="1000" filter={'url(#'+id+'-red)'} clipPath={'url(#'+id+'-half)'}/></motion.svg>;
}
export default function FinalBall({progress}:{progress:MotionValue<number>}){
 const scale=useTransform(progress,[.32,.47,.60,.71,.9],[.008,.12,1,1.15,1.4]);
 const opacity=useTransform(progress,[.30,.36,.96,1],[0,1,1,0]);
 const rotate=useTransform(progress,[.32,.60,.95],[-70,0,12]);
 const stitched=useTransform(progress,[.615,.665],[1,0]);
 const clean=useTransform(progress,[.615,.665,.8,.92],[0,1,1,0]);
 const bodyScale=useTransform(progress,[.67,.92],[1,2.5]);
 return <motion.div className="final-ball-assembly" style={{scale,opacity,rotate}} aria-label="야구공의 붉은 실밥이 분리되어 흩어지는 장면"><motion.img className="ball-leather" src="./baseball-assets/baseball-core-v4.png" alt="" style={{opacity:clean,scale:bodyScale}}/><motion.img className="ball-leather" src={ball} alt="" style={{opacity:stitched}}/><ThreadLayer progress={progress} side={-1}/><ThreadLayer progress={progress} side={1}/></motion.div>;
}
