const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const records=require('../meeting-records.js'),benefits=require('../meeting-benefits.js');
const app=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=app.indexOf('window.calculateMemberHistory = function('),end=app.indexOf('window.renderMeetingStatus =',start);
const window={EnjoyMeetingRecords:records};vm.runInNewContext(app.slice(start,end),{window,Date,Math});
const calculate=window.calculateMemberHistory,now=new Date('2026-10-30T12:00:00+09:00');
const row=amount=>({name:'성원제',status:amount?'paid':'unpaid',amount});
test('legacy numeric months belong to the original 2025-10 through 2026-9 cycle only',()=>{
 const data={records:Object.fromEntries(Array.from({length:12},(_,i)=>[String(i+1),[row(i+1)]]))};
 for(let month=1;month<=12;month++){
  const year=month>=10?2025:2026;assert.equal(records.rowsAt(data,year,month)[0].amount,month);
  assert.equal(records.rowsAt(data,year+1,month).length,0);
 }
 assert.equal(records.rowsAt(data,2025,1).length,0);
});
test('canonical and zero-padded year-month records take priority, including explicitly empty months',()=>{
 const data={records:{'1':[row(100)],'2026-01':[row(20000)],'2026-1':[row(15000)],'10':[row(15000)],'2026-10':[]}};
 assert.equal(records.rowsAt(data,2026,1)[0].amount,15000);delete data.records['2026-1'];
 assert.equal(records.rowsAt(data,2026,1)[0].amount,20000);assert.deepEqual(records.rowsAt(data,2026,10),[]);
 assert.equal(records.rowsAt(data,2025,10)[0].amount,15000);
});
test('year-specific payments do not leak into prior years in the actual wallet calculation',()=>{
 const data={records:{'10':[row(15000)],'2026-10':[row(20000)]}};
 const history=calculate(data,now)['성원제'];assert.equal(history['2025-10'].amount,15000);assert.equal(history['2026-10'].amount,20000);
 const padded=calculate({records:{'2026-01':[row(21000)]}},now)['성원제'];assert.equal(padded['2026-1'].amount,21000);
});
test('benefits, fee rates and alias month resolution agree with the wallet reader',()=>{
 const data={records:{'10':[row(15000)],'2026-01':[row(19000)],'2026-10':[row(20000)]}};
 for(const [year,month] of [[2025,10],[2026,1],[2026,10],[2027,10]])assert.deepEqual(benefits.rowsAt(data,year,month),records.rowsAt(data,year,month));
 assert.equal(records.regularDues(2025),15000);assert.equal(records.regularDues(2026),20000);
});
test('invalid periods and malformed month data fail rather than borrowing another years payment',()=>{
 for(const [year,month]of[[2024,10],[2026,0],[2026,13],['abc',1],[2026,1.5]])assert.throws(()=>records.rowsAt({records:{}},year,month),/연도와 월/);
 assert.throws(()=>records.rowsAt({records:{'2026-10':{amount:20000}}},2026,10),/자료 형식/);
});
test('rendering or browsing an absent month never adds phantom unpaid records to the shared document',()=>{
 const a=app.indexOf('window.renderDues = function('),b=app.indexOf('\n        //',app.indexOf('\n        };',a));
 const render=app.slice(a,app.indexOf('\n        };',a)+12),nodes={'dues-list':{innerHTML:''},'dues-month-title':{innerText:''}};
 const data={records:{'2025-10':[row(15000)]}},before=JSON.stringify(data);
 const root={EnjoyMeetingRecords:records,meetingData:data,activeTabIndex:0,currentDuesYear:2026,calculateMemberHistory:()=>calculate(data,now)};
 const displayStart=app.indexOf('function duesDisplayAmounts('),displayEnd=app.indexOf('function duesArrearsEntries(',displayStart);
 vm.runInNewContext(app.slice(displayStart,displayEnd)+render,{window:root,document:{getElementById:id=>nodes[id]},Date,Math,memberColors:{},duesEscape:String,
  createEmptyMonthData:()=>[row(0)],encodeURIComponent});
 root.renderDues(10,2026);root.renderDues(11,2027);assert.equal(JSON.stringify(data),before);assert.match(nodes['dues-month-title'].innerText,/2027년 11월/);
});
