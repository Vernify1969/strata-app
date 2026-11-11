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
const setB=(b,arr)=>arr.forEach(([l,q],i)=>{chg($('[data-tier="'+b+'|'+i+'|limit"]'),String(l));chg($('[data-tier="'+b+'|'+i+'|quotes"]'),String(q))});
setTimeout(()=>{try{
 ev("S.prof.role='Building manager';S.prof.pay='bank';S.prof.consent=true;S.stack=[];S.tab.manager='bld';render()");
 const NAMES=['Building Manager Budget','OC Manager and Building Manager Budget','OC Manager, Building Manager and Committee Budget'];
 // ---- every building starts with the usual budgets ----
 ok(NAMES.every(n=>txt().includes(n))&&$$('[data-tier]').length===18,'every building shows the three budgets, each with an amount and a number of quotes');
 ok($$('[data-tier$="|limit"]').map(i=>i.value).join()==='999,4999,30000,999,4999,30000,999,4999,30000'&&$$('select[data-tier$="|quotes"]').map(i=>i.value).join()==='1,2,3,1,2,3,1,2,3','every building starts with $999, $4,999 and $30,000 and 1, 2 and 3 quotes');
 ok(ev("B.every(b=>tiersSet(b)&&!tiersConfirmed(b))")&&/Starting amounts/.test(txt())&&$$('[data-a=tiersok]').length===3&&/Change the amounts and the number of quotes to match this building’s committee decision/.test(txt()),'they are marked as starting amounts, each with Keep these amounts, and the text says to change them to match the committee');
 ok(ev("budgetLine(bld('b1'))")==='$999 · $4,999 · $30,000','the building shows its amounts');
 click('[data-a=tiersok][data-v=b1]');ok(ev("tiersConfirmed(bld('b1'))")&&!$('[data-a=tiersok][data-v=b1]')&&/Budgets kept/.test($('#toast').textContent),'Keep these amounts confirms the building');
 chg($('[data-tier="b2|0|limit"]'),'750');ok(ev("tiersConfirmed(bld('b2'))")&&ev("bld('b2').tiers[0].limit")===750&&ev("bld('b2').tiers[1].limit")===4999&&ev("bld('b2').tiers[2].quotes")===3,'changing an amount confirms the building and keeps the other starting amounts');
 chg($('[data-tier="b2|1|quotes"]'),'3');ok(ev("bld('b2').tiers[1].quotes")===3,'the number of quotes can be changed too');
 ev("S.stack=[];render()");click('[data-a=tiersreset][data-v=b2]');ok(ev("bld('b2').tiers")===null&&ev("budgetLine(bld('b2'))")==='$999 · $4,999 · $30,000'&&!ev("tiersConfirmed(bld('b2'))"),'Go back to the starting amounts resets a building');
 ev("bld('b1').tiers=[{limit:null,quotes:null},{limit:null,quotes:null},{limit:null,quotes:null}];S.stack=[];render()");
 ok(ev("budgetLine(bld('b1'))")==='Not set · Not set · Not set'&&/Not all three budgets are set yet/.test(txt()),'a building whose amounts have been cleared shows Not set');
 // ---- gate: no approval until set ----
 ev("window.ORIG=JSON.parse('"+ev("JSON.stringify(J.find(j=>j.id==='m1').quotes)").replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"')");
 const setM1=(price,count,urg,bid)=>{ev("(()=>{const j=J.find(j=>j.id==='m1');j.bid='"+(bid||'b1')+"';j.appr={};j.committee=false;j.exc='';j.log=[];j.stage='open';j.urgency='"+(urg||'Standard')+"';j.quotes=ORIG.slice(0,"+count+").map(q=>({...q,price:"+price+"}));S.qdraft.reason='';S.stack=[];S.role='manager';render();go('mjob',{id:'m1'})})()")};
 setM1(900,2);ok(/Set the approval budgets first/.test(txt())&&!$('[data-a=mappr]')&&$('[data-a=gotob][data-v="b1|budgets"]'),'a quote cannot be approved while the building’s budgets are not set, and Go to Buildings opens the budgets');
 ev("go('appr',{id:'m1',q:J.find(j=>j.id==='m1').quotes[0].id})");ok(/Set the approval budgets first/.test(txt())&&$('#apbtn').disabled,'the approve screen is locked too');
 ev("A.approve('m1|'+J.find(j=>j.id==='m1').quotes[0].id)");ok(/Set the approval budgets in Buildings first/.test($('#toast').textContent)&&ev("J.find(j=>j.id==='m1').stage")==='open','approving directly is refused');
 setM1(900,1,'Emergency');ok($('[data-a=mappr]')&&!/Set the approval budgets first/.test(txt()),'an emergency job can be approved before budgets are set');
 click('[data-a=mappr]');click('#apbtn');ok(ev("J.find(j=>j.id==='m1').stage")==='paid'&&ev("J.find(j=>j.id==='m1').tier")===0,'the emergency approval goes through');
 // ---- enter the budgets by hand ----
 ev("S.stack=[];S.tab.manager='bld';render()");
 chg($('[data-tier="b1|0|limit"]'),'1000');ok(ev("bld('b1').tiers[0].limit")===1000&&!ev("tiersSet(bld('b1'))")&&/Budget saved/.test($('#toast').textContent)&&/Not all three budgets are set yet/.test(txt()),'a partial entry is saved but the building stays not set');
 chg($('[data-tier="b1|1|limit"]'),'900');ok(/higher than the one before/.test($('#toast').textContent)&&ev("bld('b1').tiers[1].limit")===null,'a budget must be higher than the one before it');
 setB('b1',[[1000,1],[4999,2],[30000,3]]);ok(ev("tiersSet(bld('b1'))")&&/All three are set/.test($('#toast').textContent)&&/All three budgets are set/.test(txt()),'entering all three amounts and quotes completes the building');
 setB('b2',[[750,1],[3500,2],[20000,3]]);setB('b3',[[500,1],[2500,2],[15000,3]]);
 ok(ev("budgetLine(bld('b1'))")==='$1,000 · $4,999 · $30,000'&&ev("budgetLine(bld('b2'))")==='$750 · $3,500 · $20,000'&&ev("budgetLine(bld('b3'))")==='$500 · $2,500 · $15,000','each building has the amounts the manager entered, and they can differ');
 chg($('[data-tier="b1|1|quotes"]'),'3');ok(ev("bld('b1').tiers[1].quotes")===3,'the number of quotes can be changed');chg($('[data-tier="b1|1|quotes"]'),'2');
 chg($('[data-tier="b1|2|limit"]'),'');ok(ev("bld('b1').tiers[2].limit")===null&&!ev("tiersSet(bld('b1'))"),'clearing an amount makes the building not set again');chg($('[data-tier="b1|2|limit"]'),'30000');
 const T=p=>ev("tierOf(bld('b1'),"+p+")");
 ok(T(1000)===1&&T(1001)===2&&T(4999)===2&&T(5000)===3&&T(30000)===3&&T(30001)===4,'each price falls in the right budget');
 ev("bld('b1').budget=60000");
 // ---- approval flows ----
 ev("S.prof.role='Building manager'");
 setM1(900,1);ok(/Building Manager Budget · up to \$1,000 per job/.test(txt())&&$('[data-a=mappr]')&&!$('[data-a=apprec]')&&!/Needs/.test(txt()),'a $900 job is in the Building Manager Budget and can be approved with 1 quote');
 setM1(2000,2);ok(/Needs OC Manager approval/.test(txt())&&!$('[data-a=mappr]'),'a $2,000 job needs the OC Manager as well');
 click('[data-a=apprec]');ok($('[data-a=mappr]')&&/OC Manager approval recorded/.test(txt()),'recording the OC Manager approval unlocks Approve and is logged');
 ev("S.prof.role='OC manager'");setM1(2000,2);ok(/Needs Building Manager approval/.test(txt()),'an OC manager is asked for the Building Manager’s approval instead');
 ev("S.prof.role='Building manager'");
 setM1(8000,3);ok(/Needs OC Manager approval/.test(txt())&&/Needs Committee approval/.test(txt()),'an $8,000 job needs the OC Manager and the Committee');
 click('[data-a=apprec][data-v$="|oc"]');ok(!$('[data-a=mappr]'),'one approval is not enough');click('[data-a=apprec][data-v$="|cm"]');ok($('[data-a=mappr]')&&ev("J.find(j=>j.id==='m1').committee"),'with both recorded Approve unlocks');
 setM1(40000,3);ok(/Needs General meeting approval/.test(txt())&&/Above the committee budget/.test(txt()),'a job above the third budget needs a general meeting');
 // ---- quotes needed ----
 setM1(2000,1);ok(/1 of 2 quotes/.test(txt()),'a $2,000 job with one quote says it needs 2');
 click('[data-a=apprec][data-v$="|oc"]');ok(/Approve with fewer quotes/.test(txt()),'the button reads Approve with fewer quotes');click('[data-a=mappr]');
 ok(/Fewer quotes than needed/.test(txt())&&$('#apbtn').disabled,'the approve screen asks for a reason');
 typeIn($('[data-reason]'),'abc');ok($('#apbtn').disabled,'a very short reason is not enough');
 typeIn($('[data-reason]'),'Urgent repair and only one contractor available');ok(!$('#apbtn').disabled,'a proper reason enables Approve');
 click('#apbtn');const j=JSON.parse(ev("JSON.stringify(J.find(j=>j.id==='m1'))"));
 ok(j.stage==='paid'&&j.qn===1&&j.need===2&&/only one contractor/.test(j.exc)&&j.tier===2&&j.log.some(l=>/Fewer quotes because: Urgent repair/.test(l.x)),'approving with fewer quotes saves the reason, the quote counts and the budget');
 setM1(8000,1,'Emergency');ev("J.find(j=>j.id==='m1').appr={oc:true,cm:true};render();go('mjob',{id:'m1'})");ok(!/Fewer quotes/.test(txt()),'an emergency job needs only one quote');
 setM1(2000,3);click('[data-a=apprec]');ok(!/Approve with fewer quotes/.test(txt())&&!/of 2 quotes/.test(txt()),'enough quotes: no reason is asked for');
 // ---- Monthly Maintenance Report ----
 ev("(()=>{const j=J.find(j=>j.id==='m1');setM1x=0;j.stage='released';j.quote={...ORIG[0],price:2000,date:addYm(todayIso().slice(0,7),-1)+'-15',no:'QT-9',scope:'x'};j.price=2000;j.con='c1';j.wo='WO-9';j.tier=2;j.qn=1;j.need=2;j.exc='Urgent repair and only one contractor available';j.inv=null;j.closed=false})()");
 ev("S.stack=[];S.tab.manager='jobs';render();A.reports();S.rep.bid='b1';S.rep.ym=addYm(todayIso().slice(0,7),-1);render()");
 const P=$('.paper').textContent;
 ok(/Monthly Maintenance Report/.test($('.paper h2').textContent)&&NAMES.every(n=>P.includes(n)),'the report is called Monthly Maintenance Report and lists the three budgets');
 ok(/Up to \$1,000 per job · 1 quote needed/.test(P)&&/Up to \$4,999 per job · 2 quotes needed/.test(P)&&/Up to \$30,000 per job · 3 quotes needed/.test(P),'each budget shows the amount and quotes the manager entered');
 const rows=$$('.paper .kv').filter(x=>NAMES.some(n=>x.textContent.includes(n))).map(x=>+x.querySelector('b:last-child').textContent.match(/(\d+) job/)[1]);
 ok(rows.reduce((a,b)=>a+b,0)===ev("repD(S.rep).done.length"),'the jobs under the three budgets add up to the jobs done');
 ok(/Approved with fewer quotes/.test(P)&&/1 of 2 quotes/.test(P)&&/only one contractor available/.test(P),'jobs approved with fewer quotes are listed with their reason');
 ok(/Spend against the annual budget/.test(P)&&/\$60,000/.test(P),'the annual budget entered by hand is used');
 // ---- unset building in the report ----
 ev("S.stack=[];S.nb={name:'Test Court',street:'1 Test St',suburb:'Balwyn',pc:'3103',oc:'PS 9',limit:'',res:null};A.bsave()");
 const nb=JSON.parse(ev("JSON.stringify(B[B.length-1])"));ok(nb.tiers===null&&nb.budget===null&&nb.limit===null,'a new building is saved with no budgets, no limit and no annual budget');
 ev("S.stack=[];S.tab.manager='jobs';render();A.reports();S.rep.bid='"+nb.id+"';S.rep.ym=addYm(todayIso().slice(0,7),-1);render()");
 ok(!/Budgets not set/.test($('.paper').textContent)&&/\$999/.test($('.paper').textContent)&&/Annual maintenance budget/.test($('.paper').textContent)&&/Not set/.test($('.paper').textContent),'for a new building the report shows the starting budgets, and the annual maintenance budget as Not set');
 ev("S.stack=[];S.tab.manager='bld';render()");ok($$('[data-tier="'+nb.id+'|0|limit"]').length===1&&$('[data-tier="'+nb.id+'|0|limit"]').value==='999'&&$('select[data-tier="'+nb.id+'|0|quotes"]').value==='1','the new building’s fields start at the usual amounts');
 // ---- property managers: nothing to set up before approving ----
 ev("S.prof.role='Property manager';S.stack=[];S.tab.manager='bld';render()");
 ok(!$('[data-lim]')&&!$('[data-tier]')&&/Property owner/.test(txt()),'property managers have no approval limit or budgets to enter');
 setM1(900,1,'Standard','b2');ok($('[data-a=mappr]')&&!/Set the approval/.test(txt()),'a property manager can approve a quote without setting anything up first');
 console.log(errs.length?'ERRORS '+errs.join('|'):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,4).join('\n'))}process.exit(0)},400);
