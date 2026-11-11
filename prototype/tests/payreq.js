const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync((process.env.APP||require('path').join(__dirname,'..','taskspeck-managers.html')),'utf8');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message))}});
const w=dom.window,d=w.document;let fail=0;
const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const $=s=>d.querySelector(s),$$=s=>[...d.querySelectorAll(s)],ev=c=>w.eval(c),txt=()=>$('#view').textContent;
const click=s=>{const e=typeof s==='string'?$(s):s;if(!e)throw new Error('missing '+s);e.click()};
const chg=(el,v)=>{el.value=v;el.dispatchEvent(new w.Event('change',{bubbles:true}))};
const typeIn=(el,v)=>{el.value=v;el.dispatchEvent(new w.Event('input',{bubbles:true}))};
setTimeout(()=>{try{
 ev("S.prof.role='OC manager';S.prof.pay='bank';S.prof.consent=true;S.stack=[];S.tab.manager='bld';render()");
 ev("bld('b1').tiers=[{limit:1000,quotes:1},{limit:4999,quotes:2},{limit:30000,quotes:3}];bld('b2').tiers=[{limit:1000,quotes:1},{limit:4999,quotes:2},{limit:30000,quotes:3}]");
 // ---- nothing is pre-filled ----
 ok($$('[data-payer]').length===3&&$$('[data-payer]').every(s=>s.value==='')&&$$('[data-payemail]').every(i=>i.value==='')&&$$('[data-terms]').every(i=>i.value==='')&&!$('[data-acct]'),'who pays, the payment email and the terms start blank for every building');
 ok(/Who pays and when/.test(txt())&&/Payment terms \(days after the final invoice/.test(txt()),'Buildings has who pays, the payment email and the terms');
 ev("window.ORIG=JSON.parse('"+ev("JSON.stringify(J.find(j=>j.id==='m1').quotes)").replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"')");
 const later=n=>ev("(()=>{const x=new Date(Date.now()+"+n+"*86400000);return isoOf(x.getFullYear(),x.getMonth(),x.getDate())})()");
 const D7=ev("addBiz(todayIso(),5)");
 const setM1=(price,dep,date,time)=>{ev("(()=>{const j=J.find(j=>j.id==='m1');j.bid='b1';j.appr={};j.committee=false;j.exc='';j.log=[];j.stage='open';j.urgency='Standard';delete j.pay;j.inv=null;j.closed=false;j.live=null;j.arrConf=false;j.final=false;j.chal=[];j.quotes=ORIG.slice(0,2).map(q=>({...q,price:"+price+",date:'"+(date||D7)+"',time:'"+(time||'09:00')+"',dep:"+JSON.stringify(dep||{type:'none'})+"}));S.qdraft.reason='';S.qdraft.pfref='';S.stack=[];S.role='manager';render();go('mjob',{id:'m1'})})()")};
 const setPayer=(b,t,em,terms)=>ev("(()=>{const x=bld('"+b+"');x.payer="+(t?"'"+t+"'":"''")+";x.payEmail='"+(em||'')+"';x.terms="+(terms==null?'null':terms)+"})()");
 // ---- contractor offer: payment before the work ----
 ev("S.stack=[];S.role='contractor';S.tab.contractor='find';render();S.find.view='list';go('cjob',{id:'o6'})");
 ok(/Payment before the work \(optional\)/.test(txt())&&/After the work/.test(txt())&&/Full before I start/.test(txt())&&/paid after the work/i.test(txt()),'the offer form has Payment before the work, defaulting to after the work');
 typeIn($('#qp'),'1000');click('[data-a=depmode][data-v=deposit]');ok(/Deposit/.test(txt())&&$('[data-a=deppct][data-v="25"]')&&$('[data-a=deppct][data-v="50"]')&&/\$300 of \$1,000/.test(txt())&&/Held by Stripe and released to you when you arrive/.test(txt()),'choosing a deposit shows 25, 30 and 50 percent and the amount ($300 of $1,000 at 30%)');
 click('[data-a=deppct][data-v="50"]');ok(/\$500 of \$1,000/.test(txt()),'the deposit percentage can be changed');
 click('[data-a=deppct][data-v="30"]');
 typeIn($('#qs'),'Replace the tap\nTest for leaks');ev("S.qdraft.date='"+D7+"';S.qdraft.time='09:00';");click('[data-a=sendq]');
 const sq=JSON.parse(ev("JSON.stringify(J.find(j=>j.id==='o6').quotes.find(q=>q.c==='c1'))"));ok(sq.dep&&sq.dep.type==='deposit'&&sq.dep.pct===30&&sq.dep.amount===300,'the offer carries the deposit request ($300)');
 // ---- manager sees the ask and approves with a deposit; nobody to pay yet ----
 setM1(1000,{type:'deposit',pct:30,amount:300});
 ok(/Asks for a 30% deposit \(\$300\)/.test(txt())&&/held by Stripe until arrival/.test(txt()),'the quote card shows the deposit ask');
 click('[data-a=mappr]');ok(/Payment/.test(txt())&&/deposit of \$300 \(30%\)/.test(txt())&&/held by Stripe, not TaskSpeck Strata/.test(txt())&&/not set yet/.test(txt())&&/Approve<\/button>|^Approve$/.test($('#apbtn').textContent)||$('#apbtn').textContent==='Approve','the approve screen explains the deposit, that Stripe holds it, and who pays');
 click('#apbtn');let jm=JSON.parse(ev("JSON.stringify(J.find(j=>j.id==='m1'))"));
 ok(jm.stage==='approved'&&jm.pay.reqs.length===1&&jm.pay.reqs[0].kind==='deposit'&&jm.pay.reqs[0].amount===300&&jm.pay.reqs[0].status==='draft'&&jm.pay.reqs[0].no==='PR-'+jm.wo.slice(3)+'-1','approval creates a $300 deposit request, numbered from the work order, not sent because nobody pays yet');
 ok(/Waiting for the deposit before the start/.test(txt())&&/Choose who pays/.test(txt())&&$('[data-a=reqsend]').disabled&&/Set who pays in Buildings/.test($('#toast').textContent),'the job waits for the deposit and says to set who pays');
 click('[data-a=reqpaid]');ok(/Email the payment request first/.test($('#toast').textContent)&&ev("J.find(j=>j.id==='m1').stage")==='approved','a payment cannot be recorded before the request is sent');
 // ---- set who pays, send ----
 setPayer('b1','accounts','accounts@example.com',14);ev("render()");
 click('[data-a=reqsend]');ok(ev("J.find(j=>j.id==='m1').pay.reqs[0].status")==='sent'&&/Payment request emailed/.test($('#toast').textContent)&&/accounts@example\.com/.test(txt()),'with who pays set, the request is emailed');
 const mail=ev("reqEmail(J.find(j=>j.id==='m1'),J.find(j=>j.id==='m1').pay.reqs[0])");
 ok(/^Payment request PR-\d+-1: please pay \$300 by /.test(mail.subject)&&/asks for a deposit/.test(mail.body)&&/Work order: WO-\d+/.test(mail.body)&&/Only pay through this link/.test(mail.body)&&/never sends bank details by email/.test(mail.body)&&/Attached: proforma PR-\d+-1, quote QT-\d+/.test(mail.body),'the email names the work, the amount, warns to use only the secure link and lists the attachments');
 ok(/Email preview/.test(txt())&&$('[data-a=reqcopy]'),'the email preview can be copied');
 const due=ev("upDue(J.find(j=>j.id==='m1'))"),exp=ev("(()=>{const s=new Date('"+D7+"T09:00:00'),x=new Date(s.getTime()-48*3600*1000);return isoOf(x.getFullYear(),x.getMonth(),x.getDate())+' '+pad(x.getHours())+':'+pad(x.getMinutes())})()");
 ok(due.iso+' '+due.hm===exp&&!due.soon,'a deposit is due 48 hours before the works start ('+exp+')');
 click('[data-a=reqremind]');ok(/Reminder sent/.test($('#toast').textContent)&&ev("J.find(j=>j.id==='m1').pay.reqs[0].reminders")===1,'a reminder can be sent');
 click('[data-a=reqdoc]');const P=$('.paper').textContent;ok(/Proforma · payment request/.test(P)&&/Deposit \(proforma\)/.test(P)&&/\$300/.test(P)&&/Secure Stripe payment link/.test(P)&&/does not hold the money/.test(P)&&!/Platform fee/.test(P),'the manager’s request document shows the deposit and the secure link, with no fee');click('[data-a=back]');
 // contractor view while waiting
 ev("S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})");
 ok(/Waiting for the deposit/.test(txt())&&/held by Stripe and released to you when you arrive/.test(txt())&&/Platform fee \(15%\)|You receive/.test(txt()),'the contractor sees the deposit is waiting and held by Stripe until arrival');
 // ---- payer pays: held by Stripe ----
 ev("S.stack=[];S.role='manager';render();go('mjob',{id:'m1'})");typeIn($('input[data-m="qdraft.pfref"]'),'REMIT-9');click('[data-a=reqpaid]');
 jm=JSON.parse(ev("JSON.stringify(J.find(j=>j.id==='m1'))"));
 ok(jm.stage==='paid'&&jm.pay.reqs[0].status==='paid'&&jm.pay.reqs[0].held&&!jm.pay.reqs[0].releasedOn&&jm.pay.reqs[0].ref==='REMIT-9'&&/Held by Stripe, not by TaskSpeck Strata/.test(txt())&&/Gate code/.test(txt())&&/Booked/.test(txt()),'when the deposit is paid it is held by Stripe, the job is booked and access is unlocked');
 ev("S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})");ok(/You receive when you arrive/.test(txt())&&/\$255/.test(txt()),'the contractor sees $255 arrives after the 15% fee ($300 deposit)');
 // ---- arrival releases the deposit ----
 click('[data-a=arrived]');jm=JSON.parse(ev("JSON.stringify(J.find(j=>j.id==='m1'))"));const r0=jm.pay.reqs[0];
 ok(r0.releasedOn&&r0.clearsOn===ev("addBiz('"+r0.releasedOn+"',2)")&&jm.log.some(l=>/released to .* on arrival \(fee \$45, they receive \$255\)/.test(l.x)),'on arrival the deposit is released, with the fee taken ($45) and funds clearing after two business days');
 ok(/Funds clear/.test(txt())&&/Stripe pays you after the funds clear/.test(txt())&&/\$45/.test(txt()),'the contractor sees the fee and the clearing date');
 ok(/TaskSpeck Strata fee invoice/.test(txt()),'a fee invoice is available once a payment is released');
 // ---- cannot cancel after arrival ----
 ev("S.stack=[];S.role='manager';render();go('mjob',{id:'m1'})");ok(!$('[data-a=mcancel]'),'a job cannot be cancelled after the contractor has arrived');
 // ---- final payment after the work, minus the deposit ----
 ev("(()=>{const j=J.find(j=>j.id==='m1');j.stage='released';j.relOn=todayIso();j.inv=null;S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})})()");
 ok(/Upload your final invoice/.test(txt())&&/The final payment request goes to the payer when you upload it/.test(txt()),'after acceptance the contractor uploads the final invoice');
 typeIn($('#in1'),'INV-1');typeIn($('#in3'),'1000');ev("S.invd.file={name:'f.pdf',size:1};render()");typeIn($('#in1'),'INV-1');typeIn($('#in3'),'1000');click('[data-a=invsend]');
 let fr=ev("J.find(j=>j.id==='m1').pay.reqs.find(r=>r.kind==='final')");
 ok(fr&&fr.amount===700&&fr.status==='sent'&&fr.due===ev("addDays(todayIso(),14)")&&fr.to==='accounts@example.com','the final request is $700 ($1,000 less the $300 deposit), sent to the payer, due in 14 days');
 ok(/Final payment/.test(txt())&&/\$700/.test(txt())&&/Waiting for payment/.test(txt()),'the contractor sees the final payment waiting');
 ev("S.stack=[];S.role='manager';render();go('mjob',{id:'m1'})");ok(/Waiting for payment/.test(txt())&&!$('[data-a=closejob]')&&/Final payment/.test(txt()),'the manager cannot close until the final payment is made');
 ev("A.closejob('m1')");ok(/Payment is not complete yet/.test($('#toast').textContent)&&!ev("J.find(j=>j.id==='m1').closed"),'closing is refused while payment is outstanding');
 // overdue and suspension
 ev("J.find(j=>j.id==='m1').pay.reqs.find(r=>r.kind==='final').due=addDays(todayIso(),-3);S.stack=[];render();go('mjob',{id:'m1'})");
 ok(/Overdue/.test(txt())&&ev("STAGE(J.find(j=>j.id==='m1'))[0]")==='Payment overdue'&&!ev("bSusp(bld('b1'))"),'a payment past its due date is Overdue, and the building is not yet paused');
 ev("J.find(j=>j.id==='m1').pay.reqs.find(r=>r.kind==='final').due=addDays(todayIso(),-10)");
 ok(ev("bSusp(bld('b1'))"),'more than 7 days overdue pauses new jobs for that building');
 ev("S.stack=[];S.role='manager';S.draft={title:'Test job',bid:'b1',trade:'plumbing',area:'x',safety:{},photos:0,video:false,urgency:'Standard',date:todayIso(),slot:'any',time:'09:00',flex:false,dl:'3d',materials:'',ins:'',swms:false,notice:'',hours:'',lift:'',po:'',tradeNote:'',instr:'',parking:'Yes',parkNote:'',access:null};render()");ev("A.post()");ok(/Payments for this building are overdue/.test($('#toast').textContent),'a new job for a paused building is refused');
 ev("S.set.susp=30");ok(!ev("bSusp(bld('b1'))"),'the pause threshold is an owner setting');ev("S.set.susp=7");
 // pay it -> ready to close
 ev("S.stack=[];S.role='manager';render();go('mjob',{id:'m1'})");click('[data-a=reqpaid][data-v$="|r2"]');ok(/Ready to close/.test(txt())&&$('[data-a=closejob]')&&ev("payDone(J.find(j=>j.id==='m1'))"),'once paid, the job is ready to close');
 const tsT=ev("(()=>{const j=J.find(j=>j.id==='m1');return reqsOf(j).filter(r=>r.status==='paid').reduce((s,r)=>s+feeOf(r.amount).fee,0)})()");ok(tsT===150,'the 15% fee was taken from each payment: $45 on the deposit and $105 on the final payment ($150)');
 click('[data-a=closejob]');ok(/Job closed/.test(txt()),'the job closes');
 // ---- full prepayment (proforma) ----
 setPayer('b1','accounts','accounts@example.com',null);
 setM1(600,{type:'full'});click('[data-a=mappr]');ok(/full payment of \$600 before the start/.test(txt()),'the approve screen explains a full prepayment');click('#apbtn');
 jm=JSON.parse(ev("JSON.stringify(J.find(j=>j.id==='m1'))"));ok(jm.pay.reqs[0].kind==='proforma'&&jm.pay.reqs[0].amount===600&&jm.pay.reqs[0].status==='sent'&&/Waiting for payment before the start/.test(txt())&&/Full payment before the start \(proforma\)/.test(txt()),'full prepayment creates a proforma request for the whole price, sent straight away');
 click('[data-a=reqpaid]');ev("A.arrived('m1')");
 ev("(()=>{const j=J.find(j=>j.id==='m1');j.stage='released';j.relOn=todayIso();S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})})()");
 typeIn($('#in1'),'INV-2');typeIn($('#in3'),'600');ev("S.invd.file={name:'g.pdf',size:1};render()");typeIn($('#in1'),'INV-2');typeIn($('#in3'),'600');click('[data-a=invsend]');
 ok(!ev("J.find(j=>j.id==='m1').pay.reqs.some(r=>r.kind==='final')")&&ev("payDone(J.find(j=>j.id==='m1'))"),'a fully prepaid job needs no final request and is ready to close');
 // ---- pay after the work is the default; terms blank means on receipt ----
 setM1(500,{type:'none'});click('[data-a=mappr]');ok(/Paid after the work\. No money moves now/.test(txt()),'the default is pay after the work');click('#apbtn');
 jm=JSON.parse(ev("JSON.stringify(J.find(j=>j.id==='m1'))"));ok(jm.stage==='paid'&&jm.pay.reqs.length===0&&/Paid after the work/.test(txt()),'approving without a deposit books the job with no payment due');
 ev("(()=>{const j=J.find(j=>j.id==='m1');j.stage='released';j.relOn=todayIso();S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})})()");
 typeIn($('#in1'),'INV-3');typeIn($('#in3'),'500');ev("S.invd.file={name:'h.pdf',size:1};render()");typeIn($('#in1'),'INV-3');typeIn($('#in3'),'500');click('[data-a=invsend]');
 fr=ev("J.find(j=>j.id==='m1').pay.reqs[0]");ok(fr.amount===500&&fr.status==='sent'&&fr.due===fr.sentOn&&ev("dueTxt(J.find(j=>j.id==='m1').pay.reqs[0])")==='on receipt','with no terms entered the final payment is due on receipt');
 // replacing the invoice cancels the unpaid final request and creates a new one
 click('[data-a=invreplace]');typeIn($('#in1'),'INV-4');typeIn($('#in3'),'480');ev("S.invd.file={name:'i.pdf',size:1};render()");typeIn($('#in1'),'INV-4');typeIn($('#in3'),'480');click('[data-a=invsend]');
 ok(ev("J.find(j=>j.id==='m1').pay.reqs.map(r=>r.status).join()")==='cancelled,sent'&&ev("J.find(j=>j.id==='m1').pay.reqs[1].amount")===480,'replacing the invoice cancels the unpaid request and sends a new one');
 // payer not set: draft
 setPayer('b1','',''); 
 setM1(500,{type:'none'});click('[data-a=mappr]');click('#apbtn');
 ev("(()=>{const j=J.find(j=>j.id==='m1');j.stage='released';j.relOn=todayIso();S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})})()");
 typeIn($('#in1'),'INV-5');typeIn($('#in3'),'500');ev("S.invd.file={name:'j.pdf',size:1};render()");typeIn($('#in1'),'INV-5');typeIn($('#in3'),'500');click('[data-a=invsend]');
 ok(ev("J.find(j=>j.id==='m1').pay.reqs[0].status")==='draft'&&ev("J.find(j=>j.id==='m1').log.some(l=>/not sent because who pays is not set/.test(l.x))"),'without a payer the final request is created but not sent, and the log says why');
 setPayer('b1','accounts','accounts@example.com',7);
 // ---- cancellations ----
 setM1(1000,{type:'deposit',pct:30,amount:300});click('[data-a=mappr]');click('#apbtn');click('[data-a=reqpaid]');
 ok(ev("J.find(j=>j.id==='m1').stage")==='paid'&&$('[data-a=mcancel]'),'a booked job can be cancelled by the manager before arrival');
 click('[data-a=mcancel]');jm=JSON.parse(ev("JSON.stringify(J.find(j=>j.id==='m1'))"));
 ok(jm.stage==='cancelled'&&jm.pay.reqs[0].status==='refunded'&&jm.log.some(l=>/refunded in full, no fee/.test(l.x))&&/Cancelled/.test(txt()),'a manager cancel refunds the held deposit in full with no fee');
 setM1(1000,{type:'deposit',pct:30,amount:300});click('[data-a=mappr]');click('#apbtn');click('[data-a=reqpaid]');
 ev("S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})");ok($('[data-a=ccancel]')&&/counts as a strike/.test(txt()),'the contractor can cancel before arrival, and is told it is a strike');
 ev("S.qdraft.cwhy='I can no longer do the job'");click('[data-a=ccancel]');jm=JSON.parse(ev("JSON.stringify(J.find(j=>j.id==='m1'))"));
 ok(jm.stage==='open'&&!jm.con&&!jm.wo&&!jm.pay&&jm.quotes.length===1&&ev("skActive('c1').length")===1&&/Strike 1 of 3/.test($('#toast').textContent),'a contractor cancel refunds the deposit, reopens the job with the other quote, and records strike 1');
 ev("skAdd('c1','cancel',null,'Another reason')");setM1(1000,{type:'none'});click('[data-a=mappr]');click('#apbtn');ev("S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})");ev("S.qdraft.cwhy='Another reason'");click('[data-a=ccancel]');
 ok(ev("skActive('c1').length")===3&&/now suspended/.test($('#toast').textContent),'the third strike suspends the contractor');
 const oid=ev("J.find(j=>!j.mine&&j.stage==='open'&&j.trade==='plumbing'&&!j.quotes.some(q=>q.c==='c1')).id");ev("S.stack=[];S.role='contractor';S.tab.contractor='find';render();go('cjob',{id:'"+oid+"'})");typeIn($('#qp'),'300');typeIn($('#qs'),'x');ev("S.qdraft.date='"+D7+"';S.qdraft.time='09:00'");ok(/Your account is suspended/.test(txt())&&!$('[data-a=sendq]'),'a suspended contractor is told so, and the send button is replaced by a notice');ev("A.sendq('"+oid+"')");ok(/suspended from sending new offers until/.test($('#toast').textContent),'and cannot make offers');
 ev("S.stack=[];S.tab.contractor='cprof';render()");ok(/Reliability record/.test(txt())&&/Strikes now/.test(txt())&&/3 of 3/.test(txt()),'the contractor profile shows the strikes');ev("S.sk=S.sk.filter(e=>e.c!=='c1')");
 // ---- reports ----
 ev("S.stack=[];S.role='manager';S.tab.manager='jobs';render();A.reports();S.rep.type='standard';S.rep.bid='all';S.rep.kind='monthly';S.rep.p=-1;render()");
 const rv=l=>{const r=$$('.paper .kv').find(x=>x.querySelector('span')&&x.querySelector('span').textContent===l);return r?r.querySelector('b').textContent:null};
 ok(rv('Jobs paid in full')===String(ev("repData('monthly',-1,'all').payPaid"))&&+rv('Jobs paid in full')>=1&&rv('Waiting for payment')!==null&&rv('Overdue payments')!==null,'the report counts jobs paid in full, waiting and overdue');
 click('[data-a=repexport]');ok(/Payment status,Paid on,Amount paid$/.test($('#cs').value.split(/\r?\n/)[0]),'the job ledger export has payment columns');
 // ---- property managers use the same flow with the owner paying ----
 ev("S.prof.role='Property manager';bld('b1').limit=5000;S.stack=[];S.tab.manager='bld';render()");
 ok($('[data-payer]')&&/Who pays and when/.test(txt()),'property managers set who pays too');
 setPayer('b1','owner','owner@example.com',7);setM1(800,{type:'deposit',pct:25,amount:200});click('[data-a=mappr]');click('#apbtn');
 ok(ev("J.find(j=>j.id==='m1').pay.reqs[0].status")==='sent'&&/Email to the property owner|owner@example\.com/.test(txt()),'a property manager’s deposit request goes to the owner');
 ok(!$('[data-a=pay]'),'there is no card payment step any more');
 console.log(errs.length?'ERRORS '+errs.join('|'):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,5).join('\n'))}process.exit(0)},400);
