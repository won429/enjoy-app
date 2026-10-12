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
