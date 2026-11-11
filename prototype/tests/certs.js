const {JSDOM,VirtualConsole}=require('jsdom');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.APP||path.join(__dirname,'..','taskspeck-managers.html'),'utf8');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mk=(url)=>{const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole(),url:url||'https://example.org/?demo=1'});const w=dom.window,d=w.document;return{w,d,$:s=>d.querySelector(s),$$:s=>[...d.querySelectorAll(s)],ev:c=>w.eval(c),txt:()=>d.querySelector('#view').textContent.replace(/\s+/g,' '),click:s=>{const e=typeof s==='string'?d.querySelector(s):s;if(!e)throw new Error('missing '+s);e.click()},inp:(e,v)=>{e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}))},chg:(e,v)=>{e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))},toast:()=>d.querySelector('#toast').textContent,
 pick:async(sel,file)=>{const el=d.querySelector(sel);Object.defineProperty(el,'files',{value:[file],configurable:true});el.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(120)}}};
const PROF="S.prof.role='OC manager';S.prof.name='Alex Morgan';S.prof.pay='bank';S.prof.consent=true;S.prof.abn='51 824 753 556';S.prof.billing='a@b.co';S.prof.oc='OC';";
(async()=>{try{
 let I=mk();await sleep(300);const e=c=>I.ev(c);e(PROF);
 // ===== the sample data =====
 ok(e("Object.values(CON).every(c=>docsOf(c).lic&&docsOf(c).ins&&docsOf(c).lic.status==='approved')")&&e("certsOK(CON.c1)")&&e("certsOK(CON.c3)"),'every sample contractor has an approved licence and insurance certificate, including the one in the demo');
 ok(e("certState(CON.c6,'ins')")==='expired'&&!e("certsOK(CON.c6)")&&/Check needed/.test(e("verifiedFor(CON.c6)"))&&/Verified/.test(e("verifiedFor(CON.c3)")),'a contractor whose insurance has ended is shown as Check needed, and one with checked papers as Verified');
 ok(e("S.set.certGate")==='book','the starting rule is that documents are checked before a manager can approve a quote');
 // ===== the contractor's profile =====
 e("S.role='contractor';S.stack=[];S.tab.contractor='cprof';render()");
 ok(/Licence certificate/.test(I.txt())&&/Insurance certificate/.test(I.txt())&&I.$$('.pill.ok').filter(p=>/Checked/.test(p.textContent)).length===2&&/Checked by TaskSpeck Strata on/.test(I.txt())&&!!I.$('#cert-lic')&&I.$('#cert-lic').getAttribute('accept')==='image/jpeg,image/png,image/webp,application/pdf'&&/Upload a new certificate \(JPG, PNG, WebP or PDF, up to 3 MB\)/.test(I.txt()),'the profile shows both certificates as Checked, with a chooser for JPG, PNG, WebP and PDF up to 3 MB');
 // ===== uploading =====
 const F=(name,type,size)=>new I.w.File([new Uint8Array(size)],name,{type});
 e("S.me.licNo='';S.me.licExp=''");e("render()");await I.pick('#cert-lic',F('l.pdf','application/pdf',1000));ok(/Fill in the number and the expiry date first/.test(I.toast())&&e("S.me.docs.lic.name")==='Licence certificate (sample).pdf','without the number and the end date it will not upload');
 e("S.me.licNo='PL 12345 (sample)';S.me.licExp=addDays(todayIso(),280);render()");
 await I.pick('#cert-lic',F('virus.exe','application/x-msdownload',1000));ok(/Choose a JPG, PNG, WebP or PDF file/.test(I.toast())&&e("S.me.docs.lic.name")==='Licence certificate (sample).pdf','a file of the wrong type is refused');
 await I.pick('#cert-lic',F('big.pdf','application/pdf',3*1024*1024+1));ok(/over 3 MB/.test(I.toast())&&e("S.me.docs.lic.name")==='Licence certificate (sample).pdf','one over 3 MB is refused');
 await I.pick('#cert-lic',F('my-licence.pdf','application/pdf',20480));
 ok(e("S.me.docs.lic.status")==='review'&&e("S.me.docs.lic.name")==='my-licence.pdf'&&e("S.me.docs.lic.size")===20480&&e("S.me.docs.lic.on")===e("todayIso()")&&/Uploaded\. It will be checked/.test(I.toast())&&e("certState(CON.c1,'lic')")==='review','a valid file is uploaded and waits to be checked');
 ok(/Waiting to be checked/.test(I.txt())&&/my-licence\.pdf · 20 KB/.test(I.txt())&&/Managers see Checking documents until then/.test(I.txt()),'the contractor is told what happens next');
 ok(e("certsOK(CON.c1)")===false&&/Checking documents/.test(e("verifiedFor(CON.c1)")),'and managers see Checking documents');
 // a manager cannot approve a quote while it waits
 e("(()=>{const j=job('m1'),q={id:'qc1',no:'QT-9100',c:'c1',price:300,gst:false,date:addDays(todayIso(),4),time:'10:00',dur:'2 hours',scope:'x',pay:'after',inc:['x'],note:''};j.stage='open';j.con=undefined;j.quote=null;j.quotes=[q]})()");
 e("S.role='manager';S.stack=[];S.tab.manager='jobs';render();go('mjob',{id:'m1'})");
 ok(/Waiting for documents/.test(I.txt())&&/licence and insurance of Aqua Flow Plumbing must be checked/.test(I.txt())&&!I.$('[data-a=mappr]'),'the manager sees Waiting for documents where the Approve button would be');
 e("A.mappr('m1|qc1')");ok(/licence and insurance to be checked/.test(I.toast())&&e("cur().n")!=='appr','and the action is refused too');
 e("A.approve('m1|qc1')");ok(/licence and insurance to be checked/.test(I.toast())&&e("job('m1').stage")==='open','including the final approval');
 // ===== the owner checks it =====
 e("S.stack=[];S.ownerMode=true;A.owner()");let t=I.txt();
 ok(/Certificates to check/.test(t)&&/Waiting \(1\)/.test(t)&&/Aqua Flow Plumbing/.test(t)&&/Licence/.test(t)&&/my-licence\.pdf · 20 KB/.test(t)&&/PL 12345 \(sample\)/.test(t)&&/Check the name, the number and the end date match what was entered/.test(t)&&/a solicitor must review this wording/i.test(t)&&/12 of 14 contractors fully checked/.test(t),'Owner settings lists the certificate waiting, with the details to check against, and the count of contractors fully checked');
 I.click('[data-a=certno]');ok(/Write the reason for not accepting it/.test(I.toast())&&e("S.me.docs.lic.status")==='review','not accepting needs a reason');
 I.inp(I.$('#certrm'),'The number does not match');I.click('[data-a=certno]');
 ok(e("S.me.docs.lic.status")==='rejected'&&e("S.me.docs.lic.why")==='The number does not match'&&e("certState(CON.c1,'lic')")==='rejected'&&/Check needed/.test(e("verifiedFor(CON.c1)")),'with a reason it is not accepted, and managers see Check needed');
 e("S.role='contractor';S.stack=[];S.tab.contractor='cprof';render()");ok(/Not accepted: The number does not match\. Upload a new certificate/.test(I.txt())&&/Not accepted/.test(I.txt()),'the contractor is told why');
 await I.pick('#cert-lic',F('licence-2.png','image/png',5000));ok(e("S.me.docs.lic.status")==='review'&&e("S.me.docs.lic.why")==='','uploading a new one puts it back to waiting');
 e("S.role='manager';S.stack=[];S.ownerMode=true;A.owner()");
 e("S.me.licExp=addDays(todayIso(),-3)");e("render()");I.click('[data-a=certok][data-v="c1|lic"]');ok(/end date is missing or has passed/.test(I.toast())&&e("S.me.docs.lic.status")==='review','a certificate that has already ended cannot be approved');
 e("S.me.licExp=addDays(todayIso(),280);render()");I.click('[data-a=certok][data-v="c1|lic"]');
 ok(e("S.me.docs.lic.status")==='approved'&&e("S.me.docs.lic.reviewedOn")===e("todayIso()")&&e("certState(CON.c1,'lic')")==='approved'&&e("certsOK(CON.c1)")&&/Waiting \(0\)/.test(I.txt())&&/13 of 14 contractors fully checked/.test(I.txt()),'approving it makes the contractor fully checked again (13 of 14, as one sample contractor’s insurance has ended)');
 e("S.stack=[];S.tab.manager='jobs';render();go('mjob',{id:'m1'})");ok(!!I.$('[data-a=mappr]')&&!/Waiting for documents/.test(I.txt()),'and the Approve button is back');
 // ===== changing the details after approval =====
 e("S.me.licNo='PL 99999'");ok(e("certState(CON.c1,'lic')")==='changed'&&/Checking documents/.test(e("verifiedFor(CON.c1)")),'changing the licence number after it was checked puts it back to be checked again');
 e("S.role='contractor';S.stack=[];S.tab.contractor='cprof';render()");ok(/You changed the details after it was checked/.test(I.txt())&&/Check again/.test(I.txt()),'the contractor is told to upload again');e("S.me.licNo='PL 12345 (sample)'");ok(e("certState(CON.c1,'lic')")==='approved','putting it back as it was makes it approved again');
 // an expired approved certificate
 e("S.me.insDate=addDays(todayIso(),-2);S.me.docs.ins.snap.exp=S.me.insDate");ok(e("certState(CON.c1,'ins')")==='expired'&&!e("certsOK(CON.c1)"),'an approved certificate that has now ended counts as expired');e("S.me.insDate=addDays(todayIso(),42);S.me.docs.ins.snap.exp=S.me.insDate");
 // ===== the manager sees the contractor =====
 e("S.role='manager';S.stack=[];S.tab.manager='cons';render()");ok(I.$$('.card').some(c=>/Steady Hands Painting/.test(c.textContent)&&/Check needed/.test(c.textContent))&&I.$$('.card').some(c=>/Metro Plumbing Co/.test(c.textContent)&&/Verified/.test(c.textContent)),'the Contractors list shows Verified for checked papers and Check needed for ended ones');
 e("S.stack=[];go('con',{id:'c3'})");ok(/Certificate checked/.test(I.txt())&&/Verified means|Verified/.test(I.txt()),'a contractor’s page says when the certificate was checked');
 e("S.me.docs.ins.data='data:image/png;base64,iVBORw0KGgo=';S.me.docs.ins.type='image/png';S.me.docs.ins.name='coc.png'");e("S.stack=[];go('con',{id:'c1'})");ok(I.$$('#view img[alt="Insurance certificate"]').length===1&&I.$$('#view img[alt="Licence certificate"]').length===1,'a checked certificate that is an image can be seen by the manager');e("S.stack=[];go('con',{id:'c3'})");ok(/Licence certificate: PDF on file \(96 KB\)/.test(I.txt())&&/Insurance certificate: PDF on file/.test(I.txt())&&I.$$('#view img').length===0,'and a PDF is noted as on file');
 // ===== the other settings =====
 e("S.stack=[];S.ownerMode=true;A.owner()");I.chg(I.$('#certgate'),'quote');ok(e("S.set.certGate")==='quote','the owner can choose to check before offers are sent');
 e("S.me.docs.lic.status='review'");e("S.role='contractor';S.stack=[];S.tab.contractor='find';render();A.cjob(J.find(j=>!j.mine&&j.stage==='open'&&j.trade==='plumbing'&&!j.quotes.some(q=>q.c==='c1')).id)");
 ok(/Your documents must be checked first/.test(I.txt())&&!I.$('[data-a=sendq]'),'then a contractor whose papers are not checked sees a notice instead of the send button');
 e("A.sendq(cur().a.id)");ok(/must be checked before you send offers/.test(I.toast()),'and cannot send');
 e("S.set.certGate='off'");e("S.role='manager';S.stack=[];S.tab.manager='jobs';render();go('mjob',{id:'m1'})");ok(!!I.$('[data-a=mappr]')&&!/Waiting for documents/.test(I.txt())&&!e("certBlocks('c1')"),'with No check needed, nothing is held back');
 e("S.set.certGate='book';S.me.docs.lic.status='approved'");
 // ===== a new account has no documents =====
 e("S.me=ME_BLANK()");ok(e("certState(CON.c1,'lic')")==='none'&&/Documents not uploaded/.test(e("verifiedFor(CON.c1)"))&&e("certBlocks('c1')"),'a new contractor account has no certificates and is held back until it does');
 e("S.role='contractor';S.stack=[];S.tab.contractor='cprof';render()");ok(/Not uploaded/.test(I.txt())&&/Fill in the number and the expiry date above, then upload the certificate/.test(I.txt()),'and is told what to do');
 // ===== older saved data =====
 const raw=JSON.parse(e("snapshot()"));delete raw.S.set.certGate;delete raw.S.me.docs;I.ev("applyRaw("+JSON.stringify(JSON.stringify(raw))+")");ok(e("S.set.certGate")==='book'&&e("certState(CON.c1,'lic')")==='none','an account saved before this change gets the starting rule, and no certificates');
 I.w.close();
 // ===== property managers and building managers both =====
 for(const [url,role] of [['https://example.org/?demo=1','OC manager'],['https://example.org/?demo=property','Property manager']]){const P=mk(url);await sleep(300);P.ev("S.prof.role='"+role+"'");
  const jid=P.ev("J.find(j=>j.mine&&j.stage==='open'&&j.quotes.length).id"),c=P.ev("job('"+jid+"').quotes[0].c");P.ev("docsOf(CON['"+c+"']).ins.status='review'");P.ev("S.stack=[];S.tab.manager='jobs';render();go('mjob',{id:'"+jid+"'})");
  ok(/Waiting for documents/.test(P.txt()),'in the '+(role==='Property manager'?'property':'building')+' world too, a quote from a contractor whose papers are being checked cannot be approved');P.w.close()}
 console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)})();
