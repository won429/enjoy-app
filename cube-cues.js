(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CubeCues=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function createTracker(){
    let previous=null,announced='';
    return {reset(){previous=null;announced='';},update(input){
      const {key,own,deadline,now,enabled,sound,finished}=input,seconds=Math.max(0,Math.ceil((deadline-now)/1000));
      if(!key){previous=null;announced='';return {announce:false,effect:null};}
      let effect=null;
      if(previous&&previous.key!==key&&previous.own&&!previous.expired&&previous.deadline<=now&&enabled&&sound)effect='timeout';
      if(!previous||previous.key!==key)previous={key,own,deadline,second:null,expired:false};
      previous.deadline=deadline;previous.own=own;
      const announce=!!(enabled&&own&&!finished&&seconds>0&&announced!==key);
      if(announce)announced=key;
      if(previous.second!==seconds){
        if(enabled&&sound&&own&&!finished){if(seconds===0)effect='timeout';else if(seconds<=5)effect='urgent';else if(seconds<=10)effect='tick';}
        previous.second=seconds;if(seconds===0)previous.expired=true;
      }
      return {announce,effect};
    }};
  }
  return {createTracker};
});
