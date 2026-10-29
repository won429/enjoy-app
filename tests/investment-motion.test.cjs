const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start = html.indexOf('        window.beginEnjoyMenuTransition = (function () {');
const source = html.slice(start,html.indexOf('\n\n        window.openMenuBrowser',start));
function setup(reduced = false) {
  const events={},mediaEvents={},media={matches:reduced,addEventListener(name,fn){mediaEvents[name]=fn;}};
  const document={hidden:false,documentElement:{},addEventListener(name,fn){events[name]=fn;}};
  const window={matchMedia:()=>media,addEventListener(name,fn){events[name]=fn;}};
  const make = id => {
    const classes=new Set(),values={};let css='color:inherit';
    const style={setProperty(name,value){values[name]=value;},get cssText(){return css;},set cssText(value){css=value;for(const key of Object.keys(values))delete values[key];}};
    const rect={left:20,top:30,width:360,height:640,right:380,bottom:670};
    return {id,style,values,hidden:false,inert:false,scrollTop:80,scrollLeft:0,parentElement:null,animations:[],
      classList:{add(name){classes.add(name);},remove(name){classes.delete(name);},contains:name=>classes.has(name)},
      getClientRects(){return this.hidden?[]:[rect];},getBoundingClientRect:()=>rect,
      animate(frames,options){
        let finish,fail;const finished=new Promise((resolve,reject)=>{finish=resolve;fail=reject;});
        const animation={frames,options,finished,cancelled:false,finish,cancel(){this.cancelled=true;fail(Error('cancelled'));}};
        this.animations.push(animation);return animation;
      }};
  };
  vm.runInNewContext(source,{window,document,getComputedStyle:()=>({display:'flex',transform:'none',perspective:'none',filter:'none',willChange:'auto',contain:'none'}),Promise});
  return {window,document,events,media,mediaEvents,make,begin:window.beginEnjoyMenuTransition};
}

test('shared menu motion completes cleanup only after both visible layers finish',async()=>{
  const ui=setup(),from=ui.make('detail'),to=ui.make('ticket');
  const commit=ui.begin(from,to);assert.equal(from.animations.length,0,'navigation state changes before any animation begins');
  from.hidden=true;const complete=commit();
  assert.equal(typeof complete.then,'function','dialog callers can safely clear their old markup after completion');
  assert.equal(from.animations[0].options.duration,160);assert.equal(to.animations[0].options.duration,280);
  assert.equal(to.animations[0].options.easing,'cubic-bezier(.2,.75,.25,1)');
  assert.equal(to.animations[0].frames[0].scale,'.985');
  assert.equal(from.inert,true);assert.equal(from.values.position,'fixed');
  from.animations[0].finish();await Promise.resolve();assert.equal(from.inert,true);
  to.animations[0].finish();await complete;
  assert.equal(from.inert,false);assert.equal(from.values.position,undefined);
  assert.equal(from.classList.contains('is-menu-transition'),false);assert.equal(to.classList.contains('is-menu-transition'),false);
  assert.equal(from.hidden,true,'cleanup never reverses the actual navigation state');
});

test('a rapid second navigation cancels the old pair and restores its input and layout state',async()=>{
  const ui=setup(),a=ui.make('home'),b=ui.make('detail'),c=ui.make('ticket');
  const first=ui.begin(a,b)();
  const next=ui.begin(b,c);
  assert.equal(a.animations[0].cancelled,true);assert.equal(b.animations[0].cancelled,true);
  assert.equal(a.inert,false);assert.equal(a.values.position,undefined);
  const second=next();b.animations.at(-1).finish();c.animations[0].finish();await Promise.all([first,second]);
  assert.equal(b.inert,false);assert.equal(c.classList.contains('is-menu-transition'),false);
});

test('reduced motion, hidden documents and resize never leave a frozen interaction layer',async()=>{
  const reduced=setup(true),a=reduced.make('home'),b=reduced.make('detail');reduced.begin(a,b)();
  assert.equal(a.animations.length,0);assert.equal(b.animations.length,0);
  reduced.document.hidden=true;reduced.media.matches=false;reduced.begin(a,b)();assert.equal(a.animations.length,0);
  const ui=setup(),from=ui.make('ticket'),to=ui.make('detail'),complete=ui.begin(from,to)();
  ui.events.resize();await complete;
  assert.equal(from.inert,false);assert.equal(from.classList.contains('is-menu-transition'),false);assert.equal(to.classList.contains('is-menu-transition'),false);
});
