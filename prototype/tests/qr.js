const {JSDOM}=require('jsdom');const fs=require('fs'),path=require('path'),cr=require('crypto');
const html=fs.readFileSync(process.env.APP||path.join(__dirname,'..','taskspeck-managers.html'),'utf8');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mk=(url,store)=>{const errs=[];const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:url||'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message));Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto,configurable:true});w.TextEncoder=TextEncoder;if(store)Object.keys(store).forEach(k=>w.localStorage.setItem(k,store[k]))}});const w=dom.window,d=w.document;
 return{w,d,errs,$:s=>d.querySelector(s),$$:s=>[...d.querySelectorAll(s)],ev:c=>w.eval(c),txt:()=>d.querySelector('#view').textContent,click:s=>{const e=typeof s==='string'?d.querySelector(s):s;if(!e)throw new Error('missing '+s);e.click()},chg:(e,v)=>{if(!e)throw new Error('missing element');e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))},inp:(e,v)=>{if(!e)throw new Error('missing element');e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}))},chk:(e,v)=>{e.checked=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))},toast:()=>d.querySelector('#toast').textContent,store:()=>{const o={};for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);o[k]=w.localStorage.getItem(k)}return o}}};
const hash=m=>cr.createHash('sha256').update(m.map(r=>r.map(v=>v?1:0).join('')).join('')).digest('hex').slice(0,16);
(async()=>{try{
 let I=mk();await sleep(300);const ev=c=>I.ev(c);
 // ===== the QR code encoder =====
 const M=t=>JSON.parse(ev("JSON.stringify((()=>{const q=qrMatrix("+JSON.stringify(t)+");return q&&{n:q.n,ver:q.ver,m:q.m}})())"));
 const a=M('TaskSpeck'),b=M('https://your-domain.example/#report-0123456789abcdef0123456789abcdef'),c=M('y'.repeat(150));
 ok(a.ver===1&&a.n===21&&b.ver===5&&b.n===37&&c.ver===8&&c.n===49,'the QR code grows with the text: version 1, 5 and 8 for short, link-sized and long text');
 ok(hash(a.m)==='d4c19f41e1b5cae9'&&hash(b.m)==='fca278487f0cb910'&&hash(c.m)==='445ec7f87477f78a','three codes match fingerprints that were read back correctly by two independent QR readers');
 const fp=(m,r,c0)=>{for(let i=0;i<7;i++)for(let j=0;j<7;j++){const on=(i===0||i===6||j===0||j===6)||(i>=2&&i<=4&&j>=2&&j<=4);if(!!m[r+i][c0+j]!==on)return false}return true};
 ok([a,b,c].every(q=>fp(q.m,0,0)&&fp(q.m,0,q.n-7)&&fp(q.m,q.n-7,0)),'every code has the three corner squares');
 ok([a,b,c].every(q=>{for(let i=8;i<q.n-8;i++)if(!!q.m[6][i]!==(i%2===0)||!!q.m[i][6]!==(i%2===0))return false;return !!q.m[q.n-8][8]}),'the timing lines and the fixed dark square are right');
 const fmtOk=q=>{const g=(r,c0)=>q.m[r][c0]?1:0,n=q.n;let v1=0;for(let i=0;i<=5;i++)v1|=g(i,8)<<i;v1|=g(7,8)<<6;v1|=g(8,8)<<7;v1|=g(8,7)<<8;for(let i=9;i<15;i++)v1|=g(8,14-i)<<i;
  let v2=0;for(let i=0;i<8;i++)v2|=g(8,n-1-i)<<i;for(let i=8;i<15;i++)v2|=g(n-15+i,8)<<i;
  const valid=bits=>{for(let m=0;m<8;m++){let rem=m;for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);if((((m<<10)|rem)^0x5412)===bits)return true}return false};return v1===v2&&valid(v1)};
 ok([a,b,c].every(fmtOk),'both copies of the format information agree and are valid');
 ok(M('z'.repeat(213))&&M('z'.repeat(213)).ver===10&&ev("qrMatrix('z'.repeat(214))")===null,'it holds up to 213 characters and says so when the text is too long');
 ok(ev("qrSvg('https://x.example/')").includes('viewBox')&&ev("qrSvg('https://x.example/')").includes('<path')&&ev("qrSvg('a')===qrSvg('a')"),'it draws a clean SVG, the same every time');
 // ===== kinds of place and how many =====
 const P=(k,s)=>JSON.parse(ev("JSON.stringify(parseLocSpec("+JSON.stringify(k)+","+JSON.stringify(s)+"))"));
 ok(P('lift','4').items.map(x=>x.name).join('|')==='Lift 1|Lift 2|Lift 3|Lift 4','4 lifts make Lift 1 to Lift 4');
 ok(P('lift','1, 3').items.map(x=>x.name).join('|')==='Lift 1|Lift 3','lifts can be named one by one');
 ok(P('carpark','B1-B3').items.map(x=>x.name+'/'+x.level).join('|')==='Car park B1/B1|Car park B2/B2|Car park B3/B3','car park levels B1 to B3 each get a level');
 ok(P('corridor','1-24').items.length===24&&P('corridor','1-24').items[23].name==='Corridor level 24','common corridors for levels 1 to 24');
 ok(P('stair','A, B').items.map(x=>x.name).join('|')==='Stairwell A|Stairwell B','fire stairwells A and B');
 ok(P('bin','2').items.map(x=>x.name).join('|')==='Bin room 1|Bin room 2'&&P('bin','Level 1, Level 2').items[1].name==='Bin room Level 2','garbage rooms by count or by level');
 ok(P('plant','1, Roof').items.map(x=>x.name).join('|')==='Plant room 1|Plant room Roof','plant rooms by number or name');
 ok(['pool','gym','entrance','lobby'].every(k=>P(k,'').items.length===1)&&P('pool','').items[0].name==='Swimming pool'&&P('entrance','').items[0].name==='Building entrance','swimming pool, gym and building entrance need nothing more');
 ok(P('custom','Rooftop terrace').items[0].name==='Rooftop terrace'&&P('custom','').err,'any other place can be typed, and it must have a name');
 ok(P('lift','').err&&P('lift','0').err&&P('lift','31').err&&P('corridor','1-100').err&&P('corridor','5-2').err,'empty, zero, too many and backwards ranges are refused with a plain message');
 ok(ev("LKINDS.map(x=>x[1]).join('|')").includes('Lift')&&['Lift','Car park level','Swimming pool','Gym','Garbage (bin) room','Fire stairwell','Common corridor','Building entrance','Plant room','Lobby','Mail room','Loading dock','Switchboard or fire panel room','Other place (type its name)'].every(n=>ev("LKINDS.map(x=>x[1])").includes(n)),'all the kinds you asked for are offered, with extras');
 // ===== the manager adds places and makes codes =====
 ev("S.prof.role='Building manager';S.prof.pay='bank';S.prof.consent=true;S.prof.abn='12 345 678 319';S.prof.billing='a@b.co';S.prof.oc='OC (sample)'");
 ev("S.stack=[];S.tab.manager='bld';S.bopen={b:'b1',s:{'b1:rpt':true},add:false};render()");
 ok(/Reporting and QR codes/.test(I.$('.bcard[data-b=b1]').textContent)&&/10 places · 2 new reports/.test(I.$('.bsec[data-k="b1:rpt"]').textContent)&&I.$('[data-a=breport][data-v=b1]'),'each building has a Reporting and QR codes group showing its places and new reports');
 I.click('[data-a=breport][data-v=b1]');ok(/Reporting/.test(I.txt())&&I.$('#rb').value==='b1'&&I.$$('[data-a=btab]').map(b=>b.textContent).join('|')==='Reports|QR codes|Settings','Reporting opens for that building with Reports, QR codes and Settings');
 ev("A.btab('qr')");ok(/Add places/.test(I.txt())&&/Lift 1/.test(I.txt())&&/Demo addresses/.test(I.txt()),'the QR codes tab lists the places and warns that the addresses are demo only');
 I.chg(I.$('#qk'),'lift');I.inp(I.$('#qs'),'4');I.click('[data-a=qadd]');
 ok(ev("S.qd.list.map(x=>x.name).join('|')")==='Lift 3|Lift 4'&&/already on the list/.test(I.txt()),'adding 4 lifts skips Lift 1 and Lift 2, which exist, and keeps Lift 3 and Lift 4 to generate');
 I.chg(I.$('#qk'),'corridor');I.inp(I.$('#qs'),'1-3');I.click('[data-a=qadd]');ok(ev("S.qd.list.length")===5&&/To generate \(5\)/.test(I.txt()),'places from different kinds are collected into one list');
 I.click('[data-a=qrem][data-v="4"]');ok(ev("S.qd.list.length")===4,'a place can be removed from the list before generating');
 const before=ev("bld('b1').locs.length");I.click('[data-a=qgen]');const L=JSON.parse(ev("JSON.stringify(bld('b1').locs)"));
 ok(L.length===before+4&&/4 QR codes generated/.test(I.toast())&&ev("S.qd.list.length")===0,'Generate makes one QR code for each place');
 ok(new Set(L.map(l=>l.tok)).size===L.length&&L.every(l=>/^[0-9a-f]{32}$/.test(l.tok)&&l.on===true),'every code has its own random 128-bit token and starts active');
 ok(L.every(l=>!l.tok.includes(l.id)&&/^[0-9a-f]+$/.test(l.tok))&&L.filter(l=>l.k==='lift').every(l=>L.filter(x=>x.k==='lift'&&x.tok!==l.tok).every(x=>x.tok.slice(0,8)!==l.tok.slice(0,8))),'the token is random hex that holds nothing about the building or the place');
 ok(ev("S.qd")&&ev("qrLink(bld('b1').locs[0])").startsWith('https://your-domain.example/#report-'+L[0].tok),'the link in each code is the address plus the token');
 // one code
 const l0=L.find(l=>l.name==='Lift 3');I.click('[data-a=qshow][data-v="b1|'+l0.id+'"]');
 ok(I.$('#qrbox svg')&&/Lift 3/.test(I.txt())&&/Scan to report a maintenance problem/.test(I.txt())&&/In an emergency call 000/.test(I.txt())&&I.$('a[download]')&&/Demo address. Do not print/.test(I.txt()),'a code shows the picture, the place, the emergency line, a download and a warning not to print demo codes');
 ev("A.back()");
 // switch off, on, replace
 ev("A.qtoggle('b1|"+l0.id+"')");ok(ev("bld('b1').locs.find(l=>l.id==='"+l0.id+"').on")===false&&/cannot create new reports/.test(I.toast()),'a code can be switched off');
 const oldTok=l0.tok;ev("A.qtoggle('b1|"+l0.id+"')");ev("A.qreplace('b1|"+l0.id+"')");const newTok=ev("bld('b1').locs.find(l=>l.id==='"+l0.id+"').tok");ok(newTok!==oldTok&&/old one has stopped working/.test(I.toast()),'a code can be replaced, which stops the old one');
 ev("S.stack=[];render();A.qsheet('b1')");ok(I.$$('.qrlab').length===ev("bld('b1').locs.filter(l=>l.on).length")&&I.$$('.qrlab svg').length===I.$$('.qrlab').length&&/In an emergency call 000/.test(I.$('.qrlab').textContent),'the print sheet has a label with a QR code for each active place');
 ev("A.qtoggle('b1|"+l0.id+"')");ev("S.stack=[];render();A.qsheet('b1')");ok(!I.$$('.qrlab').some(x=>/Lift 3/.test(x.textContent)),'a switched-off place is left off the sheet');ev("A.qtoggle('b1|"+l0.id+"')");
 I.w.close();
 // ===== the public page: no account =====
 I=mk('https://example.org/');await sleep(300);const E=c=>I.ev(c);
 ok(!E("AUTH.user")&&!E("AUTH.guest"),'a visitor starts with no account');
 I.w.close();
 // use a demo page to read tokens, then open the public page in a fresh no-account browser holding the same data
 const D=mk();await sleep(300);const lift1=JSON.parse(D.ev("JSON.stringify(bld('b1').locs[0])")),pool=JSON.parse(D.ev("JSON.stringify(bld('b1').locs.find(l=>l.k==='pool'))")),b3=JSON.parse(D.ev("JSON.stringify(bld('b3').locs[0])"));
 const raw=D.ev("snapshot()");D.w.close();
 const open=async(tok,kind)=>{const J=mk('https://example.org/?demo=1');await sleep(250);J.ev("applyRaw("+JSON.stringify(raw)+")");J.ev("location.hash='#"+(kind||'report')+"-"+tok+"'");J.ev("applyHash()");return J};
 let U=await open(pool.tok);
 ok(U.ev("!!S.pub")&&/Swimming pool/.test(U.txt())&&/Southbank Residences/.test(U.txt())&&/If anyone is in danger, call 000/.test(U.txt()),'scanning a code opens the report page with the building, address, place and the call-000 line already filled in');
 ok(U.$('#nav').style.display==='none'&&!U.$('#view [data-a=tab]')&&!U.$('#top [data-a=role]')&&!U.$('.rolesel')&&!U.$('#top [data-a=back]'),'the public page shows none of the manager menus');
 ok(!/budget|quote|\$\d|comment|committee|contractor|OC manager|manager@example|0400 000/i.test(U.txt().replace('building manager','').replace(/the building manager/gi,'')),'it shows no internal comments, quotes, money, contractors or manager details');
 ok(/Photos \(up to 10\)/.test(U.txt())&&U.$('input[type=file][multiple]')&&/JPEG, PNG|Images only, up to 3 MB/.test(U.txt()),'it takes up to 10 photos, images only');
 // validation, one rule at a time
 const send=()=>U.ev("A.pubsend()");const err=()=>(U.$('[role=alert]')||{textContent:''}).textContent;
 const fill=(o)=>{const f=U.ev("S.pub.f");Object.assign(f,o);for(const k in o)U.ev("S.pub.f."+k+"="+JSON.stringify(o[k]))};
 const ans=()=>U.ev("S.pub.ch.a+S.pub.ch.b");
 send();ok(/Describe the problem/.test(err()),'a report needs a description');
 U.inp(U.$('#pu-desc'),'Water on the floor');send();ok(/Enter your name/.test(err()),'and a name');
 U.inp(U.$('#pu-name'),'Pat');send();ok(/email address or a phone number/.test(err()),'and, for a normal report, an email or phone number');
 U.inp(U.$('#pu-ct'),'not-a-contact');send();ok(/does not look right/.test(err()),'a contact that is not an email or phone is refused');
 U.inp(U.$('#pu-ct'),'pat@example.com');send();ok(/quick check/.test(err()),'the quick spam check must be answered');
 U.inp(U.$('#pu-an'),String(ans()+1));send();ok(/not right/.test(err()),'a wrong answer is refused');
 U.inp(U.$('#pu-an'),String(ans()));send();ok(/Tick the box/.test(err()),'the privacy box must be ticked');
 ok(U.ev("RPT().filter(r=>r.lid==='"+pool.id+"').length")===1,'nothing was saved while anything was wrong');
 // hazard report
 U.click('[data-a=pusafety][data-v=hazard]');ok(U.ev("S.pub.f.safety")==='hazard','a hazard can be flagged');
 U.chk(U.$('#pu-co'),true);const n0=U.ev("RPT().length");send();
 const rr=JSON.parse(U.ev("JSON.stringify(RPT()[RPT().length-1])"));
 ok(U.ev("RPT().length")===n0+1&&/Thank you. Your report was sent/.test(U.txt())&&new RegExp('Reference '+rr.ref).test(U.txt())&&/not an emergency service/.test(U.txt()),'a good report is sent, with a reference and a plain explanation');
 ok(rr.status==='NEW'&&rr.bid==='b1'&&rr.lid===pool.id&&rr.locName==='Swimming pool'&&rr.prio==='High'&&rr.job===null&&/^RP-\d{4}$/.test(rr.ref),'it is saved as NEW for the right building and place, high priority for a hazard, and is not a job');
 ok(rr.audit.length>=3&&rr.audit[0].who==='Reporter'&&rr.audit.some(x=>/Notification sent to manager@example.com/.test(x.x))&&rr.audit.every(x=>x.t&&x.who&&x.x),'the history records the submission, the status and the notification');
 ok(U.ev("S.pub.sent.ref")===rr.ref&&U.$$('[data-a=pubsend]').length===0,'the form is gone, so it cannot be sent twice');
 U.ev("S.pub.sent=null;S.pub.busy=false");send();ok(U.ev("RPT().length")===n0+1,'sending the same form again (a double tap) makes no second report');
 // honeypot
 U.ev("openPub('"+pool.tok+"')");fill({desc:'Bot report here',name:'Bot',contact:'bot@example.com',hp:'http://spam.example',consent:true});U.ev("S.pub.f.ans=String(S.pub.ch.a+S.pub.ch.b)");send();
 ok(U.ev("RPT().length")===n0+1&&/Your report was sent/.test(U.txt()),'a robot that fills the hidden field is thanked but nothing is saved');
 // photos
 U.ev("openPub('"+pool.tok+"')");const pp=(t,s)=>U.ev("pubPhoto('"+t+"',"+s+",'data:"+t+";base64,AAAA','p.jpg')");
 ok(pp('application/pdf',100)===false&&/Only JPEG, PNG or WebP/.test(err()),'a file that is not an image is refused');
 ok(pp('image/jpeg',4*1024*1024)===false&&/over 3 MB/.test(err()),'a photo over 3 MB is refused');
 for(let i=0;i<10;i++)pp('image/jpeg',1000);ok(U.ev("S.pub.photos.length")===10&&pp('image/png',1000)===false&&/up to 10 photos/.test(err()),'up to 10 photos, and the eleventh is refused');
 U.click('[data-a=puphotorm][data-v="0"]');ok(U.ev("S.pub.photos.length")===9,'a photo can be removed');
 // rate limit
 U.ev("openPub('"+pool.tok+"')");U.ev("PUBLOG=[{t:Date.now()-1000,tok:'x',dev:true},{t:Date.now()-2000,tok:'x',dev:true},{t:Date.now()-3000,tok:'x',dev:true}]");fill({desc:'Another leak',name:'Pat',contact:'pat@example.com',consent:true});U.ev("S.pub.f.ans=String(S.pub.ch.a+S.pub.ch.b)");const nr=U.ev("RPT().length");send();
 ok(U.ev("RPT().length")===nr&&/Too many reports from this device/.test(err()),'a fourth report from one device in ten minutes is stopped');
 U.ev("PUBLOG=Array.from({length:20},()=>({t:Date.now()-5000,tok:'"+pool.tok+"',dev:false}))");send();ok(U.ev("RPT().length")===nr&&/too many reports this hour/.test(err()),'a code that gets 20 reports in an hour is paused');
 U.w.close();
 // ===== emergencies =====
 U=await open(lift1.tok);const f1=o=>{for(const k in o)U.ev("S.pub.f."+k+"="+JSON.stringify(o[k]))};
 U.click('[data-a=pusafety][data-v=danger]');
 ok(/Call 000 now/.test(U.txt())&&U.$('a[href="tel:000"]')&&/0400 000 111/.test(U.txt()),'choosing danger shows the call-000 line and the building’s own emergency instructions straight away');
 f1({desc:'Smoke coming from the lift',name:'Sam',contact:'',consent:true});U.ev("S.pub.f.ans=String(S.pub.ch.a+S.pub.ch.b)");const ne=U.ev("RPT().length");U.ev("A.pubsend()");
 const er=JSON.parse(U.ev("JSON.stringify(RPT()[RPT().length-1])"));
 ok(U.ev("RPT().length")===ne+1&&er.emergency===true&&er.prio==='Urgent'&&er.safety==='danger'&&/Emergency/.test(U.txt()),'an emergency report can be sent without contact details, and is marked urgent');
 ok(er.alert&&er.alert.contacts.join('|')==='manager@example.com|oncall@example.com'&&er.audit.some(x=>/EMERGENCY ALERT sent by email to manager@example\.com, subject “URGENT: emergency report at .+ \(RP-\d{4}\)” \(demo\)/.test(x.x))&&!er.audit.some(x=>/text message/i.test(x.x))&&er.alert.ack===null,'it emails the first emergency address straight away, by email and never by text message, with no one needing to open the dashboard');
 U.w.close();
 // emergency at a building with no emergency contact
 U=await open(b3.tok);U.click('[data-a=pusafety][data-v=danger]');U.ev("S.pub.f.desc='Gas smell';S.pub.f.name='Al';S.pub.f.consent=true;S.pub.f.ans=String(S.pub.ch.a+S.pub.ch.b)");U.ev("A.pubsend()");
 const f3=JSON.parse(U.ev("JSON.stringify(RPT()[RPT().length-1])"));ok(f3.alert.failed===true&&f3.audit.some(x=>/could not be delivered: no emergency email address is set/.test(x.x))&&f3.audit.some(x=>/No notification address is set/.test(x.x)),'if no emergency email address is set, the failure is recorded and not hidden');
 U.w.close();
 // ===== inactive, replaced and unknown codes =====
 let X=await open('0'.repeat(32));ok(/This QR code is not active/.test(X.txt())&&!/Southbank|Swimming|Lift/.test(X.txt())&&!X.$('[data-a=pubsend]'),'an unknown code shows a safe page and reveals nothing');X.w.close();
 X=await open(lift1.tok);X.ev("bld('b1').locs[0].on=false");X.ev("render()");ok(/This QR code is not active/.test(X.txt()),'a switched-off code shows that it is not active');
 X.ev("bld('b1').locs[0].on=true;openPub('"+lift1.tok+"')");X.ev("S.pub.f.desc='Late report';S.pub.f.name='Zed';S.pub.f.contact='zed@example.com';S.pub.f.consent=true;S.pub.f.ans=String(S.pub.ch.a+S.pub.ch.b)");X.ev("bld('b1').locs[0].on=false");const nx=X.ev("RPT().length");X.ev("A.pubsend()");
 ok(X.ev("RPT().length")===nx&&/no longer active/.test(X.txt()),'a code switched off while the page was open cannot create a report');X.w.close();
 X=await open(lift1.tok);X.ev("bld('b1').locs[0].tok=rndTok()");X.ev("render()");ok(/This QR code is not active/.test(X.txt()),'a replaced code (old token) no longer works');X.w.close();
 X=await open(lift1.tok);X.ev("bld('b1').rcfg.on=false");X.ev("render()");ok(/This QR code is not active/.test(X.txt()),'switching public reporting off for the building stops every code in it');X.w.close();
 // ===== one queue for each building =====
 let Q=mk();await sleep(300);Q.ev("S.prof.role='Building manager'");const q=c=>Q.ev(c);
 q("S.stack=[];S.tab.manager='mhome';render()");ok(/new reports from QR codes/.test(Q.txt())&&Q.$('[data-a=breport]'),'Home tells the manager about new reports');
 q("A.breport('b1')");const n1=q("RPT().filter(r=>r.bid==='b1'&&rStat(r)==='NEW').length");
 ok(Q.$$('#rb option').map(o=>o.textContent).join('|')==='All my buildings (3 new)|Southbank Residences (2 new)|Riverside Gardens (1 new)|Park Terrace Apartments','the building list shows each building’s new reports, and each building has its own queue');
 ok(Q.$$('[data-a=rptopen]').length===4&&!/Tom|light inside the lift/.test(Q.txt()),'Southbank’s queue shows only Southbank’s reports');
 Q.chg(Q.$('#rb'),'b2');ok(Q.$$('[data-a=rptopen]').length===1&&/Lift 1/.test(Q.txt())&&!/pool pump/.test(Q.txt()),'Riverside’s queue shows only its own report');
 Q.chg(Q.$('#rb'),'b3');ok(Q.$$('[data-a=rptopen]').length===0&&/No reports here/.test(Q.txt()),'and Park Terrace has an empty queue');
 q("A.breport('b1')");ok(Q.$$('[data-a=rptopen]')[0].textContent.includes('NEW'),'new reports are listed first');
 q("A.rfilter('done')");ok(Q.$$('[data-a=rptopen]').length===0,'the Done filter is empty at the start');q("A.rfilter('active')");
 // ===== the manager works a report =====
 const r1=JSON.parse(q("JSON.stringify(RPT().find(r=>r.bid==='b1'&&r.locName==='Lift 1'))")),pid=r1.id;
 q("A.rptopen('"+pid+"')");
 ok(/Lift 1 stops about 5 cm/.test(Q.txt())&&/Priya/.test(Q.txt())&&/priya@example.com/.test(Q.txt())&&/Only managers can see these details/.test(Q.txt())&&/History/.test(Q.txt()),'a report shows what was reported, the reporter’s details to the manager only, and its history');
 q("A.rstart('"+pid+"')");ok(q("rStat(rOf('"+pid+"'))")==='UNDER REVIEW'&&q("rOf('"+pid+"').audit.slice(-1)[0].x")==='Status changed to UNDER REVIEW','Start review sets UNDER REVIEW and records it');
 Q.chg(Q.$('[data-rprio]'),'Urgent');ok(q("rOf('"+pid+"').prio")==='Urgent'&&q("rOf('"+pid+"').audit.slice(-1)[0].x")==='Priority changed from Normal to Urgent','the priority can be changed, and the change is recorded');
 q("S.rq={cm:'Call the lift company first'}");q("A.rcomment('"+pid+"')");ok(q("rOf('"+pid+"').comments.length")===1&&/Call the lift company first/.test(Q.txt())&&q("rOf('"+pid+"').audit.slice(-1)[0].x")==='Internal comment added','internal comments are kept, and recorded');
 // reject needs a reason
 q("A.rreject('"+pid+"')");ok(q("rStat(rOf('"+pid+"'))")==='UNDER REVIEW'&&/Give a reason to reject/.test(Q.toast()),'rejecting needs a reason');
 // ask for information
 q("A.rask('"+pid+"')");ok(/Write your question first/.test(Q.toast()),'a question must be written');
 q("S.rq={ask:'Which level is the lift on?'}");q("A.rask('"+pid+"')");const rtok=q("rOf('"+pid+"').rtok");
 ok(q("rStat(rOf('"+pid+"'))")==='NEEDS INFORMATION'&&/private reply link/.test(Q.txt())&&new RegExp('#reply-'+rtok).test(Q.txt()),'asking for more information sets NEEDS INFORMATION and gives the reporter a private reply link');
 const raw2=q("snapshot()");let R=mk('https://example.org/?demo=1');await sleep(250);R.ev("applyRaw("+JSON.stringify(raw2)+")");R.ev("location.hash='#reply-"+rtok+"'");R.ev("applyHash()");
 ok(/The building manager has a question/.test(R.txt())&&/Which level is the lift on/.test(R.txt())&&!R.$('#nav').textContent.trim()||R.$('#nav').style.display==='none','the reporter opens the link, with no account, and sees the question only');
 R.ev("S.pub.f.rep='Level 3'");R.ev("A.pubreply()");ok(/Your reply was sent/.test(R.txt())&&R.ev("rStat(rOf('"+pid+"'))")==='UNDER REVIEW'&&R.ev("rOf('"+pid+"').info.slice(-1)[0].x")==='Level 3','the reply is saved and the report returns to UNDER REVIEW');
 const rawB=R.ev("snapshot()");R.w.close();
 let R2=mk('https://example.org/?demo=1');await sleep(250);R2.ev("applyRaw("+JSON.stringify(rawB)+")");R2.ev("location.hash='#reply-"+rtok+"'");R2.ev("applyHash()");ok(/This link is not active/.test(R2.txt()),'once answered, the reply link stops working');R2.w.close();
 // hold, duplicate, reject, reopen
 const pidB=JSON.parse(q("JSON.stringify(RPT().find(r=>r.locName==='Bin room Level 1'&&r.bid==='b1'))")).id;
 q("A.rptopen('"+pidB+"')");q("S.rq={hold:'Waiting for the lift company',holdD:'7'}");q("A.rhold('"+pidB+"')");ok(q("rStat(rOf('"+pidB+"'))")==='ON HOLD'&&q("rOf('"+pidB+"').holdUntil")===q("addDays(todayIso(),7)"),'on hold keeps a reason and a date to look again');
 q("A.rreopen('"+pidB+"')");ok(q("rStat(rOf('"+pidB+"'))")==='UNDER REVIEW','a report on hold can be reopened');
 q("A.rptopen('"+pid+"')");q("S.rq={dup:'"+pidB+"'}");q("A.rdup('"+pid+"')");ok(q("rStat(rOf('"+pid+"'))")==='MERGED'&&q("rOf('"+pid+"').dupOf")===pidB&&q("rOf('"+pidB+"').audit.slice(-1)[0].x").includes(r1.ref),'a duplicate can be linked to the other report');
 q("A.breport('b1')");q("A.rfilter('all')");ok(/Reported by 2 people/.test(Q.txt()),'the report shows how many people reported the same problem');
 q("A.rptopen('"+pid+"')");q("S.rq={rej:'Not our responsibility'}");q("A.rreopen('"+pid+"')");q("A.rreject('"+pid+"')");ok(q("rStat(rOf('"+pid+"'))")==='REJECTED'&&/Reason: Not our responsibility/.test(q("rOf('"+pid+"').audit.slice(-1)[0].x")),'a report can be rejected, with the reason recorded');
 // approve and convert to a job
 const pidP=JSON.parse(q("JSON.stringify(RPT().find(r=>r.locName==='Swimming pool'&&r.bid==='b1'))")).id;
 q("A.rptopen('"+pidP+"')");q("A.rapprove('"+pidP+"')");ok(q("rStat(rOf('"+pidP+"'))")==='APPROVED'&&/No contractor has been chosen and no money has been approved/.test(q("rOf('"+pidP+"').audit.slice(-1)[0].x"))&&!!Q.$('[data-a=rconv]'),'approving does not choose a contractor or approve money, and offers Convert to a job');
 q("A.rconv('"+pidP+"')");ok(q("S.step")===2&&q("S.draft.bid")==='b1'&&q("S.draft.area")==='Swimming pool'&&/Plumbing or water: Swimming pool/.test(q("S.draft.title"))&&q("S.draft.trade")==='plumbing'&&q("S.draft.urgency")==='Urgent'&&/Water is pooling/.test(q("S.draft.instr"))&&q("S.fromReport")===pidP,'Convert opens a normal request already filled in with the place, kind, priority and description');
 ok(!/Daniel|0400 000 222/.test(q("JSON.stringify(S.draft)")),'the reporter’s name and contact are not put into the request');
 q("S.prof.pay='bank';S.prof.consent=true");q("A.step('next')");q("A.step('next')");q("A.step('next')");
 q("S.draft.title=S.draft.title||'Pool leak';A.post&&0");
 const jn=q("J.length");try{q("A.send&&A.send()")}catch(e){}
 // finish the wizard by calling the post path directly
 let jid=null;for(const fn of ['post','send','submit']){if(q("typeof A."+fn)==='function'){try{q("A."+fn+"()")}catch(e){}if(q("J.length")>jn){jid=q("J[0].id");break}}}
 ok(jid&&q("J[0].fromReport")===pidP&&q("rOf('"+pidP+"').job")===jid&&q("S.fromReport")===null,'sending the request creates the job and links it to the report');
 ok(q("rStat(rOf('"+pidP+"'))")==='APPROVED'&&/Converted to the maintenance job/.test(q("rOf('"+pidP+"').audit.slice(-1)[0].x"))&&/not shared with contractors/.test(q("rOf('"+pidP+"').audit.slice(-1)[0].x")),'the report is APPROVED while the job waits for quotes, and the history says reporter details were not shared');
 const stages=[['open','APPROVED'],['approved','ASSIGNED'],['paid','ASSIGNED'],['onsite','IN PROGRESS'],['review0','IN PROGRESS'],['fix1','IN PROGRESS'],['released','COMPLETED']];
 ok(stages.every(([s,e])=>{q("J.find(j=>j.id==='"+jid+"').stage='"+s+"'");return q("rStat(rOf('"+pidP+"'))")===e}),'the report follows the job: APPROVED, ASSIGNED, IN PROGRESS, COMPLETED');
 q("A.rptopen('"+pidP+"')");ok(!!Q.$('[data-a=rclose]'),'a completed report offers Close');q("A.rclose('"+pidP+"')");ok(q("rStat(rOf('"+pidP+"'))")==='CLOSED','and closes');
 q("J.find(j=>j.id==='"+jid+"').stage='open'");q("rOf('"+pidP+"').closedAt=null");
 q("S.stack=[];go('mjob',{id:'"+jid+"'})");ok(/Reported through a QR code/.test(Q.txt())&&new RegExp(JSON.parse(q("JSON.stringify(rOf('"+pidP+"').ref)"))).test(Q.txt()),'the job shows that it came from a QR report');
 // contractors never see the reporter
 q("S.role='contractor';S.stack=[];S.tab.contractor='find';render()");const cs=[];
 for(const code of ["go('cjob',{id:'"+jid+"'})","S.stack=[];go('cwork',{id:'"+jid+"'})"]){try{q(code);cs.push(Q.txt())}catch(e){}}
 ok(cs.length>0&&cs.every(t=>!/Daniel|0400 000 222|Reported through a QR|RP-\d{4}|Priority changed|Internal comment/.test(t)),'a contractor sees the job but never the reporter’s name or contact, the QR reference or internal comments');
 q("S.role='manager'");
 // ===== history cannot be changed =====
 ok(!['rdel','rdelete','raudit','redit','rremove'].some(k=>typeof q("A."+k)==='function'),'there is no action to edit or delete a report’s history');
 const cnt=q("RPT().map(r=>r.audit.length)");q("RPT().forEach(r=>{r.audit.length})");ok(q("RPT().every(r=>r.audit.every(x=>x.t&&x.who&&x.x))"),'every history line has a time, who and what');
 // ===== alerts =====
 q("S.stack=[];S.role='manager'");q("openPub(bld('b1').locs[0].tok)");q("S.pub.f.safety='danger';S.pub.f.desc='Smoke in the lift';S.pub.f.name='Sam';S.pub.f.consent=true;S.pub.f.ans=String(S.pub.ch.a+S.pub.ch.b);PUBLOG=[]");q("A.pubsend()");q("A.pubexit()");
 q("S.stack=[];S.tab.manager='mhome';render()");const emR=JSON.parse(q("JSON.stringify(RPT().find(r=>r.emergency))"));
 ok(emR&&/Emergency report/.test(Q.txt()),'an unacknowledged emergency shows on Home as a red notice');
 q("A.rptopen('"+emR.id+"')");ok(/EMERGENCY alert sent/.test(Q.txt())&&Q.$('[data-a=rack]')&&Q.$('[data-a=resc]'),'the report shows the alert, with Acknowledge and a demo of escalation');
 q("A.resc('"+emR.id+"')");ok(/Alert emailed to the next contact: oncall@example\.com/.test(q("rOf('"+emR.id+"').audit.slice(-1)[0].x")),'with no acknowledgement the alert goes to the next contact, and it is recorded');
 q("A.resc('"+emR.id+"')");ok(/no more contacts/.test(q("rOf('"+emR.id+"').audit.slice(-1)[0].x")),'and says plainly when there is nobody left');
 q("A.rack('"+emR.id+"')");ok(/acknowledged/i.test(q("rOf('"+emR.id+"').audit.slice(-1)[0].x"))&&!!q("rOf('"+emR.id+"').alert.ack")&&q("rEmOpen().filter(r=>r.id==='"+emR.id+"').length")===0,'acknowledging stops the alert and is recorded');
 // ===== settings for each building =====
 q("A.breport('b1')");q("A.btab('set')");ok(/Settings for Southbank Residences/.test(Q.txt())&&Q.$('[data-rc="notify|b1"]').value==='manager@example.com'&&/These settings are for this building only/.test(Q.txt()),'each building has its own settings');
 Q.chg(Q.$('[data-rc="notify|b1"]'),'bm@example.com, 0400 111 222');Q.chg(Q.$('[data-rc="escMin"]'.replace('"escMin"','"escMin|b1"')),'30');Q.chk(Q.$('[data-rc="contactReq|b1"]'),false);Q.chg(Q.$('[data-rc="text|b1"]'),'Please do not stand in the water.');
 ok(q("rcfg(bld('b1')).notify")==='bm@example.com, 0400 111 222'&&q("rcfg(bld('b1')).escMin")===30&&q("rcfg(bld('b1')).contactReq")===false&&q("rcfg(bld('b2')).notify")==='manager@example.com'&&q("rcfg(bld('b2')).contactReq")===true,'changing one building’s settings does not change another’s');
 Q.chk(Q.$('[data-rc="on|b1"]'),false);ok(q("rcfg(bld('b1')).on")===false,'public reporting can be switched off for one building');q("A.btab('queue')");ok(/Public reporting is switched off/.test(Q.txt()),'and the queue says so');
 Q.w.close();
 // ===== property managers have none of this =====
 let PM=mk('https://example.org/?demo=property');await sleep(300);
 PM.ev("S.stack=[];S.tab.manager='bld';S.bopen={b:'b1',s:{'b1:rpt':true},add:false};render()");ok(!/Reporting and QR codes/.test(PM.txt())&&!PM.$('.bsec[data-k="b1:rpt"]')&&!PM.$('.bsec[data-k="b1:qlinks"]'),'a property manager sees no QR reporting on a property');
 PM.ev("S.stack=[];S.tab.manager='mhome';render()");ok(!/QR code/.test(PM.txt()),'and no QR report notices');
 PM.ev("S.stack=[{n:'breport',a:{id:'b1'}}];render()");ok(/Not available/.test(PM.txt()),'the reporting screen refuses a property manager');
 ok(PM.ev("RPT().length")===0&&PM.ev("B.every(b=>!b.locs)"),'the property world starts with no QR places or reports');PM.w.close();
 // ===== saved with the account =====
 let S1=mk('https://example.org/');await sleep(250);S1.ev("A.authgo('register');A.authtype('manager')");S1.chg(S1.$('#au-role'),'Building manager');S1.inp(S1.$('#au-name'),'Bob Building');S1.inp(S1.$('#au-email'),'bob@example.com');S1.inp(S1.$('#au-mob'),'0411 222 333');S1.inp(S1.$('#au-pw'),'Towers2026x');S1.inp(S1.$('#au-pw2'),'Towers2026x');S1.chk(S1.$('#au-terms'),true);await S1.ev("A.authreg()");await sleep(300);
 const nrep=S1.ev("RPT().length"),nloc=S1.ev("bld('b1').locs.length");S1.ev("A.qtoggle('b1|b1-l1')");S1.ev("A.rstart(RPT()[0].id)");S1.ev("persistNow()");const st=S1.store();S1.w.close();
 let S2=mk('https://example.org/',st);await sleep(300);ok(S2.ev("RPT().length")===nrep&&S2.ev("bld('b1').locs.length")===nloc&&S2.ev("bld('b1').locs[0].on")===false&&S2.ev("rStat(RPT()[0])")==='UNDER REVIEW','places, switched-off codes, reports and their status are saved with the account and come back'); S2.w.close();
 console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)})();
