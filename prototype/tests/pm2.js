const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync((process.env.APP||require('path').join(__dirname,'..','taskspeck-managers.html')),'utf8');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message))}});
const w=dom.window,d=w.document;let fail=0;
const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const $=s=>d.querySelector(s),$$=s=>[...d.querySelectorAll(s)],ev=c=>w.eval(c),txt=()=>$('#view').textContent;
const click=s=>{const e=typeof s==='string'?$(s):s;if(!e)throw new Error('missing '+s);e.click()};
const chg=(el,v)=>{el.value=v;el.dispatchEvent(new w.Event('change',{bubbles:true}))};
const typeIn=(s,v)=>{const e=$(s);if(!e)throw new Error('missing '+s);e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}))};
const J1=p=>ev("JSON.parse(JSON.stringify(J.find(j=>j.id==='m1')))"+(p||''));
setTimeout(()=>{try{
 ev("S.prof.role='Property manager';S.prof.pay='bank';S.prof.consent=true;S.stack=[];S.tab.manager='bld';bld('b1').limit=5000;bld('b1').payer='owner';bld('b1').owner='M. Chen';bld('b1').ownerEmail='owner@example.com';render()");
 // ================= quotes: the property manager's choice, never a rule =================
 const G=$('.bsec[data-k="b1:budgets"]');
 ok(/Quotes you usually want for a job \(up to 3\)/.test(G.textContent)&&!$('[data-lim=b1]')&&$$('[data-pmq=b1] option').map(o=>o.value).join()==='1,2,3'&&$('[data-pmq=b1]').value==='1'&&/This is your choice, not a rule/.test(G.textContent)&&/Quotes$/.test(G.querySelector('.bsec-h b').textContent),'the property manager chooses up to 3 quotes in a Quotes section, with no approval limit to set, worded as a choice and not a rule');
 ok(/usually 1 quote/.test($('.bsec[data-k="b1:budgets"] .bsec-h').textContent)&&!/Limit/.test($('.bcard[data-b=b1]').textContent),'the group summary says usually 1 quote, and there is no limit pill');
 chg($('[data-pmq=b1]'),'2');ev("render()");ok(ev("bld('b1').pmQuotes")===2&&/usually 2 quotes/.test($('.bsec[data-k="b1:budgets"] .bsec-h').textContent),'choosing 2 is saved and shown');
 // the request asks how many quotes and whether the owner approves
 ev("S.tab.manager='mhome';S.stack=[];render();A.new();S.draft.bid='b1';S.step=5;render()");
 ok(/Quotes and owner approval/.test(txt())&&/How many quotes do you want for this job\? \(up to 3\)/.test(txt())&&/This is your choice, not a rule/.test(txt())&&$('select[data-m="draft.qwant"]').value==='2','the last step asks how many quotes are wanted, starting from the property’s setting');
 chg($('select[data-m="draft.qwant"]'),'3');ok(ev("S.draft.qwant")==='3','up to 3 can be chosen for this job');
 ok(/Send the quotes to the owner for approval \(optional\)/.test(txt())&&!$('input[data-m="draft.ownerAppr"]').checked,'and offers an optional box to send the quotes to the owner, unticked');
 const cb=$('input[data-m="draft.ownerAppr"]');cb.checked=true;cb.dispatchEvent(new w.Event('change',{bubbles:true}));ok(ev("S.draft.ownerAppr")===true,'the box can be ticked');
 ev("S.draft={title:'Test job',bid:'b1',trade:'plumbing',area:'x',safety:{},photos:0,video:false,urgency:'Standard',date:todayIso(),slot:'any',time:'09:00',flex:false,dl:'3d',materials:'',ins:'',swms:false,notice:'',hours:'',lift:'',po:'',tradeNote:'',instr:'',parking:'Yes',parkNote:'',access:null,qwant:'3',ownerAppr:true};S.role='manager';A.post()");
 ok(ev("J[0].title")==='Test job'&&ev("J[0].ownerApproval")===true&&ev("J[0].qwant")===3,'a request sent with the box ticked keeps owner approval on, and the 3 quotes wanted');
 ev("S.draft=null;S.step=1");
 ev("window.ORIG=JSON.parse('"+ev("JSON.stringify(J.find(j=>j.id==='m1').quotes)").replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"')");
 const open=(price,n,urg,want,owner)=>ev("(()=>{const j=J.find(j=>j.id==='m1');j.bid='b1';j.stage='open';delete j.quote;delete j.wo;j.con=undefined;j.pay=undefined;j.vars=[];j.msgs=[];j.appr={};j.exc='';j.committee=false;j.ownerApproval="+(owner?'true':'false')+";j.ownerSent=null;j.qwant="+(want||'null')+";j.urgency='"+(urg||'Standard')+"';j.quotes=ORIG.slice(0,"+n+").map(q=>({...q,price:"+price+"}));S.qdraft={};S.stack=[];S.role='manager';S.tab.manager='jobs';render();go('mjob',{id:'m1'})})()");
 open(900,1,'Standard',2);
 ok(/You wanted 2 quotes\. 1 received\. You can approve one now or wait for more\./.test(txt())&&/You wanted 2 quotes and have 1\. You can approve now or wait for more\./.test(txt()),'with 1 of the 2 wanted, it says so plainly');
 ok(!/Fewer quotes|Approve with fewer|needs 2 quotes|This budget/.test(txt())&&$('[data-a=mappr]')&&/>Approve</.test($('[data-a=mappr]').outerHTML),'there is no warning and the button just says Approve');
 click('[data-a=mappr]');ok(/Quotes received/.test(txt())&&/1 \(you wanted 2\)/.test(txt())&&/Not needed, you approve/.test(txt())&&!/Fewer quotes|reason/i.test(txt())&&!$('[data-reason]')&&!$('#apbtn').disabled,'the approve screen shows 1 (you wanted 2), asks for no reason and is ready to approve');
 click('#apbtn');ok(J1('.stage')==='paid'&&!J1('.exc')&&/approved by you/.test(J1('.log').map(l=>l.x).join('|')),'it can be approved straight away');
 open(900,2,'Standard',2);ok(/You have what you wanted/.test(txt()),'with 2 of 2 it says you have what you wanted');
 open(900,1,'Standard',1);ok(!/You wanted/.test(txt()),'when 1 quote is wanted there is no quote message at all');
 // ================= optional owner approval =================
 open(900,2,'Standard',1,false);
 ok(/Send the quotes to the owner for approval/.test(txt())&&!$('input[data-oa=m1]').checked&&/If you do not tick it, you approve the quote yourself/.test(txt())&&$('[data-a=mappr]'),'on a job with quotes the property manager sees the optional box, and can approve without it');
 const oa=$('input[data-oa=m1]');oa.checked=true;oa.dispatchEvent(new w.Event('change',{bubbles:true}));
 ok(J1('.ownerApproval')===true&&/Owner\s*M\. Chen · owner@example\.com/.test(txt().replace(/\s+/g,' ').replace('Owner M.','Owner M.'))||/M\. Chen · owner@example\.com/.test(txt()),'ticking it shows the owner and their email');
 ok(/Email preview/.test(txt())&&/Quotes for your approval: Leaking tap in level 4 corridor \(Southbank Residences\)/.test(txt())&&/Quote 1: Aqua Flow Plumbing, \$900/.test(txt())&&/Quote 2: /.test(txt())&&/secure link/.test(txt()),'the email to the owner is previewed, listing each quote');
 ok(!$('[data-a=mappr]')&&/Send the quotes to the owner first/.test(txt()),'until it is sent, the quotes cannot be approved');
 ev("A.approve('m1|'+J.find(j=>j.id==='m1').quotes[0].id)");ok(/The owner must approve this quote first/.test($('#toast').textContent)&&J1('.stage')==='open','approving directly is refused');
 click('[data-a=ownersend]');ok(J1('.ownerSent.to')==='owner@example.com'&&J1('.quotes').every(q=>q.owner==='waiting')&&/Quotes emailed to M\. Chen/.test($('#toast').textContent)&&J1('.log').some(l=>/Quotes emailed to the owner/.test(l.x))&&/Waiting for the owner/.test(txt()),'emailing marks every quote as waiting for the owner, and is logged');
 ok($$('[data-a=ownerdec]').length>=4&&/Send again/.test(txt()),'the owner’s answer is recorded with demo buttons, and the quotes can be sent again');
 click('[data-a=ownerdec][data-v$="|approved"]');ok(J1('.quotes[0].owner')==='approved'&&/Approved by the owner/.test(txt())&&$('[data-a=mappr]'),'when the owner approves a quote, the property manager can approve it');
 click('[data-a=mappr]');ok(/Owner approval/.test(txt())&&/Approved by the owner/.test(txt())&&!$('#apbtn').disabled,'the approve screen says the owner approved');
 click('#apbtn');ok(J1('.stage')==='paid'&&/approved by the owner on/.test(J1('.log').map(l=>l.x).join('|')),'the approval is logged as approved by the owner');
 open(900,2,'Standard',1,true);click('[data-a=ownersend]');click('[data-a=ownerdec][data-v$="|declined"]');ok(/Declined by the owner/.test(txt())&&!$$('[data-a=mappr]').some(b=>/q1/.test(b.dataset.v)),'a quote the owner declined cannot be approved');
 const oa2=$('input[data-oa=m1]');oa2.checked=false;oa2.dispatchEvent(new w.Event('change',{bubbles:true}));ok(J1('.ownerApproval')===false&&$$('[data-a=mappr]').length>=1,'if the property manager unticks the box, they can approve the quote themselves');
 // owner email missing
 ev("bld('b1').ownerEmail=''");open(900,2,'Standard',1,true);ok(/Add the owner’s email/.test(txt())&&$('[data-a=ownersend]').disabled&&$('[data-a=gotob][data-v="b1|contacts"]')&&/Go to Properties/.test(txt()),'without the owner’s email the quotes cannot be sent, and a button goes to Properties');
 ev("A.ownersend('m1')");ok(/Add the owner’s email in Properties first/.test($('#toast').textContent),'sending is refused with a hint');
 ev("bld('b1').ownerEmail='owner@example.com'");
 // extras when the owner approves
 const book=(price,owner)=>ev("(()=>{const j=J.find(j=>j.id==='m1');const q={...j.quotes[0],price:"+price+",date:addBiz(todayIso(),5),time:'09:00',dep:{type:'none'}};j.bid='b1';j.quotes=[q,ORIG[1]];j.quote=q;j.con=q.c;j.price="+price+";j.base="+price+";j.stage='paid';j.wo='WO-1100';j.pay={reqs:[]};j.vars=[];j.msgs=[];j.inv=null;j.invHold=null;j.closed=false;j.live=null;j.urgency='Standard';j.log=[];j.appr={};j.qwant=2;j.ownerApproval="+(owner?'true':'false')+";S.qdraft={};S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})})()");
 const request=(amt)=>{typeIn('#vxa',String(amt));typeIn('#vxr','Extra pipe run found');click('[data-a=xphoto]');typeIn('#vxa',String(amt));typeIn('#vxr','Extra pipe run found');click('[data-a=xsend]')};
 const asMgr=()=>ev("S.stack=[];S.role='manager';S.tab.manager='jobs';render();go('mjob',{id:'m1'})");
 book(4000,false);request(500);asMgr();ok(/\$4,500/.test(txt())&&!/Quotes needed|Quotes recorded|Needs 1 more quote|Owner approval/.test(txt())&&/It is optional/.test(txt())&&!$('[data-a=varapprove]').disabled,'an extra needs no quotes and no owner when the box is not ticked, and adding a quote is optional');
 typeIn('input[data-m="qdraft.xqn"]','Other Plumbing Co');typeIn('input[data-m="qdraft.xqa"]','450');click('[data-a=varquote]');ok(J1('.vars[0].quotes.length')===1&&/Other Plumbing Co/.test(txt()),'a quote can still be added to compare');
 click('[data-a=varapprove]');ok(J1('.price')===4500,'and the extra is approved');
 book(4000,true);request(500);asMgr();ok(/The owner must approve this extra/.test(txt())&&$('[data-a=varapprove]').disabled&&$('[data-a=varownsend]'),'when the owner approves quotes, an extra waits for the owner');
 click('[data-a=varownsend]');ok(J1('.vars[0].owner')==='waiting'&&/Waiting for the owner/.test(txt())&&/Extra work WO-1100-V1 emailed to the owner/.test(J1('.log').map(l=>l.x).join('|')),'the extra is emailed to the owner');
 click('[data-a=varown][data-v$="|approved"]');ok(/Approved by the owner/.test(txt())&&!$('[data-a=varapprove]').disabled,'when the owner approves it, the extra can be approved');click('[data-a=varapprove]');ok(J1('.price')===4500,'and it is');
 book(4000,true);request(300);asMgr();click('[data-a=varownsend]');click('[data-a=varown][data-v$="|declined"]');ok(/Declined by the owner/.test(txt())&&$('[data-a=varapprove]').disabled,'a declined extra cannot be approved');
 ev("S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})");ok(!/You wanted|quotes you want|owner approv/i.test(txt()),'the contractor never sees how many quotes were wanted or the owner approval box');
 // ================= payment day limit =================
 ev("S.stack=[];S.role='manager';S.tab.manager='bld';render()");
 ok(/Payment terms \(days after the final invoice, up to 14\)/.test($('.bsec[data-k="b1:payer"]').textContent)&&$('[data-terms=b1]').getAttribute('max')==='14'&&/limited to 14 days/.test($('.bsec[data-k="b1:payer"]').textContent),'the payment terms field shows the limit of 14 days');
 chg($('[data-terms=b1]'),'21');ok(/cannot be longer than 14 days/.test($('#toast').textContent)&&!(ev("bld('b1').terms")>14),'a longer term is refused');
 chg($('[data-terms=b1]'),'14');ok(ev("bld('b1').terms")===14,'14 days is accepted');
 ev("S.stack=[];S.tab.manager='mprof';render();go('owner')");ok(/Longest payment term a manager may set/.test(txt())&&$('[data-set=maxPay]').value==='14','Owner settings has the longest payment term, 14 days to start');
 ev("S.set.maxPay=30");ev("S.stack=[];S.tab.manager='bld';render()");chg($('[data-terms=b1]'),'21');ok(ev("bld('b1').terms")===21,'raising the limit lets a manager choose 21 days');
 ev("S.set.maxPay=10");ev("bld('b1').payer='owner'");book(1000);ev("(()=>{const j=J.find(j=>j.id==='m1');j.stage='released';S.invd={jobId:'m1',no:'INV-1',date:todayIso(),amount:'1000',file:{name:'f.pdf',size:1}};A.invsend('m1')})()");
 ok(J1('.pay.reqs[0].due')===ev("addDays(todayIso(),10)"),'if the limit is lowered later, the due date is cut to the new limit (10 days)');ev("S.set.maxPay=14;bld('b1').terms=14");
 // ================= owner statement =================
 ev("S.prof.role='OC manager';S.stack=[];S.tab.manager='jobs';render();A.reports()");ok(!$$('#view .chips .chip').some(c=>/Owner statement/.test(c.textContent)),'building and OC managers do not get an Owner statement');
 ev("S.prof.role='Property manager';S.stack=[];S.tab.manager='jobs';render();A.reports()");ok($$('#view .chips .chip').map(c=>c.textContent).slice(0,3).join('|')==='Job reports|Owner statement|Summary report','a property manager’s reports are Job reports, Owner statement and Summary report');
 const prev=ev("addYm(todayIso().slice(0,7),-1)");
 const setupJob=()=>ev("(()=>{J.forEach(j=>{if(j.mine&&j.bid==='b1'&&j.id!=='m1')j.bid='b2'});const j=J.find(j=>j.id==='m1');const q={...j.quotes[0],price:1200,date:'"+prev+"-10',time:'09:00',dep:{type:'none'}};j.bid='b1';j.quotes=[q];j.quote=q;j.con=q.c;j.price=1200;j.base=1200;j.stage='released';j.wo='WO-1100';j.title='Replace the pressure valve';j.inv={no:'INV-7',date:'"+prev+"-11',amount:1200,gst:true,file:{name:'f.pdf',size:1}};j.invHold=null;j.closed=false;j.vars=[{id:'v1',no:'WO-1100-V1',amount:200,reason:'Extra',status:'approved',approvedOn:'"+prev+"-09',total:1200,photos:[],quotes:[]}];j.pay={reqs:[{id:'r1',no:'PR-1100-1',kind:'final',amount:1200,due:'"+prev+"-25',status:'paid',paidOn:'"+prev+"-20',sentOn:'"+prev+"-11',to:'x',held:false,releasedOn:'"+prev+"-20',clearsOn:'"+prev+"-22',reminders:0}]};S.stmts=[];S.stmode='off';bld('b2').ownerEmail='';bld('b3').ownerEmail='';S.role='manager';S.stack=[];S.tab.manager='mhome';render()})()");
 setupJob();
 ok(/1 owner statement is ready to send/.test(txt())&&/tap to review and email it to the owner/i.test(txt()),'Home says an owner statement is ready to send');
 click('[data-a=stmtdue]');let P=$('.paper').textContent;
 ok(ev("S.rep.type")==='stmt'&&ev("S.rep.bid")==='b1'&&ev("S.rep.ym")===prev&&/Owner statement/.test($('.paper h2').textContent)&&/Southbank Residences/.test(P)&&/For M\. Chen/.test(P),'tapping it opens the statement for that property and month');
 ok(['Work completed','Payments made this month','Extra work approved','How payments work'].every(h=>$$('.paper h3').some(x=>x.textContent===h)),'the statement has work completed, payments, extra work and how payments work');
 ok(/Replace the pressure valve/.test(P)&&/INV-7/.test(P)&&/\$1,200/.test(P)&&/PR-1100-1/.test(P)&&/WO-1100-V1/.test(P),'it lists the job, the invoice, the payment and the extra');
 const tile=l=>$$('.paper .rtile').find(t=>t.textContent.includes(l)).querySelector('b').textContent;
 ok(tile('Jobs completed')==='1'&&tile('Invoiced')==='$1,200'&&tile('Paid this month')==='$1,200'&&tile('Waiting for payment')==='$0','the totals are right: 1 job, $1,200 invoiced, $1,200 paid, $0 waiting');
 ok(/Payment terms\s*14 days after the final invoice|14 days after the final invoice/.test(P)&&/limited to 14 days/.test(P),'it explains the payment terms and the 14-day limit');
 // send
 ev("bld('b1').ownerEmail=''");ev("render()");ok($('[data-a=stmtsend]').disabled&&/No owner email yet/.test(txt()),'without an owner email it cannot be sent');ev("A.stmtsend()");ok(/Add the property owner’s email/.test($('#toast').textContent),'sending is refused with a hint');
 ev("bld('b1').ownerEmail='owner@example.com'");ev("render()");click('[data-a=stmtsend]');
 ok(ev("S.stmts.length")===1&&ev("S.stmts[0].to")==='owner@example.com'&&ev("S.stmts[0].html.length")>400&&/Statement emailed to M\. Chen/.test($('#toast').textContent)&&/Sent/.test($('.noprint.card .pill').textContent),'emailing records who it went to and keeps a copy');
 ok($('[data-a=pdf]')&&$('[data-a=repprint]'),'it can be downloaded or printed');
 ev("J.find(j=>j.id==='m1').inv.amount=9999;J.find(j=>j.id==='m1').title='Changed later'");click('[data-a=stmtview]');
 ok(/This is the statement as it was sent/.test(txt())&&/\$1,200/.test($('.paper').textContent)&&!/Changed later/.test($('.paper').textContent),'the sent copy is frozen and does not change');
 click('[data-a=back]');click('[data-a=stmtsend]');ok(ev("S.stmts.length")===2&&/Send again/.test(txt())===false||ev("S.stmts.length")===2,'it can be sent again');
 // notices
 home=()=>ev("S.stack=[];S.tab.manager='mhome';render()");home();ok(!/owner statement/i.test(txt().replace(/Owner statement/g,'')),'the Home notice goes once it is sent');
 ev("S.stmts=[]");home();ok(/1 owner statement is ready to send/.test(txt()),'and comes back if it has not been sent');ev("S.stmode='auto'");home();ok(!/ready to send/.test(txt()),'sending automatically hides the notice');ev("S.stmode='off'");
 // month navigation
 ev("S.stack=[];S.tab.manager='jobs';render();A.reports();S.rep.type='stmt';S.rep.bid='b1';S.rep.ym=addYm(todayIso().slice(0,7),0);render()");ok($('[data-a=repnav][data-v="1"]').disabled,'the statement cannot go past the current month');
 click('[data-a=repnav][data-v="-1"]');ok(ev('S.rep.ym')===prev,'but can go back a month');
 // booked and waiting
 ev("(()=>{const j=J.find(j=>j.id==='m1');j.stage='paid';j.inv=null;j.pay={reqs:[{id:'r1',no:'PR-1100-1',kind:'deposit',amount:300,due:todayIso(),status:'sent',sentOn:todayIso(),to:'x',held:true,reminders:0}]};S.rep.ym=addYm(todayIso().slice(0,7),0);render()})()");
 P=$('.paper').textContent;ok(/Booked or in progress/.test(P)&&/Changed later/.test(P)&&tile('Waiting for payment')==='$300','booked work and payments still waiting appear on the statement');
 console.log(errs.length?'ERRORS '+errs.join('|'):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,5).join('\n'))}process.exit(0)},400);
