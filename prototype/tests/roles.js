const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync((process.env.APP||require('path').join(__dirname,'..','taskspeck-managers.html')),'utf8');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message))}});
const w=dom.window,d=w.document;let fail=0;
const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const $=s=>d.querySelector(s),$$=s=>[...d.querySelectorAll(s)],ev=c=>w.eval(c),txt=()=>$('#view').textContent;
const click=s=>{const e=typeof s==='string'?$(s):s;if(!e)throw new Error('missing '+s);e.click()};
const pick=(sel,v)=>{const e=$(sel);e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))};
setTimeout(()=>{try{
 const prof=r=>ev("S.prof.role='"+r+"';S.prof.pay='bank';S.prof.consent=true;S.stack=[];S.tab.manager='mhome';render()");
 // ---------- building and strata managers ----------
 prof('Building manager');
 click('#view [data-a=reports]');
 ok(/Monthly Maintenance Report/.test(txt())&&$$('#view .chips .chip').map(c=>c.textContent).join('|').includes('Monthly Maintenance Report')&&!/Job reports/.test(txt()),'a building manager’s Reports opens on the monthly committee report, with no Job reports');
 ok($('.noprint.card [data-a=pdf]')&&$('[data-a=cmcopy]')&&$('[data-a=subview]'),'the committee report can be downloaded as a PDF or emailed to the manager, and last month shows as submitted');
 ev("S.subs=S.subs.filter(s=>!(s.bid===S.rep.bid&&s.ym===S.rep.ym));render()");ok($('[data-a=cmsubmit]')&&!$('[data-a=cmsubmit]').disabled,'an unsubmitted finished month can be submitted (emailed to the committee)');
 click('[data-a=cmcopy]');ok(/A copy was emailed to accounts@example\.com/.test($('#toast').textContent),'Email me a copy goes to the manager’s billing email (demo)');
 ev("S.stack=[];S.tab.manager='bld';render()");ok($('[data-cm=b1]')&&$('[data-bud="b1|0"]')&&!$('[data-own]'),'Buildings shows committee emails and budget, and no owner fields, for a building manager');
 prof('OC manager');click('#view [data-a=reports]');ok(/Monthly Maintenance Report/.test(txt()),'an OC manager also gets the committee report');
 // ---------- property managers ----------
 prof('Property manager');
 ev("S.subs=S.subs.filter(s=>s.ym!==addYm(todayIso().slice(0,7),-1));S.stack=[];S.tab.manager='mhome';render()");
 ok(!/Monthly Maintenance Report/i.test(txt()),'a property manager never sees the committee report reminder');
 click('#view [data-a=reports]');
 ok(/Job reports/.test(txt())&&/A report for each finished job/.test(txt())&&!/Monthly Maintenance Report/.test($('#view .chips').textContent),'a property manager’s Reports opens on Job reports');
 const L=ev("jrList().list.length");ok($$('#view .card').length===L&&L>=10,'every finished job has a report card ('+L+')');
 ok($$('#view .card')[0].querySelector('[data-a=jrview]')&&$$('#view .card')[0].querySelector('[data-a=jrsend]')&&/Not sent/.test($$('#view .card')[0].textContent),'each card has View report and Email to owner, and says Not sent');
 ev("S.stack=[];S.tab.manager='bld';render()");ok($('[data-own]')&&/Property owner email/.test(txt())&&!$('[data-cm]')&&!$('[data-bud]'),'Buildings asks for the property owner, not committee emails or budget');
 const oe=$('[data-own="ownerEmail|b1"]');oe.value='new.owner@example.com';oe.dispatchEvent(new w.Event('input',{bubbles:true}));ok(ev("bld('b1').ownerEmail")==='new.owner@example.com','the owner’s email can be edited');
 ev("S.stack=[];S.tab.manager='jobs';render()");click('[data-a=reports]');
 // view a job report
 const first=ev("jrList().list[0].id");click('[data-a=jrview][data-v='+first+']');
 const P=$('.paper').textContent;ok(/Job report WO-\d+/.test(P)&&['Property','The job','Costs','Safety','Photos and video','Documents','Activity'].every(h=>$$('.paper h3').some(x=>x.textContent===h)),'the job report has property, job, costs, safety, photos, documents and activity');
 ok(/What was done/.test(P)&&/Prepared/.test(P)&&/Property manager/.test(P)&&/QT-\d+/.test(P)&&/WO-\d+/.test(P),'it lists what was done, who prepared it, and the quote and work order numbers');
 ok($('[data-a=pdf]')&&$('[data-a=repprint]')&&/Email to /.test($('#view').textContent),'it can be downloaded, printed or emailed to the owner');
 // email it, then check the frozen copy
 const ownerName=ev("bld(J.find(j=>j.id==='"+first+"').bid).name");
 click('#view .noprint [data-a=jrsend]');ok(/Report emailed to/.test($('#toast').textContent),'emailing the report records it (demo)');
 ev("S.stack=[];render();go('reports',undefined)");
 ev("S.stack=[];render()");click('[data-a=tab][data-v=jobs]');click('[data-a=reports]');
 const card1=$$('#view .card').find(c=>c.querySelector('[data-a=jrview][data-v='+first+']'));ok(/Sent to the owner/.test(card1.textContent)&&card1.querySelector('[data-a=jrsent]')&&/Send again/.test(card1.textContent),'the card now says Sent to the owner, with Send again and Sent copy');
 const spendTxt=ev("money(J.find(j=>j.id==='"+first+"').price)");
 ev("J.find(j=>j.id==='"+first+"').price+=777;J.find(j=>j.id==='"+first+"').quote.price+=777");
 click(card1.querySelector('[data-a=jrsent]'));ok(/This is the report as it was sent/.test(txt())&&$('.paper').textContent.includes(spendTxt),'the sent copy stays as it was sent after the job changes');
 click('[data-a=back]');
 // missing owner email
 ev("bld('b1').ownerEmail=''");const b1job=ev("J.find(j=>j.mine&&j.stage==='released'&&j.bid==='b1'&&!sentOf(j)).id");
 click('[data-a=jrsend][data-v='+b1job+']');ok(/Add the property owner’s email/.test($('#toast').textContent),'sending without an owner email is refused with a hint');
 ev("bld('b1').ownerEmail='owner.southbank@example.com'");
 // filters
 pick('#jb','b3');ok($$('#view .card').every(c=>/Park Terrace Apartments/.test(c.textContent))&&$$('#view .card').length===ev("jrList().list.length"),'filtering by property shows only that property’s jobs');
 pick('#jb','all');const ym=ev("jrList().months[0]");pick('#jm',ym);ok(ev("jrList().list.every(j=>j.quote.date.startsWith('"+ym+"'))")&&$$('#view .card').length===ev("jrList().list.length"),'filtering by month works');
 pick('#jm','all');
 // email all unsent
 const un=ev("jrList().unsent.length");ok(un>=1&&/Email \d+ unsent report/.test(txt()),'a button emails all unsent reports ('+un+')');
 ev("bld('b2').ownerEmail=''");click('[data-a=jrall]');ok(/emailed \(demo\)/.test($('#toast').textContent)&&/skipped: no owner email/.test($('#toast').textContent),'bulk sending skips properties with no owner email');
 ev("bld('b2').ownerEmail='owner.riverside@example.com'");
 // automatic on close
 click('[data-a=jrmode][data-v=auto]');ok(ev('S.jmode')==='auto'&&/automatically/.test($('#toast').textContent),'emailing the owner automatically when a job is closed can be switched on (demo)');
 ev("const hj=J.find(j=>j.id==='h1');hj.closed=false;hj.inv={no:'INV-5',date:todayIso(),amount:hj.price,gst:true,file:{name:'x.pdf',size:1}};S.subs.length;S.stack=[];render();go('mjob',{id:'h1'})");
 const before=ev("S.jsent.filter(s=>s.jid==='h1').length");click('[data-a=closejob]');ok(/Job closed\. The report was emailed to the owner/.test($('#toast').textContent)&&ev("S.jsent.filter(s=>s.jid==='h1').length")===before+1,'closing a job emails the owner’s report when automatic is on');
 // job detail row, contractor sees none
 ev("S.stack=[];go('mjob',{id:'h1'})");ok(/Job report/.test(txt())&&$('[data-a=jrview]'),'the manager’s job documents include a Job report');
 ev("S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'h1'})");ok(!/Job report/.test(txt()),'the contractor does not see the manager’s job report');
 ev("S.role='manager'");
 console.log(errs.length?'ERRORS '+errs.join('|'):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,4).join('\n'))}process.exit(0)},400);
