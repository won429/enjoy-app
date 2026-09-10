import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {sampleScene,BASES,CONTACT,RELEASE,STAGES} from '../src/scene/timeline.ts';
import {actionBall,actionAnchors,spritePoint,CONTACT_UV,RELEASE_UV,PITCH_BASE,BAT_BASE,PITCH_SIZE,BAT_SIZE} from '../src/scene/actionTimeline.ts';
import {roster} from '../src/roster.ts';
const site=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(process.argv[2]||site+'/out');
const near=(a,b,tol=1e-5)=>assert.ok(a.every((n,i)=>Math.abs(n-b[i])<tol),`${a} != ${b}`);
near(sampleScene(.38).ball,RELEASE);near(sampleScene(.52).ball,CONTACT);
for(let i=0;i<=4;i++)near(sampleScene(.84+.16*i/4).run.position,BASES[i]);
for(const boundary of [.1,.25,.27,.38,.43,.48,.51,.52,.58,.60,.67,.70,.76,.79,1]){
 const before=sampleScene(boundary-1e-7),after=sampleScene(boundary+1e-7);
 near(before.camera,after.camera,.002);near(before.ball,after.ball,.002);
}
for(let i=0;i<=1000;i++){
 const p=i/1000,s=sampleScene(p);assert.ok([...s.camera,...s.target,...s.ball,s.fov].every(Number.isFinite));assert.ok(s.stage>=0&&s.stage<STAGES.length);assert.deepEqual(sampleScene(p),s);
}
assert.equal(roster.length,24);assert.equal(new Set(roster.map(p=>p.name)).size,24);
assert.deepEqual(roster.map(p=>p.name),['곽빈','김건희','김도영','김영우','김주원','김지찬','김진욱','노시환','문보경','문현빈','박영현','박재현','박준순','배찬승','성영탁','소형준','오원석','윤동희','이재현','정준재','조병현','조형우','최민석','최준용']);
const html=readFileSync(out+'/asian-games.html','utf8');
assert.ok(html.includes(roster[0].name));
assert.ok(html.includes('야구 커뮤니티로 돌아가기'));
for(const path of ['asian-stadium-v2.png','asian-baseball-v2.png','players/placeholder.svg','action/pitcher.png','action/batter.png','action/catcher.png','action/grandstand.png','action/pitcher16.png','action/batter16.png','action/runner16.png','korea-wordmark.png'])assert.ok(existsSync(out+'/baseball-assets/'+path));
for(const text of ['2026 아시안게임 야구,','다시 하나 되다.','아시안게임 경기도 엔조이 앱에서.','대한민국의','다음 경기.'])assert.ok(html.includes(text),text);
for(const text of ['Start a Project','Gulfstream','jeskojets.com','asian-night.mp4','함께할 이름.','floating-cta','menu-toggle','ENJOY BASEBALL','class="wordmark"'])assert.ok(!html.includes(text),text);
let count=0;for(const match of html.matchAll(/(?:src|href)="(\.\/_next\/[^"?#]+)"/g)){assert.ok(existsSync(resolve(out,match[1])),match[1]);count++;}assert.ok(count>2);
console.log('PASS: continuous camera and ball trajectory, bat contact, all four bases, reversible timeline, 24 supplied players and static asset links');

const anchors=actionAnchors();near(actionBall(.38),anchors.release);near(actionBall(.52),anchors.contact);near(actionBall(.76),[13,16,-113]);
for(const t of [.38,.52,.76])near(actionBall(t-1e-8),actionBall(t+1e-8),.001);
assert.ok(sampleScene(1).camera[1]<80);
console.log('PASS: calibrated sprite hand release, bat contact, crowd landing, closer infield camera');

// The initial export contains only the first two clubs. Later artwork is
// checked in the browser at its own timeline position, including reverse entry.
assert.equal((html.match(/data-medal="/g)||[]).length,0);
assert.equal((html.match(/logo-fragment/g)||[]).length,24);
assert.ok(html.includes('medals'));
assert.equal((html.match(/class="medal-edge"/g)||[]).length,0);
assert.ok(!html.includes('baseball-assets/players/kor-'));
assert.ok(!html.includes('baseball-assets/gold-medal-v3.png'));
assert.ok(html.includes('opening-smoke'));
console.log('PASS: initial export defers medals, player images and later scenes; first two clubs retain 12 fragments each');
