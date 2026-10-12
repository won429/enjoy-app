import engine from '../cube-engine.js';
export const ROOM_TTL = 24 * 60 * 60 * 1000;
export function fail(message, code = 'invalid-action') { throw Object.assign(new Error(message), { code }); }
const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
export class CubeRoom {
  constructor(data = null, rng = random) { this.data = data; this.random = rng; }
  get room() { return this.data?.room; }
  get state() { return this.data?.state; }
  connect(player, create, now = Date.now()) {
    if (create) {
      if (this.data) fail('다른 방 코드로 다시 만들어주세요.', 'room-exists');
      this.data = { room: { hostUid: player.uid, players: [player], playerIds: [player.uid], status: 'waiting', round: 0, revision: 0, createdAt: now, updatedAt: now, notice: '' }, state: null, receipts: [] }; return true;
    }
    if (!this.room || this.room.status === 'closed' || now-this.room.updatedAt >= ROOM_TTL) fail('해당 코드의 방을 찾을 수 없어요.', 'room-missing');
    if (this.room.playerIds.includes(player.uid)) return false;
    if (this.room.status !== 'waiting' || this.room.players.length >= 4) fail('대기 중인 빈자리가 있는 방에만 참가할 수 있어요.');
    this.data.room = { ...this.room, players: [...this.room.players,player], playerIds: [...this.room.playerIds,player.uid], revision: this.room.revision+1, updatedAt: now }; return true;
  }
  apply(uid, packet, now = Date.now()) {
    const current = this.room;
    if (!current?.players.some(p=>p.uid===uid&&!p.bot)) fail('방에 참가한 멤버만 진행할 수 있어요.', 'not-member');
    if (typeof packet.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(packet.id)) fail('게임 요청을 확인해주세요.');
    if (this.data.receipts.some(r=>r.uid===uid&&r.id===packet.id)) return false;
    if (packet.revision !== current.revision) fail('화면이 갱신됐어요. 다시 진행해주세요.', 'stale-revision');
    const action = packet.action;
    if (!action || !['leave','start','add-bot','remove-bot','commit','draw'].includes(action.type)) fail('게임 동작을 확인해주세요.');
    let room = { ...current, revision: current.revision+1, updatedAt: now }, state = this.state;
    if (action.type === 'leave') {
      room.players = current.players.filter(p=>p.uid!==uid); const humans = room.players.filter(p=>!p.bot);
      room.hostUid = humans.some(p=>p.uid===current.hostUid) ? current.hostUid : humans[0]?.uid || '';
      room.playerIds = room.players.map(p=>p.uid); room.status = humans.length ? 'waiting' : 'closed'; room.notice = '참가자가 나가서 이번 판이 종료됐어요.'; state = null;
    } else if (['add-bot','remove-bot'].includes(action.type)) {
      if (uid !== current.hostUid || current.status !== 'waiting') fail('방장만 시작 전에 가상 플레이어를 바꿀 수 있어요.');
      if (action.type === 'add-bot') {
        if (current.players.length >= 4) fail('최대 4명까지 가능해요.');
        let i = 1; while(current.playerIds.includes('cube-bot-'+i)) i++;
        room.players = [...current.players,{ uid: 'cube-bot-'+i, name: ['루미','모모','하루','보리'][i-1] || '큐브', bot: true }];
      } else {
        if (!current.players.some(p=>p.uid===action.uid&&p.bot)) fail('가상 플레이어를 선택해주세요.');
        room.players = current.players.filter(p=>p.uid!==action.uid);
      }
      room.playerIds = room.players.map(p=>p.uid);
    } else if (action.type === 'start') {
      if (uid !== current.hostUid || !['waiting','finished'].includes(current.status)) fail('방장만 새 판을 시작할 수 있어요.');
      state = engine.start(current.playerIds,this.random); room.round++; room.status = 'playing'; room.notice = '';
    } else {
      if (current.status !== 'playing' || !state) fail('진행 중인 게임이 없어요.');
      if (this.data.turnDeadline <= now) fail('차례 시간이 끝났어요. 다음 화면을 기다려주세요.');
      state = engine.move(state,uid,{ type: action.type, table: action.table }); room.status = state.winnerUid ? 'finished' : 'playing';
    }
    this.data = { ...this.data, room, state, turnDeadline: room.status==='playing' ? now+60000 : null, nextBotAt: this.botTurn(room,state) ? now+1400 : null, receipts: [...this.data.receipts,{ uid,id:packet.id }].slice(-100) }; return true;
  }
  botTurn(room = this.room, state = this.state) { return room?.status==='playing' && !state?.winnerUid && room.players.some(p=>p.bot&&p.uid===state?.turnUid); }
  advanceOrder() { return false; }
  advanceBot(now = Date.now()) {
    if (this.room?.status!=='playing') return false;
    const bot = this.botTurn() && this.data.nextBotAt <= now, timeout = this.data.turnDeadline <= now;
    if (!bot && !timeout) return false;
    const uid = this.state.turnUid, state = engine.move(this.state,uid,bot ? engine.botAction(this.state,uid) : { type:'draw' });
    const room = { ...this.room, revision: this.room.revision+1, updatedAt:now, status: state.winnerUid?'finished':'playing' };
    this.data = { ...this.data,room,state, turnDeadline: room.status==='playing'?now+60000:null, nextBotAt:this.botTurn(room,state)?now+1400:null }; return true;
  }
  listing(id) { const r=this.room; if (!r || r.status==='closed') return null; const botCount=r.players.filter(p=>p.bot).length; return { id,title:(r.players.find(p=>p.uid===r.hostUid)?.name||'친구')+'님의 방',playerCount:r.players.length,humanCount:r.players.length-botCount,botCount,capacity:4,status:r.status,createdAt:r.createdAt,expiresAt:r.updatedAt+ROOM_TTL }; }
  view(uid) {
    if (!this.room?.playerIds.includes(uid)) return { type:'removed' };
    let state=null;
    if(this.state) { const s=this.state; state={ ...s,pool:[],poolCount:s.pool.length,hands:Object.fromEntries(s.players.map(p=>[p,p===uid?s.hands[p]:s.hands[p].map((_,i)=>({id:'hidden-'+i}))])),rankings:engine.rankings(s),turnDeadline:this.data.turnDeadline }; }
    return { type:'snapshot',room:this.room,state,serverNow:Date.now() };
  }
}
