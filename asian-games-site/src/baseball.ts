export const countries = [
  {code:'KOR',name:'대한민국',color:'#E64E67',aliases:['대한민국','한국','KOR']},
  {code:'TPE',name:'차이니스 타이베이',color:'#5C91EE',aliases:['대만','차이니스 타이베이','차이니즈 타이베이','중화 타이베이','TPE']},
  {code:'JPN',name:'일본',color:'#EC5874',aliases:['일본','JPN']},
  {code:'CHN',name:'중국',color:'#E65249',aliases:['중국','CHN']},
  {code:'HKG',name:'홍콩',color:'#DC5666',aliases:['홍콩','홍콩 차이나','HKG']},
  {code:'THA',name:'태국',color:'#8585D1',aliases:['태국','THA']},
  {code:'PHI',name:'필리핀',color:'#608DE0',aliases:['필리핀','PHI','PHL']},
  {code:'PLE',name:'팔레스타인',color:'#55B28E',aliases:['팔레스타인','PLE','PSE']}
];
export const country = (name:string) => countries.find(team=>team.aliases.includes(name.trim()));
export type Game = {id:string;date:string;time:string;team1:string;team2:string;gameStatus:string;awayScore?:number;homeScore?:number;stadium?:string;ballpark?:string;inning?:string;competition?:string;league?:string;status?:string;cancelReason?:string;[key:string]:unknown};
type Document = {games?:Record<string,unknown>[]};
export const koreaToday = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const belongs = (game:Game,code:string) => !code || [game.team1,game.team2].some(team=>country(team)?.code===code);
export const canceled = (game:Game) => /취소|우천|노게임|노 게임|연기/.test([game.gameStatus,game.status,game.cancelReason].join(' '));
export function mergeGames(documents:(Document|null)[]):Game[] {
  const merged=new Map<string,Record<string,unknown>>();
  for(const doc of documents) for(const raw of (Array.isArray(doc?.games)?doc.games:[])) {
    const key=String(raw.id??[raw.date,raw.awayTeam||raw.team1,raw.homeTeam||raw.team2,raw.gameTime||raw.time].join('_'));
    merged.set(key,{...merged.get(key),...raw});
  }
  return [...merged.values()].map(raw=>{
    const away=String(raw.awayTeam||raw.team1||''); const home=String(raw.homeTeam||raw.team2||'');
    return {...raw,id:String(raw.id??''),date:String(raw.date||''),time:String(raw.gameTime||raw.time||''),team1:country(away)?.name||away,team2:country(home)?.name||home,gameStatus:String(raw.gameStatus||raw.status||'경기전')} as Game;
  }).filter(game=>{
    const event=String(game.competition||game.league||'').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(game.date) && (event?/^(asian[-_ ]?games|아시안\s*게임)$/i.test(event):belongs(game,'KOR'));
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
}
export function decode(value:Record<string,any>):any {
  if('stringValue'in value)return value.stringValue;
  if('integerValue'in value)return Number(value.integerValue);
  if('doubleValue'in value)return value.doubleValue;
  if('booleanValue'in value)return value.booleanValue;
  if(value.arrayValue)return (value.arrayValue.values||[]).map(decode);
  if(value.mapValue)return decodeFields(value.mapValue.fields||{});
  return null;
}
function decodeFields(fields:Record<string,any>){return Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,decode(value)]));}
export async function getDocument(path:string,signal:AbortSignal):Promise<Document|null> {
  const base='https://firestore.googleapis.com/v1/projects/enjoykbooo/databases/(default)/documents/';
  const key='AIzaSyCQt6_wZA5oXTDVBlK0R6Rm2EXMfzCsOx0';
  const response=await fetch(base+path+'?key='+encodeURIComponent(key),{cache:'no-store',signal});
  if(response.status===404)return null;
  if(!response.ok)throw new Error('경기정보 조회 실패');
  const json=await response.json();return json.fields?decodeFields(json.fields):null;
}
export function labelDate(date:string){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short'}).format(new Date(date+'T12:00:00+09:00'));}
