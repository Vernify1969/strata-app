const {JSDOM}=require('jsdom');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.APP||path.join(__dirname,'..','taskspeck-managers.html'),'utf8');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mk=(url)=>{const errs=[];const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:url||'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message))}});const w=dom.window,d=w.document;
 return{w,d,errs,$:s=>d.querySelector(s),$$:s=>[...d.querySelectorAll(s)],ev:c=>w.eval(c),txt:()=>d.querySelector('#view').textContent,click:s=>{const e=typeof s==='string'?d.querySelector(s):s;if(!e)throw new Error('missing '+s);e.click()},chg:(e,v)=>{if(!e)throw new Error('missing element');e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))},inp:(e,v)=>{e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}))},chk:(e,v)=>{e.checked=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))},toast:()=>d.querySelector('#toast').textContent}};
const fillProfile=(I)=>{I.ev("S.stack.length");I.chg(I.$('select[data-m="prof.role"]'),'Building manager');I.inp(I.$('[data-m="prof.oc"]'),'Southbank OC');I.inp(I.$('[data-m="prof.abn"]'),'12 345 678 319');I.inp(I.$('[data-m="prof.billing"]'),'accounts@example.com');I.chg(I.$('select[data-m="prof.pay"]'),'bank');I.chk(I.$('input[data-m="prof.consent"]'),true)};
(async()=>{try{
 // ===== a request in progress survives finishing the profile =====
 let I=mk();await sleep(300);const ev=c=>I.ev(c);
 ev("S.prof.role='';S.prof.pay='';S.prof.consent=false;S.prof.abn='';S.prof.billing=''");ev("render()");
 I.click('[data-a=reqtrade][data-v=electrical]');ev("S.draft.bid='b1';S.draft.area='Level 3 corridor';S.draft.title='Light out';S.draft.instr='The light is out';S.draft.photos=1;S.step=5;render()");
 ok(ev("cur().n")==='new'&&ev("S.step")===5&&!!I.$('[data-a=finishprof]'),'a request is at its last step with the profile unfinished');
 I.click('[data-a=finishprof]');
 ok(ev("cur().n")==='mprof'&&ev("S.stack.length")===2&&!!I.$('[data-a=back]')&&/Your request is saved/.test(I.txt())&&I.$$('[data-a=backreq]').length===2,'Finish my profile opens the profile on top of the request, with a back arrow and Back to my request at the top and the bottom');
 ev("A.backreq()");ok(ev("cur().n")==='new'&&ev("S.step")===5&&ev("S.draft.title")==='Light out'&&ev("S.stack.length")===1,'Back to my request returns to the same step with everything typed still there, even if the profile is not finished');
 ev("A.post()");ok(ev("cur().n")==='mprof'&&/Your request is saved/.test(I.toast()),'sending is refused and sends the person to the profile again');
 fillProfile(I);
 ok(ev("profOK()")===true&&/Your profile is complete/.test(I.txt())&&/Your request is waiting for you/.test(I.txt())&&/Tap Back to my request/.test(I.toast()),'completing the last field says the profile is complete, tells the person to go back, and shows it in the profile');
 I.click('[data-a=backreq]');ok(ev("cur().n")==='new'&&ev("S.step")===5&&!I.$('[data-a=post]').disabled,'Back to my request returns to the request, and Send request is now open');
 const n=ev("J.length");I.click('[data-a=post]');ok(ev("J.length")===n+1&&ev("J[0].title")==='Light out'&&ev("S.draft")===null,'the request is sent');
 I.w.close();
 // ===== the back arrow works as well =====
 I=mk();await sleep(300);I.ev("S.prof.role='';S.prof.pay='';S.prof.consent=false;S.prof.abn='';S.prof.billing=''");
 I.click('[data-a=reqtrade][data-v=plumbing]');I.ev("S.draft.area='Kitchen';S.draft.title='Tap';S.draft.photos=1;S.step=5;render()");I.ev("A.post()");fillProfile(I);I.click('#top [data-a=back]');
 ok(I.ev("cur().n")==='new'&&I.ev("S.step")===5,'the top-left back arrow also returns to the request');I.w.close();
 // ===== even when the person left by the menu =====
 I=mk();await sleep(300);I.ev("S.prof.role='';S.prof.pay='';S.prof.consent=false;S.prof.abn='';S.prof.billing=''");
 I.click('[data-a=reqtrade][data-v=plumbing]');I.ev("S.draft.area='Kitchen';S.draft.title='Tap';S.step=3;render()");I.click('[data-a=tab][data-v=mprof]');
 ok(I.ev("S.stack.length")===0&&I.$$('[data-a=backreq]').length===2,'if the person left through the Profile tab, the way back to the request is still offered');
 I.ev("S.stack=[];S.tab.manager='mhome';render()");ok(!!I.$('[data-a=backreq]')&&/Continue your request/.test(I.txt()),'and Home offers Continue your request');
 I.click('[data-a=backreq]');ok(I.ev("cur().n")==='new'&&I.ev("S.step")===3&&I.ev("S.draft.title")==='Tap','which reopens it at the step where it was left');I.w.close();
 // ===== a quick request too =====
 I=mk();await sleep(300);I.ev("S.prof.role='';S.prof.pay='';S.prof.consent=false;S.prof.abn='';S.prof.billing=''");
 I.ev("A.quick()");I.ev("S.qr.photos=[{name:'a.jpg',data:'data:image/jpeg;base64,AAAA'}];S.qr.area='Lobby';S.qr.text='Light is out';S.qr.safe='no';render()");
 I.ev("A.qrsend()");ok(I.ev("cur().n")==='mprof'&&I.ev("S.stack.length")===2&&/Your request is saved/.test(I.txt())&&/Finish your profile/.test(I.toast()),'a quick request that is stopped for the profile opens the profile on top of it');
 fillProfile(I);I.click('[data-a=backreq]');ok(I.ev("cur().n")==='quick'&&I.ev("S.qr.photos.length")===1&&I.ev("S.qr.text")==='Light is out','Back to my request returns to the quick request with its photo and words');
 I.w.close();
 // ===== no request in progress: no button =====
 I=mk();await sleep(300);I.ev("S.prof.role='';S.prof.pay='';S.prof.consent=false");I.ev("S.draft=null;S.qr=null;S.tab.manager='mprof';S.stack=[];render()");
 ok(I.$$('[data-a=backreq]').length===0&&!/waiting for you/.test(I.txt()),'with no request in progress the profile shows no Back to my request');I.w.close();
 // ===== header: Manager and Contractor are the same size =====
 const css=html.match(/\.top:has\(\.seg\) \.seg select\.rolesel\{[^}]*\}\.top:has\(\.seg\) \.seg>button\{[^}]*\}/)[0];
 ok(/select\.rolesel\{flex:1 1 0;/.test(css)&&/>button\{flex:1 1 0;/.test(css),'the Manager choice and the Contractor button share the row equally');
 // ===== Other service box =====
 I=mk();await sleep(300);I.ev("S.tab.manager='mhome';S.stack=[];render()");
 const card=I.$('#view .card');const sec=I.txt();ok(card&&/Other service/.test(card.textContent)&&I.$('#osvc')&&I.$('[data-a=reqother]')&&!/More services/.test(sec)&&sec.indexOf('Popular services')<sec.lastIndexOf('Other service'),'Home has an Other service box under the service boxes, with a place to say what is needed');
 I.click('[data-a=reqother]');ok(/Say what service you need/.test(I.toast())&&I.ev("cur().n")!=='new','an empty box does not start a request');
 I.inp(I.$('#osvc'),'Fix the front gate');I.click('[data-a=reqother]');ok(I.ev("cur().n")==='new'&&I.ev("S.step")===1&&I.ev("S.draft.trade")==='other'&&I.ev("S.draft.tradeNote")==='Fix the front gate','typing what is needed starts a request for Other service with those words');
 I.ev("S.step=2;render()");ok(/Fix the front gate/.test(I.d.body.innerHTML),'the words carry into the request');I.w.close();
 I=mk('https://example.org/?demo=property');await sleep(300);I.ev("S.stack=[];S.tab.manager='mhome';render()");ok(!!I.$('#osvc'),'property managers have the Other service box too');I.w.close();
 I=mk('https://example.org/?demo=contractor');await sleep(300);ok(!I.$('#osvc')&&!I.$('[data-a=reqother]'),'contractors do not have it');I.w.close();
 console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)})();
