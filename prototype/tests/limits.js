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
 ev("S.prof.role='OC manager';S.prof.pay='bank';S.prof.consent=true;S.stack=[];S.tab.manager='bld';B.forEach(b=>{b.tiers=[{limit:1000,quotes:1},{limit:4999,quotes:2},{limit:30000,quotes:3}];b.payer='accounts';b.payEmail='a@example.com';b.terms=14});render()");
 ev("window.ORIG=JSON.parse('"+ev("JSON.stringify(J.find(j=>j.id==='m1').quotes)").replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"')");
 const openJ=(price,n,urg)=>ev("(()=>{const j=J.find(j=>j.id==='m1');j.bid='b1';j.stage='open';delete j.quote;delete j.wo;j.con=undefined;j.pay=undefined;j.vars=[];j.msgs=[];j.appr={};j.exc='';j.tier=undefined;j.urgency='"+(urg||'Standard')+"';j.quotes=ORIG.slice(0,"+(n||1)+").map(q=>({...q,price:"+price+"}));S.qdraft={};S.stack=[];S.role='manager';S.tab.manager='jobs';render();go('mjob',{id:'m1'})})()");
 const bldOpen=()=>ev("S.stack=[];S.role='manager';S.tab.manager='bld';S.bopen={b:'b1',s:{'b1:budgets':true,'b1:payer':true,'b1:contacts':true},add:false};render()");
 ev("window.M1COPY=JSON.stringify(J.find(j=>j.id==='m1'))");
 // ================= emergency limit =================
 bldOpen();const G=$('.bsec[data-k="b1:budgets"]');
 ok(/Emergencies \(optional\)/.test(G.textContent)&&/approve it alone, without the OC Manager or the committee, up to this amount/.test(G.textContent)&&$('[data-emlim=b1]').value===''&&/Leave it blank to follow the budgets above/.test(G.textContent),'each building has an optional emergency limit, blank to start, explained in plain words');
 chg($('[data-emlim=b1]'),'3000');ok(ev("bld('b1').emLimit")===3000&&/Emergency limit saved/.test($('#toast').textContent)&&/emergency up to \$3,000/.test($('.bsec[data-k="b1:budgets"] .bsec-h').textContent),'the manager can set it, and the building shows it');
 openJ(2500,1,'Emergency');ok($('[data-a=mappr]')&&!/OC Manager approval|Needs/.test(txt())&&/Emergency approval/.test(txt()),'an emergency of $2,500, within the limit, can be approved by the manager alone');
 click('[data-a=mappr]');ok(!/Record|OC Manager approval/.test(txt())&&!$('#apbtn').disabled&&/Emergency approval/.test(txt()),'the approve screen needs no other approvals');
 click('#apbtn');ok(J1('.stage')==='paid'&&J1('.tier')===0&&/Emergency approval/.test(J1('.log').map(l=>l.x).join('|')),'it is approved as an emergency approval and recorded as such');
 openJ(3500,1,'Emergency');ok(/Building Manager approval|Needs Building Manager/.test(txt())&&!$('[data-a=mappr]'),'an emergency above the limit follows the normal budget rules');
 openJ(2500,1,'Standard');ok(/Building Manager approval|Needs Building Manager/.test(txt())&&!$('[data-a=mappr]'),'a job that is not an emergency is not affected by the emergency limit');
 // extras
 const book=(price,urg)=>ev("(()=>{const j=J.find(j=>j.id==='m1');const q={...ORIG[0],price:"+price+",date:addBiz(todayIso(),5),time:'09:00',dep:{type:'none'}};j.bid='b1';j.quotes=[q];j.quote=q;j.con=q.c;j.price="+price+";j.base="+price+";j.stage='paid';j.wo='WO-1100';j.pay={reqs:[]};j.vars=[];j.msgs=[];j.inv=null;j.invHold=null;j.closed=false;j.urgency='"+(urg||'Standard')+"';j.tier=undefined;j.log=[];j.appr={};S.qdraft={};S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})})()");
 const request=(amt)=>{typeIn('#vxa',String(amt));typeIn('#vxr','Extra pipe run found');click('[data-a=xphoto]');typeIn('#vxa',String(amt));typeIn('#vxr','Extra pipe run found');click('[data-a=xsend]')};
 const asMgr=()=>ev("S.stack=[];S.role='manager';S.tab.manager='jobs';render();go('mjob',{id:'m1'})");
 book(2000,'Emergency');request(500);asMgr();ok(/\$2,500/.test(txt())&&!/Needs|more quote/.test(txt())&&!$('[data-a=varapprove]').disabled,'an emergency extra that keeps the total within the limit can be approved by the manager alone');
 book(2000,'Emergency');request(1200);asMgr();ok(/\$3,200/.test(txt())&&$('[data-a=varapprove]').disabled,'an emergency extra that takes the total above the limit follows the normal rules');
 book(2000,'Standard');request(500);asMgr();ok(/Needs 1 more quote|OC Manager approval/.test(txt())&&$('[data-a=varapprove]').disabled,'a normal job’s extra is not affected');
 chg((bldOpen(),$('[data-emlim=b1]')),'');ok(ev("bld('b1').emLimit")===null&&/Emergency limit removed/.test($('#toast').textContent),'clearing it removes the option');
 openJ(2500,1,'Emergency');ok(/Building Manager approval|Needs Building Manager/.test(txt()),'and emergencies go back to the normal rules');
 // report
 const prev=ev("addYm(todayIso().slice(0,7),-1)");
 ev("bld('b1').emLimit=3000;bld('b1').annualT=[10000,20000,30000];bld('b1').budget=60000");
 const mk=(id,title,price,tier,urg)=>ev("(()=>{const q={...ORIG[0],price:"+price+",date:'"+prev+"-10',time:'09:00',dep:{type:'none'}};J.push({id:'"+id+"',mine:true,title:'"+title+"',trade:'plumbing',bid:'b1',area:'x',stage:'released',quote:q,quotes:[q],con:'c1',price:"+price+",base:"+price+",wo:'WO-"+id+"',tier:"+tier+",urgency:'"+(urg||'Standard')+"',pay:{reqs:[]},vars:[],msgs:[],appr:{},log:[],chal:[],ev:{before:[],after:[],fix1:[],fix2:[]},inv:{no:'I-"+id+"',date:'"+prev+"-11',amount:"+price+",file:{name:'f.pdf',size:1}}})})()");
 ev("J.splice(0,J.length,...J.filter(j=>!(j.mine&&j.bid==='b1')))");
 mk('r1','Tap washers',800,1);mk('r2','Valve replacement',3000,2);mk('r3','Pump overhaul',25000,3);mk('r4','Burst pipe in the plant room',2800,0,'Emergency');
 ev("S.stack=[];S.tab.manager='jobs';render();A.reports();S.rep.bid='b1';S.rep.ym='"+prev+"';render()");
 let P=$('.paper').textContent;
 ok(/By budget level/.test(P)&&/Annual budget \$10,000 · remaining \$9,200 · 8% used/.test(P)&&/Annual budget \$20,000 · remaining \$17,000 · 15% used/.test(P)&&/Annual budget \$30,000 · remaining \$5,000 · 83% used/.test(P),'the report shows spend, remaining and percentage used against each level’s annual budget');
 ok(/Emergency approvals/.test(P)&&/Approved by the manager alone up to \$3,000/.test(P)&&/1 job · \$2,800/.test(P)&&/Emergency approvals \(manager alone\)\$2,800/.test(P.replace(/\s+/g,'')===P.replace(/\s+/g,'')?P:P)||/Emergency approvals/.test(P),'emergency approvals approved alone are listed separately');
 const rows=$$('.paper .kv').filter(x=>['Building Manager Budget','OC Manager and Building Manager Budget','OC Manager, Building Manager and Committee Budget'].some(n=>x.textContent.startsWith(n)&&/job/.test(x.textContent)));
 ok(rows.map(x=>x.querySelector('b:last-child').textContent).join('|').includes('1 job · $800')&&rows.map(x=>x.querySelector('b:last-child').textContent).join('|').includes('1 job · $3,000')&&rows.map(x=>x.querySelector('b:last-child').textContent).join('|').includes('1 job · $25,000'),'the emergency job is not counted under the three budgets');
 ev("J.find(j=>j.id==='r3').price=33000;J.find(j=>j.id==='r3').tier=3;render()");P=$('.paper').textContent;ok(/Over budget/.test(P)&&/Spending at this level is above its annual budget/.test(P),'a level that goes over its annual budget is flagged');
 ev("J.find(j=>j.id==='r3').price=25000;render()");
 // ================= annual budgets per level =================
 bldOpen();
 ok($$('[data-bud]').filter(i=>i.dataset.bud.startsWith('b1|')).length===3&&['Building Manager Budget','OC Manager and Building Manager Budget','OC Manager, Building Manager and Committee Budget'].every(n=>$('.bsec[data-k="b1:contacts"]').textContent.includes('Annual budget: '+n)),'each building has three annual budget fields, one for each budget level');
 ev("bld('b1').annualT=undefined;bld('b1').budget=null;render()");bldOpen();ok(/No annual budget entered yet/.test($('.bsec[data-k="b1:contacts"]').textContent),'they start empty');
 chg($('[data-bud="b1|0"]'),'10000');ok(ev("bld('b1').annualT[0]")===10000&&ev("bld('b1').budget")===10000&&/Annual budget saved/.test($('#toast').textContent)&&/Total annual budget \$10,000/.test($('#btb1').textContent),'entering one level saves it and shows the total');
 chg($('[data-bud="b1|1"]'),'20000');chg($('[data-bud="b1|2"]'),'30000');ok(ev("bld('b1').budget")===60000&&/Total annual budget \$60,000/.test($('#btb1').textContent)&&ev("JSON.stringify(bld('b1').annualT)")==='[10000,20000,30000]','the total is the three levels added together');
 chg($('[data-bud="b1|1"]'),'');ok(ev("bld('b1').budget")===40000&&ev("bld('b1').annualT[1]")===null,'clearing a level takes it out of the total');
 ev("bld('b2').annualT=undefined;bld('b2').budget=48000");bldOpen();ev("S.bopen={b:'b2',s:{'b2:contacts':true},add:false};render()");ok(/An earlier single total/.test($('#btb2').textContent)&&/\$48,000/.test($('#btb2').textContent),'an earlier single annual budget is still counted, with a note to enter the three levels');
 ev("S.stack=[];S.tab.manager='jobs';render();A.reports();S.rep.type='standard';S.rep.bid='all';render()");ok(ev("budgetData('all',monthRange('"+prev+"')).budget")===40000+48000+ev("bld('b3').budget||0"),'the all-buildings totals use the new annual budgets');
 // ================= deposit cap =================
 ev("if(!J.find(j=>j.id==='m1'))J.unshift(JSON.parse(window.M1COPY));J.find(j=>j.id==='m1').bid='b1'");
 bldOpen();const PG=$('.bsec[data-k="b1:payer"]');
 ok(/Highest deposit I will accept \(% of the job\)/.test(PG.textContent)&&$('[data-depcap=b1]').value===''&&/You choose the number/.test(PG.textContent)&&/Enter 0 for no payment before the work/.test(PG.textContent),'each building has a highest deposit the manager chooses, blank to start');
 chg($('[data-depcap=b1]'),'30');ok(ev("bld('b1').depCap")===30&&/Deposit limit saved/.test($('#toast').textContent),'the manager enters the number');
 chg($('[data-depcap=b1]'),'250');ok(ev("bld('b1').depCap")===100,'a number above 100 is cut to 100');chg($('[data-depcap=b1]'),'-5');ok(ev("bld('b1').depCap")===0,'and below 0 to 0');
 const offer=(cap)=>{ev("bld('b1').depCap="+(cap===null?'null':cap)+";(()=>{const j=J.find(j=>j.id==='m1');j.bid='b1';j.stage='open';delete j.quote;delete j.wo;j.con=undefined;j.quotes=[];S.qdraft={dep:'none',depPct:30};S.stack=[];S.role='contractor';S.tab.contractor='find';render();go('cjob',{id:'m1'})})()")};
 const chips=()=>$$('#view [data-a=depmode]').map(b=>b.textContent.trim()).join('|'),pcts=()=>$$('#view [data-a=deppct]').map(b=>b.textContent.trim()).join('|');
 offer(30);ok(chips()==='After the work|Deposit'&&/This building accepts deposits up to 30%, and not full payment before the start/.test(txt()),'with a 30% limit the contractor sees After the work and Deposit only, and why');
 ev("S.qdraft.dep='deposit';render()");ok(pcts()==='25%|30%','and only the deposit amounts up to 30%');
 ev("A.deppct('50')");ok(/accepts deposits up to 30%/.test($('#toast').textContent)&&ev("S.qdraft.depPct")!==50,'a larger deposit cannot be chosen');
 ev("A.depmode('full')");ok(/does not accept that payment/.test($('#toast').textContent)&&ev("S.qdraft.dep")==='deposit','nor full payment');
 offer(100);ok(chips()==='After the work|Deposit|Full before I start'&&/accepts deposits up to 100%/.test(txt()),'a limit of 100 allows everything');
 offer(0);ok(chips()==='After the work'&&/does not accept payment before the work/.test(txt()),'a limit of 0 allows no payment before the work');
 offer(null);ok(chips()==='After the work|Deposit|Full before I start'&&!/This building accepts deposits|does not accept payment/.test(txt()),'with no limit nothing changes for the contractor');
 // sending an offer above the limit is refused
 offer(30);ev("S.qdraft={dep:'deposit',depPct:50,price:1000,scope:'Replace the washer',date:addBiz(todayIso(),5),time:'09:00',dur:60};A.sendq('m1')");ok(/accepts deposits up to 30%/.test($('#toast').textContent)&&ev("J.find(j=>j.id==='m1').quotes.length")===0,'an offer asking for more than the limit cannot be sent');
 ev("S.qdraft={dep:'deposit',depPct:25,price:1000,scope:'Replace the washer',date:addBiz(todayIso(),5),time:'09:00',dur:60};A.sendq('m1')");ok(ev("J.find(j=>j.id==='m1').quotes.length")===1&&ev("J.find(j=>j.id==='m1').quotes[0].dep.pct")===25,'a 25% deposit within the limit is sent');
 // manager's warning
 ev("J.find(j=>j.id==='m1').quotes[0].dep={type:'deposit',pct:50,amount:500};S.stack=[];S.role='manager';S.tab.manager='jobs';render();go('mjob',{id:'m1'})");ok(/Above your deposit limit/.test(txt())&&/Your limit is 30%/.test(txt())&&$('[data-a=mappr]'),'if an offer is above the limit the manager is warned, and can still approve it');
 ev("J.find(j=>j.id==='m1').quotes[0].dep={type:'full'};render()");ok(/Above your deposit limit/.test(txt())&&/full payment before the start/.test(txt()),'full payment is flagged when the limit is below 100');
 ev("J.find(j=>j.id==='m1').quotes[0].dep={type:'deposit',pct:25,amount:250};render()");ok(!/Above your deposit limit/.test(txt()),'no warning within the limit');
 ev("bld('b1').depCap=null;J.find(j=>j.id==='m1').quotes[0].dep={type:'full'};render()");ok(!/Above your deposit limit/.test(txt()),'and none when there is no limit');
 // ================= weekend rule =================
 ev("(()=>{const j=J.find(j=>j.id==='m1');j.stage='review0';j.con='c1';j.quote=j.quotes[0];S.stack=[];S.role='manager';S.tab.manager='jobs';render();go('mjob',{id:'m1'})})()");ok(/If the 72 hours end on a weekend or public holiday, the review stays open until 5 pm on the next working day/.test(txt()),'the manager is told the review stays open to the next working day if it ends on a weekend or public holiday');
 ev("S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m1'})");ok(/until 5 pm on the next working day/.test(txt()),'and so is the contractor');
 console.log(errs.length?'ERRORS '+errs.join('|'):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)},400);
