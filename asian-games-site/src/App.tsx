'use client';
import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {motion,useMotionValue,useMotionValueEvent,useTransform,MotionConfig} from 'framer-motion';
import {ArrowLeft,ArrowRight,ArrowUpRight,RefreshCw,Play} from 'lucide-react';
import Stage from './scene/Stage';
import Opening from './Opening';
import {SceneWindow,useNearby} from './sceneWindow';
import FinalBall from './FinalBall';
import FlagBackdrop from './FlagBackdrop';
import MedalTransition,{FlyingLetter} from './MedalTransition';
import {roster} from './roster';
import {useAsianGames} from './useAsianGames';
import {country,koreaToday,labelDate,type Game} from './baseball';
const colors=['#E882B4','#6EB5FF','#6BBF7A','#F4845F'];
function back(){if(parent!==window)parent.postMessage({type:'enjoy-asian-games-close'},location.origin);else location.replace('./index.html?asianGamesView=community');}
function openGame(game:Game){if(parent!==window&&game.id)parent.postMessage({type:'enjoy-asian-games-open-match',id:game.id,date:game.date},location.origin);else location.href='./baseball-game-detail.html?matchId='+encodeURIComponent(game.id)+'&matchDate='+encodeURIComponent(game.date)+'&from=asian-games';}
function Flag({name}:{name:string}){const c=country(name);return c?<img src={'./baseball-assets/flags/'+c.code+'.png'} alt="" width="56" height="40"/>:null;}
export default function App(){
 const hero=useRef<HTMLElement>(null),players=useRef<HTMLElement>(null),finale=useRef<HTMLElement>(null);
 const playersNearby=useNearby(players),finaleNearby=useNearby(finale);
 const hp=useMotionValue(0),pp=useMotionValue(0),fp=useMotionValue(0);
 const [index,setIndex]=useState(0),[locked,setLocked]=useState(false),[gameIndex,setGameIndex]=useState(0),[today,setToday]=useState('2026-09-09');
 const [autoplay,setAutoplay]=useState(false),[replayKey,setReplayKey]=useState(0);
 useEffect(()=>{
  if(!autoplay)return;
  let frame=0,last=0,position=window.scrollY;
  const stop=()=>setAutoplay(false);
  const keydown=(event:KeyboardEvent)=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' ' ,'Escape'].includes(event.key)&&!(event.target instanceof HTMLElement&&event.target.closest('button,input,textarea,select')))stop();};
  const visibility=()=>{if(document.hidden)stop();};
  const message=(event:MessageEvent)=>{if(event.origin===location.origin&&event.source===parent&&event.data?.type==='enjoy-asian-games-visibility'&&!event.data.visible)stop();};
  const tick=(time:number)=>{
   if(last){
    position+=Math.min(time-last,50)/1000*innerHeight*.18;
    const end=Math.max(0,document.documentElement.scrollHeight-innerHeight);
    window.scrollTo({top:Math.min(position,end),behavior:'instant'});
    if(position>=end){stop();return;}
   }
   last=time;frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
  window.addEventListener('wheel',stop,{passive:true});window.addEventListener('touchstart',stop,{passive:true});window.addEventListener('keydown',keydown);window.addEventListener('message',message);document.addEventListener('visibilitychange',visibility);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('wheel',stop);window.removeEventListener('touchstart',stop);window.removeEventListener('keydown',keydown);window.removeEventListener('message',message);document.removeEventListener('visibilitychange',visibility);};
 },[autoplay,replayKey]);
 const replay=()=>{window.scrollTo({top:0,behavior:'instant'});setReplayKey(value=>value+1);setAutoplay(true);};
 const lockTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{setToday(koreaToday());return()=>{if(lockTimer.current)clearTimeout(lockTimer.current);};},[]);
 const {games,loading,error,refresh}=useAsianGames(today.slice(0,7),today);
 const showGames=useMemo(()=>{const upcoming=games.filter(g=>g.date>=today);return upcoming.length?upcoming:games;},[games,today]);
 const game=showGames[Math.min(gameIndex,Math.max(0,showGames.length-1))];
 const introOpacity=useTransform(hp,[0,.185,.20,.225,.25],[0,0,1,1,0]);
 const whiteOpacity=useTransform(hp,[.868,.921,.965,1],[0,1,1,0]);
 const [typed,setTyped]=useState('');const phrase='아시안게임 경기도\n엔조이 앱에서.';
 useMotionValueEvent(hp,'change',p=>setTyped(phrase.slice(0,Math.round(Math.max(0,Math.min(1,(p-.912)/.032))*phrase.length))));
 const playerScale=useTransform(pp,[0,.35,.7,1],[.84,1,1.03,.95]);const playerY=useTransform(pp,[0,1],[70,-50]);const playerRotate=useTransform(pp,[0,.5,1],[-3,0,3]);const nameX=useTransform(pp,[0,1],['8%','-8%']);
 const finalCopyOpacity=useTransform(fp,[0,.08,.32,.48],[0,1,1,0]);const finalCopyScale=useTransform(fp,[0,.14,.32,.48],[6,1,1,.85]);
 const next=(delta:number)=>{if(locked)return;setLocked(true);setIndex(i=>(i+delta+roster.length)%roster.length);lockTimer.current=setTimeout(()=>setLocked(false),650);};
 const active=roster[index];
 const finaleBackground=useTransform(fp,[0,.20,.45],['#E882B4','#33433d','#121513']);
 const flagOpacity=useTransform(fp,[.60,.87],[0,1]);
 const backdropOpacity=useTransform(fp,[.60,.9],[1,0]);
 const finaleVeil=useTransform(fp,[0,.3],[1,0]);
 return <MotionConfig reducedMotion="user"><div className="experience"><Stage hero={hero} players={players} finale={finale} progress={hp} playerProgress={pp} finalProgress={fp}/>
 <button className="back-button" onClick={()=>{setAutoplay(false);back();}} aria-label="야구 커뮤니티로 돌아가기"><ArrowLeft/></button>
 <main>
 <section ref={hero} className="hero-track" id="home"><span id="pitch" className="story-marker" style={{top:"calc(1500vh * .4567)"}}/><span id="contact" className="story-marker" style={{top:"calc(1500vh * .5568)"}}/><span id="medals" className="story-marker" style={{top:"calc(1500vh * .805)"}}/><div className="hero-sticky"><SceneWindow progress={hp} start={0} end={.25}><Opening progress={hp}/></SceneWindow>

 <motion.div className="hero-titles" style={{opacity:introOpacity}}><p>2026 아시안게임 야구,</p><h1>다시 하나 되다.</h1></motion.div>
 <SceneWindow progress={hp} start={.60} end={.99}><MedalTransition progress={hp}/></SceneWindow><motion.div className="white-transition" style={{opacity:whiteOpacity}}><h2 aria-label={phrase.replace('\n',' ')}>{typed.split('\n').map((line,row)=><span className="typing-line" key={row}>{Array.from(line).map((letter,i)=><FlyingLetter key={i} {...{letter,index:i+row*12,progress:hp}}/>)}</span>)}</h2></motion.div></div></section>
 <section ref={players} id="players" className="players-track" aria-label="대한민국 선수 소개" onKeyDown={e=>{if(e.key==='ArrowLeft')next(-1);if(e.key==='ArrowRight')next(1);}}>
 <div className="players-section" style={{backgroundColor:colors[index%4]}}><motion.h2 className="player-big-name" style={{x:nameX}} aria-hidden="true">{active.name}</motion.h2>
 <motion.div className="carousel-art" style={{scale:playerScale,y:playerY,rotate:playerRotate}} aria-hidden="true">{playersNearby&&roster.map((p,i)=>{
 const relative=(i-index+roster.length)%roster.length;
 // Four visible figures plus one hidden neighbor on each side preserve the
 // existing 650ms entrance/exit transitions in either carousel direction.
 if(relative>3&&relative<roster.length-2)return null;
 const role=relative===0?'center':relative===1?'right':relative===roster.length-1?'left':relative===2?'back':'hidden';
 return <div key={p.id} className={'figurine '+role} style={{'--accent':colors[i%4]} as CSSProperties}><img src={p.image||'./baseball-assets/players/placeholder.svg'} alt="" onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src='./baseball-assets/players/placeholder.svg';}}/>{!p.image&&<span className="placeholder-number">{String(i+1).padStart(2,'0')}</span>}</div>;
 })}</motion.div>
 <div className="player-specs" aria-live="polite"><h3>{active.name}</h3><p>{active.position} · {active.bats}</p><p>{active.height} cm · {active.weight} kg</p><small>{active.image?'임시 스펙':'임시 스펙 · 캐릭터 교체 예정'}</small><div className="player-arrows"><button disabled={locked} onClick={()=>next(-1)} aria-label="이전 선수"><ArrowLeft/></button><button disabled={locked} onClick={()=>next(1)} aria-label="다음 선수"><ArrowRight/></button></div></div>
 <div className="player-count"><strong>{String(index+1).padStart(2,'0')}</strong><span> / 24</span></div></div>
 </section>
 <div className="final-sequence"><motion.div className="flag-backdrop" style={{opacity:flagOpacity}}><SceneWindow progress={fp} start={.30}><FlagBackdrop/></SceneWindow><div className="flag-shade"/></motion.div><section ref={finale} className="ball-track" id="finale"><span id="unravel" className="story-marker" style={{top:"calc(320vh * .76)"}}/><motion.div className="ball-sticky"><motion.div className="finale-base" style={{background:finaleBackground,opacity:backdropOpacity}}/><motion.div className="finale-color-veil" style={{backgroundColor:colors[index%4],opacity:finaleVeil}}/>{finaleNearby&&<SceneWindow progress={fp} start={.12}><FinalBall progress={fp}/></SceneWindow>}<motion.h2 style={{opacity:finalCopyOpacity,scale:finalCopyScale}}>대한민국의<br/>다음 경기.</motion.h2></motion.div></section>
 <section className="schedule" id="schedule" aria-label="아시안게임 경기 일정">
 {loading&&!game?<p role="status">경기 일정을 불러오는 중</p>:!game?<div className="schedule-empty"><h3>{error?'일정을 불러오지 못했습니다.':'경기 일정 준비 중'}</h3><button onClick={refresh}><RefreshCw size={18}/> 다시 확인</button></div>:<article className="match" key={game.id+game.date}><p className="match-date">{labelDate(game.date)} · {game.time||'시간 미정'}</p><div className="match-teams"><div><Flag name={game.team1}/><h3>{game.team1}</h3></div><span>VS</span><div><Flag name={game.team2}/><h3>{game.team2}</h3></div></div><p className="match-venue">{game.stadium||game.ballpark||'구장 미정'}</p><button className="match-detail" onClick={()=>openGame(game)}>경기정보 보기 <ArrowUpRight size={22}/></button><div className="match-controls"><button onClick={()=>setGameIndex(i=>Math.max(0,i-1))} disabled={gameIndex===0} aria-label="이전 경기"><ArrowLeft/></button><span>{Math.min(gameIndex+1,showGames.length)} / {showGames.length}</span><button onClick={()=>setGameIndex(i=>Math.min(showGames.length-1,i+1))} disabled={gameIndex>=showGames.length-1} aria-label="다음 경기"><ArrowRight/></button></div>{error&&<p role="status">{error}</p>}</article>}
 <button className="autoplay-button" onClick={replay}><Play size={13}/><span>자동재생으로 한번 더 보기</span></button>
 </section></div>
 </main></div></MotionConfig>;
}
