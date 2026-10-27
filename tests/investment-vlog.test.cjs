const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const modulePromise = import('../cloudflare-worker/investment-vlog.js');

test('catalog reads only actual vlog URLs, includes latest banner and ignores comments, shares and unrelated videos', async () => {
  const {extractVlogCatalog,youtubeVideoId}=await modulePromise;
  const html=`<section id="home-vlog-panel"><div onclick="openBrowser('https://youtu.be/21uUicVMzqg')"></div><div id="home-vlog-catalog"></div></section>
    window.ENJOY_VLOG_PROGRAMS = { /* } https://youtu.be/ZZZZZZZZZZZ */ demo:{title:'{x}',episodes:[{url:'https://youtu.be/9nvi_15zz9s?si=abc'},{url:'https://youtube.com/shorts/AkszapiawS4'}, {url:'https://evil.invalid/watch?v=ZZZZZZZZZZZ'}]}};
    const unrelated='https://youtu.be/ZZZZZZZZZZZ';`;
  assert.deepEqual(extractVlogCatalog(html),['21uUicVMzqg','9nvi_15zz9s','AkszapiawS4']);
  assert.equal(youtubeVideoId('https://youtube.com.evil.invalid/watch?v=21uUicVMzqg'),'');
  assert.equal(youtubeVideoId('https://m.youtube.com/watch?v=21uUicVMzqg'),'21uUicVMzqg');
  assert.throws(()=>extractVlogCatalog('window.ENJOY_VLOG_PROGRAMS={broken'),/incomplete/);
  const actual=extractVlogCatalog(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'));
  assert.ok(actual.includes('21uUicVMzqg'));assert.ok(actual.includes('DhZ4val4eXg'));assert.ok(actual.length>=25);
});

test('20/30/50 directional weights respect the configured cap; clicks falling is negative and neutral random has no bias', async () => {
  const {stockInfluence}=await modulePromise;
  const full=stockInfluence({indexPrice:103,indexBaseline:100,clicks:20,previousClicks:0,uploads:1,maxBps:300});
  assert.deepEqual(full.components,{index:60,clicks:90,uploads:150,random:0});assert.equal(full.bps,300);
  assert.equal(stockInfluence({indexPrice:100,indexBaseline:100,maxBps:300}).bps,0);
  assert.equal(stockInfluence({indexPrice:97,indexBaseline:100,clicks:0,previousClicks:20,maxBps:300}).bps,-150);
  assert.equal(stockInfluence({indexPrice:10000,indexBaseline:1,clicks:100000,uploads:10000,maxBps:300}).bps,300);
});

test('daily index change affects successive stock ticks, index remains fixed and small point changes accumulate', async () => {
  const {createMarket,advanceMarket:advance,UPDATE_MS:HOUR_MS}=await import('../cloudflare-worker/investment-market.js');
  const advanceMarket=(state,now,signals)=>advance(state,now,signals,72,()=>.5);
  const state=createMarket({},0);state.quotes[0].price=103;
  const first=advanceMarket(state,HOUR_MS).state;
  assert.equal(first.quotes[0].price,103);assert.equal(first.quotes[1].price,101);assert.equal(first.lastDrivers.components.index,60);
  const second=advanceMarket(first,2*HOUR_MS).state;
  assert.equal(second.lastDrivers.components.index,60);assert.equal(second.quotes[1].price,101);
  const small=advanceMarket(createMarket({},0),20*HOUR_MS,()=>({clicks:1,previousClicks:0})).state;
  assert.equal(small.quotes[1].price,103,'fractional point influence survives integer display rounding');
  assert.equal(small.quotes[0].price,100);
});
