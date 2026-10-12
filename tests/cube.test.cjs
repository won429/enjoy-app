const test=require('node:test'),assert=require('node:assert/strict'),E=require('../cube-engine.js');
const t=(n,color='red',k=0)=>({id:`${color}-${n}-${k}`,n,color}),j=k=>({id:'joker-'+k,n:0,color:'joker'});
function fixture(hand,table=[],opened=false){return {players:['a','b'],hands:{a:hand,b:[t(13,'blue')]},pool:[t(1,'black')],table,opened:{a:opened,b:false},turnUid:'a',revision:0,winnerUid:null,passes:0,turn:1};}
const commit=(s,rows)=>E.move(s,'a',{type:'commit',table:rows.map(row=>row.map(t=>t.id))});
test('106 unique tiles, two of each number/color, 14 tiles each and 2–4 players',()=>{const deck=E.deck();assert.equal(deck.length,106);assert.equal(new Set(deck.map(t=>t.id)).size,106);for(let n=2;n<=4;n++){const s=E.start(Array.from({length:n},(_,i)=>''+i));assert.equal(s.pool.length,106-n*14);assert.ok(Object.values(s.hands).every(h=>h.length===14));}assert.throws(()=>E.start(['a']));});
test('groups, runs, both jokers, gaps, duplicates, ordering and no 13–1 wrap',()=>{
 assert.equal(E.meld([t(10),t(10,'blue'),t(10,'orange')]).points,30);
 assert.equal(E.meld([t(10),j(0),j(1)]).points,30);
 assert.equal(E.meld([t(11),j(0),t(13)]).points,36);
 for(const row of [[t(1),t(2)],[t(13),t(1),t(2)],[t(1),t(3),t(4)],[t(1),t(2,'blue'),t(3)],[t(5),t(5,'red',1),t(5,'blue')],[j(0),t(1),t(2)]]) assert.equal(E.meld(row),null);
});
test('initial meld combines 30 points from own rack and preserves the public table',()=>{
 const low=[t(1),t(2),t(3)],high=[t(9,'blue'),t(10,'blue'),t(11,'blue')],old=[t(5,'black'),t(6,'black'),t(7,'black')];
 const s=fixture([...low,...high], [old]);assert.throws(()=>commit(s,[old,low]),/30/);const next=commit(s,[old,low,high]);assert.equal(next.opened.a,true);assert.equal(next.winnerUid,'a');assert.equal(s.hands.a.length,6);
 const ext=t(8,'black');assert.throws(()=>commit(fixture([ext,...high],[old]),[[...old,ext],high]),/첫 등록/);
});
test('rearrangement conserves table tiles, only consumes actor hand and is atomic',()=>{
 const old=[t(1),t(2),t(3),t(4),t(5),t(6)],extra=t(7);
 const s=fixture([extra,t(8,'blue')],[old],true);const next=commit(s,[old.slice(0,3),[...old.slice(3),extra]]);
 assert.equal(next.table.length,2);assert.equal(next.hands.a.length,1);assert.equal(next.turnUid,'b');assert.equal(s.table[0].length,6);
 assert.throws(()=>commit(s,[[...old.slice(1),extra]]),/테이블/);
 assert.throws(()=>E.move(s,'b',{type:'draw'}),/차례/);
 assert.throws(()=>E.move(s,'a',{type:'commit',table:[[extra.id,extra.id,'stolen']]}),/중복/);
 assert.throws(()=>commit(s,[old]),/최소 한 장/);
});
test('joker retrieval reuses it on the table in the same turn',()=>{
 const joker=j(0),old=[t(10),joker,t(12)],replacement=t(11),newSet=[t(7,'blue'),t(8,'blue')];const s=fixture([replacement,...newSet], [old],true);
 const next=commit(s,[[t(10),replacement,t(12)],[...newSet,joker]]);assert.equal(next.winnerUid,'a');
 assert.throws(()=>commit(s,[[t(10),replacement,t(12)]]),/테이블/);
});
test('draw ends turn, pool exhaustion ends only after every player passes and scores sum to zero',()=>{
 let s=fixture([j(0),t(1)]);s=E.move(s,'a',{type:'draw'});assert.equal(s.hands.a.length,3);assert.equal(s.turnUid,'b');assert.equal(s.winnerUid,null);
 s=E.move(s,'b',{type:'draw'});assert.equal(s.winnerUid,null);s=E.move(s,'a',{type:'draw'});assert.equal(s.winnerUid,'b');assert.equal(s.blocked,true);const ranks=E.rankings(s);assert.equal(ranks.reduce((n,r)=>n+r.score,0),0);assert.equal(ranks.find(r=>r.uid==='a').penalty,32);
});
test('120 seeded AI games complete with valid board and every tile conserved',()=>{
 for(let seed=1;seed<=120;seed++){
  let n=seed;const random=()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;};const players=Array.from({length:2+seed%3},(_,i)=>''+i);let s=E.start(players,random),turns=0;
  while(!s.winnerUid&&turns++<700){s=E.move(s,s.turnUid,E.botAction(s,s.turnUid));const all=[...s.pool,...s.table.flat(),...Object.values(s.hands).flat()];assert.equal(all.length,106);assert.equal(new Set(all.map(t=>t.id)).size,106);assert.ok(s.table.every(E.meld));}
  assert.ok(s.winnerUid,'seed '+seed);assert.equal(E.rankings(s).reduce((n,r)=>n+r.score,0),0);
 }
});

test('each player has two hints per game without changing tiles, turns or deadline',()=>{
 let s=E.start(['a','b'],()=>.25);s.turnUid='a';s.turnDeadline=100000;const original=JSON.stringify(s),tiles=JSON.stringify([s.hands,s.table,s.pool]),turn=s.turn;
 s=E.move(s,'a',{type:'hint'});assert.equal(s.hintsUsed.a,1);assert.equal(s.hintsUsed.b,0);assert.equal(s.turnUid,'a');assert.equal(s.turn,turn);assert.equal(s.turnDeadline,100000);assert.equal(JSON.stringify([s.hands,s.table,s.pool]),tiles);
 s=E.move(s,'a',{type:'hint'});assert.equal(s.hintsUsed.a,2);const exhausted=JSON.stringify(s);assert.throws(()=>E.move(s,'a',{type:'hint'}),/2번/);assert.equal(JSON.stringify(s),exhausted);
 assert.throws(()=>E.move(s,'b',{type:'hint'}),/차례/);s=E.move(s,'a',{type:'draw'});assert.equal(s.hintsUsed.a,2);s=E.move(s,'b',{type:'hint'});assert.equal(s.hintsUsed.b,1);assert.equal(s.hintsUsed.a,2);assert.deepEqual(E.start(['a','b']).hintsUsed,{a:0,b:0});
 const legacy=JSON.parse(original);delete legacy.hintsUsed;assert.equal(E.move(legacy,'a',{type:'hint'}).hintsUsed.a,1);
});
