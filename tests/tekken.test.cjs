const test=require('node:test'),assert=require('node:assert/strict'),E=require('../tekken-engine.js');
const game=()=>{const s=E.start([{uid:'a',character:0},{uid:'b',character:1}]);E.advance(s,{},2.3);return s;};
test('movement has arena bounds and fighter collision',()=>{const s=game();E.advance(s,{a:{axis:1},b:{axis:-1}},3);assert.ok(s.players[1].x-s.players[0].x>=85);E.advance(s,{a:{axis:-1},b:{axis:1}},5);assert.ok(s.players.every(p=>p.x>=62&&p.x<=1038));});
test('attacks require reach and have one hit per move',()=>{const s=game();E.advance(s,{a:{move:'punch'}},.3);assert.equal(s.players[1].hp,100);s.players[1].x=470;E.advance(s,{},.5);E.tick(s,{a:{move:'punch'}});E.advance(s,{},.3);assert.equal(s.players[1].hp,91);E.advance(s,{},.1);assert.equal(s.players[1].hp,91);});
test('guard reduces damage and special needs a full server gauge',()=>{const s=game();s.players[1].x=470;E.advance(s,{a:{move:'special'}},.5);assert.equal(s.players[1].hp,100);E.advance(s,{a:{move:'punch'},b:{guard:true}},.3);assert.equal(s.players[1].hp,99);E.advance(s,{},.6);s.players[0].energy=100;E.tick(s,{a:{move:'special'}});E.advance(s,{},.6);assert.equal(s.players[0].energy,0);assert.equal(s.players[1].hp,72);});
test('two round wins finish a match and each round resets health',()=>{const s=game();s.players[1].hp=0;E.tick(s);assert.equal(s.players[0].wins,1);assert.equal(s.phase,'round-end');E.advance(s,{},3.1);assert.equal(s.players[1].hp,100);assert.equal(s.round,2);E.advance(s,{},2.3);s.players[1].hp=0;E.tick(s);assert.equal(s.phase,'finished');assert.equal(s.winner,'a');});
test('timeout awards the higher health and ties award neither player',()=>{let s=game();s.time=.01;s.players[0].hp=70;E.tick(s);assert.equal(s.roundWinner,1);s=game();s.time=.01;E.tick(s);assert.equal(s.roundWinner,null);assert.equal(s.players[0].wins+s.players[1].wins,0);});
test('malformed inputs are sanitized and attacks cannot rewrite health',()=>{assert.deepEqual(E.input({axis:Infinity,guard:'yes',move:'__proto__',hp:999}),{axis:0,guard:false,move:null});});
test('AI bouts reach a result without invalid health or gauge',()=>{for(let seed=1;seed<=15;seed++){let n=seed,rng=()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;},s=game();s.players[0].character=seed%4;s.players[1].character=(seed+1)%4;for(let i=0;i<30000&&s.phase!=='finished';i++)E.tick(s,{a:E.bot(s,0,rng),b:E.bot(s,1,rng)});assert.equal(s.phase,'finished');assert.ok(s.players.every(p=>p.hp>=0&&p.hp<=100&&p.energy>=0&&p.energy<=100));}});
test('all four fighters have distinct power, kick reach and special patterns',()=>{
 assert.equal(E.ROSTER.length,4);const patterns=[];for(let character=0;character<4;character++){const s=game();s.players[0].character=character;s.players[0].energy=100;s.players[1].x=465;E.tick(s,{a:{move:'special'}});patterns.push(E.strikePlan(s.players[0],s.players[0].attack).map(h=>h.t));E.advance(s,{},1.2);assert.ok(s.players[1].hp<100);assert.equal(s.players[0].energy,0);assert.ok(s.events.filter(e=>e.kind==='hit').every(e=>e.character===character));}assert.equal(new Set(patterns.map(JSON.stringify)).size,4);
 const punchDamage=c=>{const s=game();s.players[0].character=c;s.players[1].x=470;E.advance(s,{a:{move:'punch'}},.3);return 100-s.players[1].hp;};assert.ok(punchDamage(2)>punchDamage(0));assert.ok(punchDamage(0)>punchDamage(1));
});
test('movement accelerates, coasts to rest and jumping lands without snapping position',()=>{
 const s=game(),p=s.players[0];E.tick(s,{a:{axis:-1}});assert.ok(p.vx<0&&p.vx> -E.ROSTER[0].speed);E.advance(s,{a:{axis:-1}},.3);const speed=Math.abs(p.vx),x=p.x;E.tick(s);assert.ok(Math.abs(p.vx)<speed&&p.vx<0&&p.x<x);E.advance(s,{},.5);assert.ok(Math.abs(p.vx)<1);E.tick(s,{a:{move:'jump'}});assert.ok(p.y>0&&p.vy>0);E.advance(s,{},.35);assert.ok(p.y>60);E.advance(s,{},.6);assert.equal(p.y,0);assert.equal(p.vy,0);
});
test('late input queues the next attack and hitstop does not discard input',()=>{
 const s=game();E.tick(s,{a:{move:'punch'}});E.advance(s,{},.3);E.tick(s,{a:{move:'kick'}});E.advance(s,{},.15);assert.equal(s.players[0].attack?.move,'kick');
 const p=game();E.tick(p,{a:{move:'punch'}});E.advance(p,{},.3);p.freeze=.04;E.tick(p,{a:{move:'kick'}});E.advance(p,{},.18);assert.equal(p.players[0].attack?.move,'kick');
});
test('dash has cooldown, moves continuously, and advance consumes one move once',()=>{
 const s=game(),p=s.players[0],x=p.x;E.advance(s,{a:{axis:-1,move:'dash'}},.4);assert.ok(p.x<x-100);assert.equal(s.events.filter(e=>e.kind==='dash').length,1);const before=s.eventId;E.tick(s,{a:{move:'dash'}});assert.equal(s.eventId,before);
 const a=game();a.players[1].x=470;E.advance(a,{a:{move:'punch'}},1);assert.equal(a.events.filter(e=>e.kind==='attack').length,1);
});
test('launcher creates an aerial reaction and blocked launcher stays grounded',()=>{
 for(const guard of [false,true]){const s=game();s.players[1].x=465;E.advance(s,{a:{move:'launcher'},b:{guard}},.3);assert.equal(s.players[1].y>0,!guard);assert.ok(s.players[1].hp<100);}
});
test('fixed-step outcomes agree at 30, 60 and 120Hz render cadences',()=>{
 const results=[30,60,120].map(hz=>{const s=game();let accumulator=0;for(let frame=0;frame<hz;frame++){accumulator+=1/hz;while(accumulator+1e-9>=E.STEP){E.tick(s,{a:{axis:-1}});accumulator-=E.STEP;}}return[s.players[0].x,s.players[0].vx,s.time];});results.forEach(r=>r.forEach((v,i)=>assert.ok(Math.abs(v-results[0][i])<1e-7)));
});
test('v1 persisted games retain identity, health and score while adding motion fields',()=>{const s=game();delete s.version;delete s.events;s.players[0].hp=73;s.players[0].wins=1;delete s.players[0].vx;E.upgrade(s);assert.equal(s.players[0].hp,73);assert.equal(s.players[0].wins,1);assert.equal(s.players[0].vx,0);assert.equal(s.version,2);E.tick(s);assert.ok(Number.isFinite(s.players[0].x));});
