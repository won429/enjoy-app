export type V3=[number,number,number];
export const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export const phase=(p:number,a:number,b:number)=>clamp((p-a)/(b-a));
export const smooth=(t:number)=>{t=clamp(t);return t*t*(3-2*t);};
export const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
export const mix=(a:V3,b:V3,t:number):V3=>a.map((n,i)=>lerp(n,b[i],t)) as V3;
export const BASES:V3[]=[[0,0,0],[19.397,0,-19.397],[0,0,-38.794],[-19.397,0,-19.397],[0,0,0]];
export const CONTACT:V3=[.12,1.28,-.72];
export const RELEASE:V3=[.36,1.97,-17.92];
export const STAGES=[
 {at:0,end:.12,kicker:'01 / AT THE PLATE',title:'승부의 시작',text:'타석의 긴장, 그 바로 뒤에서.'},
 {at:.12,end:.27,kicker:'02 / EYES ON THE PITCHER',title:'오직, 한 구',text:'타자의 눈으로 마운드를 바라봅니다.'},
 {at:.27,end:.38,kicker:'03 / THE WINDUP',title:'모든 것이 멈춘 순간',text:'투수가 공을 쥐고, 첫 동작을 시작합니다.'},
 {at:.38,end:.52,kicker:'04 / THE PITCH',title:'다가오는 승부',text:'공이 손끝을 떠나 홈플레이트로 향합니다.'},
 {at:.52,end:.59,kicker:'05 / THE CONTACT',title:'한 번의 스윙',text:'배트와 공이 만나는 바로 그 순간.'},
 {at:.59,end:.76,kicker:'06 / OUT OF THE PARK',title:'담장을 넘어',text:'공은 멀리, 우리의 함성은 더 높이.'},
 {at:.76,end:1.01,kicker:'07 / THE HOME RUN',title:'다시, 홈으로',text:'1루, 2루, 3루. 그리고 홈.'}
];
export function flight(t:number):V3{return [lerp(CONTACT[0],13,t),lerp(CONTACT[1],16,t)+Math.sin(t*Math.PI)*37,lerp(CONTACT[2],-113,t)];}
export function runAt(p:number){const r=phase(p,.84,1)*4;const i=Math.min(3,Math.floor(r));const t=r-i;return {position:mix(BASES[i],BASES[i+1],t),segment:i,t,progress:r};}
export function sampleScene(input:number){
 const p=clamp(input),windup=phase(p,.27,.38),pitch=phase(p,.38,.52),hit=phase(p,.48,.58),fly=phase(p,.52,.76),run=runAt(p);
 let ball:V3;
 if(p<.38){const w=smooth(windup);ball=mix([.36,1.54,-18.1],RELEASE,w);ball[1]+=Math.sin(w*Math.PI)*.7;}
 else if(p<.52){ball=mix(RELEASE,CONTACT,pitch);ball[1]+=Math.sin(pitch*Math.PI)*.12;}
 else ball=flight(fly);
 let camera:V3=[0,2.85,5.5],target:V3=[0,1.4,-14],fov=56;
 if(p>=.10&&p<.27){const t=smooth(phase(p,.10,.25));camera=mix(camera,[-1.0,1.82,.45],t);target=mix(target,[.05,1.65,-18],t);fov=lerp(56,43,t);}
 else if(p>=.27&&p<.43){camera=[-1,1.82,.45];target=[.05,1.65,-18];fov=43;}
 else if(p>=.43&&p<.52){const t=smooth(phase(p,.43,.51));camera=mix([-1,1.82,.45],[-4.7,2.6,4.2],t);target=mix([.05,1.65,-18],CONTACT,t);fov=lerp(43,48,t);}
 else if(p>=.52&&p<.76){const t=smooth(phase(p,.52,.60));camera=mix([-4.7,2.6,4.2],[ball[0]-5,ball[1]+4,ball[2]+15],t);target=mix(CONTACT,ball,t);fov=48;}
 else if(p>=.76){const t=smooth(phase(p,.76,.84)),b=flight(phase(.76,.52,.76));camera=mix([b[0]-5,b[1]+4,b[2]+15],[0,65,9],t);target=mix(b,[0,0,-19],t);fov=lerp(48,56,t);}
 return {p,ball,camera,target,fov,windup,pitch,hit,fly,run,stage:STAGES.findIndex(s=>p>=s.at&&p<s.end)};
}
