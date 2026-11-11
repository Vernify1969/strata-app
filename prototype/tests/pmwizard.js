const {JSDOM}=require('jsdom');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.APP||path.join(__dirname,'..','taskspeck-managers.html'),'utf8');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mk=(url)=>{const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:url||'https://example.org/?demo=1'});const w=dom.window,d=w.document;return{w,d,$:s=>d.querySelector(s),$$:s=>[...d.querySelectorAll(s)],ev:c=>w.eval(c),txt:()=>d.querySelector('#view').textContent,click:s=>{const e=typeof s==='string'?d.querySelector(s):s;if(!e)throw new Error('missing '+s);e.click()},toast:()=>d.querySelector('#toast').textContent}};
const prof=I=>I.ev("S.prof.pay='bank';S.prof.consent=true;S.prof.abn='12 345 678 319';S.prof.billing='a@b.co';S.prof.oc='Agency (sample)'");
(async()=>{try{
 // ===== the ninth box =====
 let I=mk();await sleep(300);I.ev("S.tab.manager='mhome';S.stack=[];render()");
 const tiles=I.$$('.ptile'),names=t=>t.map(x=>x.querySelector('b').textContent);
 ok(tiles.length===13&&JSON.stringify(names(tiles))===JSON.stringify(['Plumbing','Electrical','Cleaning','Handyman','Air conditioning','Painting','Doors, gates and locks','Gardening and landscaping','Hard rubbish','Roofing and gutters','Pest control','Fire safety','Other service'])&&tiles.every(t=>t.dataset.a==='reqtrade'),'every service is a box: twelve trades, most requested first, and Other service last');
 ok(tiles[12].classList.contains('wide')&&!tiles.slice(0,12).some(t=>t.classList.contains('wide'))&&/\.ptile\.wide\{grid-column:1\/-1;/.test(html)&&/@media\(min-width:700px\)\{\.ptiles\{grid-template-columns:repeat\(3,1fr\)\}/.test(html),'twelve boxes make full rows of three (or two on a phone), and Other service is a full-width row at the end');
 ok(!/More services/.test(I.txt())&&I.$$('.chip[data-a=reqtrade]').length===0,'there is no separate More services list');
 I.click(tiles[12]);ok(I.ev("cur().n")==='new'&&I.ev("S.draft.trade")==='other'&&I.ev("S.step")===1,'tapping Other service starts a request for it');I.click(I.$('[data-a=back]'));I.ev("S.stack=[];S.draft=null;render()");I.click(I.$$('.ptile')[0]);ok(I.ev("S.draft.trade")==='plumbing','and the first box is Plumbing');I.w.close();
 I=mk('https://example.org/?demo=property');await sleep(300);I.ev("S.tab.manager='mhome';S.stack=[];render()");ok(I.$$('.ptile').length===13&&/Other service/.test(I.$$('.ptile')[12].textContent)&&I.$$('.ptile')[12].classList.contains('wide'),'property managers have the same boxes');I.w.close();
 I=mk('https://example.org/?demo=contractor');await sleep(300);ok(I.$$('.ptile').length===8&&!I.$$('.ptile').some(t=>/Other service/.test(t.textContent)),'contractors still have their eight, with job counts');I.w.close();
 // ===== a property is named once =====
 I=mk('https://example.org/?demo=property');await sleep(300);prof(I);I.ev("A.new()");
 const opts=I.$$('#view select option').map(o=>o.textContent);
 ok(opts.includes('5/12 Example Road, Richmond')&&!opts.some(o=>/Richmond, Richmond|Kew, Kew|Fitzroy, Fitzroy|Hawthorn, Hawthorn/.test(o)),'the property list shows each property once, without the suburb repeated');
 I.w.close();
 I=mk();await sleep(300);prof(I);I.ev("S.prof.role='Building manager'");I.ev("A.new()");{const o=I.$$('#view select option').map(o=>o.textContent);ok(o.includes('Southbank Residences')&&!o.some(x=>/Southbank, Southbank|Residences, Southbank/.test(x))&&o.some(x=>/^Riverside Gardens, \w+/.test(x)),'a building shows its name, and its suburb only when the name does not already say it');}
 I.ev("S.stack=[];A.emerg&&A.emerg();go('emerg')");I.w.close();
 // ===== the property request, step by step, in its own words =====
 const STRATA=/\bbuilding|residents|\bOC\b|committee|owners corporation|lift|lobby|corridor|plant room|car park|gym|strata/i;
 I=mk('https://example.org/?demo=property');await sleep(300);prof(I);I.ev("A.new();S.draft.bid='b1';S.draft.area='Kitchen';S.draft.title='Tap';S.draft.instr='Drips';S.draft.photos=1");
 const seen={};for(const st of [1,2,3,4,5]){I.ev("S.step="+st+";render()");const m=I.txt().match(STRATA);if(m)seen[st]=m[0]}
 ok(Object.keys(seen).length===0,'no step of a property manager’s request uses building, resident, OC, lift or committee wording '+JSON.stringify(seen));
 I.ev("S.step=4;render()");const t4=I.txt();
 ok(/Choose the date/.test(t4)&&/Choose the time/.test(t4)&&/Morning/.test(t4)&&/Afternoon/.test(t4)&&/Any time/.test(t4)&&/Exact start time/.test(t4)&&/Contractors can work: Mon to Fri, 9 am to 5 pm/.test(t4),'the time step has the date, the time of day and an exact start time, with the property’s entry hours');
 ok(/Who supplies materials/.test(t4)&&I.$$('select[data-m="draft.materials"] option').map(o=>o.textContent).join('|')==='Contractor supplies|Owner supplies|To be agreed','materials can be supplied by the contractor, the owner or agreed');
 ok(/Notice to the tenant/.test(t4)&&I.$$('select[data-m="draft.notice"] option').map(o=>o.textContent).join('|')==='No|Yes, 24 hours|Yes, 48 hours|Yes, 7 days|Yes, 14 days'&&/Tenants must be given proper notice of entry/.test(t4)&&/solicitor/.test(t4),'notice is to the tenant, with a reminder to check the period with a solicitor');
 I.ev("S.step=5;render()");const t5=I.txt();ok(/Invoice to \(agency or owner name\)/.test(t5)&&/ABN/.test(t5)&&!/OC ABN|OC name/.test(t5),'the last step asks who to invoice (agency or owner) and the ABN');
 I.ev("S.step=4;render()");I.ev("S.draft.date=addDays(todayIso(),1);while(dow(S.draft.date)===0||dow(S.draft.date)===6)S.draft.date=addDays(S.draft.date,1);S.draft.slot='any';S.draft.notice='Yes, 48 hours';S.draft.materials='Owner supplies';render()");
 ok(I.ev("S.draft.notice")==='Yes, 48 hours'&&I.ev("S.draft.materials")==='Owner supplies','the choices are kept');
 const n=I.ev("J.length");I.ev("S.step=5;render()");I.ev("A.post()");const j=JSON.parse(I.ev("JSON.stringify(J[0])"));
 ok(I.ev("J.length")===n+1&&j.notice==='Yes, 48 hours'&&j.materials==='Owner supplies'&&j.bid==='b1','the request is sent with those choices');
 I.ev("S.role='contractor';S.stack=[];S.tab.contractor='find';render();go('cjob',{id:'"+j.id+"'})");const c=I.txt();
 ok(/Notice to the tenant/.test(c)&&/Yes, 48 hours/.test(c)&&/Entry hours/.test(c),'a contractor sees the notice to the tenant and the entry hours');I.w.close();
 // strata request is unchanged
 I=mk();await sleep(300);prof(I);I.ev("S.prof.role='Building manager'");I.ev("A.new();S.draft.bid='b1';S.draft.area='Lobby';S.step=4;render()");
 ok(/Building supplies/.test(I.txt())&&/Notice to residents/.test(I.txt())&&!/Owner supplies|Notice to the tenant/.test(I.txt()),'a building manager’s request keeps Building supplies and Notice to residents');
 I.ev("S.step=5;render()");ok(/Invoice to \(OC name\)/.test(I.txt())&&/OC ABN/.test(I.txt()),'and Invoice to (OC name) and OC ABN');I.w.close();
 console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)})();
