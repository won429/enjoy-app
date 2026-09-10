import ffmpeg from 'ffmpeg-static';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// Original AI artwork, slow camera motion and dissolves encoded into a real seekable video.
// The two dissolves fall inside the gaps between text sections.
const filters=[
 "[0:v]scale=1920:1080,zoompan=z='1+on*0.00018':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=108:s=1920x1080:fps=24,format=yuv420p,setsar=1[a]",
 "[1:v]scale=1920:1080,zoompan=z='1.035-on*0.00020':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=132:s=1920x1080:fps=24,format=yuv420p,setsar=1[b]",
 "[2:v]scale=1920:1080,zoompan=z='1+on*0.00018':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=120:s=1920x1080:fps=24,format=yuv420p,setsar=1[c]",
 '[a][b]xfade=transition=fade:duration=0.5:offset=4[ab]',
 '[ab][c]xfade=transition=fade:duration=0.5:offset=9,format=yuv420p[out]'
].join(';');
const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','warning','-y','-i',root+'artwork/day.png','-i',root+'artwork/ball.png','-i',root+'artwork/night.png','-filter_complex_threads','1','-filter_complex',filters,'-map','[out]','-t','14','-an','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-g','12','-movflags','+faststart',root+'public/baseball-assets/asian-games-cinematic.mp4'],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status||1);
