const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.APP||path.join(__dirname,'..','taskspeck-managers.html'),'utf8');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mk=(url)=>{const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole(),url:url||'https://example.org/?demo=1'});const w=dom.window,d=w.document;return{w,d,$:s=>d.querySelector(s),$$:s=>[...d.querySelectorAll(s)],ev:c=>w.eval(c),txt:()=>d.querySelector('#view').textContent.replace(/\s+/g,' '),click:s=>{const e=typeof s==='string'?d.querySelector(s):s;if(!e)throw new Error('missing '+s);e.click()},inp:(e,v)=>{e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}))},chg:(e,v)=>{e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))},toast:()=>d.querySelector('#toast').textContent}};
const PROF="S.prof.role='OC manager';S.prof.name='Alex Morgan';S.prof.pay='bank';S.prof.consent=true;S.prof.abn='51 824 753 556';S.prof.billing='a@b.co';S.prof.oc='OC';";
(async()=>{try{
 let I=mk();await sleep(300);const e=c=>I.ev(c);e(PROF);
 // ===== a screen that cannot open never leaves a blank page =====
 e("S.role='contractor';S.stack=[];go('cwork',{id:J.find(j=>j.stage==='open').id})");ok(/This job has no contractor yet/.test(I.txt()),'a job screen opened for a job that nobody has been given to says so, instead of crashing');
 e("S.role='contractor';S.stack=[];go('cwork',{id:'nope'})");ok(/This job has no contractor yet/.test(I.txt()),'and so does one that does not exist');
 e("S.role='manager';S.stack=[];S.tab.manager='mhome';render()");
 const bad=[];for(const n of Object.keys(JSON.parse(e("JSON.stringify(Object.fromEntries(Object.keys(V).map(k=>[k,1])))")))){for(const a of ['{id:"zzz"}','{}','{id:null}']){try{e("S.role='manager';S.stack=[];go('"+n+"',"+a+")");if(!I.txt().trim()&&!I.d.querySelector('#view').children.length)bad.push(n+' '+a)}catch(x){bad.push(n+' '+a+': '+x.message)}}}
 ok(bad.length===0,'no screen leaves a blank page or throws when it is opened with a missing or wrong id '+JSON.stringify(bad.slice(0,5)));
 e("S.stack=[];S.role='manager';go('mjob',{id:'zzz'})");ok(/This screen could not open/.test(I.txt())&&!!I.$('[data-a=back]'),'a screen that cannot open says so, with a Go back button');
 e("S.stack=[];S.tab.manager='mhome';render()");
 // ===== every button on every screen has an action behind it =====
 const dead=new Set();let seen=0;
 for(const [name,url,role,side] of [['building manager','?demo=1','Building manager','manager'],['property manager','?demo=property','Property manager','manager'],['contractor','?demo=contractor','','contractor']]){
  const X=mk('https://example.org/'+url);await sleep(250);if(side==='manager')X.ev("S.prof.role='"+role+"';"+PROF);
  const screens=[];const add=(c)=>screens.push(c);
  if(side==='manager'){['mhome','jobs','mcal','bld','cons','mprof'].forEach(t=>add("S.stack=[];S.role='manager';S.tab.manager='"+t+"';render()"));
   JSON.parse(X.ev("JSON.stringify(J.filter(j=>j.mine).map(j=>j.id))")).forEach(id=>add("S.stack=[];S.tab.manager='jobs';render();go('mjob',{id:'"+id+"'})"));
   JSON.parse(X.ev("JSON.stringify(B.map(b=>b.id))")).forEach(id=>add("S.stack=[];S.tab.manager='bld';S.bopen={b:'"+id+"',s:Object.fromEntries(['photos','budgets','payer','contacts','tenant','site','hist','edit','rpt','qlinks'].map(k=>['"+id+":'+k,true])),add:false};render()"));
   for(let i=1;i<=5;i++)add("S.stack=[];A.new();S.draft.bid=B[0].id;S.step="+i+";render()");add("S.stack=[];A.quick()");add("S.stack=[];go('emerg')");add("S.stack=[];S.ownerMode=true;A.owner()");add("S.stack=[];go('help')");add("S.stack=[];go('notify')");add("S.stack=[];go('mydata')");add("S.stack=[];A.reports()");
   if(role!=='Property manager'){['queue','qr','set'].forEach(t=>add("S.stack=[];A.breport('b1');S.bt='"+t+"';render()"));add("S.stack=[];A.breport('all');S.bt='queue';render()");JSON.parse(X.ev("JSON.stringify(RPT().map(r=>r.id))")).forEach(id=>add("S.stack=[];A.rptopen('"+id+"')"));add("S.stack=[];A.qshow('b1|b1-l1')");add("S.stack=[];openPub(bld('b1').locs[0].tok)")}
  }else{['chome','find','cactive','ccal','cprof'].forEach(t=>add("S.stack=[];S.role='contractor';S.tab.contractor='"+t+"';render()"));add("S.stack=[];S.role='contractor';go('help')");add("S.stack=[];S.role='contractor';go('notify')");add("S.stack=[];S.role='contractor';go('mydata')");
   JSON.parse(X.ev("JSON.stringify(J.map(j=>[j.id,j.stage]))")).forEach(([id,st])=>{add("S.stack=[];S.role='contractor';A.cjob('"+id+"')");if(st!=='open')add("S.stack=[];S.role='contractor';go('cwork',{id:'"+id+"'})")})}
  for(const c of screens){try{X.ev(c)}catch(x){continue}seen++;for(const el of X.$$('[data-a]')){const k=el.getAttribute('data-a');if(!k||k.includes('$'))continue;if(X.ev("typeof A['"+k.replace(/'/g,"\\'")+"']")!=='function')dead.add(name+': '+k)}}
  X.w.close()}
 ok(seen>=150,'checked the buttons on '+seen+' screens');ok(dead.size===0,'every button on every screen has an action behind it '+JSON.stringify([...dead].slice(0,6)));
 // ===== the small fixes =====
 e("S.stack=[];S.ownerMode=true;A.owner()");ok(!/ km /.test(I.txt())&&/Melbourne only to start\. The starting list/.test(I.txt()),'Owner settings no longer mentions a distance next to the postcode list');
 e("S.find.km=8;S.find.q='x';A.fclear()");ok(e("S.find.km")===0&&e("S.find.q")==='','clearing the contractor’s filters goes back to Any distance, as it starts');
 e("S.stack=[];S.tab.manager='bld';S.bopen={b:'b1',s:{'b1:qlinks':true},add:false};render()");ok(/Private shortcuts \(not for printing\)/.test(I.txt())&&/Never print or share these/.test(I.txt())&&!/Manager shortcut links/.test(I.txt()),'the manager’s shortcut links are named so they cannot be mistaken for the QR codes to print');
 // role switch
 {const R=mk();await sleep(300);R.ev("S.prof.role='OC manager'");R.ev("S.draft=newDraft();S.draft.title='Half done request';S.draft.area='Level 2'");const before=R.ev("S.prof.role");R.ev("A.mgrrole('Property manager')");
  ok(R.ev("S.prof.role")===before&&/unfinished request/.test(R.toast())&&R.ev("S.draft.title")==='Half done request','switching to the other kind of manager with a half-done request warns first, and changes nothing');
  R.ev("A.mgrrole('Property manager')");ok(R.ev("S.prof.role")==='Property manager'&&!/Half done request/.test(R.ev("JSON.stringify(S.draft)")),'tapping again switches and discards it');
  R.ev("S.draft=newDraft()");R.d.querySelector('#toast').textContent='';R.ev("A.mgrrole('Building manager')");ok(R.ev("S.prof.role")==='Building manager'&&!/unfinished/.test(R.toast()),'with nothing half-done it switches at once');
  R.ev("S.draft=newDraft();S.draft.title='Another';A.mgrrole('OC manager')");ok(R.ev("S.prof.role")==='OC manager'&&R.ev("S.draft.title")==='Another','between Building manager and OC manager (the same world) nothing is lost and there is no warning');R.w.close()}
 // ===== a payment that fails =====
 I.w.close();I=mk();await sleep(300);const f=c=>I.ev(c);f(PROF);
 const jid=f("J.find(j=>j.mine&&['approved','paid'].includes(j.stage)&&j.quote&&j.wo).id");
 f("(()=>{const j=job('"+jid+"');const r=newReq(j,'deposit',100,{iso:addDays(todayIso(),2),hm:'09:00'});r.status='sent';r.to='x@example.com'})()");const rid=f("reqsOf(job('"+jid+"')).slice(-1)[0].id");
 f("S.stack=[];S.tab.manager='jobs';render();go('mjob',{id:'"+jid+"'})");ok(I.$('[data-a=reqfail]')&&/Payment failed/.test(I.$('[data-a=reqfail]').textContent)&&!I.$('[data-a=reqretry]'),'a payment request that is waiting can be marked as failed (demo)');
 const paid0=f("paidSum(job('"+jid+"'))"),stage0=f("job('"+jid+"').stage");I.click('[data-a=reqfail]');
 ok(f("reqsOf(job('"+jid+"')).slice(-1)[0].status")==='sent'&&f("!!reqsOf(job('"+jid+"')).slice(-1)[0].failed")&&f("paidSum(job('"+jid+"'))")===paid0&&f("job('"+jid+"').stage")===stage0,'a failed payment stays owing: not paid, and the job does not move on');
 ok(/Payment failed\. Action needed\. Still owing/.test(I.txt())&&/The payment did not go through/.test(I.txt())&&/The card was declined/.test(I.txt())&&/nothing is held/.test(I.txt())&&!!I.$('[data-a=reqretry]')&&!I.$('[data-a=reqfail]'),'the job says so clearly, and what to do');
 ok(f("job('"+jid+"').log.slice(-1)[0].x")===('Payment of $100 for '+f("reqsOf(job('"+jid+"')).slice(-1)[0].no")+' failed: the card was declined. It is still owing')&&f("job('"+jid+"').log.slice(-1)[0].w")==='Payment (demo)','the job history records the failure');
 I.click('[data-a=reqretry]');ok(f("!reqsOf(job('"+jid+"')).slice(-1)[0].failed")&&!/Payment failed\. Action needed/.test(I.txt()),'Payer will try again clears the failed state');
 f("A.reqfail('"+jid+"|"+rid+"')");f("A.reqretry('"+jid+"|"+rid+"')");f("A.reqfail('"+jid+"|"+rid+"')");ok(/Failed 2 times|Failed 3 times/.test(I.txt())&&f("reqsOf(job('"+jid+"')).slice(-1)[0].fails")===3,'repeated failures are counted');
 f("A.reqpaid('"+jid+"|"+rid+"')");ok(f("reqsOf(job('"+jid+"')).slice(-1)[0].status")==='paid'&&f("!reqsOf(job('"+jid+"')).slice(-1)[0].failed"),'when it finally goes through it is paid and the failed state is gone');
 f("A.reqfail('"+jid+"|"+rid+"')");ok(/Email the payment request first/.test(I.toast())&&f("!reqsOf(job('"+jid+"')).slice(-1)[0].failed"),'a payment that is already paid cannot be marked as failed');
 f("(()=>{const j=job('"+jid+"');const r=newReq(j,'deposit',50,{iso:addDays(todayIso(),-1),hm:null});r.status='sent';r.failed={on:Date.now(),why:'x'}})()");ok(f("reqOver(reqsOf(job('"+jid+"')).slice(-1)[0])")===true,'a failed payment that is also past its due date is overdue too');
 // ===== my data and privacy =====
 f("S.stack=[];S.tab.manager='mprof';render()");ok(!!I.$('[data-a=mydata]')&&/My data and privacy/.test(I.txt()),'Profile has My data and privacy');
 I.click('[data-a=mydata]');ok(/Download my data/.test(I.txt())&&/Send a privacy request/.test(I.txt())&&/a solicitor must/i.test(I.txt())&&I.$$('#pt option').length===4,'the screen offers a download and four kinds of privacy request, and says a solicitor must review it');
 let blob='';I.w.Blob=class{constructor(p){blob=p.join('')}};I.w.URL.createObjectURL=()=>'blob:x';I.w.URL.revokeObjectURL=()=>{};I.click('[data-a=dldata]');
 const out=JSON.parse(blob);ok(/downloaded/.test(I.toast())&&out.account&&out.account.name==='Alex Morgan'&&Array.isArray(out.buildings)&&out.buildings.length>=3&&out.jobs.length>0&&out.jobs[0].log&&Array.isArray(out.reports),'the download holds the manager’s profile, buildings, jobs with their history, and reports');
 ok(!('priv' in out.account)&&!/passw|hash|salt|token/i.test(JSON.stringify(out.account))&&!/rtok|tok"/.test(JSON.stringify(out.reports)),'but no passwords, secret links or tokens');
 I.chg(I.$('#pt'),'Delete my account and data');I.inp(I.$('#pn'),'Please delete everything');I.click('[data-a=privsend]');
 ok(f("S.prof.priv.length")===1&&f("S.prof.priv[0].type")==='Delete my account and data'&&f("S.prof.priv[0].note")==='Please delete everything'&&/Your requests/.test(I.txt())&&/Delete my account and data/.test(I.txt())&&/Received/.test(I.txt()),'a privacy request is recorded and shown with its date and status');
 I.click('[data-a=privsend]');ok(f("S.prof.priv.length")===2,'more than one can be sent');
 f("S.role='contractor';S.stack=[];go('mydata')");blob='';I.click('[data-a=dldata]');const co=JSON.parse(blob);ok(co.profile&&co.business&&Array.isArray(co.jobs)&&!co.account&&f("(S.me.priv||[]).length")===0,'a contractor’s download holds their own profile and jobs, and their requests are kept apart from the manager’s');f("S.role='manager'");
 // ===== ABN =====
 ok(f("abnOk('51 824 753 556')")&&f("abnOk('51824753556')")&&!f("abnOk('51 824 753 557')")&&!f("abnOk('12 345 678 901')")&&!f("abnOk('5182475355')")&&!f("abnOk('')")&&!f("abnOk(null)")&&!f("abnOk('51 824 753 5566')")&&f("abnOk(' 51-824-753-556 ')"),'the ABN check accepts a valid ABN (with or without spaces) and refuses wrong digits, wrong lengths and empty values');
 const abns=[...new Set(html.match(/\b\d{2} \d{3} \d{3} \d{3}\b/g))].filter(x=>x!=='00 000 000 000');ok(abns.length>=2&&abns.every(x=>f("abnOk('"+x+"')")),'every sample ABN in the app passes the check ('+abns.join(', ')+')');
 f("S.prof.abn=''");ok(f("profMissing().some(x=>/Add your 11 digit ABN/.test(x))")===true,'a blank ABN is asked for');
 f("S.prof.abn='12 345 678 901'");ok(f("profMissing().some(x=>/Check your ABN\\. The digits do not add up/.test(x))")===true,'eleven digits that do not add up are not accepted');
 f("S.prof.abn='51 824 753 556'");ok(f("!profMissing().some(x=>/ABN/.test(x))"),'a valid ABN is accepted');
 f("S.stack=[];S.tab.manager='mprof';render()");f("S.prof.abn='51 824 753 557'");f("render()");ok(/These digits do not add up/.test(I.txt()),'the profile says so under the field');f("S.prof.abn='51 824 753 556'");f("render()");ok(/The digits are valid\. We check the digits only/.test(I.txt())&&/ABN Lookup service comes with the server build/.test(I.txt()),'and says that only the digits are checked, when it is right');f("S.prof.abn='5182'");f("render()");ok(/An ABN has 11 digits/.test(I.txt()),'and when it is too short');f("S.prof.abn='51 824 753 556'");
 f("S.role='contractor';S.me.abn='12 345 678 901'");
 f("S.stack=[];S.tab.contractor='cprof';render()");ok(/These digits do not add up/.test(I.txt()),'a contractor’s wrong ABN is flagged on their profile');f("S.me.abn='98 765 432 122';render()");ok(/The digits are valid/.test(I.txt()),'a right one is accepted');f("S.role='manager'");
 // ===== licences and insurance expiring =====
 ok(f("JSON.stringify(expItems(60).map(x=>x.c.id+':'+x.what+':'+x.left))")===JSON.stringify(["c6:Insurance:-5","c4:Licence:18","c2:Insurance:25","c1:Insurance:42"]),'the watch list holds what has ended or ends within 60 days, soonest first: c6 insurance ended 5 days ago, c4 licence in 18 days, c2 insurance in 25 days, c1 insurance in 42 days');
 ok(f("expItems(30).length")===3&&f("expItems(10).length")===1,'the window can be 30 or 10 days');
 ok(f("expTxt(addDays(todayIso(),-1))")==='Expired 1 day ago ('+f("fmtD(addDays(todayIso(),-1))")+')'&&/^Ends in 1 day /.test(f("expTxt(addDays(todayIso(),1))"))&&/^Valid to /.test(f("expTxt(addDays(todayIso(),300))"))&&f("expTxt('')")==='Not recorded','the wording is plain: Expired 1 day ago, Ends in 1 day, Valid to, Not recorded');
 f("S.stack=[];S.tab.manager='mhome';render()");ok(/3 licence or insurance items expired or ending within 30 days/.test(I.txt())&&/Tap to see them/.test(I.txt()),'the manager’s Home says how many are expired or ending soon');
 I.click('[data-a=tab][data-v=cons].notice');ok(f("S.tab.manager")==='cons'&&/Licences and insurance to watch/.test(I.txt()),'and tapping it opens the Contractors list');
 const tx=I.txt();ok(/Ending within 60 days, or already ended/.test(tx)&&/Expired 5 days ago/.test(tx)&&/Ends in 18 days/.test(tx)&&/Ends in 25 days/.test(tx)&&(tx.match(/Check needed: insurance expired/g)||[]).length===1&&(tx.match(/Your attention: licence ends soon/g)||[]).length===1&&(tx.match(/Your attention: insurance ends soon/g)||[]).length===2&&/Ends in 42 days/.test(tx),'the list shows each with its date, and each contractor card says what needs attention');
 f("S.stack=[];S.cq.trade='all';go('con',{id:'c6'})");ok(/Insurance\s*Expired 5 days ago/.test(I.txt())&&/Check needed/.test(I.txt())&&/Licence\s*Valid to/.test(I.txt()),'a contractor’s own page shows the real dates, not just Verified');
 f("S.stack=[];go('con',{id:'c3'})");ok(!/Check needed|Your attention/.test(I.txt())&&/Valid to/.test(I.txt()),'and nothing is flagged for one whose papers are fine');
 // a quote from someone whose insurance has ended
 f("(()=>{const j=job('m2');j.stage='open';j.con=undefined;j.quotes=[{id:'qx1',c:'c6',price:500,gst:false,date:addDays(todayIso(),4),time:'10:00',dur:'2 hours',scope:'x',pay:'after',inc:['x'],note:''}]})()");
 f("S.role='manager';S.stack=[];S.tab.manager='jobs';render();go('mjob',{id:'m2'})");ok(/Pipeline Pros|Steady|Sparkle|Metro|Aqua|Bright|[A-Z]/.test(I.txt())&&/insurance expired/.test(I.txt())&&/Ask for the new certificate before you approve/.test(I.txt()),'a quote from a contractor with expired insurance carries a warning before the Approve button');
 f("job('m2').quotes[0].c='c3'");f("render()");ok(!/Ask for the new certificate/.test(I.txt()),'but not one from a contractor whose papers are fine');
 // notification setting
 f("S.stack=[];S.role='manager';go('notify')");ok(/A contractor’s licence or insurance is about to end/.test(I.txt()),'managers can choose to be told when a licence or insurance is about to end');
 I.w.close();
 // property managers see it too, in their own world
 const P=mk('https://example.org/?demo=property');await sleep(300);P.ev("S.stack=[];S.tab.manager='mhome';render()");ok(/licence or insurance item/.test(P.txt())&&!/building/i.test(P.$('[data-a=tab][data-v=cons].notice')?P.$('[data-a=tab][data-v=cons].notice').textContent:''),'property managers see the same warning, in property words');P.w.close();
 console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)})();
