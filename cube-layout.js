(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CubeLayout=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TILE_HEIGHT=1.4,GAP=.35;
  const clamp=(v,low,high)=>Math.max(low,Math.min(high,v));
  const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=128&&p.y<=128;
  const rect=(row,p)=>({x:p.x,y:p.y,w:row.length,h:TILE_HEIGHT});
  const overlaps=(a,b)=>a.x<b.x+b.w+GAP&&a.x+a.w+GAP>b.x&&a.y<b.y+b.h+.2&&a.y+a.h+.2>b.y;
  function freeSpace(rows,layout,n,preferred={x:0,y:0},width=22){
    const clear=p=>rows.every((row,i)=>!row.length||!layout[i]||!overlaps(rect(new Array(n),p),rect(row,layout[i])));
    if(clear(preferred))return {...preferred};
    for(let y=0;y<180;y+=1.7)for(let x=0;x+n<=Math.max(width,n);x+=.25){const p={x,y:Math.round(y*100)/100};if(clear(p))return p;}
    return {x:0,y:Math.max(0,...layout.map(p=>p?.y||0))+1.7};
  }
  function ensure(rows,prior=[],width=22){
    const result=rows.map((_,i)=>valid(prior[i])?{x:prior[i].x,y:prior[i].y}:null);
    for(let i=0;i<rows.length;i++)if(rows[i].length&&!result[i])result[i]=freeSpace(rows,result,rows[i].length,{x:0,y:0},width);
    for(let i=0;i<rows.length;i++)if(rows[i].length&&rows.slice(0,i).some((row,j)=>row.length&&overlaps(rect(rows[i],result[i]),rect(row,result[j])))){
      const others=rows.map((row,j)=>j===i?[]:row);result[i]=freeSpace(others,result,rows[i].length,{x:result[i].x,y:result[i].y},width);
    }
    return result.map(p=>p||{x:0,y:0});
  }
  function fit(rows,layout,width,height,base=50){
    const bounds=rows.reduce((out,row,i)=>row.length?{w:Math.max(out.w,layout[i].x+row.length+.25),h:Math.max(out.h,layout[i].y+TILE_HEIGHT+.25)}:out,{w:0,h:0});
    return {unit:Math.max(.01,Math.min(base,bounds.w?width/bounds.w:base,bounds.h?height/bounds.h:base)),...bounds};
  }
  function move(source,anchors,ids,point){
    if(!ids.length||new Set(ids).size!==ids.length)throw Error('타일을 확인해주세요.');
    const rows=source.map(row=>row.slice()),layout=ensure(rows,anchors),moving=new Set(ids);
    rows.forEach((row,i)=>{const first=row.findIndex(id=>!moving.has(id));if(first>0)layout[i].x+=first;rows[i]=row.filter(id=>!moving.has(id));});
    let target=-1,distance=Infinity;
    rows.forEach((row,i)=>{if(!row.length)return;const p=layout[i],dy=Math.abs(point.y-p.y-TILE_HEIGHT/2),dx=Math.max(p.x-point.x,point.x-(p.x+row.length),0);if(dy<=.65&&dx<=.7&&dy+dx<distance){target=i;distance=dy+dx;}});
    if(target>=0){
      const p=layout[target],index=clamp(Math.round(point.x-p.x),0,rows[target].length);
      if(point.x<p.x)p.x=Math.max(0,p.x-ids.length);
      rows[target].splice(index,0,...ids);
    }else {
      target=rows.length;rows.push(ids.slice());layout.push(freeSpace(rows.slice(0,-1),layout,ids.length,{x:Math.max(0,Math.round((point.x-.5)*10)/10),y:Math.max(0,Math.round((point.y-TILE_HEIGHT/2)*10)/10)}));
    }
    // An insertion only nudges its immediate neighbours; the rest of the table keeps its anchors.
    const queue=[target],visited=new Set();
    while(queue.length){const i=queue.shift();if(visited.has(i))continue;visited.add(i);for(let j=0;j<rows.length;j++)if(j!==i&&rows[j].length&&!visited.has(j)&&overlaps(rect(rows[i],layout[i]),rect(rows[j],layout[j]))){layout[j].x=layout[i].x+rows[i].length+GAP;queue.push(j);}}
    return {rows,layout,target};
  }
  function normalize(rows,layout){
    if(layout===undefined)return ensure(rows);
    if(!Array.isArray(layout)||layout.length!==rows.length||layout.some(p=>!valid(p)))throw Error('테이블 위치를 확인해주세요.');
    return ensure(rows,layout.map(p=>({x:Math.round(p.x*100)/100,y:Math.round(p.y*100)/100})));
  }
  function syncRack(slots,ids,ordered=ids){
    const hand=new Set(ids),out=slots.map(id=>hand.has(id)?id:null),seen=new Set(out.filter(Boolean));
    for(const id of ordered)if(hand.has(id)&&!seen.has(id)){const empty=out.indexOf(null);if(empty<0)out.push(id);else out[empty]=id;seen.add(id);}
    while(out.length&&out.at(-1)===null)out.pop();return out;
  }
  function moveRack(slots,ids,index){
    const out=slots.slice(),old=out.indexOf(ids[0]),moving=new Set(ids),occupant=out[index];
    out.forEach((id,i)=>{if(moving.has(id))out[i]=null;});
    if(ids.length===1&&old>=0&&occupant&&!moving.has(occupant)){out[old]=occupant;out[index]=ids[0];return out;}
    for(let i=0;i<ids.length;i++){
      const at=index+i;if(out[at]){let hole=at+1;while(out[hole])hole++;for(let j=hole;j>at;j--)out[j]=out[j-1];}out[at]=ids[i];
    }
    return out;
  }
  return {TILE_HEIGHT,ensure,fit,move,normalize,freeSpace,syncRack,moveRack};
});
