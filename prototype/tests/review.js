const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync((process.env.APP||require('path').join(__dirname,'..','taskspeck-managers.html')),'utf8');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message))}});
const w=dom.window,d=w.document;let fail=0;
const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const $=s=>d.querySelector(s),ev=c=>w.eval(c),txt=()=>$('#view').textContent;
const click=s=>{const e=typeof s==='string'?$(s):s;if(!e)throw new Error('missing '+s);e.click()};
setTimeout(()=>{try{
 ev("S.prof.role='Building manager';S.prof.pay='bank';S.prof.consent=true;S.stack=[];render()");
 ok(ev("REVIEW_H")===72,'the review window is 72 hours, which is 48 hours plus one more day');
 const cj=ev("J.find(j=>j.mine&&j.chal&&j.chal.length&&j.chal[0].proof&&j.chal[0].proof.length).id");
 ok(!!cj,'seeded challenged jobs carry the manager’s photos');
 ev("go('evid',{id:'"+cj+"'})");ok(/Manager’s photos: first challenge/.test(txt()),'the evidence record shows the manager’s challenge photos');
 ev("S.stack=[];render();go('jobreport',{id:'"+cj+"'})");ok(/Fix requests/.test($('.paper').textContent)&&/2 photos/.test($('.paper').textContent),'the job report lists the fix request with its photo count');
 // proforma (48 hours) is unchanged
 ok(ev("(()=>{const j=J.find(j=>j.id==='m1');j.quote={...j.quote,date:'2030-01-10',time:'09:00'};return upDue(j).iso+' '+upDue(j).hm})()")==='2030-01-08 09:00','a deposit or proforma request is still due 48 hours before the works start');
 // contractor-side text and skip
 ev("(()=>{const j=J.find(j=>j.id==='m3');j.stage='review0';j.con='c1';j.wo=j.wo||'WO-1';S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m3'})})()");
 ok(/The manager has 72 hours to accept or challenge/.test(txt())&&/must show with photos what is wrong/.test(txt()),'the contractor is told the manager has 72 hours and must show photos to challenge');
 ev("S.stack=[];S.role='manager';render();go('mjob',{id:'m3'})");click('[data-a=skiprev]');
 ok(ev("J.find(j=>j.id==='m3').stage")==='released'&&ev("J.find(j=>j.id==='m3').log.some(l=>/No response in 72 hours/.test(l.x))")&&/72 hours passed/.test($('#toast').textContent),'with no response after 72 hours the work counts as accepted');
 console.log(errs.length?'ERRORS '+errs.join('|'):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,4).join('\n'))}process.exit(0)},400);
