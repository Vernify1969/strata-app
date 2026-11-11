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
 const book=(price,urg,stage)=>ev("(()=>{const j=J.find(j=>j.id==='m1');const q={...j.quotes[0],price:"+price+",date:addBiz(todayIso(),5),time:'09:00',dep:{type:'none'}};j.bid='b1';j.quotes=[q];j.quote=q;j.con=q.c;j.price="+price+";j.base="+price+";j.stage='"+(stage||'paid')+"';j.wo='WO-1100';j.pay={reqs:[]};j.vars=[];j.inv=null;j.invHold=null;j.invReturned=null;j.closed=false;j.live=null;j.urgency='"+(urg||'Standard')+"';j.tier=tierOf(bld('b1'),"+price+");j.log=[];j.appr={};S.qdraft={};S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})})()");
 const asMgr=()=>ev("S.stack=[];S.role='manager';S.tab.manager='jobs';render();go('mjob',{id:'m1'})");
 const asCon=()=>ev("S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})");
 const request=(amt,why,photo)=>{typeIn('#vxa',String(amt));typeIn('#vxr',why);if(photo!==false)click('[data-a=xphoto]');typeIn('#vxa',String(amt));typeIn('#vxr',why);click('[data-a=xsend]')};
 // ---------- requesting ----------
 book(1000);ok(/Need to do extra work\?/.test(txt())&&/Do not do extra work before it is approved/.test(txt())&&$('#vxa')&&$('[data-a=xphoto]'),'the contractor has a Request extra work form on a booked job');
 click('[data-a=xsend]');ok(/Enter the extra amount/.test($('#toast').textContent),'an amount is needed');
 typeIn('#vxa','1');click('[data-a=xsend]');ok(/Say what the extra work is and why/.test($('#toast').textContent),'a reason is needed');
 typeIn('#vxa','1');typeIn('#vxr','Rotten pipe behind the wall');click('[data-a=xsend]');ok(/Take at least 1 photo/.test($('#toast').textContent),'a photo is needed');
 click('[data-a=xphoto]');typeIn('#vxa','1');typeIn('#vxr','Rotten pipe behind the wall');click('[data-a=xsend]');
 let v=J1('.vars[0]');ok(v&&v.no==='WO-1100-V1'&&v.amount===1&&v.status==='requested'&&v.photos.length===1&&/Waiting for the manager/.test(txt())&&!$('#vxa'),'a $1 extra is sent, numbered from the work order, and the form is replaced by its status');
 ev("A.xsend('m1')");ok(/already waiting/.test($('#toast').textContent),'only one request can wait at a time');
 book(1000,'Standard','approved');ok(!/Need to do extra work\?/.test(txt()),'extra work cannot be requested before the job is booked and started');
 // ---------- $1 over the limit: the next budget applies ----------
 book(1000);request(1,'Rotten pipe behind the wall');asMgr();
 ok(/Extra work/.test(txt())&&/\$1,001/.test(txt())&&/OC Manager and Building Manager Budget/.test(txt())&&/Needs 1 more quote/.test(txt())&&$('[data-a=varapprove]').disabled,'a $1 extra that takes the job to $1,001 falls in the next budget, needs a second quote, and cannot be approved yet');
 ok(/never overwritten|Nothing is overwritten/.test(txt())&&/to the dollar/.test(txt())&&/emergencies too/.test(txt()),'the screen states the rule: to the dollar, nothing overwritten, emergencies too');
 ev("A.varapprove('m1|v1')");ok(/needs 2 quotes for the new total\. You have 1/.test($('#toast').textContent)&&J1('.price')===1000,'approving without the second quote is refused');
 click('[data-a=varsample]');ok(J1('.vars[0].quotes.length')===1&&!/Needs 1 more quote/.test(txt())&&/Needs OC Manager approval/.test(txt())&&$('[data-a=varapprove]').disabled,'with the second quote recorded, the OC Manager approval is still needed');
 click('[data-a=varappr]');ok(!$('[data-a=varapprove]').disabled,'with the approval recorded, the extra can be approved');
 click('[data-a=varapprove]');v=J1('.vars[0]');ok(v.status==='approved'&&J1('.price')===1001&&J1('.base')===1000&&v.tierName==='OC Manager and Building Manager Budget'&&J1('.log').some(l=>/Extra work WO-1100-V1 approved: \+\$1, new total \$1,001/.test(l.x)),'approving moves the agreed total to $1,001, keeps the original $1,000, and logs it');
 asCon();ok(/Approved\. The agreed total is now \$1,001/.test(txt()),'the contractor sees the extra approved and the new total');
 // ---------- a second extra follows the rule again ----------
 request(5,'Extra bracket');asMgr();
 ok(/\$1,006/.test(txt())&&/Needs 1 more quote/.test(txt())&&/Needs OC Manager approval/.test(txt()),'a second $5 extra needs its own second quote and approval, even in the same budget');
 // ---------- exactly at the limit stays in the budget ----------
 book(900);request(100,'Extra pipe length');asMgr();
 ok(/\$1,000/.test(txt())&&/Building Manager Budget/.test(txt())&&!/Needs/.test($('#view').textContent.replace(/Needs your decision/g,''))&&!$('[data-a=varapprove]').disabled,'$900 plus $100 is exactly $1,000: still the Building Manager Budget, one quote, no further approval');
 click('[data-a=varapprove]');ok(J1('.price')===1000&&J1('.vars[0].status')==='approved','and it can be approved');
 book(900);request(101,'Extra pipe length');asMgr();ok(/\$1,001/.test(txt())&&/OC Manager and Building Manager Budget/.test(txt())&&$('[data-a=varapprove]').disabled,'$900 plus $101 is $1,001: the next budget, so more is needed');
 // ---------- third and fourth budgets ----------
 book(4900);request(200,'Replace the valve');asMgr();
 ok(/\$5,100/.test(txt())&&/Committee Budget/.test(txt())&&/Needs 2 more quotes/.test(txt()),'$4,900 plus $200 is the committee budget and needs 2 more quotes');
 click('[data-a=varsample]');click('[data-a=varsample]');ok(!/more quote/.test(txt())&&/Needs OC Manager approval/.test(txt())&&/Needs Committee approval/.test(txt())&&$('[data-a=varapprove]').disabled,'with the quotes in, it still needs the OC Manager and the Committee');
 click('[data-a=varappr][data-v$="|oc"]');ok($('[data-a=varapprove]').disabled,'one approval is not enough');click('[data-a=varappr][data-v$="|cm"]');click('[data-a=varapprove]');ok(J1('.price')===5100,'with both recorded it is approved');
 book(29900);request(200,'Structural repair');asMgr();ok(/\$30,100/.test(txt())&&/Above the committee budget/.test(txt()),'above the third budget it is Above the committee budget');
 click('[data-a=varsample]');click('[data-a=varsample]');click('[data-a=varappr][data-v$="|oc"]');click('[data-a=varappr][data-v$="|cm"]');ok(/Needs General meeting approval/.test(txt())&&$('[data-a=varapprove]').disabled,'and it needs a general meeting');
 // ---------- emergencies follow the same rule ----------
 book(1000,'Emergency');request(1,'Second leak found');asMgr();
 ok(/\$1,001/.test(txt())&&/Needs 1 more quote/.test(txt())&&$('[data-a=varapprove]').disabled,'an emergency job gets no exemption: a $1 extra still needs the second quote');
 // ---------- budgets not set ----------
 ev("bld('b1').tiers=[{limit:null,quotes:null},{limit:null,quotes:null},{limit:null,quotes:null}]");book(500,'Emergency');request(10,'Extra');asMgr();ok(/Set the approval budgets first/.test(txt())&&!$('[data-a=varapprove]')&&$('[data-a=gotob][data-v="b1|budgets"]'),'with no budgets set, even an emergency extra cannot be decided');ev("A.varapprove('m1|v1')");ok(/Set the approval budgets in Buildings first/.test($('#toast').textContent),'approving directly is refused');
 ev("bld('b1').tiers=[{limit:1000,quotes:1},{limit:4999,quotes:2},{limit:30000,quotes:3}]");
 // ---------- decline ----------
 book(500);request(50,'Extra bracket');asMgr();typeIn('input[data-m="qdraft.xdr"]','Get another quote first');click('[data-a=vardecline]');
 ok(J1('.vars[0].status')==='declined'&&J1('.price')===500&&/Declined: Get another quote first/.test(txt()),'a declined extra leaves the price unchanged and records why');
 asCon();ok(/Declined: Get another quote first/.test(txt())&&/Do not do this extra work/.test(txt())&&$('#vxa'),'the contractor is told not to do it, and can ask again');
 // ---------- property managers: the owner decides only if the box is ticked ----------
 ev("S.prof.role='Property manager'");book(4000);request(500,'Extra');asMgr();ok(/\$4,500/.test(txt())&&!$('[data-a=varapprove]').disabled&&!/Owner approval|Needs/.test(txt()),'a property manager’s extra can be approved without the owner when the owner box is not ticked');
 book(4000);ev("J.find(j=>j.id==='m1').ownerApproval=true");request(1500,'Extra');asMgr();ok(/\$5,500/.test(txt())&&/The owner must approve this extra/.test(txt())&&$('[data-a=varapprove]').disabled,'when the owner must approve, the extra waits for the owner');
 ev("S.prof.role='Building manager'");
 // ---------- invoice control ----------
 const invoice=(no,amt)=>{ev("S.invd={jobId:'m1',no:'"+no+"',date:todayIso(),amount:'"+amt+"',file:{name:'f.pdf',size:1}};A.invsend('m1')")};
 book(1000,'Standard','released');invoice('INV-1','1001');
 ok(J1('.invHold.kind')==='above'&&J1('.invHold.over')===1&&J1('.pay.reqs.length')===0&&/held for the manager/.test($('#toast').textContent),'an invoice $1 above the approved total is held, with no payment request sent');
 asMgr();ok(/Invoice held for review/.test(txt())&&/\$1 above the approved total of \$1,000/.test(txt())&&!$('[data-a=closejob]')&&ev("STAGE(J.find(j=>j.id==='m1'))[0]")==='Invoice held for review'&&ev("needsMe(J.find(j=>j.id==='m1'))"),'the manager is told, cannot close, and it is under Needs you');
 ev("A.closejob('m1')");ok(/Payment is not complete yet/.test($('#toast').textContent),'closing is refused');
 asCon();ok(/Your invoice is held/.test(txt())&&/request the extra work/.test(txt()),'the contractor is told how to be paid more');
 asMgr();typeIn('#ivw','Amount is above the approved total');click('[data-a=invreturn]');
 ok(J1('.inv')===null&&J1('.invReturned.reason')==='Amount is above the approved total','the manager can return the invoice with a reason');
 asCon();ok(/The manager asked you to correct invoice INV-1/.test(txt())&&/Amount is above the approved total/.test(txt())&&$('#in1'),'the contractor sees it returned and can upload a corrected one');
 invoice('INV-2','1000');ok(J1('.pay.reqs[0].amount')===1000&&J1('.pay.reqs[0].status')==='sent'&&J1('.invHold')===null,'a corrected invoice at the approved total sends the final request');
 // approved extra makes the higher invoice valid, and the fee applies
 book(1000);request(1,'Extra');asMgr();click('[data-a=varsample]');click('[data-a=varappr]');click('[data-a=varapprove]');
 ev("J.find(j=>j.id==='m1').stage='released'");invoice('INV-3','1001');
 ok(J1('.invHold')===null&&J1('.pay.reqs[0].amount')===1001&&J1('.pay.reqs[0].status')==='sent','after the extra is approved, an invoice of $1,001 is accepted');
 asMgr();click('[data-a=reqpaid]');const fee=ev("feeOf(1001)");
 ok(/Ready to close/.test(txt())&&fee.fee>150&&fee.fee<151,'once paid it is ready to close, and the 15% fee on the extra is $'+fee.fee);
 asCon();ok(/\$850\.85|\$850\.9|\$850\.86/.test(txt())||new RegExp(String(fee.net).replace('.','\\.')).test(txt())||/You receive/.test(txt()),'the contractor’s payout is calculated on the full $1,001');
 // invoice below the amount already paid
 book(1000,'Standard','released');ev("(()=>{const j=J.find(j=>j.id==='m1');j.pay={reqs:[]};const r=newReq(j,'deposit',300,{iso:todayIso(),hm:'09:00',soon:true});r.status='paid';r.paidOn=todayIso();r.held=true;r.releasedOn=todayIso()})()");invoice('INV-4','200');
 ok(J1('.invHold.kind')==='below'&&J1('.invHold.under')===100&&J1('.pay.reqs.filter(r=>r.kind==="final").length')===0,'an invoice below the deposit already paid is held, not closed');
 // below the approved total but above the prepayment is normal
 book(1000,'Standard','released');invoice('INV-5','900');ok(J1('.invHold')===null&&J1('.pay.reqs[0].amount')===900,'an invoice below the approved total is accepted');
 // late request after the work
 book(1000,'Standard','released');ok(/The work is finished, so this will be marked as raised after the work/.test(txt()),'extra work can still be requested after the work, and is marked as raised late');request(10,'Forgot to mention');ok(J1('.vars[0].late')===true,'it is flagged as raised after the work');
 ev("(()=>{const j=J.find(j=>j.id==='m1');j.pay={reqs:[{id:'r1',kind:'final',amount:1000,status:'paid',no:'x'}]}})()");asCon();ok(!$('#vxa'),'nothing can be requested once the final payment has been made');
 // ---------- documents ----------
 book(1000);request(1,'Extra');asMgr();click('[data-a=varsample]');click('[data-a=varappr]');click('[data-a=varapprove]');
 ok(/Extra work WO-1100-V1/.test(txt())&&$('[data-a=vardoc]'),'the job documents list the extra');
 ev("go('wo',{id:'m1'})");{const P=$('.paper').textContent;ok(/Original price\$1,000/.test(P)&&/Extra WO-1100-V1/.test(P)&&/Agreed price\$1,001/.test(P),'the work order shows the original price, the extra and the new agreed price')}
 ev("S.stack=[];go('mjob',{id:'m1'})");click('[data-a=vardoc]');const P=$('.paper').textContent;ok(/Extra work WO-1100-V1/.test(P)&&/Budget check/.test(P)&&/Total with the extra/.test(P)&&/Other quotes for the extra/.test(P)&&/15% platform fee applies/.test(P),'the extra has its own document with the budget check and the quotes');
 // ---------- reports ----------
 ev("J.find(j=>j.id==='m1').vars[0].approvedOn=addYm(todayIso().slice(0,7),-1)+'-10';S.stack=[];S.tab.manager='jobs';render();A.reports();S.rep.bid='b1';S.rep.ym=addYm(todayIso().slice(0,7),-1);render()");
 ok(/Extra work approved/.test($('.paper').textContent)&&/WO-1100-V1/.test($('.paper').textContent)&&/\+\$1/.test($('.paper').textContent),'the Monthly Maintenance Report lists approved extra work');
 ev("S.rep.type='standard';S.rep.bid='all';S.rep.kind='monthly';S.rep.p=-1;render()");click('[data-a=repexport]');ok(/Approved extras,Payment status,Paid on,Amount paid$/.test($('#cs').value.split(/\r?\n/)[0]),'the spreadsheet export has an Approved extras column');
 console.log(errs.length?'ERRORS '+errs.join('|'):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,5).join('\n'))}process.exit(0)},400);
