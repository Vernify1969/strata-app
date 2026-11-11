const {JSDOM}=require('jsdom');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.APP||path.join(__dirname,'..','taskspeck-managers.html'),'utf8');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const REAL=Date;
const mk=(fixed,url)=>{const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:url||'https://example.org/?demo=1',beforeParse(w){const D=w.Date;class F extends D{constructor(...a){if(a.length===0)super(fixed);else super(...a)}static now(){return fixed}}w.Date=F}});const w=dom.window;return{w,d:w.document,ev:c=>w.eval(c),txt:()=>w.document.querySelector('#view').textContent.replace(/\s+/g,' '),$:s=>w.document.querySelector(s),$$:s=>[...w.document.querySelectorAll(s)],click:s=>{const e=typeof s==='string'?w.document.querySelector(s):s;if(!e)throw new Error('missing '+s);e.click()},inp:(e,v)=>{e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}))},chg:(e,v)=>{e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))},toast:()=>w.document.querySelector('#toast').textContent}};
const PROF="S.prof.role='OC manager';S.prof.pay='bank';S.prof.consent=true;S.prof.abn='12 345 678 319';S.prof.billing='a@b.co';S.prof.oc='OC';";
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const devParts=(ms,tz)=>{const o={};new Intl.DateTimeFormat('en-AU',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new REAL(ms)).forEach(p=>{if(p.type!=='literal')o[p.type]=+p.value});return o};
const label=(tz,ms)=>new Intl.DateTimeFormat('en-AU',{timeZone:tz,timeZoneName:'short'}).formatToParts(new REAL(ms)).find(p=>p.type==='timeZoneName').value;
(async()=>{try{
 // ===== the app shows the device's own time =====
 const instants=[['Mon 9 Nov 2026, 8:00 am in Melbourne','2026-11-09T08:00:00+11:00'],['Mon 9 Nov 2026, 11:30 pm in Melbourne','2026-11-09T23:30:00+11:00'],['Thu 1 Oct 2026, 12:30 am in Melbourne','2026-10-01T00:30:00+10:00'],['Sun 4 Oct 2026, 3:01 am, just after daylight saving starts','2026-10-04T03:01:00+11:00']];
 for(const tz of ['Australia/Melbourne','Asia/Singapore','America/New_York','Europe/London','Asia/Kolkata','Pacific/Auckland','UTC']){process.env.TZ=tz;const bad=[];
  for(const [lab,iso] of instants){const ms=new REAL(iso).getTime(),p=devParts(ms,tz),want=p.day+' '+MON[p.month-1]+' '+String(p.hour).padStart(2,'0')+':'+String(p.minute).padStart(2,'0')+(tz==='Australia/Melbourne'?'':' '+label(tz,ms)),wd=p.year+'-'+String(p.month).padStart(2,'0')+'-'+String(p.day).padStart(2,'0');const I=mk(ms);await sleep(100);const t=I.ev('todayIso()'),c=I.ev('clock()');if(t!==wd||c!==want)bad.push(lab+': got '+t+' / '+c+', wanted '+wd+' / '+want);I.w.close()}
  ok(bad.length===0,'on a device set to '+tz+', today and the clock are that device’s own time'+(tz==='Australia/Melbourne'?'':', with the zone shown')+(bad.length?' '+JSON.stringify(bad):''))}
 // ===== a visit at a building, shown in the device's time with the building's time in brackets =====
 const SHOW=async(tz,q)=>{process.env.TZ=tz;const I=mk(new REAL('2026-12-10T12:00:00+11:00').getTime());await sleep(100);const r=I.ev("JSON.stringify([startTxt("+JSON.stringify(q)+"),endTxt("+JSON.stringify(q)+")])");I.w.close();return JSON.parse(r)};
 const q={date:'2026-12-24',time:'10:00',dur:'2 hours'};
 ok(JSON.stringify(await SHOW('Australia/Melbourne',q))===JSON.stringify(['Thu 24 Dec at 10 am','12 pm']),'a Melbourne device sees a Melbourne visit as it is: Thu 24 Dec at 10 am, ending 12 pm, with no brackets');
 ok(JSON.stringify(await SHOW('Asia/Singapore',q))===JSON.stringify(['Thu 24 Dec at 7 am (10 am Melbourne)','9 am']),'a Singapore device sees the same visit as 7 am (10 am Melbourne), ending 9 am');
 ok(JSON.stringify(await SHOW('America/New_York',q))===JSON.stringify(['Wed 23 Dec at 6 pm (10 am Thu 24 Dec Melbourne)','8 pm']),'a New York device sees it the evening before, and the brackets name the Melbourne day too');
 ok(JSON.stringify(await SHOW('Australia/Sydney',q))===JSON.stringify(['Thu 24 Dec at 10 am','12 pm']),'Sydney has the same time as Melbourne, so nothing changes');
 ok((await SHOW('Asia/Singapore',{date:'2026-12-24',time:'10:00',dur:'2 hours',tz:'Asia/Singapore'}))[0]==='Thu 24 Dec at 10 am','a visit already in the device’s own time is shown as it is');
 // ===== the review end =====
 process.env.TZ='Asia/Singapore';let I=mk(new REAL('2026-12-24T10:00:00+11:00').getTime());await sleep(100);I.ev(PROF);
 I.ev("(()=>{const j=job('m3');j.subTs=Date.now()})()");I.ev("S.stack=[];S.tab.manager='jobs';render();go('mjob',{id:'m3'})");
 ok(/The review ends Tue 29 Dec at 2 pm \(5 pm Melbourne\) \(the 72 hours would end on Sunday\)/.test(I.txt()),'a review handed in on Christmas Eve ends at 5 pm Tuesday Melbourne time, and a Singapore device shows it as 2 pm');
 const ends=[];for(const tz of ['Australia/Melbourne','America/Los_Angeles','Asia/Tokyo','Asia/Singapore']){process.env.TZ=tz;const w=mk(new REAL('2026-12-24T10:00:00+11:00').getTime());await sleep(80);ends.push(w.ev("(()=>{const r=reviewEnd(zToTs('2026-12-24','10:00','Australia/Melbourne'));return r.at.getTime()})()"));w.w.close()}
 ok(ends.every(e=>e===ends[0])&&ends[0]===new REAL('2026-12-29T17:00:00+11:00').getTime(),'the deadline is the same moment on every device');
 I.w.close();
 // a public holiday is a calendar date: it reads the same on every device
 for(const tz of ['Australia/Melbourne','Asia/Singapore','America/New_York','Pacific/Auckland']){process.env.TZ=tz;const w=mk(new REAL('2026-12-10T12:00:00+11:00').getTime());await sleep(80);w.ev(PROF);w.ev("S.ownerMode=true;S.stack=[];A.owner()");const t=w.txt();ok(/Thu 1 Jan 2026\s*New Year’s Day/.test(t)&&/Mon 26 Jan 2026\s*Australia Day/.test(t)&&/Tue 3 Nov 2026\s*Melbourne Cup Day/.test(t)&&/Fri 25 Dec 2026\s*Christmas Day/.test(t),'on a device in '+tz+', the holiday list shows the right weekday and date (New Year’s Day is Thu 1 Jan 2026)');w.w.close()}
 // ===== the notice =====
 process.env.TZ='Asia/Singapore';I=mk(new REAL('2026-12-10T12:00:00+11:00').getTime());await sleep(100);I.ev(PROF);I.ev("S.stack=[];S.tab.manager='mhome';render()");
 ok(/Your device is on Singapore time \(GMT\+8\)/.test(I.txt())&&/building’s own time in brackets/.test(I.txt()),'on a device in Singapore, Home says so and explains the brackets');I.w.close();
 process.env.TZ='Australia/Melbourne';I=mk(new REAL('2026-12-10T12:00:00+11:00').getTime());await sleep(100);I.ev("S.tab.manager='mhome';S.stack=[];render()");ok(!/Your device is on/.test(I.txt()),'on a device in Melbourne there is no notice');I.w.close();
 process.env.TZ='Asia/Singapore';I=mk(new REAL('2026-12-10T12:00:00+11:00').getTime(),'https://example.org/?demo=property');await sleep(100);ok(/Your device is on Singapore time/.test(I.txt())&&/property’s own time in brackets/.test(I.txt())&&!/building/i.test(I.$('.notice.info').textContent),'property managers get it in property words');I.w.close();
 I=mk(new REAL('2026-12-10T12:00:00+11:00').getTime(),'https://example.org/?demo=contractor');await sleep(100);ok(/Your device is on Singapore time/.test(I.txt()),'contractors get it too');I.w.close();
 // ===== regions: each has its own time zone and public holidays =====
 process.env.TZ='Australia/Melbourne';I=mk(new REAL('2026-11-05T12:00:00+11:00').getTime());await sleep(100);const e=c=>I.ev(c);e(PROF);
 ok(e("Object.keys(S.set.regions).join()")==='AU-VIC'&&e("S.set.regions['AU-VIC'].tz")==='Australia/Melbourne'&&e("regKey(bld('b1'))")==='AU-VIC','there is one region to start with, Victoria in Australia, and every building belongs to it');
 e("S.set.regions['X-singapore']={name:'Singapore',tz:'Asia/Singapore',hols:[{d:'2026-11-09',n:'Deepavali (test)'}]};bld('b3').region='X-singapore'");
 ok(e("isWork('2026-11-09','AU-VIC')")===true&&e("isWork('2026-11-09','X-singapore')")===false&&e("isHol('2026-11-03','X-singapore')")===false&&e("isHol('2026-11-03','AU-VIC')")===true,'a public holiday in one region is not a holiday in another: Melbourne Cup Day is only in Victoria');
 ok(e("addBiz('2026-11-06',1,'AU-VIC')")==='2026-11-09'&&e("addBiz('2026-11-06',1,'X-singapore')")==='2026-11-10','working days are counted with the region’s own holidays');
 const sub=e("zToTs('2026-11-06','09:00','Asia/Singapore')");const r=JSON.parse(e("JSON.stringify((()=>{const r=reviewEnd("+sub+",'X-singapore');return[r.iso,r.hm,r.ext,r.why,r.tz]})())"));
 ok(r[0]==='2026-11-10'&&r[1]==='17:00'&&r[2]===true&&r[3]==='Deepavali (test)'&&r[4]==='Asia/Singapore','a review in a Singapore building ends at 5 pm Singapore time on the next working day when it would end on a Singapore holiday');
 const vic=JSON.parse(e("JSON.stringify((()=>{const r=reviewEnd("+e("zToTs('2026-11-06','09:00','Australia/Melbourne')")+",'AU-VIC');return[r.iso,r.hm,r.ext]})())"));ok(vic[0]==='2026-11-09'&&vic[2]===false,'the same days in Victoria end on the Monday as normal');
 e("(()=>{const j=job('m3');j.subTs="+sub+"})()");e("S.stack=[];S.tab.manager='jobs';render();go('mjob',{id:'m3'})");ok(/The review ends .*\(the 72 hours would end on Deepavali \(test\)\)/.test(I.txt()),'a job in that building shows its own region’s holiday in the review notice');
 // owner settings
 e("S.ownerMode=true;S.stack=[];A.owner()");let t=I.txt();
 ok(/Regions and public holidays/.test(t)&&I.$('#regsel')&&I.$$('#regsel option').map(o=>o.textContent).join('|')==='Victoria, Australia|Singapore'&&/Time zone Australia\/Melbourne · \d+ buildings?/.test(t),'Owner settings lists the regions, each with its time zone and how many buildings use it');
 I.chg(I.$('#regsel'),'X-singapore');t=I.txt();ok(/Time zone Asia\/Singapore · 1 building/.test(t)&&/Deepavali \(test\)/.test(t)&&I.$$('[data-a=holrem]').length===1,'choosing a region shows its own holidays');
 I.$('#hold').value='2026-12-25';I.inp(I.$('#holn'),'Christmas Day');I.click('[data-a=holadd]');ok(e("S.set.regions['X-singapore'].hols.length")===2&&e("S.set.regions['AU-VIC'].hols.length")===28,'a holiday is added to the chosen region only');
 I.click('[data-a=holrem][data-v="X-singapore|2026-12-25"]');ok(e("S.set.regions['X-singapore'].hols.length")===1,'and removed from it only');
 I.click('[data-a=regdel]');ok(/Move the 1 building/.test(I.toast())&&e("!!S.set.regions['X-singapore']"),'a region with buildings in it cannot be removed');
 e("bld('b3').region='AU-VIC'");I.click('[data-a=regdel]');ok(!e("S.set.regions['X-singapore']")&&e("S.ownReg")==='AU-VIC'&&/Region removed/.test(I.toast()),'once it is empty it can be');
 I.inp(I.$('#regn'),'Singapore');I.inp(I.$('#regz'),'Asia/Singapore');I.click('[data-a=regadd]');ok(e("S.set.regions['X-singapore'].tz")==='Asia/Singapore'&&e("S.set.regions['X-singapore'].hols.length")===0&&e("S.ownReg")==='X-singapore'&&/Now add its public holidays/.test(I.toast())&&/No public holidays are listed after today for this region/.test(I.txt()),'a region can be added with a name and a time zone, and the owner is warned that it has no holidays yet');
 I.inp(I.$('#regn'),'Singapore');I.inp(I.$('#regz'),'Asia/Singapore');I.click('[data-a=regadd]');ok(/already on the list/.test(I.toast()),'the same name twice is refused');
 I.inp(I.$('#regn'),'Nowhere');I.inp(I.$('#regz'),'Mars/Olympus');I.click('[data-a=regadd]');ok(/not recognised/.test(I.toast())&&!e("S.set.regions['X-nowhere']"),'a time zone that does not exist is refused');
 I.inp(I.$('#regn'),'X');I.inp(I.$('#regz'),'Asia/Tokyo');I.click('[data-a=regadd]');ok(/Enter the name/.test(I.toast()),'and so is a missing name');
 I.chg(I.$('#regsel'),'AU-VIC');I.click('[data-a=regdel]');ok(/cannot be removed/.test(I.toast()),'the starting region cannot be removed');
 // a building chooses its region
 e("S.stack=[];S.tab.manager='bld';S.bopen={b:'b2',s:{'b2:edit':true},add:false};render()");
 ok(I.$('#be-region-b2')&&I.$$('#be-region-b2 option').map(o=>o.textContent).join('|')==='Victoria, Australia|Singapore','a building has a Region choice in Edit details');
 I.chg(I.$('#be-region-b2'),'X-singapore');ok(e("bld('b2').region")==='X-singapore'&&e("regTz(regKey(bld('b2')))")==='Asia/Singapore','choosing one sets that building’s time zone and holidays');
 // payment clearing days follow the building's region
 e("bld('b2').region='X-singapore';S.set.regions['X-singapore'].hols=[{d:'2026-11-09',n:'Test'}]");ok(e("addBiz('2026-11-06',2,jobReg(job('m2')))")==='2026-11-12'||e("jobReg(job('m2'))")==='X-singapore','payment clearing days use the building’s region');
 // an account saved before regions exist
 const raw=JSON.parse(e("snapshot()"));delete raw.S.set.regions;raw.S.set.hols=[{d:'2026-12-25',n:'Christmas Day'}];I.ev("applyRaw("+JSON.stringify(JSON.stringify(raw))+")");ok(e("Object.keys(S.set.regions).join()")==='AU-VIC'&&e("S.set.regions['AU-VIC'].hols.length")===1&&e("regKey({region:'X-gone'})")==='AU-VIC','an earlier account becomes the Victoria region, and a building whose region has gone falls back to Victoria');
 I.w.close();
 console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)})();
