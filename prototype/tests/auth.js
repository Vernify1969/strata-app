const {JSDOM}=require('jsdom');const fs=require('fs');const nodeCrypto=require('crypto');
const html=fs.readFileSync((process.env.APP||require('path').join(__dirname,'..','taskspeck-managers.html')),'utf8');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mk=(store,opts)=>{opts=opts||{};const errs=[];const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/'+(opts.demo?'?demo=1':''),beforeParse(w){w.addEventListener('error',e=>errs.push(e.message));Object.defineProperty(w,'crypto',{value:nodeCrypto.webcrypto,configurable:true});w.TextEncoder=TextEncoder;if(store)Object.keys(store).forEach(k=>w.localStorage.setItem(k,store[k]));if(opts.pre)opts.pre(w)}});const w=dom.window,d=w.document;
 const I={w,d,errs,$:s=>d.querySelector(s),$$:s=>[...d.querySelectorAll(s)],ev:c=>w.eval(c),txt:()=>d.querySelector('#view').textContent,click:s=>{const e=typeof s==='string'?d.querySelector(s):s;if(!e)throw new Error('missing '+s);e.click()},set:(id,v)=>{const e=d.getElementById(id);if(!e)throw new Error('missing #'+id);e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}))},chk:(id,v)=>{const e=d.getElementById(id);if(!e)throw new Error('missing #'+id);e.checked=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))},chg:(e,v)=>{e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))},store:()=>{const o={};for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);o[k]=w.localStorage.getItem(k)}return o},toast:()=>d.querySelector('#toast').textContent};return I};
const reg=async(I,o)=>{I.ev("A.authgo('register')");if(o.type)I.ev("A.authtype('"+o.type+"')");const rl=I.$('#au-role');if(rl&&o.role)I.chg(rl,o.role);if(o.biz&&I.$('#au-biz'))I.set('au-biz',o.biz);I.set('au-name',o.name||'');I.set('au-email',o.email||'');I.set('au-mob',o.mobile||'');I.set('au-pw',o.pw||'');I.set('au-pw2',o.pw2===undefined?o.pw:o.pw2);I.chk('au-terms',o.terms!==false);if(o.remember===false)I.chk('au-rem',false);await I.ev("A.authreg()")};
const signin=async(I,email,pw,rem)=>{I.ev("A.authgo('signin')");I.set('au-email',email);I.set('au-pw',pw);if(rem===false)I.chk('au-rem',false);await I.ev("A.authsignin()")};
(async()=>{try{
 // ===== 1. welcome =====
 let A=mk(null);await sleep(300);
 ok(/Maintenance quotes for buildings and properties/.test(A.txt())&&A.$('[data-a=authgo][data-v=register]')&&A.$('[data-a=authgo][data-v=signin]')&&A.$('[data-a=authguest]')&&A.$('#nav').style.display==='none'&&!A.$('[data-a=role]'),'a first visit shows Welcome with Create an account, Sign in and the demo, and no app menus');
 // ===== 2. register: every rule =====
 const good={type:'manager',role:'Building manager',name:'Nick Kampouris',email:'Nick@Example.com',mobile:'0499 154 827',pw:'Strata2026'};
 const bad=[['no type',{type:''},/Choose whether you are a manager or a contractor/],['no role',{role:''},/Choose your role/],['short name',{name:'N'},/Enter your full name/],['bad email',{email:'nick@'},/valid email/],['no mobile',{mobile:'12'},/mobile number/],['short password',{pw:'abc12'},/at least 8 characters/],['letters only',{pw:'abcdefghij'},/letters and at least one number/],['email in password',{pw:'nick12345'},/Do not use your email/],['mismatch',{pw2:'Strata2027'},/do not match/],['no terms',{terms:false},/Agree to the terms/]];
 for(const [n,ch,re] of bad){await reg(A,Object.assign({},good,ch));ok(re.test(A.txt())&&A.ev("AUTH.user")===null&&A.ev("ACCT.list.length")===0,'registering is refused: '+n)}
 await reg(A,Object.assign({},good,{type:'contractor',biz:''}));ok(/Enter your business name/.test(A.txt()),'a contractor must give a business name');
 // ===== 3. manager registers =====
 await reg(A,good);await sleep(300);
 ok(A.ev("!!AUTH.user&&AUTH.user.type")==='manager'&&A.ev("S.role")==='manager'&&A.ev("S.tab.manager")==='mprof'&&/My account/.test(A.txt())&&/Nick Kampouris/.test(A.txt())&&/nick@example\.com/.test(A.txt())&&A.$('#nav').style.display==='','the account is created, signed in, and opens on the Profile');
 ok(A.ev("S.prof.name")==='Nick Kampouris'&&A.ev("S.prof.email")==='nick@example.com'&&A.ev("S.prof.mobile")==='0499 154 827'&&A.ev("S.prof.role")==='Building manager'&&A.ev("S.prof.oc")===''&&A.ev("S.prof.abn")==='','the profile starts with the registration details, and the rest blank');
 ok(/Finish your profile to send a request/.test(A.$('#profstat').textContent)&&/Add your OC or company/.test(A.$('#profstat').textContent)&&/Add your 11 digit ABN/.test(A.$('#profstat').textContent)&&!/Add your name/.test(A.$('#profstat').textContent)&&!/Choose your role/.test(A.$('#profstat').textContent),'it asks only for what is still missing');
 let st=A.store();const acctRaw=st['ts-accounts-v1'],rec=JSON.parse(acctRaw).list[0];
 ok(rec.email==='nick@example.com'&&rec.hash&&rec.salt&&rec.alg==='pbkdf2'&&!/Strata2026/.test(Object.values(st).join(' '))&&!rec.password,'the password is stored only as a salted hash, never as text');
 ok(Object.keys(st).some(k=>k==='ts-data-v1-'+rec.id),'the account has its own saved data');
 A.ev("A.signout()");await reg(A,good);ok(/already exists/.test(A.txt())&&A.ev("ACCT.list.length")===1,'registering the same email again is refused');
 await signin(A,'nick@example.com','Strata2026');A.ev("S.stack=[];S.tab.manager='mprof';render()");
 const prof=(k,v)=>{const el=A.$('[data-m="'+k+'"]');if(el.tagName==='SELECT')A.chg(el,v);else{el.value=v;el.dispatchEvent(new A.w.Event('input',{bubbles:true}));el.dispatchEvent(new A.w.Event('change',{bubbles:true}))}};
 prof('prof.oc','Denmark Kew OC');prof('prof.abn','12 345 678 319');prof('prof.billing','accounts@denmark.example.com');prof('prof.pay','bank');const cb=A.$('input[data-m="prof.consent"]');cb.checked=true;cb.dispatchEvent(new A.w.Event('change',{bubbles:true}));
 A.ev("bld('b1').payer='accounts';bld('b1').payEmail='a@d.example.com';bld('b1').tiers=[{limit:2000,quotes:1},{limit:6000,quotes:2},{limit:20000,quotes:3}]");
 A.click('[data-a=saveprof]');ok(/Profile saved to your account/.test(A.toast())&&/Saved to your account on this device · /.test(A.txt()),'Save my profile confirms it is saved to the account');
 await sleep(100);st=A.store();const sA=JSON.parse(st['ts-accounts-v1']);
 // ===== 5. a new visit: still signed in with everything =====
 let R=mk(st);await sleep(300);
 ok(R.ev("!!AUTH.user&&AUTH.user.email")==='nick@example.com'&&!/Create an account|Sign in/.test(R.txt().slice(0,60))&&R.ev("S.prof.oc")==='Denmark Kew OC'&&R.ev("S.prof.abn")==='12 345 678 319'&&R.ev("S.prof.billing")==='accounts@denmark.example.com'&&R.ev("bld('b1').tiers[0].limit")===2000&&R.ev("bld('b1').payEmail")==='a@d.example.com','coming back, the person is still signed in and the profile and building settings are all still there');
 ok(R.ev("profMissing().length")===0,'and nothing has to be entered again');
 // ===== 6. sign out, wrong password, sign in =====
 R.ev("A.signout()");ok(/Sign in/.test(R.txt())&&/You are signed out/.test(R.txt())&&R.ev("AUTH.user")===null&&JSON.parse(R.store()['ts-accounts-v1']).active===null,'signing out returns to Sign in and forgets the session');
 await signin(R,'nick@example.com','WrongPass1');ok(/The email or password is not right/.test(R.txt())&&R.ev("AUTH.user")===null,'a wrong password is refused, without saying which part was wrong');
 await signin(R,'nobody@example.com','Strata2026');ok(/The email or password is not right/.test(R.txt()),'an unknown email gets the same message');
 await signin(R,'NICK@example.com','Strata2026');ok(R.ev("!!AUTH.user")&&R.ev("S.prof.oc")==='Denmark Kew OC'&&/Welcome back, Nick/.test(R.toast()),'the right password signs in (email not case sensitive) and restores the profile');
 // lockout
 R.ev("A.signout()");for(let i=0;i<5;i++)await signin(R,'nick@example.com','Nope12345');ok(/Too many tries/.test(R.txt()),'five wrong tries lock sign-in for a minute');
 await signin(R,'nick@example.com','Strata2026');ok(R.ev("AUTH.user")===null&&/Too many tries/.test(R.txt()),'even the right password waits during the lock');
 // reset password
 R.ev("AUTH.lock={};A.authgo('forgot')");R.set('au-email','nick@example.com');await R.ev("A.authforgot()");ok(/Check your email/.test(R.txt())&&/no email is sent/.test(R.txt()),'Forgot password says a link was sent (demo)');
 R.ev("A.authgo('reset')");R.set('au-email','nick@example.com');R.set('au-pw','abc');R.set('au-pw2','abc');await R.ev("A.authreset()");ok(/at least 8 characters/.test(R.txt()),'the new password must follow the same rules');
 R.set('au-pw','Brand2New9');R.set('au-pw2','Brand2New9');await R.ev("A.authreset()");ok(/Sign in with the new password/.test(R.txt()),'resetting works');
 await signin(R,'nick@example.com','Strata2026');ok(R.ev("AUTH.user")===null,'the old password no longer works');
 await signin(R,'nick@example.com','Brand2New9');ok(R.ev("!!AUTH.user"),'the new password does');
 // ===== 7. not kept signed in =====
 R.ev("A.signout()");await signin(R,'nick@example.com','Brand2New9',false);await sleep(100);const st2=R.store();ok(JSON.parse(st2['ts-accounts-v1']).active===null,'without Keep me signed in, the device does not remember the session');
 let R2=mk(st2);await sleep(300);ok(R2.ev("AUTH.user")===null&&/Sign in/.test(R2.txt()),'a new visit asks to sign in');R2.w.close();
 // ===== 8. account card: name, mobile, password =====
 R.ev("S.stack=[];S.role='manager';S.tab.manager='mprof';render()");
 R.chg(R.$('#ac-mob'),'12');ok(/Enter your mobile number/.test(R.toast())&&R.ev("AUTH.user.mobile")==='0499 154 827','a bad mobile number is refused');
 R.chg(R.$('#ac-mob'),'0411 222 333');R.chg(R.$('#ac-name'),'Nikos Kampouris');ok(R.ev("AUTH.user.mobile")==='0411 222 333'&&R.ev("AUTH.user.name")==='Nikos Kampouris'&&R.ev("S.prof.name")==='Nikos Kampouris'&&R.ev("S.prof.mobile")==='0411 222 333'&&JSON.parse(R.store()['ts-accounts-v1']).list[0].name==='Nikos Kampouris','changing name or mobile updates the account and the profile');
 R.click('[data-a=pwopen]');R.set('ac-pw0','Wrong0000');R.set('ac-pw1','Another8Pass');R.set('ac-pw2','Another8Pass');await R.ev("A.pwsave()");ok(/current password is not right/.test(R.txt()),'changing the password needs the current one');
 R.set('ac-pw0','Brand2New9');R.set('ac-pw1','short');R.set('ac-pw2','short');await R.ev("A.pwsave()");ok(/at least 8 characters/.test(R.txt()),'and a new one that follows the rules');
 R.set('ac-pw0','Brand2New9');R.set('ac-pw1','Another8Pass');R.set('ac-pw2','Another8Pass');await R.ev("A.pwsave()");ok(/Password changed/.test(R.toast()),'the password can be changed');
 R.ev("A.signout()");await signin(R,'nick@example.com','Another8Pass');ok(R.ev("!!AUTH.user"),'and the new one signs in');
 // ===== 9. two people on one device keep separate data =====
 R.ev("(()=>{B.push({id:'bx',name:'Balwyn Court',street:'2 Sample Road',suburb:'Balwyn',oc:'PS 777',committee:'',owner:'',ownerEmail:'',hrs:{days:[1,2,3,4,5],from:'08:00',to:'17:00'},acc:''});S.prof.oc='Nick OC'})()");R.ev("A.signout()");
 await reg(R,{type:'manager',role:'OC manager',name:'Second Person',email:'second@example.com',mobile:'0400 111 222',pw:'Zebra2026xx'});await sleep(200);
 ok(R.ev("B.some(b=>b.name==='Balwyn Court')")===false&&R.ev("S.prof.name")==='Second Person'&&R.ev("S.prof.oc")==='','a second account starts with its own data and does not see the first person’s building or profile');
 R.ev("A.signout()");await signin(R,'nick@example.com','Another8Pass');ok(R.ev("B.some(b=>b.name==='Balwyn Court')")&&R.ev("S.prof.oc")==='Nick OC'&&R.ev("S.prof.name")==='Nikos Kampouris','and the first person’s data is all still there');
 // ===== 10. reset data keeps the account =====
 R.ev("S.stack=[];S.role='manager';S.tab.manager='mprof';render()");R.click('[data-a=resetask]');ok(/Reset your data\?/.test(R.txt()),'resetting asks first');R.click('[data-a=resetno]');ok(R.ev("B.some(b=>b.name==='Balwyn Court')"),'Cancel keeps everything');
 R.click('[data-a=resetask]');R.click('[data-a=resetyes]');ok(R.ev("!B.some(b=>b.name==='Balwyn Court')")&&R.ev("!!AUTH.user")&&R.ev("S.prof.oc")==='Nick OC'&&R.ev("S.prof.name")==='Nikos Kampouris','Reset my data clears buildings and jobs but keeps the account and the profile');
 // ===== 11. delete the account =====
 R.click('[data-a=delask]');ok(/Delete your account\?/.test(R.txt()),'deleting asks first');R.click('[data-a=delyes]');await sleep(350);
 const st3=R.store();ok(JSON.parse(st3['ts-accounts-v1']).list.every(a=>a.email!=='nick@example.com')&&!Object.keys(st3).some(k=>/ts-data-v1-/.test(k)&&k.includes(sA.list[0].id))&&/Your account and data were deleted/.test(R.txt()),'Delete my account removes the account and its data');
 await signin(R,'nick@example.com','Another8Pass');ok(R.ev("AUTH.user")===null,'and the person can no longer sign in');
 R.w.close();A.w.close();
 // ===== 12. contractor registers and keeps credentials =====
 let C=mk(null);await sleep(300);
 await reg(C,{type:'contractor',biz:'Kew Plumbing Pty Ltd',name:'Sam Plumber',email:'sam@kewplumbing.example.com',mobile:'0412 000 111',pw:'Pipes2026ok'});await sleep(300);
 ok(C.ev("AUTH.user.type")==='contractor'&&C.ev("S.role")==='contractor'&&C.ev("S.tab.contractor")==='cprof'&&C.ev("CON[ME].name")==='Kew Plumbing Pty Ltd'&&/My account/.test(C.txt())&&/Sam Plumber/.test(C.txt())&&/sam@kewplumbing\.example\.com/.test(C.txt()),'a contractor registers with a business name and lands on their Profile');
 ok(/Finish your profile to send offers/.test(C.txt())&&/Add your 11 digit ABN/.test(C.txt())&&/Choose at least one trade/.test(C.txt())&&/Add your licence or registration number/.test(C.txt())&&/public liability policy number/.test(C.txt())&&/Not verified yet/.test(C.txt())&&!/Add your business name/.test(C.txt()),'it lists the credentials still missing, and is not verified yet');
 ok(['cb','ca','clt','cln','cle','cis','cin','cie'].every(id=>C.$('#'+id)),'the profile has fields for business name, ABN, licence type, number and expiry, insurer, policy number and expiry');
 // gate on offers
 C.ev("S.stack=[];S.role='contractor';go('cjob',{id:'m1'})");C.ev("S.qdraft.price=500;S.qdraft.scope='Replace the tap washer';S.qdraft.date=addBiz(todayIso(),5);S.qdraft.time='09:00';S.qdraft.dur=60");
 const n0=C.ev("J.find(j=>j.id==='m1').quotes.length");C.ev("J.find(j=>j.id==='m1').stage='open';A.sendq('m1')");ok(/Finish your profile before you send an offer/.test(C.toast())&&C.ev("J.find(j=>j.id==='m1').quotes.length")===n0&&C.ev("S.tab.contractor")==='cprof','an offer cannot be sent until the credentials are complete');
 // fill credentials
 C.ev("S.stack=[];S.tab.contractor='cprof';render()");
 const fill=(id,v)=>{const e=C.$('#'+id);e.value=v;e.dispatchEvent(new C.w.Event('input',{bubbles:true}));e.dispatchEvent(new C.w.Event('change',{bubbles:true}))};
 fill('ca','98 765 432 122');fill('clt','Plumber');fill('cln','PL 98765');fill('cle',C.ev("addDays(todayIso(),300)"));fill('cis','Allied Cover');fill('cin','PL-555');fill('cie',C.ev("addDays(todayIso(),200)"));
 C.ev("A.mytrade('plumbing')");const cons=C.$('input[data-m="me.consent"]');cons.checked=true;cons.dispatchEvent(new C.w.Event('change',{bubbles:true}));
 ok(C.ev("cprofMissing().length")===0&&/Your profile is complete/.test(C.$('#cprofstat').textContent),'with ABN, licence, insurance, a trade and consent entered, the profile is complete');
 C.ev("S.stack=[];S.tab.contractor='cprof';render()");ok(/Verified/.test(C.$('#view .card .row').textContent+C.txt().slice(0,3000))&&/PL 98765 · valid to/.test(C.txt())&&/PL-555 · valid to/.test(C.txt()),'the profile shows Verified and the licence and insurance with their expiry dates');
 fill('cie',C.ev("addDays(todayIso(),-3)"));ok(C.ev("S.me.insExp")===true&&/Expired/.test(C.txt())&&C.ev("cprofMissing().length")>0&&/insurance expiry date in the future/.test(C.$('#cprofstat').textContent),'an insurance date in the past marks it expired and the profile incomplete');
 fill('cie',C.ev("addDays(todayIso(),200)"));ok(C.ev("S.me.insExp")===false,'a future date clears it');
 C.ev("S.stack=[];S.role='contractor';go('cjob',{id:'m1'})");C.ev("S.qdraft.price=500;S.qdraft.scope='Replace the tap washer';S.qdraft.date=addBiz(todayIso(),5);S.qdraft.time='09:00';S.qdraft.dur=60;A.sendq('m1')");ok(C.ev("J.find(j=>j.id==='m1').quotes.length")===n0+1,'then an offer can be sent');
 C.click('[data-a=saveprof]');await sleep(100);const cst=C.store();C.w.close();
 let C2=mk(cst);await sleep(300);ok(C2.ev("AUTH.user.type")==='contractor'&&C2.ev("CON[ME].name")==='Kew Plumbing Pty Ltd'&&C2.ev("S.me.licNo")==='PL 98765'&&C2.ev("S.me.insNo")==='PL-555'&&C2.ev("S.me.abn")==='98 765 432 122'&&C2.ev("S.me.trades.join()")==='plumbing'&&C2.ev("cprofMissing().length")===0,'next visit the contractor’s credentials are all still there');C2.w.close();
 // ===== 13. terms page and form memory =====
 let T=mk(null);await sleep(250);T.ev("A.authgo('register');A.authtype('manager')");T.set('au-name','Pat Person');T.set('au-email','pat@example.com');T.click('[data-a=authgo][data-v=terms]');
 ok(/Terms and privacy/.test(T.txt())&&/not the contractor’s employer/.test(T.txt())&&/Stripe/.test(T.txt()),'the terms and privacy summary can be read');T.click('[data-a=authgo][data-v=register]');ok(T.$('#au-name').value==='Pat Person'&&T.$('#au-email').value==='pat@example.com','going back keeps what was typed');T.w.close();
 // ===== 14. demo mode =====
 let G=mk(null);await sleep(250);G.click('[data-a=authguest][data-v="Building manager"]');ok(G.ev("AUTH.guest")===true&&/Demo mode/.test(G.txt()+G.d.body.textContent)&&G.$('#nav').style.display==='','the demo opens the sample app, marked as demo mode');
 G.ev("S.prof.oc='Typed in demo';render();persistNow()");await sleep(350);ok(Object.keys(G.store()).filter(k=>/^ts-(data|accounts)/.test(k)).length===0,'nothing is saved in demo mode');
 G.ev("S.stack=[];S.tab.manager='mprof';render()");ok(/You are in demo mode/.test(G.txt())&&G.$('[data-a=authexit][data-v=register]'),'the Profile says so and offers Create an account');G.click('[data-a=authexit][data-v=register]');ok(/Create your account/.test(G.txt()),'which opens Create your account');G.w.close();
 // ===== 15. earlier saved details are adopted by the first account =====
 const legacy=JSON.stringify({v:1,ctr:{JN:150,WON:1010,QTN:1020},S:{prof:{role:'Building manager',name:'Old Nick',oc:'Old OC',abn:'12 345 678 319',billing:'old@example.com',consent:true,pay:'bank'},role:'manager',tab:{manager:'mhome',contractor:'chome'}},B:JSON.parse(JSON.stringify(mk(null,{demo:true}).ev("B"))).concat([{id:'bz',name:'Kept Building',street:'1 Kept St',suburb:'Kew',oc:'PS 1',committee:'',owner:'',ownerEmail:'',hrs:{days:[1],from:'08:00',to:'17:00'},acc:''}]),J:[]});
 let L=mk({'taskspeck-strata-v1':legacy});await sleep(300);await reg(L,{type:'manager',role:'Building manager',name:'Nick Kampouris',email:'nick@example.com',mobile:'0499 154 827',pw:'Strata2026'});await sleep(300);
 ok(L.ev("B.some(b=>b.name==='Kept Building')")&&L.ev("S.prof.oc")==='Old OC'&&L.ev("S.prof.name")==='Nick Kampouris'&&L.ev("S.prof.email")==='nick@example.com'&&/earlier details were kept/.test(L.toast())&&L.w.localStorage.getItem('taskspeck-strata-v1')===null,'details saved before accounts existed are kept by the first account that registers');L.w.close();
 // ===== 16. damaged data and blocked storage =====
 let D=mk(null);await sleep(250);await reg(D,{type:'manager',role:'Building manager',name:'Dana Dee',email:'dana@example.com',mobile:'0400 999 888',pw:'Cedar2026pass'});await sleep(300);const id=D.ev("AUTH.user.id");const dst=D.store();D.w.close();
 const dmg=JSON.parse(dst['ts-data-v1-'+id]);dmg.J[0]=null;dst['ts-data-v1-'+id]=JSON.stringify(dmg);
 let D2=mk(dst);await sleep(400);ok(/started fresh/.test(D2.toast())&&D2.w.localStorage.getItem('ts-data-v1-'+id+'-crashed')&&D2.ev("!!AUTH.user")&&D2.errs.length===0,'saved data that crashes the app is set aside as a backup and the person is not locked out');D2.w.close();
 let Z=mk(null,{pre:w=>{w.Storage.prototype.setItem=function(){const e=new Error('blocked');e.name='SecurityError';throw e}}});await sleep(250);await reg(Z,{type:'manager',role:'Building manager',name:'Zed Zed',email:'zed@example.com',mobile:'0400 123 456',pw:'Quartz2026X'});ok(/not letting the app save/.test(Z.txt())&&Z.ev("AUTH.user")===null,'if the browser blocks saving, registration says so instead of pretending');Z.w.close();
 console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)})();
