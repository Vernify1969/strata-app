const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync((process.env.APP||require('path').join(__dirname,'..','taskspeck-managers.html')),'utf8');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message))}});
const w=dom.window,d=w.document;let fail=0;
const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const $=s=>d.querySelector(s),$$=s=>[...d.querySelectorAll(s)],ev=c=>w.eval(c),txt=()=>$('#view').textContent;
const click=s=>{const e=typeof s==='string'?$(s):s;if(!e)throw new Error('missing '+s);e.click()};
const type=(s,v)=>{const e=$(s);e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}));e.dispatchEvent(new w.Event('change',{bubbles:true}))};
setTimeout(()=>{try{
 ev("S.prof.role='Building manager';S.prof.pay='bank';S.prof.consent=true;S.stack=[];S.tab.manager='bld';render()");
 ok(/Tap a building to open it/.test(txt())&&$$('.bcard').length===3&&$$('.bcard.open').length===0,'Buildings is a short list of three closed buildings');
 const c1=$('.bcard[data-b=b1]');ok(/Southbank Residences/.test(c1.textContent)&&/Starting amounts/.test(c1.querySelector('.bsec-h').textContent)&&/Payer not set/.test(c1.querySelector('.bsec-h').textContent),'each building shows its name, address and whether budgets and payer are set');
 ok(['photos','budgets','payer','contacts','site','rpt','qlinks','edit'].every(k=>$('.bsec[data-k="b1:'+k+'"]'))&&$$('.bcard[data-b=b1] .bsec').length===9,'each building has nine drop-down groups: photos, budgets, who pays, annual budgets and committee, working hours, history, edit details or archive, reporting and QR codes, manager shortcut links');
 ok(/Approval budgets/.test($('.bsec[data-k="b1:budgets"]').textContent)&&/starting amounts/.test($('.bsec[data-k="b1:budgets"] .bsec-h').textContent)&&/\$999 · \$4,999 · \$30,000/.test($('.bsec[data-k="b1:budgets"] .bsec-h').textContent),'the budgets group shows the starting amounts until they are checked');
 // open one building at a time
 click('[data-a=bopen][data-v=b1]');ok($('.bcard[data-b=b1]').classList.contains('open')&&!$('.bcard[data-b=b2]').classList.contains('open')&&ev('S.bopen.b')==='b1','tapping a building opens it');
 click('[data-a=bopen][data-v=b2]');ok(!$('.bcard[data-b=b1]').classList.contains('open')&&$('.bcard[data-b=b2]').classList.contains('open'),'opening another building closes the first');
 click('[data-a=bopen][data-v=b2]');ok($$('.bcard.open').length===0,'tapping it again closes it');
 // sections
 click('[data-a=bopen][data-v=b1]');click('[data-a=bsec][data-v="b1:budgets"]');ok($('.bsec[data-k="b1:budgets"]').classList.contains('open')&&!$('.bsec[data-k="b1:payer"]').classList.contains('open'),'tapping a group opens only that group');
 ev("render()");ok($('.bcard[data-b=b1]').classList.contains('open')&&$('.bsec[data-k="b1:budgets"]').classList.contains('open'),'what is open stays open after the screen refreshes');
 click('[data-a=bsec][data-v="b1:budgets"]');ok(!$('.bsec[data-k="b1:budgets"]').classList.contains('open'),'tapping the group again closes it');
 // entering values updates the summaries
 [[1000,1],[4999,2],[30000,3]].forEach(([l,q],i)=>{type('[data-tier="b1|'+i+'|limit"]',String(l));type('[data-tier="b1|'+i+'|quotes"]',String(q))});
 const py=$('[data-payer=b1]');py.value='accounts';py.dispatchEvent(new w.Event('change',{bubbles:true}));type('[data-payemail=b1]','a@example.com');type('[data-terms=b1]','14');
 ev("render()");const h1=$('.bcard[data-b=b1] .bsec-h').textContent;
 ok(/Budgets set/.test(h1)&&/Payer set/.test(h1)&&/\$1,000 · \$4,999 · \$30,000/.test($('.bsec[data-k="b1:budgets"]').textContent)&&/Accounts · 14 days/.test($('.bsec[data-k="b1:payer"] .bsec-h').textContent),'after entering the budgets and the payer the summaries and pills update');
 ok(/0 of 2 photos/.test($('.bsec[data-k="b1:photos"] .bsec-h').textContent)&&/Not set|Annual budgets not set/.test($('.bsec[data-k="b1:contacts"] .bsec-h').textContent)&&/8 am to 5 pm|8:00|8 am/.test($('.bsec[data-k="b1:site"] .bsec-h').textContent),'photos, annual budget and working hours also show a summary');
 // add a building
 ok(!$('#addb').classList.contains('open'),'the Add a building group starts closed');
 click('[data-a=bnew]');ok($('#addb').classList.contains('open')&&$('[data-m="nb.name"]'),'Add a building opens a form in place');
 type('[data-m="nb.name"]','Balwyn Court');type('[data-m="nb.street"]','2 Sample Road');const sb=$('input[data-m=\"nb.suburb\"]');sb.value='Balwyn';sb.dispatchEvent(new w.Event('input',{bubbles:true}));{const pe=$('input[data-m="nb.pc"]');pe.value='3103';pe.dispatchEvent(new w.Event('input',{bubbles:true}))};type('[data-m="nb.oc"]','PS 777');
 click('[data-a=bsave]');ok($$('.bcard').length===4&&/Balwyn Court/.test(txt())&&!$('#addb').classList.contains('open')&&$('.bcard[data-b=b4]').classList.contains('open')&&/Building added/.test($('#toast').textContent),'saving adds the building, closes the form and opens the new building');
 click('[data-a=bnew]');ev("S.set.radius=12");type('[data-m="nb.name"]','Box Hill Towers');type('[data-m="nb.street"]','1 Sample Street');const s2=$('input[data-m=\"nb.suburb\"]');s2.value='Box Hill';s2.dispatchEvent(new w.Event('input',{bubbles:true}));{const pe=$('input[data-m="nb.pc"]');pe.value='3128';pe.dispatchEvent(new w.Event('input',{bubbles:true}))};click('[data-a=bsave]');
 ok(/We do not cover this area yet/.test($('#addb').textContent)&&$('#addb').classList.contains('open')&&$$('.bcard').length===4,'an address outside the area shows the notice inside the form');
 click('[data-a=wait]');ok(!$('#addb').classList.contains('open')&&ev('S.waitlist.length')===1&&/Box Hill Towers/.test(txt()),'joining the waiting list closes the form and lists it');
 // deep links
 ev("window.ORIG=JSON.parse('"+ev("JSON.stringify(J.find(j=>j.id==='m1').quotes)").replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"')");
 ev("bld('b2').tiers=[{limit:null,quotes:null},{limit:null,quotes:null},{limit:null,quotes:null}];J.find(j=>j.id==='m1').bid='b2';J.find(j=>j.id==='m1').quotes=ORIG.slice(0,1);S.bopen={b:null,s:{},add:false};S.stack=[];S.role='manager';S.tab.manager='jobs';render();go('mjob',{id:'m1'})");
 ok(/Set the approval budgets first/.test(txt())&&$('[data-a=gotob][data-v="b2|budgets"]'),'a quote card that cannot be approved links to that building’s budgets');
 click('[data-a=gotob][data-v="b2|budgets"]');ok(ev("cur().n")==='bld'||/Tap a building to open it/.test(txt()),'Go to Buildings opens the Buildings tab');
 ok($('.bcard[data-b=b2]').classList.contains('open')&&$('.bsec[data-k="b2:budgets"]').classList.contains('open')&&!$('.bsec[data-k="b2:payer"]').classList.contains('open'),'with that building and its budgets group already open');
 // who pays link
 ev("bld('b2').tiers=[{limit:1000,quotes:1},{limit:4999,quotes:2},{limit:30000,quotes:3}];const j=J.find(j=>j.id==='m1');const q=j.quotes[0];j.quote=q;j.con=q.c;j.price=q.price;j.stage='paid';j.wo='WO-1;';j.wo='WO-1099';j.pay={reqs:[]};S.bopen={b:null,s:{},add:false};S.stack=[];S.tab.manager='jobs';render();go('mjob',{id:'m1'})");
 ok($('[data-a=gotob][data-v="b2|payer"]'),'a job that needs who pays links to the who-pays group');
 click('[data-a=gotob][data-v="b2|payer"]');ok($('.bsec[data-k="b2:payer"]').classList.contains('open')&&$('.bcard[data-b=b2]').classList.contains('open'),'and opens that group');
 // property managers
 ev("S.prof.role='Property manager';S.bopen={b:null,s:{},add:false};S.stack=[];S.tab.manager='bld';render()");
 ok(!/Limit/.test($('.bcard[data-b=b1]').textContent)&&$('.bsec[data-k="b1:contacts"]')&&/Property owner/.test($('.bsec[data-k="b1:contacts"]').textContent)&&/Quotes/.test($('.bsec[data-k="b1:budgets"] .bsec-h').textContent)&&!$('[data-lim=b1]')&&$('[data-pmq=b1]'),'property managers see a Quotes group and a property owner group, with no limit and no budgets');
 console.log(errs.length?'ERRORS '+errs.join('|'):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,4).join('\n'))}process.exit(0)},400);
