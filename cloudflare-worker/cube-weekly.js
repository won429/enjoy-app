import engine from '../cube-engine.js';
const DAY=86400000,OFFSET=9*3600000;
export function weekWindow(now=Date.now()){
  const local=new Date(now+OFFSET),day=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()),monday=day-((local.getUTCDay()+6)%7)*DAY;
  return {key:new Date(monday).toISOString().slice(0,10),startsAt:monday-OFFSET,endsAt:monday-OFFSET+7*DAY};
}
export function roundRecord(data){
  const room=data?.room,state=data?.state,humans=room?.players.filter(p=>!p.bot)||[];
  if(room?.status!=='finished'||!state?.winnerUid||!Number.isFinite(room.finishedAt)||humans.length<2||!data.code)return null;
  const scores=new Map(engine.rankings(state).map(p=>[p.uid,p.score]));
  return {id:data.code+':'+room.createdAt+':'+room.round,finishedAt:room.finishedAt,players:humans.map(p=>({uid:p.uid,name:p.name,photoURL:p.photoURL||'',wins:p.uid===state.winnerUid?1:0,points:scores.get(p.uid)}))};
}
export function validRecord(record){
  return record&&typeof record.id==='string'&&/^[A-Z2-9]{6}:\d+:\d+$/.test(record.id)&&Number.isFinite(record.finishedAt)&&Array.isArray(record.players)&&record.players.length>=2&&record.players.length<=4&&new Set(record.players.map(p=>p.uid)).size===record.players.length&&record.players.every(p=>typeof p.uid==='string'&&p.uid.length>0&&p.uid.length<=128&&typeof p.name==='string'&&p.name.length>0&&p.name.length<=40&&typeof p.photoURL==='string'&&p.photoURL.length<=2048&&[0,1].includes(p.wins)&&Number.isInteger(p.points)&&Math.abs(p.points)<=5000)&&record.players.reduce((n,p)=>n+p.wins,0)<=1;
}
export function setupWeekly(sql){
  sql.exec('CREATE TABLE IF NOT EXISTS weekly_matches (id TEXT PRIMARY KEY, week TEXT NOT NULL, finished INTEGER NOT NULL)');
  sql.exec('CREATE TABLE IF NOT EXISTS weekly_scores (week TEXT NOT NULL, uid TEXT NOT NULL, name TEXT NOT NULL, photo TEXT NOT NULL, wins INTEGER NOT NULL, games INTEGER NOT NULL, points INTEGER NOT NULL, last_played INTEGER NOT NULL, PRIMARY KEY(week,uid))');
}
export function recordWeekly(storage,record){
  if(!validRecord(record))throw Error('순위 기록을 확인해주세요.');
  const week=weekWindow(record.finishedAt).key;
  return storage.transactionSync(()=>{
    const inserted=[...storage.sql.exec('INSERT INTO weekly_matches(id,week,finished) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id',record.id,week,record.finishedAt)];
    if(!inserted.length)return false;
    for(const p of record.players)storage.sql.exec('INSERT INTO weekly_scores(week,uid,name,photo,wins,games,points,last_played) VALUES(?,?,?,?,?,1,?,?) ON CONFLICT(week,uid) DO UPDATE SET name=CASE WHEN excluded.last_played>=last_played THEN excluded.name ELSE name END,photo=CASE WHEN excluded.last_played>=last_played THEN excluded.photo ELSE photo END,wins=wins+excluded.wins,games=games+1,points=points+excluded.points,last_played=MAX(last_played,excluded.last_played)',week,p.uid,p.name,p.photoURL,p.wins,p.points,record.finishedAt);
    return true;
  });
}
export function weeklyBoard(sql,uid='',now=Date.now()){
  const week=weekWindow(now),query='SELECT uid,name,photo AS photoURL,wins,games,points,RANK() OVER(ORDER BY wins DESC,points DESC) AS rank FROM weekly_scores WHERE week=?';
  const entries=[...sql.exec('SELECT * FROM ('+query+') ORDER BY rank,uid LIMIT 50',week.key)];
  const myEntry=uid?(entries.find(p=>p.uid===uid)||[...sql.exec('SELECT * FROM ('+query+') WHERE uid=?',week.key,uid)][0]||null):null;
  return {...week,entries,myEntry};
}
