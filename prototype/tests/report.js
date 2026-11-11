const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync((process.env.APP||require('path').join(__dirname,'..','taskspeck-managers.html')),'utf8');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message))}});
const w=dom.window,d=w.document;let fail=0;
const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const $=s=>d.querySelector(s),$$=s=>[...d.querySelectorAll(s)],ev=c=>w.eval(c),txt=()=>$('#view').textContent;
const click=s=>{const e=typeof s==='string'?$(s):s;if(!e)throw new Error('missing '+s);e.click()};
const OWN=/owner(?!s corporation| corporation|s’ corporation)/i;
setTimeout(()=>{try{
 const prev=ev("addYm(todayIso().slice(0,7),-1)");
 for(const role of ['Building manager','OC manager']){
  ev("S.prof.role='"+role+"';S.prof.pay='bank';S.prof.consent=true;S.prof.oc='Southbank OC';S.prof.abn='12 345 678 319';S.prof.billing='a@b.co';S.role='manager';S.stack=[]");
  const L=role+': ';
  // ---- no owner details for building, OC and strata managers
  ev("S.tab.manager='bld';S.bopen={b:'b1',s:{'b1:payer':true,'b1:contacts':true,'b1:budgets':true},add:false};render()");
  ok($$('select[data-payer=b1] option').map(o=>o.textContent).join('|')==='Choose|Accounts (OC or agency)|The manager','Who pays offers Accounts or The manager, not a property owner ('+L+')');
  ok(!OWN.test($('.bsec[data-k="b1:contacts"]').textContent.replace('Annual budgets and committee','')),'the annual budgets and committee group has no owner fields ('+L+')');
  ev("S.stack=[];S.tab.manager='jobs';render();go('mjob',{id:'m4'})");ok(!/Job report|property owner/.test(txt())&&/Job documents/.test(txt()),'a finished job shows its documents but no job report for an owner ('+L+')');
  ev("A.jrview('m4')");ok(ev("cur().n")!=='jobreport','the owner job report cannot be opened ('+L+')');
  ev("S.stack=[];S.tab.manager='mprof';render()");ok(!$('[data-a=owner]')&&!/Owner settings/.test(txt()),'the profile has no Owner settings link ('+L+')');
  // ---- a leftover report type from another role is replaced
  ev("S.stack=[];S.tab.manager='jobs';S.rep.type='job';render();go('reports')");ok(ev("S.rep.type")==='committee'&&!OWN.test(txt().replace(/Owner settings/g,''))&&/Monthly Maintenance Report/.test(txt()),'reports never show owner job reports to this role, even with an old saved choice ('+L+')');
  ev("S.stack=[];S.tab.manager='jobs';render();A.reports();S.rep.bid='b1';S.rep.ym='"+prev+"';render()");
  const P=$('.paper');
  ok($$('.paper h3.rsec').map(h=>h.textContent).join('|')==='1. Work completed|2. Spending|3. Approvals|4. Extra work and invoices|5. Safety|6. Needs attention and coming up'||/^1\. Work completed\|2\. Spending\|3\. Approvals\|4\. Extra work and invoices\|5\. Safety\|6\. Needs attention and coming up/.test($$('.paper h3.rsec').map(h=>h.textContent).join('|')),'the monthly report has six numbered sections in a clear order ('+L+')');
  const sub=$$('.paper .rsub').map(x=>x.textContent);
  ok(['Budgets and approvals','Spend against the annual budget','Extra work approved','Invoice variances','Approved by the committee','Approved with fewer quotes','Work orders and invoices','Needs attention now','Booked after this period'].every(t=>sub.includes(t)),'every earlier part is still there, as a sub heading ('+L+')');
  ok($$('.paper h3').every(h=>h.classList.contains('rsec')||/^Appendix|^WO-/.test(h.textContent)),'no loose headings are left between the sections ('+L+')');
  const secs=$$('.paper h3.rsec');const i3=secs.findIndex(h=>/Approvals/.test(h.textContent));ok(/Budgets and approvals/.test(P.textContent.slice(P.textContent.indexOf('3. Approvals'),P.textContent.indexOf('3. Approvals')+80)),'budgets and approvals sit under Approvals ('+L+')');
  const tierRows=$$('.paper .kv b.nw');ok(tierRows.length>=3&&tierRows.every(b=>/job/.test(b.textContent)),'the jobs and amount for each budget stay on one line ('+L+')');
  ok(!OWN.test(P.textContent),'the report has no owner wording ('+L+')');
  // summary report
  ev("S.rep.type='standard';render()");ok($$('.paper h3.rsec').map(h=>h.textContent).join('|')==='1. Work completed|2. Spending|3. Work orders and invoices|4. Safety|5. Needs attention and coming up','the summary report has five numbered sections ('+L+')');
 }
 // ---- property managers still have their owner features
 ev("S.prof.role='Property manager';S.stack=[];S.tab.manager='bld';S.bopen={b:'b1',s:{'b1:payer':true},add:false};render()");
 ok($$('select[data-payer=b1] option').map(o=>o.textContent).join('|')==='Choose|Accounts (OC or agency)|Property owner|The manager','property managers can still choose the property owner as payer');
 ev("S.stack=[];S.tab.manager='jobs';render();go('mjob',{id:'m4'})");ok(/Job report/.test(txt())&&/property owner/.test(txt()),'and still get the job report for the owner');
 ev("S.stack=[];S.tab.manager='jobs';S.rep.type='committee';render();go('reports')");ok(ev("S.rep.type")==='job','a property manager is moved off the monthly report to job reports');
 console.log(errs.length?'ERRORS '+errs.join('|'):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)},400);
