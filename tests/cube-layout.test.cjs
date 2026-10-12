const test=require('node:test'),assert=require('node:assert/strict'),L=require('../cube-layout.js');
test('dropping in empty space retains the requested location and leaves existing anchors alone',()=>{
 const rows=[['a','b','c']],layout=[{x:1,y:1}];const next=L.move(rows,layout,['own'],{x:8.5,y:3.7});
 assert.deepEqual(next.rows,[['a','b','c'],['own']]);assert.deepEqual(next.layout,[{x:1,y:1},{x:8,y:3}]);assert.deepEqual(rows,[['a','b','c']]);
});
test('nearby drops snap into a run and shifting an insertion does not move unrelated groups',()=>{
 const next=L.move([['a','b','c'],['z1','z2','z3']],[{x:1,y:1},{x:1,y:5}],['own'],{x:4.5,y:1.7});
 assert.deepEqual(next.rows[0],['a','b','c','own']);assert.deepEqual(next.layout[1],{x:1,y:5});
 const inside=L.move(next.rows,next.layout,['new'],{x:2.2,y:1.7});assert.deepEqual(inside.rows[0],['a','new','b','c','own']);
});
test('moving public tiles conserves every id and carries no tile from the old group twice',()=>{
 const next=L.move([['a','b','c'],['d','e','f']],[{x:0,y:1},{x:6,y:1}],['a','b'],{x:9.4,y:1.7});
 assert.deepEqual(next.rows.flat().sort(),['a','b','c','d','e','f']);assert.equal(new Set(next.rows.flat()).size,6);assert.deepEqual(next.layout[0],{x:2,y:1});
});
test('canvas zoom preserves logical positions and fits all 100 tiles in a small landscape board',()=>{
 const rows=Array.from({length:25},(_,i)=>Array.from({length:4},(_,j)=>i+'-'+j)),anchors=L.ensure(rows);const before=JSON.stringify(anchors),fit=L.fit(rows,anchors,330,105,34);
 assert.ok(fit.unit<34);for(let i=0;i<rows.length;i++){assert.ok((anchors[i].x+rows[i].length)*fit.unit<=330);assert.ok((anchors[i].y+1.4)*fit.unit<=105);}assert.equal(JSON.stringify(anchors),before);
 const expanded=L.ensure([...rows,['x','y','z']],anchors);assert.deepEqual(expanded.slice(0,25),anchors);
});
test('rack leaves holes when tiles are played, swaps into a slot, and fills the next hole on a draw',()=>{
 const slots=['a','b','c','d'];assert.deepEqual(L.syncRack(slots,['a','c','d']),['a',null,'c','d']);
 assert.deepEqual(L.moveRack(slots,['a'],2),['c','b','a','d']);assert.deepEqual(L.syncRack(['a',null,'c','d'],['a','c','d','new']),['a','new','c','d']);
 const multiple=L.moveRack(slots,['a','c'],1);assert.deepEqual(multiple.filter(Boolean).sort(),slots.sort());
});
test('layout validation rejects non-finite, missing or unbounded locations and ignores extra metadata',()=>{
 for(const value of [[{x:NaN,y:1}],[{x:0,y:Infinity}],[{x:-1,y:0}],[{x:1000,y:0}],[]])assert.throws(()=>L.normalize([['a','b','c']],value));
 assert.deepEqual(L.normalize([['a','b','c']],[{x:1.234,y:2.345,extra:'unused'}]),[{x:1.23,y:2.35}]);
});

test('removing the middle of a run splits both sides at their original positions',()=>{
 const next=L.move([['r1','r2','r3','r4','r5','r6','r7'],['z1','z2','z3']],[{x:1,y:1},{x:1,y:6}],['r4'],{x:12.5,y:3.7});
 assert.deepEqual(next.rows,[['r1','r2','r3'],['r5','r6','r7'],['z1','z2','z3'],['r4']]);assert.deepEqual(next.layout.slice(0,3),[{x:1,y:1},{x:5,y:1},{x:1,y:6}]);
 const removed=L.remove([['a','b','c','d','e','f','g']],[{x:0,y:2}],['b','e']);assert.deepEqual(removed.rows,[['a'],['c','d'],['f','g']]);assert.deepEqual(removed.layout,[{x:0,y:2},{x:2,y:2},{x:5,y:2}]);
});
test('same-number groups keep their remainder together and free placement bypasses snapping',()=>{
 const next=L.move([['r10','b10','o10','k10']],[{x:1,y:1}],['b10'],{x:8.5,y:4.7},{split:()=>false});assert.deepEqual(next.rows[0],['r10','o10','k10']);
 const free=L.move([['a','b','c']],[{x:1,y:1}],['own'],{x:4.9,y:1.7},{free:true});assert.deepEqual(free.rows,[['a','b','c'],['own']]);assert.deepEqual(free.layout,[{x:1,y:1},{x:4.4,y:1}]);
 const near=L.move([['a','b','c']],[{x:1,y:1}],['own'],{x:2,y:2.1});assert.equal(near.rows.length,2);assert.ok(near.layout[1].y>=2.6);
});
test('automatic run separation can be submitted with an extracted public tile and own tiles',()=>{
 const E=require('../cube-engine.js'),deck=E.deck(),find=id=>deck.find(t=>t.id===id),old=Array.from({length:7},(_,i)=>find('red-'+(i+1)+'-0')),hand=['blue-4-0','orange-4-0','black-12-0'].map(find);
 const state={players:['a','b'],turnUid:'a',hands:{a:hand,b:[find('blue-13-0')]},pool:[],table:[old],opened:{a:true,b:false},revision:0,turn:1,passes:0,winnerUid:null};
 const moved=L.move([old.map(t=>t.id)],[{x:1,y:1}],['red-4-0','blue-4-0','orange-4-0'],{x:12.5,y:4.7});const next=E.move(state,'a',{type:'commit',table:moved.rows});assert.equal(next.table.length,3);assert.ok(next.table.every(E.meld));assert.equal(next.hands.a.length,1);assert.equal(new Set(next.table.flat().map(t=>t.id)).size,9);
});
