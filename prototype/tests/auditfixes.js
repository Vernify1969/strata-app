const {JSDOM}=require('jsdom');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.APP||path.join(__dirname,'..','taskspeck-managers.html'),'utf8');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mk=(url)=>{const errs=[];const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:url||'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message))}});const w=dom.window,d=w.document;return{w,d,errs,$:s=>d.querySelector(s),$$:s=>[...d.querySelectorAll(s)],ev:c=>w.eval(c),txt:()=>d.querySelector('#view').textContent.replace(/\s+/g,' '),click:s=>{const e=typeof s==='string'?d.querySelector(s):s;if(!e)throw new Error('missing '+s);e.click()},inp:(e,v)=>{e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}))},toast:()=>d.querySelector('#toast').textContent}};
(async()=>{try{
 let I=mk();await sleep(300);const ev=c=>I.ev(c);ev("S.prof.role='OC manager';S.prof.pay='bank';S.prof.consent=true;S.prof.abn='12 345 678 319';S.prof.billing='a@b.co';S.prof.oc='OC'");
 // ===== public holidays =====
 const H=JSON.parse(ev("JSON.stringify(S.set.regions['AU-VIC'].hols)"));
 ok(H.length===28&&['2026-11-03','2026-12-25','2026-12-28','2027-01-26','2027-11-02'].every(x=>H.some(h=>h.d===x))&&H.find(h=>h.d==='2026-11-03').n==='Melbourne Cup Day','the starting list holds Victorian public holidays for 2026 and 2027, including Melbourne Cup Day and the additional Boxing Day');
 ok(ev("isWork('2026-11-03')")===false&&ev("isWork('2026-11-04')")===true&&ev("isWork('2026-11-07')")===false&&ev("isWork('2026-11-08')")===false&&ev("isWork('2026-11-09')")===true,'a working day is not a weekend and not a public holiday');
 ok(ev("addBiz('2026-12-24',2)")==='2026-12-30'&&ev("addBiz('2026-11-02',1)")==='2026-11-04','counting working days skips public holidays (payment clearing, for example)');
 ev("S.set.regions['AU-VIC'].hols=[]");ok(ev("addBiz('2026-11-02',1)")==='2026-11-03','with no holidays listed it counts only weekdays');ev("S.set.regions['AU-VIC'].hols=DEFAULT_HOLS.map(([d,n])=>({d,n}))");
 const RE=(iso,time)=>JSON.parse(ev("JSON.stringify((()=>{const r=reviewEnd(zToTs('"+iso+"','"+time.slice(0,5)+"','Australia/Melbourne'));return{ext:r.ext,why:r.why||'',d:r.iso,h:+r.hm.split(':')[0],m:+r.hm.split(':')[1]}})())"));
 let r=RE('2026-10-30','12:00:00');ok(r.ext===false&&r.d==='2026-11-02'&&r.h===12,'a review that ends on a working day ends at the same time (Friday noon to Monday noon)');
 r=RE('2026-11-04','09:00:00');ok(r.ext&&r.why==='Saturday'&&r.d==='2026-11-09'&&r.h===17&&r.m===0,'one that would end on a Saturday stays open until 5 pm on Monday');
 r=RE('2026-10-31','10:00:00');ok(r.ext&&r.why==='Melbourne Cup Day'&&r.d==='2026-11-04'&&r.h===17,'one that would end on Melbourne Cup Day stays open until 5 pm on the next working day');
 r=RE('2026-12-24','10:00:00');ok(r.ext&&r.why==='Sunday'&&r.d==='2026-12-29'&&r.h===17,'over Christmas it skips Sunday, the additional Boxing Day and lands on Tuesday 29 December at 5 pm');
 // the notices
 ev("S.stack=[];S.tab.manager='jobs';render();go('mjob',{id:'m3'})");let t=I.txt();
 ok(/The review ends [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} at/.test(t)&&/You have 72 hours to accept or challenge/.test(t)&&!/about 70 hours left/.test(t)&&/public holiday, the review stays open until 5 pm/.test(t),'the manager sees the real end of the review, not a rough number of hours');
 ev("S.stack=[];S.role='contractor';go('cwork',{id:'m3'})");t=I.txt();ok(/The review ends [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} at/.test(t),'and so does the contractor');ev("S.role='manager';S.stack=[]");
 const subTs=ev("J.find(j=>j.id==='m3').subTs");ok(Math.abs(Date.now()-26*3600000-subTs)<120000,'the sample job in review was handed in 26 hours ago');
 ev("(()=>{const j=J.find(j=>j.id==='m2');j.stage='onsite';j.ev=j.ev||{before:[],after:[]};j.ev.before=j.ev.before||[];j.ev.after=j.ev.after||[]})()");const before=Date.now();ev("A.submit('m2')");
 ok(ev("J.find(j=>j.id==='m2').stage")==='review0'&&ev("J.find(j=>j.id==='m2').subTs")>=before-5&&/72 hours to review/.test(I.toast()),'handing the work in starts the clock');
 ev("S.stack=[];S.role='manager';S.tab.manager='jobs';render();go('mjob',{id:'m2'})");ok(/The review ends/.test(I.txt()),'and the review end shows at once');
 // moving a holiday changes the deadline
 const j=(h,ts)=>ev("reviewEnd("+ts+").iso");const ts=ev("zToTs('2026-12-24','10:00','Australia/Melbourne')");
 ev("S.set.regions['AU-VIC'].hols.push({d:'2026-12-29',n:'Test day'})");ok(j(0,ts)==='2026-12-30','adding a holiday moves a review deadline that would have ended on it');ev("S.set.regions['AU-VIC'].hols=DEFAULT_HOLS.map(([d,n])=>({d,n}))");
 // Owner settings
 ev("S.ownerMode=true;S.stack=[];A.owner()");t=I.txt();
 ok(/In the real app only the platform owner will see these\. In this demo anyone who adds #owner to the address can open them/.test(t),'Owner settings no longer claims that only the owner can open it: it says this is a demo');
 ok(/Regions and public holidays/.test(t)&&/written from memory/.test(t)&&I.$$('[data-a=holrem]').length===28&&/Melbourne Cup Day/.test(t)&&I.$('#hold')&&I.$('#holn')&&I.$('[data-a=holadd]')&&I.$('[data-a=holreset]'),'Owner settings lists the public holidays, says they are from memory, and lets the owner add, remove and reset');
 I.inp(I.$('#holn'),'Grand Final Friday');I.click('[data-a=holadd]');ok(/Choose a date/.test(I.toast())&&ev("S.set.regions['AU-VIC'].hols.length")===28,'adding without a date is refused');
 I.$('#hold').value='2027-09-24';I.inp(I.$('#holn'),'Grand Final Friday');I.click('[data-a=holadd]');ok(ev("S.set.regions['AU-VIC'].hols.length")===29&&ev("isHol('2027-09-24')")&&/Grand Final Friday/.test(I.txt()),'a holiday can be added with its name');
 I.$('#hold').value='2027-09-24';I.click('[data-a=holadd]');ok(/already on the list/.test(I.toast())&&ev("S.set.regions['AU-VIC'].hols.length")===29,'the same date twice is refused');
 I.click('[data-a=holrem][data-v="AU-VIC|2027-09-24"]');ok(ev("S.set.regions['AU-VIC'].hols.length")===28&&!ev("isHol('2027-09-24')"),'a holiday can be removed');
 ev("S.set.regions['AU-VIC'].hols=[{d:'2026-01-01',n:'Old'}];A.owner()");ok(/No public holidays are listed after today/.test(I.txt()),'the owner is warned when no holiday is listed after today');
 I.click('[data-a=holreset]');ok(ev("S.set.regions['AU-VIC'].hols.length")===28&&!/No public holidays are listed after today/.test(I.txt()),'and can go back to the starting list');
 // saved settings from before this change get the list
 const raw=JSON.parse(ev("snapshot()"));delete raw.S.set.regions;delete raw.S.set.hols;I.ev("applyRaw("+JSON.stringify(JSON.stringify(raw))+")");ok(ev("S.set.regions['AU-VIC'].hols.length===28"),'an account saved before holidays existed gets the starting list');
 const raw2=JSON.parse(ev("snapshot()"));delete raw2.S.set.regions;raw2.S.set.hols=[{d:'2026-12-25',n:'Christmas Day'}];I.ev("applyRaw("+JSON.stringify(JSON.stringify(raw2))+")");ok(ev("S.set.regions['AU-VIC'].hols.length===1&&S.set.hols===undefined"),'an account saved with the single holiday list keeps its list, now as the Victoria region');
 I.w.close();
 // ===== approved, invoiced and paid =====
 I=mk();await sleep(300);const e2=c=>I.ev(c);e2("S.prof.role='OC manager';S.prof.pay='bank';S.prof.consent=true;S.prof.oc='OC'");
 const mon=id=>e2("J.find(j=>j.id==='"+id+"').quote.date.slice(0,7)"),bidOf=id=>e2("J.find(j=>j.id==='"+id+"').bid");
 const open=(bid,ym,type)=>e2("S.stack=[];S.tab.manager='jobs';render();A.reports();S.rep.type='"+(type||'committee')+"';S.rep.bid='"+bid+"';S.rep.ym='"+ym+"';render()");
 open(bidOf('h1'),mon('h1'));t=I.txt();
 ok(/Approved spend/.test(t)&&/Approved this financial year to date/.test(t)&&/Approved in this period/.test(t)&&!/Total spend|Spent this financial year|Spend in this period/.test(t),'the report says Approved, not Spent, because the figure counts agreed prices of accepted work');
 ok(/Approved, invoiced and paid/.test(t)&&/Approved is the agreed price of finished jobs/.test(t),'and explains the difference in a new block');
 const num=l=>{const r=I.$$('.paper .kv').find(x=>x.querySelector('span')&&x.querySelector('span').textContent===l);return r?r.querySelector('b').textContent:null};
 const want=JSON.parse(e2("JSON.stringify((()=>{const d=repD(S.rep);return{a:money(d.spend),i:money(d.invTotal),p:money(d.done.reduce((t,j)=>t+paidSum(j),0)),n:money(d.invMiss.reduce((t,j)=>t+j.price,0))}})())"));
 ok(num('Approved')===want.a&&num('Invoiced')===want.i&&num('Paid')===want.p&&num('Approved, not yet invoiced')===want.n,'Approved, Invoiced, Paid and Approved not yet invoiced match the jobs');
 ok(want.n!=='$0'&&e2("repD(S.rep).invMiss.some(j=>j.id==='h1')"),'the laundry tap job, accepted with no invoice, is in Approved, not yet invoiced');
 ok(/Approved spend: /.test(e2("repText()")),'the copied text summary uses the same word');
 // late invoices
 e2("S.stack=[];S.tab.manager='mhome';render()");t=I.txt();
 const late=JSON.parse(e2("JSON.stringify(J.filter(j=>j.mine&&invLate(j)).map(j=>j.id))"));
 ok(late.includes('h10')&&late.includes('h12')&&!late.includes('h1'),'jobs accepted more than 7 days ago with no invoice are late; the laundry tap job (1 day) is not');
 ok(new RegExp(late.length+' jobs waiting for an invoice for more than 7 days').test(t),'Home says how many jobs are waiting for an invoice');
 e2("S.tab.manager='jobs';S.stack=[];render()");ok(/waiting for an invoice for more than 7 days/.test(I.txt()),'and so does the Jobs list');
 const need=e2("J.filter(j=>j.mine&&needsMe(j)).length");e2("S.stack=[];S.tab.manager='mhome';render()");ok(new RegExp(need+' jobs? need').test(I.txt())||need===0,'the count of jobs that need the manager is not changed by late invoices');
 const sd=(id,n)=>e2("(()=>{const j=J.find(j=>j.id==='"+id+"');j.quote.date=addDays(todayIso(),-("+n+"));return invAge(j)+'|'+invLate(j)})()");
 ok(sd('h1',7)==='7|false'&&sd('h1',8)==='8|true','seven days is not late, eight days is');
 e2("J.find(j=>j.id==='h1').inv={no:'INV-9',date:todayIso(),amount:290,gst:0,file:{name:'invoice-9.pdf',size:48000}}");ok(e2("invLate(J.find(j=>j.id==='h1'))")===false,'once an invoice arrives the job is no longer late');
 open(bidOf('h10'),mon('h10'));const rs=I.txt();const k=rs.indexOf('Needs attention now');ok(/No invoice for \d+ days/.test(rs.slice(k,k+500))&&/Replace pump room valve/.test(rs.slice(k,k+500)),'the report lists the job under Needs attention now, with how many days it has had no invoice');
 I.w.close();
 I=mk('https://example.org/?demo=property');await sleep(300);I.ev("S.tab.manager='mhome';S.stack=[];render()");ok(/waiting for an invoice for more than 7 days/.test(I.txt()),'property managers see the same warning');I.w.close();
 console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)})();
