const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.APP||path.join(__dirname,'..','taskspeck-managers.html'),'utf8');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mk=(url)=>{const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole(),url:url||'https://example.org/?demo=1'});const w=dom.window,d=w.document;return{w,d,$:s=>d.querySelector(s),$$:s=>[...d.querySelectorAll(s)],ev:c=>w.eval(c),txt:()=>d.querySelector('#view').textContent.replace(/\s+/g,' '),click:s=>{const e=typeof s==='string'?d.querySelector(s):s;if(!e)throw new Error('missing '+s);e.click()},chg:(e,v)=>{e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))},chk:(e,v)=>{e.checked=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))},toast:()=>d.querySelector('#toast').textContent}};
const PROF="S.prof.role='OC manager';S.prof.pay='bank';S.prof.consent=true;S.prof.abn='51 824 753 556';S.prof.billing='a@b.co';S.prof.oc='OC';";
(async()=>{try{
 let I=mk();await sleep(300);const e=c=>I.ev(c);e(PROF);
 // ===== notification settings =====
 e("S.stack=[];S.role='manager';go('notify')");let t=I.txt();
 ok(/Urgent and emergency alerts \(always by email\)/.test(t)&&/always come by email\. They cannot be switched off, and they are never sent by text message/.test(t)&&/Text message \(never used for urgent alerts\)/.test(t),'Notification settings says urgent and emergency alerts always come by email, never by text message');
 ok(!!I.$('input[disabled][checked]'),'and the urgent alerts row cannot be switched off');
 I.chk(I.$('[data-nf="ch.email"]'),false);I.chk(I.$('[data-nf="ch.push"]'),false);I.chk(I.$('[data-nf="ch.sms"]'),true);ok(/always by email/.test(I.txt())&&!!I.$('input[disabled][checked]'),'even with email switched off and text switched on, the urgent alerts row stays by email');
 e("S.role='contractor';S.stack=[];go('notify')");ok(/Urgent and emergency alerts \(always by email\)/.test(I.txt()),'contractors see the same');e("S.role='manager'");
 // ===== the building's emergency addresses =====
 e("S.stack=[];A.breport('b1');S.bt='set';render()");
 ok(/Emergency email addresses, in order/.test(I.txt())&&/by email only, never by text message/.test(I.txt())&&!/Emergency contacts, in order/.test(I.txt()),'the building setting asks for email addresses, and says why');
 ok(e("rcfg(bld('b1')).ecs")==='manager@example.com, oncall@example.com','the sample building has two email addresses');
 I.chg(I.$('[data-rc="ecs|b1"]'),'0400 000 111');ok(/Urgent alerts go by email only/.test(I.toast())&&e("rcfg(bld('b1')).ecs")==='manager@example.com, oncall@example.com','a phone number is refused, and nothing is changed');
 I.chg(I.$('[data-rc="ecs|b1"]'),'a@example.com, 0400 000 111');ok(/Urgent alerts go by email only/.test(I.toast())&&e("rcfg(bld('b1')).ecs")==='manager@example.com, oncall@example.com','so is a list with a phone number in it');
 I.chg(I.$('[data-rc="ecs|b1"]'),'not an email');ok(/email only/.test(I.toast())&&e("rcfg(bld('b1')).ecs")==='manager@example.com, oncall@example.com','and so is anything that is not an email address');
 I.chg(I.$('[data-rc="ecs|b1"]'),'one@example.com,  two@example.com ,three@example.org');ok(e("rcfg(bld('b1')).ecs")==='one@example.com,  two@example.com ,three@example.org'&&e("rcfg(bld('b1')).ecs.split(',').map(x=>x.trim()).filter(isEmail).length")===3,'a list of email addresses is saved, and each is read as an address');
 I.chg(I.$('[data-rc="ecs|b1"]'),'');ok(e("rcfg(bld('b1')).ecs")==='','an empty list is allowed, and the failure is then recorded when an emergency report comes in');
 I.chg(I.$('[data-rc="ecs|b1"]'),'manager@example.com, oncall@example.com');
 // ===== an emergency report =====
 const send=async(ecs,fields)=>{const P=mk();await sleep(250);P.ev(PROF);if(ecs!==null)P.ev("bld('b1').rcfg.ecs="+JSON.stringify(ecs));const tok=P.ev("bld('b1').locs.find(l=>l.k==='pool').tok");P.ev("openPub('"+tok+"')");P.ev("Object.assign(S.pub.f,"+JSON.stringify(Object.assign({desc:'Man collapsed by the pool',name:'Zed',contact:'zed@example.com',consent:true,safety:'danger'},fields||{}))+");S.pub.f.ans=String(S.pub.ch.a+S.pub.ch.b);PUBLOG=[]");P.ev("A.pubsend()");const r=JSON.parse(P.ev("JSON.stringify(RPT()[RPT().length-1])"));P.w.close();return r};
 let r=await send(null);const al=r.audit.map(x=>x.x).find(x=>/EMERGENCY ALERT/.test(x))||'';
 ok(r.emergency&&/^EMERGENCY ALERT sent by email to manager@example\.com, subject “URGENT: emergency report at Swimming pool \(RP-\d{4}\)” \(demo\)$/.test(al),'an emergency report emails the first address, with a subject that starts URGENT and names the place and the reference');
 ok(!r.audit.some(x=>/text message|sms|texted/i.test(x.x)),'and nothing in its history mentions a text message');
 r=await send('0400 000 111, legacy@example.com');ok(r.alert.contacts.join()==='legacy@example.com'&&/sent by email to legacy@example\.com/.test(r.audit.map(x=>x.x).find(x=>/EMERGENCY ALERT/.test(x))),'if an old setting still holds a phone number, it is skipped and only email addresses are used');
 r=await send('0400 000 111');ok(r.alert.failed===true&&r.audit.some(x=>/could not be delivered: no emergency email address is set/.test(x.x)),'with only a phone number nothing is sent, and the failure is recorded');
 r=await send('');ok(r.alert.failed===true&&r.audit.some(x=>/no emergency email address is set/.test(x.x)),'with no address the failure is recorded too');
 // the alert on the report and the escalation
 {const P=mk();await sleep(250);P.ev(PROF);const tok=P.ev("bld('b1').locs.find(l=>l.k==='pool').tok");P.ev("openPub('"+tok+"')");P.ev("Object.assign(S.pub.f,{desc:'Man collapsed by the pool',name:'Zed',contact:'',consent:true,safety:'danger'});S.pub.f.ans=String(S.pub.ch.a+S.pub.ch.b);PUBLOG=[];A.pubsend()");const id=P.ev("RPT()[RPT().length-1].id");P.ev("A.pubexit();S.stack=[];S.rq={};A.rptopen('"+id+"')");
  ok(/EMERGENCY alert sent/.test(P.txt())&&/Sent by email .* to manager@example\.com/.test(P.txt()),'the manager’s report says the alert was sent by email, and to whom');
  P.ev("A.resc('"+id+"')");ok(/Alert emailed to the next contact: oncall@example\.com/.test(P.ev("rOf('"+id+"').audit.slice(-1)[0].x")),'when nobody acknowledges, the next address is emailed, and it is recorded');
  P.ev("A.resc('"+id+"')");ok(/There are no more contacts\. Call the people on site now\./.test(P.ev("rOf('"+id+"').audit.slice(-1)[0].x")),'when the addresses run out, the manager is told to call the people on site');P.w.close()}
 // contractor emergency alert
 e("S.role='contractor';S.stack=[]");e("A.sosalert('m4')");ok(/The site contact and TaskSpeck Strata support were emailed/.test(e("job('m4').log.slice(-1)[0].x"))&&!/text/i.test(e("job('m4').log.slice(-1)[0].x")),'a contractor’s emergency alert on site is also by email');e("S.role='manager'");
 // help and the rest of the app
 e("S.stack=[];go('help')");ok(/Urgent and emergency alerts always stay on, and always come by email/.test(I.d.querySelector('#view').innerHTML.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')),'the help page says so');
 const app=html.replace(/Text message \(never used for urgent alerts\)/g,'').replace(/never sent by text message/g,'').replace(/never by text message/g,'').replace(/never used for urgent alerts/g,'');
 ok(!/(urgent|emergency)[^.<>]{0,90}(text message|\bsms\b|texted)/i.test(app)&&!/(text message|\bsms\b)[^.<>]{0,90}(urgent|emergency)/i.test(app),'nowhere in the app does an urgent or emergency alert go by text message');
 I.w.close();console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)})();
