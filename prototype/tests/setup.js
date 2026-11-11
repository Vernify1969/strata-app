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
const home=()=>ev("S.stack=[];S.tab.manager='mhome';render()");
const setT=(b,arr)=>arr.forEach(([l,q],i)=>{chg($('[data-tier="'+b+'|'+i+'|limit"]'),String(l));chg($('[data-tier="'+b+'|'+i+'|quotes"]'),String(q))});
setTimeout(()=>{try{
 // ================= building and OC managers: budgets =================
 ev("S.prof.role='OC manager';S.prof.pay='bank';S.prof.consent=true;S.stack=[];S.tab.manager='mhome';render()");
 ok(/Check the budgets for 3 buildings/.test(txt())&&/Each building starts with the usual budgets: up to \$999 needs 1 quote, up to \$4,999 needs 2, up to \$30,000 needs 3/.test(txt())&&/Change the amounts and quotes if your committee decided differently, or keep them/.test(txt())&&/Tap to start with Southbank Residences/.test(txt()),'Home tells a new OC manager that every building starts with the usual budgets, to check or change');
 click('[data-a=gotob][data-v="b1|budgets"]');ok($('.bcard[data-b=b1]').classList.contains('open')&&$('.bsec[data-k="b1:budgets"]').classList.contains('open')&&$('[data-a=tiersok][data-v=b1]')&&/Starting amounts/.test($('.bsec[data-k="b1:budgets"]').textContent),'the notice opens that building’s budgets group, with Keep these amounts');
 click('[data-a=tiersok][data-v=b1]');home();ok(/Check the budgets for 2 buildings/.test(txt())&&/start with Riverside Gardens/.test(txt()),'keeping the amounts counts that building as done');
 ev("S.tab.manager='bld';render()");setT('b2',[[2000,1],[6000,2],[20000,3]]);setT('b3',[[500,2],[1500,3],[9000,3]]);home();ok(!/budgets for \d building/.test(txt()),'when every building has been kept or changed the notice goes');
 ok(ev("budgetLine(bld('b1'))")==='$999 · $4,999 · $30,000'&&ev("budgetLine(bld('b2'))")==='$2,000 · $6,000 · $20,000'&&ev("budgetLine(bld('b3'))")==='$500 · $1,500 · $9,000','each building keeps its own amounts');
 // the same $1,500 quote in three buildings
 ev("window.ORIG=JSON.parse('"+ev("JSON.stringify(J.find(j=>j.id==='m1').quotes)").replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"')");
 const inb=(b,price)=>ev("(()=>{const j=J.find(j=>j.id==='m1');j.bid='"+b+"';j.stage='open';delete j.quote;delete j.wo;j.urgency='Standard';j.appr={};j.quotes=ORIG.slice(0,1).map(q=>({...q,price:"+price+"}));const ai=approvalInfo(j,j.quotes[0]);return JSON.stringify({name:ai.name,need:ai.need,have:ai.have,miss:ai.missing.map(m=>m[0]),ok:ai.quotesOK})})()");
 let r1=JSON.parse(inb('b1',1500)),r2=JSON.parse(inb('b2',1500)),r3=JSON.parse(inb('b3',1500));
 ok(r1.name==='OC Manager and Building Manager Budget'&&r1.need===2&&r1.miss.length===1,'$1,500 in Southbank Residences is the second budget: 2 quotes and the other approver');
 ok(r2.name==='Building Manager Budget'&&r2.need===1&&r2.ok&&r2.miss.length===0,'the same $1,500 in Riverside Gardens is the first budget: 1 quote and no further approval');
 ok(r3.name==='OC Manager and Building Manager Budget'&&r3.need===3&&!r3.ok,'and in Park Terrace Apartments it is the second budget needing 3 quotes');
 // quote count cannot fall as the budget rises
 ev("S.tab.manager='bld';S.stack=[];render()");chg($('[data-tier="b1|1|quotes"]'),'1');chg($('[data-tier="b1|0|quotes"]'),'2');
 ok(/A higher budget cannot need fewer quotes than a lower one/.test($('#toast').textContent)||ev("bld('b1').tiers[0].quotes")===1,'the first budget cannot need more quotes than the second');
 chg($('[data-tier="b1|0|quotes"]'),'1');chg($('[data-tier="b1|1|quotes"]'),'1');ok(ev("tiersOf(bld('b1'))[1].quotes")===1,'equal numbers of quotes are allowed');chg($('[data-tier="b1|1|quotes"]'),'2');
 ev("bld('b1').tiers[1].quotes=2");chg($('[data-tier="b1|2|quotes"]'),'1');ok(/A higher budget cannot need fewer quotes/.test($('#toast').textContent)&&ev("bld('b1').tiers[2].quotes")===3,'a higher budget cannot need fewer quotes than a lower one');
 // later changes do not rewrite approved jobs
 ev("(()=>{const j=J.find(j=>j.id==='m1');j.bid='b1';j.tier=1;j.stage='paid';j.price=900;j.quote={...j.quotes[0],price:900};j.con='c1';j.wo='WO-1100'})()");chg($('[data-tier="b1|0|limit"]'),'500');ok(J1('.tier')===1,'changing a building’s budgets later does not change the budget recorded on an approved job');chg($('[data-tier="b1|0|limit"]'),'1000');
 // request step 5 soft note
 ev("bld('b3').tiers=[{limit:null,quotes:null},{limit:null,quotes:null},{limit:null,quotes:null}];A.new();S.draft.bid='b3';S.step=5;render()");ok(/The budgets are not set for this building/.test(txt())&&$('[data-a=gotob][data-v="b3|budgets"]')&&!$('[data-a=post]').disabled,'the last step of a request warns that the budgets are not set, but does not block sending');
 ev("S.draft.bid='b1';render()");ok(!/The budgets are not set for this building/.test(txt()),'and says nothing when they are set');ev("S.draft=null;S.step=1");
 // a new building starts unset
 ev("bld('b3').tiers=[{limit:500,quotes:2},{limit:1500,quotes:3},{limit:9000,quotes:3}];S.stack=[];S.tab.manager='bld';render()");click('[data-a=bnew]');typeIn('[data-m="nb.name"]','Balwyn Court');typeIn('[data-m="nb.street"]','2 Sample Road');const sb=$('input[data-m=\"nb.suburb\"]');sb.value='Balwyn';sb.dispatchEvent(new w.Event('input',{bubbles:true}));{const pe=$('input[data-m="nb.pc"]');pe.value='3103';pe.dispatchEvent(new w.Event('input',{bubbles:true}))};typeIn('[data-m="nb.oc"]','PS 777');click('[data-a=bsave]');home();
 ok(/Check the budgets for 1 building/.test(txt())&&/start with Balwyn Court/.test(txt())&&ev("budgetLine(B[B.length-1])")==='$999 · $4,999 · $30,000'&&ev("tiersSet(B[B.length-1])&&!tiersConfirmed(B[B.length-1])"),'a new building starts with the usual budgets, and Home asks to check them');
 // ================= property managers =================
 ev("S.prof.role='Property manager';S.stack=[];S.tab.manager='mhome';B.forEach(b=>{b.limit=null;b.payer='';b.payEmail='';b.owner='';b.ownerEmail=''});render()");
 ok($$('.nav button').some(b=>/Properties/.test(b.textContent))&&!$$('.nav button').some(b=>/^Buildings$/.test(b.textContent.trim())),'for a property manager the tab is called Properties');
 ok(!/Set the approval limit|Set the budgets/.test(txt()),'a property manager is not asked to set any limit or budget');
 ev("S.tab.manager='bld';S.bopen={b:'b1',s:{},add:false};render()");ok(/Properties/.test($('#view h1').textContent)&&/Tap a property to open it/.test(txt())&&/＋ Add a property/.test(txt())&&/Property photos/.test($('.bcard[data-b=b1]').textContent)&&/Quotes/.test($('.bsec[data-k="b1:budgets"]').textContent)&&!/Approval limit/.test($('.bcard[data-b=b1]').textContent)&&/Property owner/.test($('.bsec[data-k="b1:contacts"]').textContent),'the Properties screen uses property wording, with quotes and owner groups and no limit');

 ev("S.tab.manager='mhome';render();A.new()");ok(/Property and place/.test(txt())&&/for="bs">Property</.test($('#view').innerHTML)||/Property<\/label>/.test($('#view').innerHTML),'the request starts with Property and place');
 ev("S.draft.bid='b2';S.step=5;render()");ok(/Quotes and owner approval/.test(txt())&&/Send the quotes to the owner for approval \(optional\)/.test(txt())&&!/limit/.test(txt()),'the last step offers quotes wanted and the optional owner approval, with no limit');ev("S.draft=null;S.step=1");
 // owner is the payer: the owner's email is used
 ev("bld('b1').payer='owner';bld('b1').payEmail='';bld('b1').ownerEmail='owner@example.com';bld('b1').owner='M. Chen'");
 ok(ev("payInfo(bld('b1')).ok")&&ev("payInfo(bld('b1')).email")==='owner@example.com','when the owner pays, the owner’s email is used without entering it twice');
 ev("bld('b2').payer='accounts';bld('b2').payEmail='';bld('b2').ownerEmail='x@example.com'");ok(!ev("payInfo(bld('b2')).ok"),'an Accounts payer still needs its own payment email');
 const book=(price,dep)=>ev("(()=>{const j=J.find(j=>j.id==='m1');const q={...j.quotes[0],price:"+price+",date:addBiz(todayIso(),5),time:'09:00',dep:"+JSON.stringify(dep||{type:'none'})+"};j.bid='b1';j.quotes=[q];j.stage='open';delete j.quote;delete j.wo;j.con=undefined;j.pay=undefined;j.vars=[];j.msgs=[];j.inv=null;j.invHold=null;j.closed=false;j.appr={};j.log=[];j.live=null;S.qdraft={};S.stack=[];S.role='manager';S.tab.manager='jobs';render();go('mjob',{id:'m1'})})()");
 const bad=/committee|OC manager|Building Manager|three budgets|Quotes needed|Budgets (not )?set/i;
 book(4000,{type:'deposit',pct:25,amount:1000});ok(!bad.test(txt())&&/Approve/.test(txt())&&!/Needs/.test(txt()),'a quote within the limit can be approved straight away, with no committee or budget wording');
 click('[data-a=mappr]');ok(!bad.test(txt())&&/Not needed, you approve/.test(txt())&&!/limit/.test(txt()),'the approve screen shows that the owner is not needed, with no limit wording');
 click('#apbtn');let reqs=J1('.pay.reqs');ok(reqs.length===1&&reqs[0].amount===1000&&reqs[0].status==='sent'&&reqs[0].to==='owner@example.com','the deposit request is sent to the owner’s email');
 // above the limit needs the owner
 book(6000);ok(!/Needs/.test(txt())&&$('[data-a=mappr]'),'a quote of any size can be approved by the property manager when the owner box is not ticked');click('[data-a=mappr]');click('#apbtn');ok(J1('.stage')==='paid'&&/approved by you/.test(J1('.log').map(l=>l.x).join('|')),'and it is approved without the owner');
 // finish the job, owner pays
 ev("(()=>{const j=J.find(j=>j.id==='m1');j.stage='released';j.relOn=todayIso();S.invd={jobId:'m1',no:'INV-9',date:todayIso(),amount:'6000',file:{name:'f.pdf',size:1}};A.invsend('m1');S.stack=[];S.role='manager';render();go('mjob',{id:'m1'})})()");
 ok(J1('.pay.reqs[0].to')==='owner@example.com'&&/Waiting for payment/.test(txt()),'the final payment request goes to the owner');
 click('[data-a=reqpaid]');ok(/Ready to close/.test(txt()),'when the owner has paid, the job is ready to close');
 click('[data-a=closejob]');ev("J.find(j=>j.id==='m1').quote.date=todayIso();S.stack=[];S.tab.manager='jobs';render();A.reports()");
 ok(/Job reports/.test(txt())&&!/Monthly Maintenance Report/.test($('#view .chips').textContent)&&$('[data-a=jrview][data-v=m1]'),'the property manager’s reports are Job reports and the finished job is listed');
 click('[data-a=jrsend][data-v=m1]');ok(/Report emailed to M\. Chen/.test($('#toast').textContent)&&ev("S.jsent[S.jsent.length-1].to")==='owner@example.com','the job report is emailed to the owner');
 // messages work for a property manager
 ev("(()=>{const j=J.find(j=>j.id==='m1');j.msgs=[{id:'m1',c:'c1',from:'contractor',text:'Is the gate open at 8?',tt:'now',ctx:null,r:{}}];S.stack=[];S.tab.manager='jobs';render()})()");ok(/New message/.test(txt()),'new messages show for a property manager too');
 // extras use the limit
 book(4500);click('[data-a=mappr]');click('#apbtn');
 ev("S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})");typeIn('#vxa','800');typeIn('#vxr','Extra pipe run found');click('[data-a=xphoto]');typeIn('#vxa','800');typeIn('#vxr','Extra pipe run found');click('[data-a=xsend]');
 ev("S.stack=[];S.role='manager';render();go('mjob',{id:'m1'})");ok(/\$5,300/.test(txt())&&!/Needs/.test(txt())&&!/Quotes needed/.test(txt())&&!$('[data-a=varapprove]').disabled,'an extra needs no limit and no owner approval unless the owner box is ticked');
 // building and OC managers still see building wording
 ev("S.prof.role='OC manager';S.stack=[];S.tab.manager='bld';render()");ok($$('.nav button').some(b=>/Buildings/.test(b.textContent))&&/Buildings/.test($('#view h1').textContent)&&/＋ Add a building/.test(txt()),'building and OC managers still see Buildings');
 console.log(errs.length?'ERRORS '+errs.join('|'):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,5).join('\n'))}process.exit(0)},400);
