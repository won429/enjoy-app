import {sampleScene,phase,mix,CONTACT,RELEASE,type V3} from './timeline.ts';
export const PITCH_BASE:V3=[0,.32,-18.44];
export const BAT_BASE:V3=[-1.18,.15,.1];
export const PITCH_SIZE=2.65,BAT_SIZE=3.1;
// UVs measured in each generated cell, with origin at the lower left.
export const RELEASE_UV:[number,number]=[.32,.94];
export const CONTACT_UV:[number,number]=[.93,.685];
const norm=(v:V3):V3=>{const l=Math.hypot(...v);return v.map(x=>x/l) as V3;};
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function spritePoint(uv:[number,number],base:V3,size:number,camera:V3,target:V3):V3{
 const back=norm(camera.map((x,i)=>x-target[i]) as V3),right=norm(cross([0,1,0],back)),up=cross(back,right);
 return base.map((x,i)=>x+right[i]*(uv[0]-.5)*size+up[i]*uv[1]*size) as V3;
}
export function actionAnchors(){const r=sampleScene(.38),c=sampleScene(.52),point=spritePoint(CONTACT_UV,BAT_BASE,BAT_SIZE,c.camera,c.target),back=norm(c.camera.map((v,i)=>v-c.target[i]) as V3);return {release:spritePoint(RELEASE_UV,PITCH_BASE,PITCH_SIZE,r.camera,r.target),contact:point.map((v,i)=>v-back[i]*.14) as V3};}
export const pitcherPose=(p:number)=>p<.38?phase(p,.27,.38)*9:9+phase(p,.38,.47)*6;
export const batterPose=(p:number)=>p<.38?phase(p,.12,.38)*3:p<.48?3+phase(p,.38,.48)*5:p<=.52?8+phase(p,.48,.52)*2:10+phase(p,.52,.65)*5;
const handUV:[number,number][]=[[.43,.62],[.43,.85],[.29,.8],[.37,.7],[.36,.67],[.36,.67],[.34,.56],[.36,.81],[.40,.69],RELEASE_UV];
export function heldBall(p:number,camera:V3,target:V3):V3{const f=pitcherPose(p),i=Math.min(8,Math.floor(f)),t=f-i;const uv=handUV[i].map((x,k)=>x+(handUV[i+1][k]-x)*t) as [number,number];return spritePoint(uv,PITCH_BASE,PITCH_SIZE,camera,target);}
export function actionBall(p:number):V3{
 const s=sampleScene(p),a=actionAnchors();
 if(p<.38)return heldBall(p,s.camera,s.target);
 const offset=p<.52?mix(a.release.map((v,i)=>v-RELEASE[i]) as V3,a.contact.map((v,i)=>v-CONTACT[i]) as V3,phase(p,.38,.52)):a.contact.map((v,i)=>(v-CONTACT[i])*(1-phase(p,.52,.76))) as V3;
 return s.ball.map((v,i)=>v+offset[i]) as V3;
}
