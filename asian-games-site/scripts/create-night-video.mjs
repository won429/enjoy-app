import ffmpeg from 'ffmpeg-static';
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
mkdirSync(root+'public/baseball-assets',{recursive:true});
function run(args){const r=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
for(const name of ['night','ball'])run(['-i',root+'artwork/'+name+'.png','-vf','scale=1600:-2','-frames:v','1','-c:v','libwebp','-quality','85',root+'public/baseball-assets/asian-'+name+'.webp']);
// A gentle eight-second camera loop from original baseball artwork; no game footage.
run(['-i',root+'artwork/night.png','-vf',"scale=1920:1080,zoompan=z='1.015+0.015*sin(on*2*PI/192-PI/2)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=192:s=1920x1080:fps=24,format=yuv420p",'-t','8','-an','-c:v','libx264','-preset','fast','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart',root+'public/baseball-assets/asian-night.mp4']);
