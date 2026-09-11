import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
const index=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const detail=readFileSync(new URL('../../baseball-game-detail.html',import.meta.url),'utf8');
for(const html of [index,detail])for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 if(!/\bsrc\s*=|application\/ld\+json|type=["']module/.test(match[1]))new Script(match[2]);
}
assert.ok(!index.includes('asian-games-frame'));
assert.ok(!index.includes('asian-games-screen'));
const source=index.slice(index.indexOf('window.openEnjoyAsianGames = function'),index.indexOf('window.openEnjoyAsianGamesDestination = async'));
let destination,returnUrl,guestReturn;
const state={keep:'existing-state'};
runInNewContext(source+'window.openEnjoyAsianGames();',{
 URL,sessionStorage:{setItem:(key,value)=>guestReturn=value},window:{isGuest:true,location:{href:'https://won429.github.io/enjoy-app/index.html?existing=1',assign:url=>destination=url}},
 history:{state,replaceState:(s,unused,url)=>{assert.equal(s,state);returnUrl=new URL(url);}}
});
assert.equal(destination,'asian-games.html');
assert.equal(guestReturn,'1');
assert.equal(returnUrl.searchParams.get('existing'),'1');
assert.equal(returnUrl.searchParams.get('asianGamesView'),'community');
const restoreSource=index.slice(index.indexOf('let restoreAsianGamesGuest = false;'),index.indexOf('showLoginForm();',index.indexOf('let restoreAsianGamesGuest = false;')));
for(const [view,flag,expected] of [['community','1',true],['schedule','1',true],['community','0',false],['other','1',false]]){
 let restored=false,removed=false;
 runInNewContext('(function(){'+restoreSource+'})()',{
  URLSearchParams,location:{search:'?asianGamesView='+view},
  sessionStorage:{getItem:()=>flag,removeItem:()=>removed=true},window:{enjoyGuest:()=>restored=true}
 });
 assert.equal(restored,expected);assert.equal(removed,expected);
}
const backScript=[...detail.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('standalone-back'))[1];
for(const embedded of [true,false]){
 let click,backs=0,replacement;
 const window={};window.parent=embedded?{}:window;
 const button={hidden:true,addEventListener:(type,fn)=>click=fn};
 const history={length:2,back:()=>backs++};
 runInNewContext(backScript,{window,URLSearchParams,location:{search:'?from=asian-games',replace:url=>replacement=url},document:{getElementById:()=>button},history});
 assert.equal(button.hidden,embedded);
 if(!embedded){click();assert.equal(backs,1);history.length=1;click();assert.equal(replacement,'./asian-games.html#schedule');}
}
console.log('PASS: inline script syntax, same-tab navigation, baseball return URL, no Asian Games iframe, standalone detail return');
