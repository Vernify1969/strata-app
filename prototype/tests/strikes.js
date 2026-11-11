const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.APP||path.join(__dirname,'..','taskspeck-managers.html'),'utf8');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mk=(url)=>{const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole(),url:url||'https://example.org/?demo=1'});const w=dom.window,d=w.document;return{w,d,$:s=>d.querySelector(s),$$:s=>[...d.querySelectorAll(s)],ev:c=>w.eval(c),txt:()=>d.querySelector('#view').textContent.replace(/\s+/g,' '),click:s=>{const e=typeof s==='string'?d.querySelector(s):s;if(!e)throw new Error('missing '+s);e.click()},inp:(e,v)=>{e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}))},chg:(e,v)=>{e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))},toast:()=>d.querySelector('#toast').textContent}};
const PROF="S.prof.role='OC manager';S.prof.name='Alex Morgan';S.prof.pay='bank';S.prof.consent=true;S.prof.abn='51 824 753 556';S.prof.billing='a@b.co';S.prof.oc='OC';";
(async()=>{try{
 let I=mk();await sleep(300);const e=c=>I.ev(c);e(PROF);
 // ===== settings and sample data =====
 ok(e("S.set.strikeLimit")===3&&e("S.set.strikeDays")===180&&e("S.set.suspendDays")===30&&e("S.set.noShowMin")===60,'the starting rules are 3 strikes, counted for 180 days, a 30 day suspension, and no arrival flagged after 60 minutes');
 ok(e("suspUntil('c10')")===e("addDays(todayIso(),21)")&&e("suspended('c10')")&&e("skActive('c9').length")===1&&!e("suspended('c9')")&&e("skActive('c11').length")===0&&e("skAll('c11').length")===1&&e("skActive('c1').length")===0,'the sample data has one suspended contractor, one with a strike, one whose strike was removed, and nothing against the contractor in the demo');
 ok(!/S\.strikes\[ME\]/.test(html)&&!/S\.strikes\.c1/.test(html),'nothing in the app still counts a contractor’s strikes the old way');
 // ===== a contractor cancels =====
 const book=(extra)=>e("(()=>{const j=job('m1'),q={id:'qb1',no:'QT-9001',c:ME,price:300,gst:false,date:addDays(todayIso(),3),time:'10:00',dur:'2 hours',scope:'x',pay:'after',inc:['x'],note:''};j.quote=q;j.quotes=[q];j.con=ME;j.price=q.price;j.wo='WO-9001';j.stage='paid';j.pay={reqs:[]};j.live=null;j.log=j.log||[];"+(extra||'')+"})()");
 book();e("S.role='contractor';S.stack=[];S.tab.contractor='cactive';render();go('cwork',{id:'m1'})");
 ok(!!I.$('#cwhy')&&I.$$('#cwhy option').map(o=>o.textContent).join('|')==='Choose a reason|The site was unsafe|The manager changed the job or the access|I was sick or had an emergency|I can no longer do the job|Another reason','the cancel card asks why, with five reasons');
 ok(/counts as a strike, unless the site was unsafe or the manager changed the job or the access/.test(I.txt())&&/At 3 strikes within 180 days, new offers are suspended for 30 days/.test(I.txt()),'and says what counts as a strike and what happens at the limit, with the current numbers');
 I.click('[data-a=ccancel]');ok(/Choose why you are cancelling/.test(I.toast())&&e("job('m1').stage")==='paid'&&e("skActive('c1').length")===0,'it will not cancel without a reason');
 for(const why of ['The site was unsafe','The manager changed the job or the access']){book();e("S.role='contractor';S.stack=[];go('cwork',{id:'m1'})");I.chg(I.$('#cwhy'),why);I.click('[data-a=ccancel]');
  ok(e("job('m1').stage")==='open'&&e("skActive('c1').length")===0&&/No strike for this reason/.test(I.toast())&&e("job('m1').log.slice(-1)[0].x").includes('('+why+'). No strike.'),'cancelling because “'+why.toLowerCase()+'” is not a strike, and the history says so')}
 book("const r=newReq(j,'deposit',100,{iso:addDays(todayIso(),2),hm:'09:00'});r.status='paid';r.held=true;");e("S.role='contractor';S.stack=[];go('cwork',{id:'m1'})");I.chg(I.$('#cwhy'),'I can no longer do the job');I.click('[data-a=ccancel]');
 ok(e("skActive('c1').length")===1&&e("S.sk.filter(x=>x.c==='c1')[0].type")==='cancel'&&e("S.sk.filter(x=>x.c==='c1')[0].reason")==='I can no longer do the job'&&e("S.sk.filter(x=>x.c==='c1')[0].title")===e("job('m1').title")&&/Strike 1 of 3/.test(I.toast()),'cancelling for any other reason is a strike, with the job and the reason recorded');
 ok(e("job('m1').stage")==='open'&&!e("job('m1').con")&&e("!job('m1').pay")&&e("job('m1').log.some(l=>/PR-\\d+.* refunded in full, no fee/.test(l.x))")&&/Strike recorded\. Any payment held by Stripe was refunded in full/.test(e("job('m1').log.slice(-1)[0].x")),'the deposit is refunded in full, the job opens again, and the history says a strike was recorded');
 // ===== counting and suspension =====
 const setSk=(days)=>e("S.sk=S.sk.filter(x=>x.c!=='c1');"+JSON.stringify(days)+".forEach((d,i)=>S.sk.push({id:'t'+i,c:'c1',type:'cancel',job:null,title:'T'+i,on:addDays(todayIso(),d),reason:'Another reason',status:'active',why:'',review:null}))");
 setSk([-100,-60,-10]);ok(e("suspUntil('c1')")===e("addDays(todayIso(),20)")&&e("suspended('c1')"),'three strikes in the window suspend for 30 days from the third one');
 setSk([-100,-60,-45]);ok(e("suspUntil('c1')")===null&&e("skActive('c1').length")===3,'once the 30 days are over the contractor can send offers again, with the strikes still counting');
 e("skAdd('c1','cancel',null,'Another reason')");ok(e("suspUntil('c1')")===e("addDays(todayIso(),30)"),'and one more strike suspends again for 30 days from that strike');
 setSk([-200,-20,-10]);ok(e("skActive('c1').length")===2&&!e("suspended('c1')"),'a strike older than 180 days no longer counts');
 setSk([-30,-20,-10]);e("S.sk.find(x=>x.id==='t1').status='removed'");ok(!e("suspended('c1')")&&e("skActive('c1').length")===2,'a removed strike does not count');e("S.sk.find(x=>x.id==='t1').status='active'");ok(e("suspended('c1')"),'and counts again when restored');
 e("S.set.strikeLimit=2;S.sk.find(x=>x.id==='t2').status='removed'");ok(e("suspended('c1')"),'a different limit is used: two strikes suspend when the limit is 2');e("S.set.strikeLimit=3");
 // ===== what a suspended contractor sees =====
 setSk([-30,-20,-10]);e("S.role='contractor';S.stack=[];S.tab.contractor='cprof';render()");
 ok(/Reliability record/.test(I.txt())&&/Your account is suspended from sending new offers until/.test(I.txt())&&/Strikes now\s*3 of 3/.test(I.txt())&&/Cancelled after accepting · T2/.test(I.txt())&&/You keep the jobs you have already accepted/.test(I.txt()),'the profile shows the record and the suspension, and that accepted jobs continue');
 e("S.stack=[];S.tab.contractor='chome';render()");ok(/Your account is suspended from sending new offers until/.test(I.txt()),'and so does the Find work screen');
 // ===== asking for a review, and the owner's decision =====
 e("S.stack=[];S.tab.contractor='cprof';render()");I.click('[data-a=skreview][data-v=t2]');ok(/Write why it should be reviewed/.test(I.toast())&&!e("S.sk.find(x=>x.id==='t2').review"),'a review needs a reason');
 I.inp(I.$('#skn'),'The manager moved the booking by phone');I.click('[data-a=skreview][data-v=t2]');ok(e("S.sk.find(x=>x.id==='t2').review.note")==='The manager moved the booking by phone'&&/In review/.test(I.txt())&&/review requested/.test(I.txt()),'a review request is recorded and shown as In review');
 e("S.role='manager';S.stack=[];S.ownerMode=true;A.owner()");ok(/Strikes recorded \(\d+ active\)/.test(I.txt())&&/review requested: The manager moved the booking by phone/.test(I.txt())&&/Aqua Flow Plumbing/.test(I.txt()),'the owner sees the strikes, the contractor’s name and the review request');
 I.click('[data-a=skremove][data-v=t2]');ok(/Write the reason for removing it/.test(I.toast())&&e("S.sk.find(x=>x.id==='t2').status")==='active','removing a strike needs a reason');
 I.inp(I.$('#skrm'),'Booking was moved by the manager');I.click('[data-a=skremove][data-v=t2]');ok(e("S.sk.find(x=>x.id==='t2').status")==='removed'&&e("S.sk.find(x=>x.id==='t2').why")==='Booking was moved by the manager'&&!e("suspended('c1')")&&e("skActive('c1').length")===2,'with a reason it is removed, and the suspension ends');
 e("S.role='contractor';S.stack=[];S.tab.contractor='cprof';render()");ok(/removed: Booking was moved by the manager/.test(I.txt())&&/Strikes now\s*2 of 3/.test(I.txt()),'the contractor sees it as removed, with the reason');
 e("S.role='manager';S.stack=[];S.ownerMode=true;A.owner()");I.click('[data-a=skrestore][data-v=t2]');ok(e("S.sk.find(x=>x.id==='t2').status")==='active'&&e("suspended('c1')"),'the owner can restore it');
 e("S.role='contractor'");e("S.sk=S.sk.filter(x=>x.c!=='c1')");
 // ===== owner settings =====
 e("S.role='manager';S.stack=[];S.ownerMode=true;A.owner()");
 ok(['strikeLimit','strikeDays','suspendDays','noShowMin'].every(k=>!!I.$('#sk-'+k))&&/Strikes that cause a suspension \(1 to 10\)/.test(I.txt())&&/a solicitor must review these rules/i.test(I.txt()),'Owner settings has the four numbers, and says a solicitor must review the rules');
 I.chg(I.$('#sk-strikeLimit'),'0');ok(/from 1 to 10/.test(I.toast())&&e("S.set.strikeLimit")===3,'a limit of 0 is refused');
 I.chg(I.$('#sk-strikeLimit'),'11');ok(/from 1 to 10/.test(I.toast())&&e("S.set.strikeLimit")===3,'and 11');
 I.chg(I.$('#sk-strikeDays'),'abc');ok(/from 30 to 730/.test(I.toast())&&e("S.set.strikeDays")===180,'and text');
 I.chg(I.$('#sk-suspendDays'),'181');ok(/from 1 to 180/.test(I.toast())&&e("S.set.suspendDays")===30,'and a suspension of more than 180 days');
 I.chg(I.$('#sk-noShowMin'),'10');ok(/from 15 to 240/.test(I.toast())&&e("S.set.noShowMin")===60,'and a no-arrival time under 15 minutes');
 I.chg(I.$('#sk-strikeLimit'),'4');I.chg(I.$('#sk-suspendDays'),'14');I.chg(I.$('#sk-noShowMin'),'45');ok(e("S.set.strikeLimit")===4&&e("S.set.suspendDays")===14&&e("S.set.noShowMin")===45,'valid numbers are saved');
 e("S.set.strikeLimit=3;S.set.suspendDays=30;S.set.noShowMin=60");
 // ===== a contractor does not arrive =====
 const place=(mins,who)=>e("(()=>{const j=job('m2'),c='"+(who||'c2')+"',q={id:'qns',no:'QT-9002',c,price:300,gst:false,dur:'2 hours',scope:'x',pay:'after',inc:['x'],note:''},p=zParts(Date.now()-"+mins+"*60000,regTz(jobReg(j)));q.date=isoOf(p.year,p.month-1,p.day);q.time=pad(p.hour)+':'+pad(p.minute);j.quote=q;j.quotes=[q];j.con=c;j.price=300;j.wo='WO-9002';j.stage='paid';j.pay={reqs:[]};j.live=null;j.nsOk=false;const r=newReq(j,'deposit',100,{iso:addDays(todayIso(),1),hm:'09:00'});r.status='paid';r.held=true})()");
 e("S.role='manager';S.prof.role='OC manager';S.stack=[];S.tab.manager='jobs';render()");
 place(59);e("go('mjob',{id:'m2'})");ok(!/No arrival recorded/.test(I.txt())&&!e("noShowDue(job('m2'))"),'59 minutes after the start there is no flag');
 place(61);e("S.stack=[];go('mjob',{id:'m2'})");const cn=e("CON['c2'].name");ok(e("noShowDue(job('m2'))")&&/No arrival recorded/.test(I.txt())&&I.txt().includes(cn+' was booked for')&&/has not arrived 60 minutes later/.test(I.txt())&&!!I.$('[data-a=noshow]')&&!!I.$('[data-a=nsok]')&&/Do not confirm if you agreed a change/.test(I.txt()),'61 minutes after the start the manager is asked, naming the contractor and the booking');
 I.click('[data-a=nsok]');ok(e("job('m2').nsOk")===true&&!/No arrival recorded/.test(I.txt())&&e("S.sk.filter(x=>x.c==='c2').length")===0&&e("job('m2').stage")==='paid'&&/no problem with the booked arrival/.test(e("job('m2').log.slice(-1)[0].x")),'saying it is fine removes the flag and records nothing against the contractor');
 place(90);e("S.stack=[];go('mjob',{id:'m2'})");I.click('[data-a=noshow]');
 ok(e("S.sk.filter(x=>x.c==='c2'&&x.type==='noshow').length")===1&&e("S.sk.find(x=>x.c==='c2'&&x.type==='noshow').title")===e("job('m2').title")&&e("job('m2').stage")==='open'&&!e("job('m2').con"),'confirming records a strike against that contractor, and the job opens again');
 ok(e("job('m2').log.map(l=>l.x).some(x=>/did not arrive\\. Confirmed by the manager\\. Strike recorded\\. Any payment held by Stripe was refunded in full/.test(x))")&&e("job('m2').log.some(l=>/refunded in full/.test(l.x))"),'the deposit is refunded in full and the history says what happened');
 place(120);e("job('m2').live={arr:true}");ok(!e("noShowDue(job('m2'))"),'a contractor who has arrived is never flagged');e("job('m2').live=null;job('m2').stage='onsite'");ok(!e("noShowDue(job('m2'))"),'nor one whose job is under way');e("job('m2').stage='paid'");
 e("job('m2').mine=false");ok(!e("noShowDue(job('m2'))"),'nor a job that is not the manager’s');e("job('m2').mine=true");
 e("A.noshow('m2')");e("job('m2').nsOk=true;A.noshow('m2')");ok(/can no longer be marked this way/.test(I.toast()),'and the action is refused when the flag is gone');
 // ===== older saved data =====
 const raw=JSON.parse(e("snapshot()"));raw.S.strikes={c1:2,c3:1};delete raw.S.sk;delete raw.S.set.strikeLimit;delete raw.S.set.strikeDays;delete raw.S.set.suspendDays;delete raw.S.set.noShowMin;I.ev("applyRaw("+JSON.stringify(JSON.stringify(raw))+")");
 ok(e("skActive('c1').length")===2&&e("skActive('c3').length")===1&&e("S.sk.filter(x=>x.c==='c1').every(x=>x.reason==='Carried over from an earlier version')")&&Object.keys(JSON.parse(e("JSON.stringify(S.strikes)"))).length===0&&e("S.set.strikeLimit")===3&&e("S.set.noShowMin")===60,'an account saved with the old strike counts keeps them as strikes, and gets the starting rules');
 console.log(fail?fail+' FAILED':'ALL PASSED');I.w.close();
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)})();
