const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync((process.env.APP||require('path').join(__dirname,'..','taskspeck-managers.html')),'utf8');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message))}});
const w=dom.window,d=w.document;let fail=0;
const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const $=s=>d.querySelector(s),$$=s=>[...d.querySelectorAll(s)],ev=c=>w.eval(c),txt=()=>$('#view').textContent;
const click=s=>{const e=typeof s==='string'?$(s):s;if(!e)throw new Error('missing '+s);e.click()};
const typeIn=(s,v)=>{const e=$(s);if(!e)throw new Error('missing '+s);e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}))};
const J1=p=>ev("JSON.parse(JSON.stringify(J.find(j=>j.id==='m1')))"+(p||''));
setTimeout(()=>{try{
 ev("S.prof.role='Building manager';S.prof.pay='bank';S.prof.consent=true;S.stack=[];['b1','b2','b3'].forEach(b=>{bld(b).tiers=[{limit:1000,quotes:1},{limit:4999,quotes:2},{limit:30000,quotes:3}];bld(b).payer='accounts';bld(b).payEmail='a@example.com';bld(b).terms=14})");
 const book=(price,urg,stage)=>ev("(()=>{const j=J.find(j=>j.id==='m1');const q={...j.quotes[0],price:"+price+",date:addBiz(todayIso(),5),time:'09:00',dep:{type:'none'}};j.bid='b1';j.quotes=[q];j.quote=q;j.con=q.c;j.price="+price+";j.base="+price+";j.stage='"+(stage||'paid')+"';j.wo='WO-1100';j.pay={reqs:[]};j.vars=[];j.msgs=[];j.invHist=[];j.settled=null;j.inv=null;j.invHold=null;j.invReturned=null;j.closed=false;j.live=null;j.urgency='"+(urg||'Standard')+"';j.tier=tierOf(bld('b1'),"+price+");j.log=[];j.appr={};S.qdraft={};S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})})()");
 const openJob=()=>ev("(()=>{const j=J.find(j=>j.id==='m1');const q={...j.quotes[0],price:500,date:addBiz(todayIso(),5),time:'09:00',dep:{type:'none'}};j.bid='b1';j.quotes=[q];j.quote=null;j.con=null;delete j.wo;delete j.price;j.stage='open';j.pay=undefined;j.vars=[];j.msgs=[];j.log=[];S.qdraft={};S.stack=[];S.role='contractor';S.tab.contractor='find';S.find.view='list';render();go('cjob',{id:'m1'})})()");
 const asMgr=()=>ev("S.stack=[];S.role='manager';S.tab.manager='jobs';render();go('mjob',{id:'m1'})");
 const asCon=(open)=>ev("S.stack=[];S.role='contractor';S.tab.contractor='"+(open?'find':'cactive')+"';render();go('"+(open?'cjob':'cwork')+"',{id:'m1'})");
 const request=(amt,why)=>{typeIn('#vxa',String(amt));typeIn('#vxr',why);click('[data-a=xphoto]');typeIn('#vxa',String(amt));typeIn('#vxr',why);click('[data-a=xsend]')};
 const invoice=(no,amt)=>{ev("S.invd={jobId:'m1',no:'"+no+"',date:todayIso(),amount:'"+amt+"',file:{name:'f.pdf',size:1}};A.invsend('m1')")};
 const send=(sel,text)=>{typeIn(sel,text);click('[data-a=msgsend]')};
 // ================= 1. messages =================
 openJob();ok(/Messages/.test(txt())&&/Ask the manager a question/.test(txt())&&/Phone numbers and emails cannot be shared before the job is booked/.test(txt())&&$('#mcm1'),'a contractor can ask the manager a question on an open job');
 click('[data-a=msgsend]');ok(/Write a message first/.test($('#toast').textContent),'an empty message is refused');
 send('#mcm1','Call me on 0412 345 678');ok(/Phone numbers and emails cannot be shared/.test($('#toast').textContent)&&J1('.msgs.length')===0,'a phone number is refused before booking');
 send('#mcm1','Email me at tradie@example.com');ok(/Phone numbers and emails cannot be shared/.test($('#toast').textContent)&&J1('.msgs.length')===0,'an email address is refused before booking');
 send('#mcm1','Is the lift free on 2026-11-14 09:00 for the tools?');ok(J1('.msgs.length')===1&&/Message sent/.test($('#toast').textContent),'a normal message with a date is sent');
 ok(/Is the lift free/.test(txt())&&!$('#mcm1').value,'it appears in the thread and the box is cleared');
 typeIn('#mcm1','x'.repeat(501));click('[data-a=msgsend]');ok(/under 500 characters/.test($('#toast').textContent),'a message over 500 characters is refused');
 // manager sees it
 ev("S.stack=[];S.role='manager';S.tab.manager='jobs';render()");
 ok(/New message/.test($('#view').textContent)&&ev("needsMe(J.find(j=>j.id==='m1'))"),'the manager’s Jobs list shows New message and the job needs them');
 asMgr();ok(/Messages/.test(txt())&&/Is the lift free/.test(txt())&&/Aqua Flow Plumbing/.test(txt())&&/1 new/.test(txt()),'the manager sees the message in a thread with the contractor’s name');
 ev("S.stack=[];render();go('mjob',{id:'m1'})");ok(!/1 new/.test(txt())&&ev("unreadFor(J.find(j=>j.id==='m1'),'manager')")===0,'once read, the new badge goes');
 send('#mmm1c1','Yes, the lift is free that morning.');ok(J1('.msgs.length')===2&&J1('.msgs[1].from')==='manager','the manager can reply');
 // contractor sees reply and a badge
 ev("S.stack=[];S.role='contractor';S.tab.contractor='cquotes';render()");ok(/New message/.test($('#view').textContent),'the contractor’s My offers list shows New message');
 asCon(true);ok(/Yes, the lift is free/.test(txt())&&ev("unreadFor(J.find(j=>j.id==='m1'),'contractor')")===0,'the contractor reads the reply');
 // privacy between contractors
 ev("J.find(j=>j.id==='m1').msgs.push({id:'m9',c:'c2',from:'contractor',text:'Secret price talk from another contractor',tt:'now',ctx:null,r:{}})");asCon(true);ok(!/Secret price talk/.test(txt()),'a contractor cannot see another contractor’s messages');
 asMgr();ok(/Secret price talk/.test(txt())&&/Is the lift free/.test(txt()),'the manager sees every contractor’s thread separately');
 // after booking
 book(1000);send('#mcm1','My number is 0412 345 678 if the gate is stuck');ok(J1('.msgs.length')===1&&/Message sent/.test($('#toast').textContent)&&!/Phone numbers and emails cannot be shared before/.test(txt()),'after booking, phone numbers are allowed');
 ev("(()=>{const j=J.find(j=>j.id==='m1');j.con='c3'})()");asCon();ok(/Messages/.test(txt())&&!$('#mcm1'),'a contractor who was not chosen can read but not write');
 // ================= extra-work question =================
 book(1000);request(1,'Rotten pipe behind the wall');asMgr();
 click('[data-a=varq]');ok(/Write your question first/.test($('#toast').textContent),'an empty question is refused');
 typeIn('input[data-m="qdraft.xqq"]','Can you send a wider photo of the pipe?');click('[data-a=varq]');
 const m=J1('.msgs[0]');ok(m&&m.ctx&&m.ctx.k==='var'&&m.from==='manager'&&J1('.vars[0].asked')===true&&/You asked a question/.test(txt())&&/about WO-1100-V1/.test(txt()),'asking a question about an extra sends a message tied to that extra');
 asCon();ok(/The manager asked you a question/.test(txt())&&/Can you send a wider photo/.test(txt())&&/about WO-1100-V1/.test(txt()),'the contractor sees the question on the extra and in the thread');
 send('#mcm1','Here is the photo description: the pipe is rotten for 40 cm.');asMgr();ok(/rotten for 40 cm/.test(txt()),'the contractor’s answer reaches the manager');
 // ================= 2. reject and return =================
 book(1000,'Standard','released');invoice('INV-1','1500');
 asMgr();ok(/Ask the contractor to correct the invoice/.test(txt())&&/Reject the invoice \(you will not pay it\)/.test(txt())&&/Ask the contractor to correct it:.*Reject it:/.test(txt()),'a held invoice has Ask to correct and Reject as separate buttons, each explained');
 typeIn('#ivw','Not what we approved');click('[data-a=invreject]');
 ok(J1('.invReturned.kind')==='rejected'&&J1('.invHist[0].kind')==='rejected'&&J1('.inv')===null&&J1('.log').some(l=>/The manager rejected invoice INV-1: Not what we approved/.test(l.x)),'rejecting records it as rejected, with the reason, and removes the invoice');
 asCon();ok(/The manager rejected invoice INV-1/.test(txt())&&/Not what we approved/.test(txt())&&$('#in1'),'the contractor sees it was rejected and can upload a new one');
 invoice('INV-2','1500');asMgr();typeIn('#ivw','Please correct');click('[data-a=invreturn]');ok(J1('.invReturned.kind')==='returned'&&J1('.invHist.length')===2,'returning records it as returned');asCon();ok(/The manager asked you to correct invoice INV-2/.test(txt()),'the contractor sees it was returned');
 // ================= 3. pay the approved amount, hold the extra =================
 book(1000,'Standard','released');invoice('INV-3','1500');asMgr();
 ok(/Pay the approved amount now \(\$1,000\) and leave the extra unpaid for now/.test(txt())&&!/Close at the approved amount/.test(txt()),'a held invoice offers to pay the approved amount now');
 click('[data-a=invpartial]');let r=J1('.pay.reqs[0]');
 ok(r.kind==='final'&&r.amount===1000&&r.part===true&&r.status==='sent'&&J1('.invHold.partial')===true&&J1('.invHold.over')===500,'the payer is asked for the approved $1,000 and the $500 stays held');
 ok(/Approved amount requested, extra not yet requested/.test(txt())&&!$('[data-a=closejob]')&&!$('[data-a=invpartial]'),'the manager sees the extra is held, and cannot close');
 asCon();ok(/The approved amount was requested\. Your extra has not been requested yet/.test(txt())&&/\$500/.test(txt()),'the contractor sees the same');
 asMgr();click('[data-a=reqpaid]');ok(/Close at the approved amount \(the extra \$500 is not paid\)/.test(txt())&&!$('[data-a=closejob]'),'once the approved amount is paid, the manager can close at the approved amount');
 click('[data-a=invsettle]');ok(J1('.invHold')===null&&J1('.settled.over')===500&&/Ready to close/.test(txt())&&$('[data-a=closejob]')&&J1('.log').some(l=>/settled at the approved amount\. The extra \$500 was not paid/.test(l.x)),'settling closes the hold and the job is ready to close');
 asCon();ok(/settled at the approved amount/.test(txt())&&/The extra \$500 was not paid/.test(txt()),'the contractor is told');
 ok(ev("reqsOf(J.find(j=>j.id==='m1')).filter(r=>r.status==='paid').reduce((s,r)=>s+feeOf(r.amount).fee,0)")===150,'the 15% fee was taken only on the $1,000 paid');
 // extra approved releases the held part
 book(1000,'Standard','released');invoice('INV-4','1500');asMgr();click('[data-a=invpartial]');click('[data-a=reqpaid]');
 asCon();request(500,'Extra pipe and labour found');asMgr();
 ok(/\$1,500/.test(txt())&&/Needs 1 more quote/.test(txt()),'the held excess can only be paid through an extra that follows the budget rule');
 click('[data-a=varsample]');click('[data-a=varappr]');click('[data-a=varapprove]');
 ok(J1('.invHold')===null&&J1('.price')===1500&&J1('.pay.reqs.length')===2&&J1('.pay.reqs[1].amount')===500&&J1('.pay.reqs[1].status')==='sent'&&J1('.log').some(l=>/now matches the approved total/.test(l.x)),'approving the extra releases the hold and requests the remaining $500');
 click('[data-a=reqpaid]');ok(/Ready to close/.test(txt())&&ev("paidSum(J.find(j=>j.id==='m1'))")===1500,'once the remaining $500 is paid the job is ready to close with $1,500 paid');
 // prepaid cases
 book(1000,'Standard','released');ev("(()=>{const j=J.find(j=>j.id==='m1');const r=newReq(j,'proforma',1000,{iso:todayIso(),hm:'09:00',soon:true});r.status='paid';r.paidOn=todayIso();r.held=true;r.releasedOn=todayIso()})()");invoice('INV-5','1200');asMgr();
 ok(!$('[data-a=invpartial]')&&/Close at the approved amount \(the extra \$200 is not paid\)/.test(txt()),'when the approved amount is already paid, only Close at the approved amount is offered');
 click('[data-a=invsettle]');ok(J1('.invHold')===null&&/Ready to close/.test(txt()),'and it closes');
 book(1000,'Standard','released');ev("(()=>{const j=J.find(j=>j.id==='m1');const r=newReq(j,'deposit',300,{iso:todayIso(),hm:'09:00',soon:true});r.status='paid';r.paidOn=todayIso();r.held=true;r.releasedOn=todayIso()})()");invoice('INV-6','1500');asMgr();
 ok(/Pay the approved amount now \(\$700\)/.test(txt()),'with a $300 deposit paid, the approved amount still to pay is $700');
 click('[data-a=invpartial]');ok(J1('.pay.reqs[1].amount')===700,'and the request is for $700');
 // ================= 4. reports =================
 const prev=ev("addYm(todayIso().slice(0,7),-1)");
 book(1000,'Standard','released');invoice('INV-7','1500');ev("(()=>{const j=J.find(j=>j.id==='m1');j.quote.date='"+prev+"-10'})()");
 ev("(()=>{const j=J.find(j=>j.id==='m1');j.invHist=[{no:'INV-OLD',amount:900,over:400,kind:'rejected',reason:'Above the approved total',on:'"+prev+"-12'},{no:'INV-OLD2',amount:800,over:300,kind:'returned',reason:'Wrong building',on:'"+prev+"-13'}];j.settled=null})()");
 ev("S.stack=[];S.role='manager';S.tab.manager='jobs';render();A.reports();S.rep.bid='b1';S.rep.ym='"+prev+"';render()");
 let P=$('.paper').textContent;
 ok(/Invoice variances/.test(P)&&/held for review/.test(P)&&/invoice \$1,500 against approved \$1,000/.test(P)&&/\+\$500/.test(P),'the Monthly Maintenance Report lists the held invoice with the invoice, the approved total and the excess');
 ok(/invoice INV-OLD rejected: Above the approved total/.test(P)&&/invoice INV-OLD2 sent back to correct: Wrong building/.test(P),'and the rejected and returned invoices with their reasons');
 ev("(()=>{const j=J.find(j=>j.id==='m1');j.invHold=null;j.settled={over:200,on:'"+prev+"-14'}})()");ev("render()");P=$('.paper').textContent;ok(/settled at the approved amount, the extra was not paid/.test(P),'and an invoice settled at the approved amount');
 ev("J.find(j=>j.id==='m1').invHold={kind:'above',over:500};S.rep.type='standard';S.rep.bid='all';S.rep.kind='monthly';S.rep.p=-1;render()");
 const rv=l=>{const r=$$('.paper .kv').find(x=>x.querySelector('span')&&x.querySelector('span').textContent===l);return r?r.querySelector('b').textContent:null};
 const rd=ev("repData('monthly',-1,'all')");ok(rv('Invoices held for review')===String(rd.invHeld)&&+rv('Invoices held for review')>=1&&rv('Invoices rejected')===String(rd.invRej)&&+rv('Invoices rejected')>=1&&rv('Invoices sent back to correct')===String(rd.invRet)&&+rv('Invoices sent back to correct')>=1,'the summary report counts invoices held, rejected and sent back to correct');
 click('[data-a=repexport]');const hdr=$('#cs').value.split(/\r?\n/)[0];ok(/Invoice matches,Invoice variance,Invoice review,Status,Approved extras,Payment status,Paid on,Amount paid$/.test(hdr),'the job ledger export has Invoice variance and Invoice review columns');
 const rows=$('#cs').value.split(/\r?\n/);const hi=hdr.split(',').indexOf('Invoice review'),vi=hdr.split(',').indexOf('Invoice variance');const mr=rows.find(r=>/Leaking tap/.test(r));ok(mr&&/Held for review|rejected and returned|rejected/.test(mr),'the held job shows its review status in the export ('+(mr?mr.split(',').slice(vi,hi+1).join(' | '):'row not found')+')');
 console.log(errs.length?'ERRORS '+errs.join('|'):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,5).join('\n'))}process.exit(0)},400);
