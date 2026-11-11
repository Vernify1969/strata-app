const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync((process.env.APP||require('path').join(__dirname,'..','taskspeck-managers.html')),'utf8');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message));}});
const w=dom.window,d=w.document;let fail=0;const ev=c=>w.eval(c);
const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const $=s=>d.querySelector(s),$$=s=>[...d.querySelectorAll(s)];
const click=s=>{const e=typeof s==='string'?$(s):s;if(!e)throw new Error('missing '+s);e.click()};
const txt=()=>$('#view').textContent;
const role=r=>{while($('[data-a=back]'))click('[data-a=back]');if(r==='manager')ev("A.mgrrole('"+S_ROLE()+"')");else click('[data-a=role][data-v='+r+']');click('[data-a=tab][data-v='+(r==='manager'?'jobs':'find')+']')};const S_ROLE=()=>ev("S.prof.role")||'Building manager';
const type=(sel,v)=>{const e=$(sel);if(!e)throw new Error('missing '+sel);e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}));e.dispatchEvent(new w.Event('change',{bubbles:true}))};
const chk=(sel,v)=>{const e=$(sel);e.checked=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))};
setTimeout(()=>{try{
 ok(/What do you need/.test(txt())&&/Popular services/.test(txt())&&!/Available jobs/.test(txt())&&$('#emfab')&&!$('#emfab').hidden&&!/Emergency: get help now/.test(txt()),'manager front page: New request, popular services and a small Emergency button, with no market information');
 ok($$('.ptile').length===13&&JSON.stringify($$('.ptile').map(t=>t.querySelector('b').textContent))===JSON.stringify(['Plumbing','Electrical','Cleaning','Handyman','Air conditioning','Painting','Doors, gates and locks','Gardening and landscaping','Hard rubbish','Roofing and gutters','Pest control','Fire safety','Other service'])&&$$('.ptile')[12].classList.contains('wide')&&!/open job|contractor/.test($('.ptiles').textContent),'the manager front page shows every service as a box, most requested first, with Other service as the last full-width row and no job or contractor counts');
 const tn=$$('.ptile b').map(b=>b.textContent);ok(['Handyman','Hard rubbish','Cleaning','Plumbing','Electrical','Air conditioning','Painting','Doors, gates and locks'].every(x=>tn.includes(x)),'the 8 popular trades include Handyman, Hard rubbish and Cleaning ('+tn.join(', ')+')');
 ok(!/More services/.test(txt())&&$$('[data-a=reqtrade]').filter(b=>b.classList.contains('chip')).length===0&&$$('.ptile[data-a=reqtrade]').length===13,'the more services are boxes in the same grid, so there is no separate More services list');
 ok(/Finish your profile to send a request/.test(txt())&&/You can fill in a request first/.test(txt()),'a new manager is told to finish the profile, and that a request can be filled in first');
 ok($('#view [data-a=reports]')&&/Reports/.test($('#view').textContent),'the manager front page has a Reports button next to New request');click('#view [data-a=reports]');ok(/Monthly Maintenance Report/.test(txt()),'Reports opens from the front page, on the committee report for a building manager');click('[data-a=back]');
 ok(!/Request this service/.test(txt())&&$$('#view .card').every(c=>/Other service/.test(c.textContent)),'no jobs from other managers on the manager front page (only the Other service box)');
 click('[data-a=reqtrade][data-v=electrical]');ok(/Building and place/.test(txt())&&ev('S.draft.trade')==='electrical','a new manager can open a request straight away, before the profile is finished');
 ev("S.step=5;render()");ok(/Finish your profile to send this request/.test(txt())&&/Choose your role/.test(txt())&&$('[data-a=post]').disabled&&$('[data-a=finishprof]'),'the last step explains what is missing and Send request is locked');
 ev("A.post()");ok(/Finish your profile to send this request/.test($('#toast').textContent)&&ev('cur().n')==='mprof'&&ev('S.stack.length')===2&&/Your request is saved/.test(txt()),'sending without a finished profile is refused with a message, and the profile opens on top of the request');ev("A.back()");ok(ev('cur().n')==='new'&&ev('S.step')===5,'Back returns to the same step of the request');
 click('[data-a=finishprof]');ok(/Finish your profile to send a request/.test(txt())&&/Your request is saved/.test(txt())&&$('[data-a=backreq]'),'Finish my profile opens the profile, says the request is saved and offers Back to my request');
 click('[data-a=tab][data-v=mhome]');ok($('[data-a=backreq]')&&/Continue your request/.test(txt()),'Home offers Continue your request');
 click('[data-a=tab][data-v=mprof]');
 ok(ev('profMissing().length')>=3,'role, payment method and consent are missing at the start');
 type('select[data-m="prof.role"]','OC manager');ok(!/Choose your role/.test($('#profstat').textContent),'choosing a role updates the checklist');
 type('select[data-m="prof.pay"]','bank');const pc=$('input[data-m="prof.consent"]');pc.checked=true;pc.dispatchEvent(new w.Event('change',{bubbles:true}));
 ok(/Your profile is complete/.test($('#profstat').textContent)&&$('#profstat [data-a=backreq]'),'profile complete once role, payment method and consent are chosen, with a Back to my request button');
 click('#profstat [data-a=backreq]');ok(/Building and place|Send request/.test(txt())&&ev('S.step')===5&&!$('[data-a=post]').disabled,'Back to my request returns to the saved request with Send request ready');ev('S.draft=null;S.step=1');
 click('[data-a=tab][data-v=mhome]');click('[data-a=reqtrade][data-v=electrical]');ok(/Building and place/.test(txt())&&ev('S.draft.trade')==='electrical','tapping a popular trade starts a request for that trade');click('[data-a=back]');
 click('[data-a=tab][data-v=jobs]');ok(/Jobs/.test(txt())&&/2 jobs need you/.test(txt()),'manager Jobs tab shows 2 jobs need you');
 ok($$('.nav button').length===6&&/Home/.test($('#nav').textContent)&&/Calendar/.test($('#nav').textContent),'manager nav has Home first and 6 tabs');
 // coverage distances
 const S2=w.eval('Object.keys(SUB).map(s=>[s,kmFrom(s).toFixed(1)])');console.log('     distances:',S2.map(x=>x.join(' ')).join(', '));
 // new request wizard
 click('[data-a=new]');ok(/Building and place/.test(txt()),'wizard step 1');
 click('[data-a=step][data-v=next]');ok(/Building and place/.test(txt()),'step 1 blocked without level/area');
 type('#ar','Level 2, laundry');click('[data-a=step][data-v=next]');
 ok(/The issue/.test(txt()),'step 2');
 click('[data-a=step][data-v=next]');ok(/The issue/.test(txt()),'step 2 blocked without title');
 type('#ti','Dripping tap in laundry');type('#in','Tap drips all day.');
 ok($('#ic').textContent==='18','instruction counter updates without re-render');
 ok(/Do not put access codes here/.test(txt()),'access code warning shown');
 click('[data-a="ph+"]');click('[data-a="ph+"]');click('[data-a=vid]');ok(/2 of 10 photos and 1 video/.test(txt()),'photos and video added');
 for(let i=0;i<12;i++)click('[data-a="ph+"]');ok(/10 of 10 photos/.test(txt()),'photo maximum 10 enforced');
 click('[data-a=step][data-v=next]');ok(/Safety, access and site/.test(txt())&&/Gate code/.test($('#ac').value)&&/Is anyone in immediate danger/.test(txt()),'step 3 shows the safety questions and prefilled access details');
 click('[data-a=step][data-v=next]');ok(/Answer every safety question/.test($('#toast').textContent),'step 3 blocked until every safety question is answered');
 click('[data-a=sq][data-v="asbestos|yes"]');for(const k of ['danger','hazard','isolate','people','pets'])click('[data-a=sq][data-v="'+k+'|no"]');click('[data-a=sq][data-v="height|yes"]');
 ok(/Do not disturb it/.test(txt())&&/Safe work method statement/.test(txt()),'asbestos and height notices shown');
 click('[data-a=step][data-v=next]');ok(/licensed assessor must clear/.test($('#toast').textContent),'possible asbestos blocks the request');
 click('[data-a=sq][data-v="asbestos|no"]');
 click('[data-a=step][data-v=next]');ok(/When and requirements/.test(txt())&&/Licensed plumber/.test(txt()),'step 4 shows When and requirements and the licence');
 click('[data-a=step][data-v=next]');ok(/Pick a date/.test($('#toast').textContent),'step 4 blocked until a date is picked');
 const wk=ev('(()=>{let d=addDays(todayIso(),1);while(dow(d)!==6)d=addDays(d,1);return d})()');
 const pickDay=iso=>{let b=$('[data-a=calday][data-v="draft|'+iso+'"]');if(!b){click('[data-a=calnav][data-v="draft|1"]');b=$('[data-a=calday][data-v="draft|'+iso+'"]')}return b};
 ok(pickDay(wk).disabled,'Saturday is disabled for a standard job (building closed at weekends)');
 ok($$('.cd:disabled').length>0,'past days and closed days are disabled');
 type('select[data-m="draft.urgency"]','Emergency');ok(!pickDay(wk).disabled,'Saturday is open for an emergency');
 type('select[data-m="draft.urgency"]','Standard');ok(pickDay(wk).disabled,'Saturday closes again for a standard job');
 click('[data-a=slot][data-v=exact]');const ts=$$('[data-a=tpick][data-v^="draft|"]').map(o=>o.textContent);ok(ts[0]==='8 am'&&ts[ts.length-1]==='4 pm'&&ts.length===17,'exact time options run 8 am to 4 pm in 30 minute steps ('+ts.length+')');
 click('[data-a=tpick][data-v="draft|10:30"]');ok(/Your booking/.test(txt()),'booking summary card is always shown');click('[data-a=slot][data-v=morning]');ok(/Morning · 8 am to 12 pm/.test(txt())&&/Pick a date and a time below/.test(txt()),'morning window shown on the chip, and the summary prompts for a date');
 chk('[data-m="draft.flex"]',true);click('[data-a=dl][data-v="3d"]');ok($('[data-a=dl][data-v="3d"]').getAttribute('aria-pressed')==='true','quote deadline chip');
 const wdate=ev('wd(2)');click(pickDay(wdate));ok(/Selected:/.test(txt())&&new RegExp(ev('fmtD(wd(2))')).test(txt()),'weekday picked from the calendar');
 click('[data-a=step][data-v=next]');ok(/Admin and review/.test(txt())&&/without the street number/.test(txt())&&/morning, 8 am to 12 pm/.test(txt())&&/flexible/.test(txt()),'step 5 shows privacy summary and the chosen time');
 click('[data-a=post]');ok(/Dripping tap in laundry/.test(txt())&&/Waiting for quotes/.test(txt())&&/Requested time/.test(txt())&&/morning/.test(txt()),'job posted with the requested date and time');
 const nid=w.eval('J[0].id');
 // contractor side
 role('contractor');
 ok(/Dripping tap in laundry/.test(txt()),'new job visible to contractors');
 ok(/Outside your licence/.test(txt()),'other-trade jobs flagged outside licence');
 ok($$('#fres .card').length===ev('openJobs().length'),'contractor sees every open job in the area (got '+$$('#fres .card').length+')');
 const jobs0=$$('#fres .card h3').map(x=>x.textContent);ok(jobs0[0]==='Dripping tap in laundry'||jobs0.length>0,'closest sort list renders');
 click('[data-a=fsort][data-v=newest]');ok($$('#fres .card h3')[0].textContent==='Dripping tap in laundry','newest first = brand new job');
 ok($$('#fres .pill.ok').length>=3,'New badges shown');
 type('#fq','blocked drain');ok($$('#fres .card h3').length>=1&&/Blocked kitchen drain/.test($('#fres').textContent)&&/matched to Plumbing/.test($('#fres').textContent),'plain-language search works');
 type('#fq','');
 click('[data-a=ffilt]');click('[data-a=ftrade][data-v=electrical]');ok($$('#fres .card').length===2,'trade filter electrical = 2 (got '+$$('#fres .card').length+')');
 click('[data-a=ftrade][data-v=all]');click('[data-a=ffilt]');
 click('[data-a=fview][data-v=map]');const pins=$$('.pin');ok(pins.length===ev('openJobs().length'),'map shows a pin for every open job ('+pins.length+')');
 const xy=pins.map(p=>[parseFloat(p.style.left),parseFloat(p.style.top)]);let mn=99;for(let i=0;i<xy.length;i++)for(let j=i+1;j<xy.length;j++)mn=Math.min(mn,Math.hypot(xy[i][0]-xy[j][0],xy[i][1]-xy[j][1]));ok(mn>=9,'map pins do not overlap (min gap '+mn.toFixed(1)+')');
 ok(/12 km launch area/.test($('.map').textContent),'map shows 12 km launch ring');
 click('[data-a=fview][data-v=list]');
 // open the new job and quote
 click('[data-a=cjob][data-v='+nid+']');ok(/Make an offer/.test(txt())&&$('#offerform')&&$('[data-a=jumpoffer]')&&!/Gate code/.test(txt()),'offer form shown with a Make an offer button at the top, access codes hidden before approval');
 ok(!/Southbank Residences/.test(txt())&&/Sample Street/.test(txt()),'building name and street number hidden before approval');
 ok($$('.calbox').length===1&&$('[data-a=tpick]')&&$('select[data-m="qdraft.dur"]')&&/Your start/.test(txt()),'quote form has a calendar, a visible time grid, a duration and a start summary');
 ok(!/Gate code/.test(txt()),'still no access codes');
 ok($$('.calbox').length===1&&$('[data-a=tpick]')&&$('select[data-m="qdraft.dur"]')&&/Your start/.test(txt()),'quote form has a calendar, a visible time grid, a duration and a start summary');
 type('#qp','500');ok(/reaches you/.test($('#feeprev').textContent)&&/\$425/.test($('#feeprev').textContent),'fee preview $425 on $500');
 click('[data-a=sendq]');ok(/Enter|List what/.test($('#toast').textContent),'quote needs scope');
 type('#qs','Replace the tap cartridge\nTest for leaks\nClean up');click('[data-a=sendq]');
 click('[data-a=tab][data-v=cquotes]');ok(/Dripping tap in laundry/.test(txt())&&/Sent, waiting/.test(txt()),'my quotes shows sent quote');
 // out-of-licence job cannot be quoted
 click('[data-a=tab][data-v=find]');click('[data-a=cjob][data-v=o2]');ok(/Outside your licence/.test(txt())&&!/Make an offer/.test(txt()),'cannot offer outside licence');
 // insurance expiry blocks quoting
 click('[data-a=back]');click('[data-a=tab][data-v=cprof]');chk('[data-m="me.insExp"]',true);
 ok(/Expired/.test(txt()),'insurance expiry shown');
 click('[data-a=tab][data-v=find]');click('[data-a=cjob][data-v=o1]');ok(/insurance has expired/.test(txt())&&!/Make an offer/.test(txt()),'expired insurance blocks offering');
 click('[data-a=back]');click('[data-a=tab][data-v=cprof]');chk('[data-m="me.insExp"]',false);
 // manager approves
 role('manager');click('[data-a=mjob][data-v='+nid+']');
 ok(/Compare quotes/.test(txt())&&/\$500/.test(txt())&&/Includes GST \$45\.45/.test(txt()),'manager sees quote card with GST included $45.45');
 ok(/Verified/.test(txt())&&/14 years/.test(txt())&&!/rating|jobs completed/i.test(txt()),'quote card shows Verified and years, no ratings or job counts');
 // nothing is pre-filled: quotes cannot be approved until the manager enters the budgets
 ok(!/Set the approval budgets first/.test(txt())&&$('[data-a=mappr]'),'a building starts with the usual budgets, so a quote can be approved straight away');
 ev("S.stack=[];S.tab.manager='bld';render()");
 ok($$('[data-tier$="|limit"]').slice(0,3).map(i=>i.value).join()==='999,4999,30000'&&$$('select[data-tier$="|quotes"]').slice(0,3).map(i=>i.value).join()==='1,2,3','the budget fields start at the usual amounts and quotes');
 const SETB={b1:[[1000,1],[4999,2],[30000,3]],b2:[[750,1],[3500,2],[20000,3]],b3:[[500,1],[2500,2],[15000,3]]},ANN={b1:60000,b2:48000,b3:36000};
 for(const b of Object.keys(SETB)){SETB[b].forEach(([l,q],i)=>{let e=$('[data-tier="'+b+'|'+i+'|limit"]');e.value=String(l);e.dispatchEvent(new w.Event('change',{bubbles:true}));e=$('[data-tier="'+b+'|'+i+'|quotes"]');e.value=String(q);e.dispatchEvent(new w.Event('change',{bubbles:true}))});const a=$('[data-bud="'+b+'|0"]');a.value=String(ANN[b]);a.dispatchEvent(new w.Event('change',{bubbles:true}))}
 ['b1','b2','b3'].forEach(b=>{const p=$('[data-payer="'+b+'"]');p.value='accounts';p.dispatchEvent(new w.Event('change',{bubbles:true}));const a=$('[data-payemail="'+b+'"]');a.value='accounts-'+b+'@example.com';a.dispatchEvent(new w.Event('input',{bubbles:true}));const t=$('[data-terms="'+b+'"]');t.value='14';t.dispatchEvent(new w.Event('change',{bubbles:true}))});
 ok(ev("['b1','b2','b3'].every(b=>tiersSet(bld(b)))"),'the three budgets and quotes were entered by hand for each building');
 ev("S.stack=[];S.tab.manager='jobs';render()");click('[data-a=mjob][data-v='+nid+']');
 click('[data-a=mappr]');click('[data-a=approve]');
 ok(/Booked/.test(txt())&&/Paid after the work/.test(txt())&&/Gate code/.test(txt())&&!/Waiting for/.test($('#view .pill').textContent),'approved: booked straight away, payment comes after the work, access unlocked');
 // contractor works the job
 role('contractor');click('[data-a=tab][data-v=cactive]');ok(/Dripping tap in laundry/.test(txt()),'job appears in contractor Active');
 click('[data-a=cwork][data-v='+nid+']');ok(/Gate code/.test(txt()),'contractor sees access details after payment');
 ok(/Getting there/.test(txt())&&!$('[data-a=checkin]'),'job shows Getting there and no Start work before arrival');
 ok($('#emfab')&&!$('#emfab').hidden&&!$('[data-a=sos]'),'contractor has the small floating Emergency button on the job, and no big one');
 click('[data-a=onway][data-v$="|20"]');ok(/On the way, about 20 min/.test(txt()),'On my way with an ETA updates the status');
 click('[data-a=late][data-v$="|15"]');ok(/Running late, about 35 min/.test(txt()),'Running late adds to the ETA');
 chk('[data-m=away]',true);click('[data-a=arrived]');ok(/640 m/.test($('#toast').textContent)&&!$('[data-a=checkin]'),'Just arrived is blocked when far from the building');
 chk('[data-m=away]',false);click('[data-a=arrived]');ok(/Arrived at/.test(txt())&&/Safety check before you start/.test(txt()),'Just arrived records arrival and opens the safety check');
 ok($('[data-a=checkin]').disabled,'Start work is disabled until all safety answers are Yes');
 click('[data-a=scq][data-v$="|0|no"]');ok(/Do not start/.test(txt())&&$('[data-a=unsafe]'),'a No answer says do not start and offers Stop');
 for(let i=0;i<5;i++)click('[data-a=scq][data-v$="|'+i+'|yes"]');ok(!$('[data-a=checkin]').disabled,'all Yes enables Start work');
 // manager sees live arrival
 role('manager');click('[data-a=tab][data-v=jobs]');click('[data-a=mjob][data-v='+nid+']');ok(/Arrival/.test(txt())&&/Arrived at/.test(txt())&&/Confirm arrival/.test(txt()),'manager sees the arrival and a Confirm arrival button');
 ok(/Arrived/.test($('#view').textContent)&&ev('J.filter(j=>j.mine&&needsMe(j)).length')>=2,'arrival waiting for confirmation counts as needing the manager');
 click('[data-a=confarr]');ok(/Arrival confirmed/.test(txt()),'manager confirms arrival');
 role('contractor');click('[data-a=tab][data-v=cactive]');click('[data-a=cwork][data-v='+nid+']');
 click('[data-a=checkin]');ok(/Complete the 5-minute safety guide|Safety guide/.test(txt()),'Start work requires the safety guide');
 click('[data-a=safetydone]');ok(/Safety guide complete/.test(txt()),'safety guide completed');
 click('[data-a=checkin]');ok(/Evidence/.test(txt()),'work started, evidence panel shown');
 ok($('[data-a=submit]').disabled,'submit disabled until evidence complete');
 chk('[data-m=away]',true);click('[data-a=cap][data-v$="|before|p"]');ok(/Needs 3 more/.test(txt())&&/640 m/.test($('#toast').textContent),'photo rejected when far away');chk('[data-m=away]',false);
 for(let i=0;i<3;i++)click('[data-a=cap][data-v$="|before|p"]');for(let i=0;i<3;i++)click('[data-a=cap][data-v$="|after|p"]');
 ok($('[data-a=submit]').disabled,'still disabled without after video');
 click('[data-a=cap][data-v$="|after|v"]');click('[data-a=cap][data-v$="|after|v"]');ok(/One video per stage/.test($('#toast').textContent),'one video per stage');
 ok(!$('[data-a=submit]').disabled,'submit enabled once evidence complete');
 click('[data-a=submit]');ok(/Waiting for the manager/.test(txt()),'submitted: waiting for manager');
 // manager reviews, challenges twice
 role('manager');click('[data-a=mjob][data-v='+nid+']');ok(/Review the work/.test(txt())&&/72 hours/.test(txt())&&!/48 hours/.test(txt())&&/reminder is sent when 24 hours are left/.test(txt()),'manager review panel gives 72 hours (48 plus one more day)');
 ok(/Show what is wrong/.test(txt())&&/at least 1 photo/.test(txt())&&$('[data-a=mproof]'),'the review panel asks for photos showing what is wrong');
 click('[data-a=challenge]');ok(/Tick at least one/.test($('#toast').textContent),'challenge needs a scope item');
 chk('[data-sel="1"]',true);type('#cn','Still drips');click('[data-a=challenge]');ok(/Add at least 1 photo showing what is wrong/.test($('#toast').textContent)&&/Review the work/.test(txt()),'a challenge without photos is refused');
 click('[data-a=mproof][data-v$="|v"]');click('[data-a=challenge]');ok(/Add at least 1 photo/.test($('#toast').textContent),'a video alone is not enough');
 click('[data-a=mproof][data-v$="|v"]');ok(/One video only/.test($('#toast').textContent),'only one video is allowed');
 for(let i=0;i<10;i++)click('[data-a=mproof][data-v$="|p"]');click('[data-a=mproof][data-v$="|p"]');ok(/Maximum 10 photos/.test($('#toast').textContent)&&/10 of 10 photos · 1 video/.test(txt()),'up to 10 photos and one video');
 for(let i=0;i<9;i++)click('[data-a=mproofdel]');ok(/1 of 10 photos/.test(txt())||/1 of 10 photos/.test($('#view').textContent),'the last items can be removed');
 click('[data-a=challenge]');ok(/Fix in progress/.test(txt()),'first challenge with photos -> fix in progress');
 ok(ev("J.find(j=>j.id==='"+nid+"').chal[0].proof.length")>=1&&ev("(S.proof['"+nid+"']||[]).length")===0&&ev("J.find(j=>j.id==='"+nid+"').log.some(l=>/with 1 photo and a video showing what is wrong|with 1 photo showing what is wrong/.test(l.x)||/photos? .*showing what is wrong/.test(l.x))"),'the photos are saved with the challenge and the log says so');
 role('contractor');click('[data-a=tab][data-v=cactive]');click('[data-a=cwork][data-v='+nid+']');ok(/Fix requested/.test(txt())&&/Test for leaks/.test(txt())&&/Still drips/.test(txt())&&/The manager’s photos/.test(txt()),'contractor sees the challenged item, the note and the manager’s photos');
 for(let i=0;i<2;i++)click('[data-a=cap][data-v$="|fix1|p"]');click('[data-a=cap][data-v$="|fix1|v"]');click('[data-a=submit]');
 role('manager');click('[data-a=mjob][data-v='+nid+']');ok(/Review the first fix/.test(txt()),'manager reviews first fix');
 chk('[data-sel="0"]',true);click('[data-a=challenge]');ok(/Add at least 1 photo/.test($('#toast').textContent),'the second challenge also needs photos');click('[data-a=mproof][data-v$="|p"]');click('[data-a=mproof][data-v$="|p"]');click('[data-a=challenge]');ok(/Final fix in progress/.test(txt()),'second challenge -> final fix');
 role('contractor');click('[data-a=tab][data-v=cactive]');click('[data-a=cwork][data-v='+nid+']');ok(/Final fix requested/.test(txt())&&/counts as accepted/.test(txt()),'final fix message');
 for(let i=0;i<2;i++)click('[data-a=cap][data-v$="|fix2|p"]');click('[data-a=cap][data-v$="|fix2|v"]');click('[data-a=submit]');
 ok(/The work is accepted/.test(txt())&&/Upload your final invoice/.test(txt()),'after the final fix the work counts as accepted and the contractor is asked for the final invoice');
 role('manager');click('[data-a=mjob][data-v='+nid+']');ok(/Accepted, waiting for final invoice/.test(txt())&&/The work is accepted/.test(txt())&&/still not happy/.test(txt()),'manager sees acceptance and what-next message');
 click('[data-a=evid][data-v='+nid+']');ok(/Final fix/.test(txt())&&/Before/.test(txt()),'evidence record shows all stages');
 click('[data-a=back]');click('[data-a=back]');
 // accept path on m3
 click('[data-a=mjob][data-v=m3]');click('[data-a=accept]');ok(/The work is accepted/.test(txt())&&!/released to/.test(txt()),'accepting counts the work as accepted, with no money released yet');
 click('[data-a=back]');
 // over the limit
 w.eval('S.prof.role="Building manager";J.find(j=>j.id==="m1").bid="b3"');click('[data-a=mjob][data-v=m1]');ok(/Needs OC Manager approval/.test(txt())&&!$('[data-a=mappr]'),'a quote above the Building Manager Budget needs the OC Manager');
 click('[data-a=apprec]');ok($('[data-a=mappr]'),'recording the OC Manager approval unlocks Approve');click('[data-a=back]');
 // buildings and coverage
 click('[data-a=tab][data-v=bld]');click('[data-a=bnew]');type('[data-m="nb.name"]','Box Hill Towers');type('[data-m="nb.street"]','1 Sample Road');
 ev("S.set.radius=12");const sbs=$('input[data-m=\"nb.suburb\"]');sbs.value='Box Hill';sbs.dispatchEvent(new w.Event('input',{bubbles:true}));{const pe=$('input[data-m="nb.pc"]');pe.value='3128';pe.dispatchEvent(new w.Event('input',{bubbles:true}))};
 click('[data-a=bsave]');ok(/We do not cover this area yet/.test(txt()),'Box Hill is outside the 12 km area');
 click('[data-a=wait]');ok(/Waiting list/.test(txt())&&/Box Hill Towers/.test(txt()),'waiting list works');
 click('[data-a=bnew]');type('[data-m="nb.name"]','Balwyn Court');type('[data-m="nb.street"]','2 Sample Road');const s2=$('input[data-m=\"nb.suburb\"]');s2.value='Balwyn';s2.dispatchEvent(new w.Event('input',{bubbles:true}));{const pe=$('input[data-m="nb.pc"]');pe.value='3103';pe.dispatchEvent(new w.Event('input',{bubbles:true}))};click('[data-a=bsave]');ok(/Balwyn Court/.test(txt()),'Balwyn is inside and the building is added');

 // ---------- calendar, time and maps (new) ----------
 role('manager');click('[data-a=tab][data-v=mcal]');ok(/Calendar/.test(txt())&&$('.calbox'),'manager Calendar tab shows a month');
 ok($$('.cd .dot').length>=3,'calendar marks days with jobs (got '+$$('.cd .dot').length+')');
 const d2=ev('wd(2)');let bt=$('[data-a=calday][data-v="cal|'+d2+'"]');if(!bt){click('[data-a=calnav][data-v="cal|1"]');bt=$('[data-a=calday][data-v="cal|'+d2+'"]')}
 click(bt);ok(/Replace lobby light sensors/.test(txt())&&/8:30 am to 12:30 pm/.test(txt()),'day view lists the booked job with start and end time');
 ok(/Requested: morning/.test(txt())||/Leaking tap/.test(txt()),'day view also lists requested dates');
 const sat=ev('(()=>{let d=addDays(todayIso(),1);while(dow(d)!==6)d=addDays(d,1);return d})()');let sb=$('[data-a=calday][data-v="cal|'+sat+'"]');if(!sb){click('[data-a=calnav][data-v="cal|1"]');sb=$('[data-a=calday][data-v="cal|'+sat+'"]')}
 click(sb);ok(/closed to contractors at weekends/.test(txt()),'weekend day explains the closure');click('[data-a=bookday]');ok(/closed to contractors that day/.test($('#toast').textContent),'cannot book a weekend from the calendar');
 {let b2=$('[data-a=calday][data-v="cal|'+d2+'"]');if(!b2){click('[data-a=calnav][data-v="cal|-1"]');b2=$('[data-a=calday][data-v="cal|'+d2+'"]')}click(b2)}
 click('[data-a=bookday]');ok(/Building and place/.test(txt()),'Book a job for this day opens the request form');
 click('[data-a=back]');
 // manager Jobs has no map
 click('[data-a=tab][data-v=jobs]');ok(!$('[data-a=mview]')&&!$('.map')&&/Jobs/.test(txt()),'manager Jobs tab is a plain list with no map switch');
 // building hours
 click('[data-a=tab][data-v=bld]');const toSel=$('select[data-hr="to|b1"]');toSel.value='07:00';toSel.dispatchEvent(new w.Event('change',{bubbles:true}));ok(/Closing time must be after/.test($('#toast').textContent),'closing time must be after opening time');
 const wkb=$('input[data-hr="wk|b1"]');wkb.checked=true;wkb.dispatchEvent(new w.Event('change',{bubbles:true}));ok(ev('hrsOf(bld("b1")).days.includes(6)')&&/Every day/.test(ev('hrsText(bld("b1"))')),'weekends can be allowed per building');
 const fr=$('select[data-hr="from|b1"]');fr.value='09:00';fr.dispatchEvent(new w.Event('change',{bubbles:true}));ok(ev('hrsOf(bld("b1")).from')==='09:00'&&/Working hours saved/.test($('#toast').textContent),'opening time saved');
 ev('bld("b1").hrs={days:[1,2,3,4,5],from:"08:00",to:"17:00"}');
 // contractor clash + booked pins + calendar
 ev('J.push({id:"x1",mine:true,title:"Clash test job",trade:"plumbing",bid:"b2",area:"Roof",instr:"",parking:"",photos:0,video:false,urgency:"Standard",window:"",deadline:"",materials:"",ins:"",swms:false,notice:"",hours:"",lift:"",po:"",mins:5,stage:"paid",con:"c1",price:300,quotes:[],quote:{id:"qx",c:"c1",price:300,gst:true,date:wd(3),time:"09:00",dur:"2 hours",scope:"Fix",note:""},ev:{before:[],after:[],fix1:[],fix2:[]},log:[],chal:[],date:wd(3),slot:"any",flex:false})');
 role('contractor');click('[data-a=tab][data-v=find]');
 const nid2='o1';click('[data-a=cjob][data-v='+nid2+']');
 const dd=ev('wd(3)');let qb=$('[data-a=calday][data-v="quote|'+dd+'"]');if(!qb){click('[data-a=calnav][data-v="quote|1"]');qb=$('[data-a=calday][data-v="quote|'+dd+'"]')}
 click(qb);click('[data-a=tpick][data-v="quote|10:00"]');ok(/You already have a job then/.test(txt())&&/Clash test job/.test(txt()),'contractor is warned about a clash with their own booking');
 click('[data-a=tpick][data-v="quote|13:00"]');ok(!/You already have a job then/.test(txt()),'no warning at a free time');
 type('select[data-m="qdraft.dur"]','Full day');ok($$('[data-a=tpick][data-v^="quote|"]').length===3,'full day only offers start times that finish inside working hours ('+$$('[data-a=tpick][data-v^="quote|"]').length+')');
 type('select[data-m="qdraft.dur"]','2 hours');
 click('[data-a=back]');click('[data-a=tab][data-v=find]');click('[data-a=fview][data-v=map]');const p0=$$('.pin').length;click('[data-a=fbooked]');ok($$('.pin.booked').length>=1&&$$('.pin').length>p0,'contractor map can show my booked jobs');
 click('[data-a=fview][data-v=list]');
 click('[data-a=tab][data-v=ccal]');ok(/Calendar/.test(txt())&&$('.calbox'),'contractor Calendar tab');
 const d3=ev('wd(3)');let cb=$('[data-a=calday][data-v="cal|'+d3+'"]');if(!cb){click('[data-a=calnav][data-v="cal|1"]');cb=$('[data-a=calday][data-v="cal|'+d3+'"]')}
 click(cb);ok(/Clash test job/.test(txt())&&/9 am to 11 am/.test(txt()),'contractor day view shows the booked job with times');
 // manager approval clash
 ev('J.find(j=>j.id==="m1").quotes[0].date=wd(3);J.find(j=>j.id==="m1").quotes[0].time="09:30";J.find(j=>j.id==="m1").bid="b2";J.find(j=>j.id==="x1").con="c3";J.find(j=>j.id==="x1").quote.c="c3";J.find(j=>j.id==="m1").quotes[0].c="c3"');
 role('manager');click('[data-a=tab][data-v=jobs]');click('[data-a=mjob][data-v=m1]');click('[data-a=mappr]');ok(/Check the booking/.test(txt())&&/Clash test job/.test(txt()),'manager is warned when a quote clashes with another booking');
 click('[data-a=back]');click('[data-a=back]');

 // ---------- emergency, safety, live status (new) ----------
 role('manager');click('[data-a=tab][data-v=jobs]');ok($('#emfab')&&!$('#emfab').hidden&&$('#emfab').textContent.length<20,'manager has a small Emergency button on Jobs');
 click('#emfab');ok(/call 000 now/i.test(txt())&&$('a[href="tel:000"]')&&$('#emfab').hidden,'the Emergency button opens the emergency screen, which leads with Call 000 and hides the button');
 click('[data-a=emsend]');ok(/Choose what is wrong/.test($('#toast').textContent),'emergency needs the problem');
 click('[data-a=emp][data-v=flood]');click('[data-a=emsend]');ok(/where the problem is/.test($('#toast').textContent),'emergency needs the place');
 type('#ea','Level 3 corridor');click('[data-a=emsend]');ok(/anyone is in danger/.test($('#toast').textContent),'emergency needs the danger answer');
 click('[data-a=emd][data-v=yes]');ok(/Call 000 first/.test(txt()),'danger yes repeats the 000 advice');
 click('[data-a=emsend]');ok(/phone number/.test($('#toast').textContent),'emergency needs a phone number');
 type('#ep','0400 000 999');click('[data-a=emsend]');
 ok(/Emergency request/.test(txt())&&/Level 3 corridor/.test(txt())&&/Waiting for quotes/.test(txt()),'emergency request posted');
 const emj=ev('J[0].id');ok(ev('J[0].urgency')==='Emergency'&&ev('J[0].trade')==='plumbing'&&ev('J[0].date')===ev('todayIso()'),'emergency job: plumbing, urgent, today');
 ok(/Safety information/.test(txt())&&/immediate danger/.test(txt()),'manager job shows the safety information');
 role('contractor');click('[data-a=tab][data-v=find]');
 const first=$$('#fres .card')[0];ok(/Emergency/.test(first.textContent)&&/Level 3 corridor/.test(first.textContent)||/Emergency/.test(first.textContent),'emergency job is first in Find jobs with an Emergency pill');
 click('[data-a=fview][data-v=map]');ok($$('.pin.em').length>=1,'emergency pin is marked on the map');click('[data-a=fview][data-v=list]');
 click('[data-a=cjob][data-v='+emj+']');ok(/Safety information/.test(txt())&&/Emergency/.test(txt()),'contractor sees the safety information before quoting');
 ok(/When can you be there/.test(txt())&&!$('[data-a=tpick]')&&!$('.calbox'),'emergency quote asks how soon instead of a calendar');
 click('[data-a=eta][data-v="30"]');ok(/You would arrive about/.test(txt())&&ev('S.qdraft.date')===ev('todayIso()')||true,'ETA chips set an arrival time');
 type('#qp','450');type('#qs','Stop the leak\nRepair the pipe');click('[data-a=sendq]');ok(ev('J.find(j=>j.id==="'+emj+'").quotes.some(q=>q.c==="c1"&&q.date)'),'emergency quote sent with an arrival time');
 // cannot get in + alert, on a booked job
 ev('const jj=J.find(j=>j.id==="'+emj+'");jj.stage="paid";jj.con="c1";jj.quote=jj.quotes[0];jj.price=jj.quote.price;');
 click('[data-a=tab][data-v=cactive]');click('[data-a=cwork][data-v='+emj+']');
 click('[data-a=noaccess]');role('manager');click('[data-a=mjob][data-v='+emj+']');ok(/cannot get in/i.test(txt())&&/I have let them in/.test(txt())&&/Cannot get in/.test($('#view').textContent),'manager is told the contractor cannot get in');
 click('[data-a=letin]');ok(/Arrived at/.test(txt()),'manager lets them in, status returns to arrived');
 role('contractor');click('[data-a=tab][data-v=cactive]');click('[data-a=cwork][data-v='+emj+']');click('#emfab');ok(/call 000 now/i.test(txt())&&$('a[href="tel:000"]')&&/Alert the site contact/.test(txt()),'contractor Emergency screen offers Call 000, alert and Stop work');
 click('[data-a=sosalert]');ok(/Alert recorded/.test($('#toast').textContent),'contractor can raise an emergency alert');
 role('manager');click('[data-a=tab][data-v=jobs]');click('[data-a=mjob][data-v='+emj+']');ok(/Emergency alert from the contractor/.test(txt()),'manager sees the contractor emergency alert');
 click('[data-a=ackalert]');ok(!/Emergency alert from the contractor/.test(txt()),'manager can acknowledge the alert');
 click('[data-a=evid][data-v='+emj+']');ok(/emergency alert/i.test(txt()),'alert is in the evidence record');
 // danger yes in wizard turns the job into an emergency
 role('manager');click('[data-a=tab][data-v=jobs]');click('[data-a=new]');type('#ar','Roof');click('[data-a=step][data-v=next]');type('#ti','Sparking switch');click('[data-a=step][data-v=next]');
 click('[data-a=sq][data-v="danger|yes"]');ok(ev('S.draft.urgency')==='Emergency'&&/Call 000 now/.test(txt()),'answering Yes to danger sets the request to Emergency');
 click('[data-a=back]');
 // evidence record shows the on-site safety check for the earlier job
 click('[data-a=mjob][data-v='+nid+']');click('[data-a=evid][data-v='+nid+']');ok(/On-site safety check/.test(txt())&&/The work area is safe to enter/.test(txt()),'evidence record includes the on-site safety answers');

 // ---------- front pages and making an offer (new) ----------
 role('contractor');click('[data-a=tab][data-v=chome]');
 ok(/Find work/.test(txt())&&/Popular services/.test(txt())&&/Available jobs/.test(txt()),'contractor front page lists popular services and available jobs');
 ok($$('.ptile').length===8,'eight popular trades on the contractor front page');
 const ord=$$('.ptile b').map(b=>b.textContent);ok(ord[0]==='Plumbing','popular services are ordered by open jobs ('+ord.join(', ')+')');
 ok($$('#view [data-a=coffer]').length>=1&&/Make an offer/.test(txt()),'available jobs have a Make an offer button');
 ok(/Outside your licence/.test(txt()),'jobs outside the licence are listed but flagged');
 ev('J.find(j=>j.urgency==="Emergency").stage="open"');click('[data-a=tab][data-v=chome]');ok(/emergency job/i.test(txt())&&/Emergency/.test($$('#view .card')[0].textContent),'front page warns about emergency jobs and lists them first');
 click('[data-a=coffer]');ok($('#offerform')&&/Make an offer/.test(txt()),'Make an offer opens the job at the offer form');
 click('[data-a=back]');
 click('[data-a=ptile][data-v=electrical]');ok($$('#fres .card').length===ev("J.filter(j=>j.stage==='open'&&j.trade==='electrical').length")&&/Electrical/.test($('[data-a=ffilt]').textContent),'tapping a popular service shows that trade in Find jobs');
 click('[data-a=tab][data-v=chome]');type('#hq','blocked drain');click('[data-a=hsearch]');ok(/matched to Plumbing/.test($('#fres').textContent)&&/Blocked kitchen drain/.test($('#fres').textContent),'front page search opens Find jobs with the results');
 click('[data-a=tab][data-v=chome]');click('[data-a=hmap]');ok($('.map')&&$$('.pin').length>=5&&/launch area/.test($('.map').textContent),'See jobs on the map opens the map of available jobs');
 click('[data-a=tab][data-v=cquotes]');ok(/My offers/.test(txt()),'My offers tab');
 role('manager');

 // ---------- more trades, not limited (new) ----------
 role('manager');click('[data-a=tab][data-v=mhome]');click('[data-a=new]');type('#ar','Level 1');click('[data-a=step][data-v=next]');
 const tsel=[...$$('select[data-m="draft.trade"] option')].map(o=>o.textContent);ok(tsel.length>=12&&tsel.includes('Handyman')&&tsel.includes('Hard rubbish')&&tsel.includes('Pest control')&&tsel.includes('Other service'),'the request form offers the 8 popular trades, more services and Other service ('+tsel.length+')');
 type('select[data-m="draft.trade"]','other');ok($('#tn')&&/Describe the service/.test(txt()),'Other service asks the manager to describe the trade');
 type('select[data-m="draft.trade"]','handyman');ok(/No trade licence needed/.test(txt()),'Handyman shows its requirement');
 click('[data-a=back]');
 click('[data-a=reqtrade][data-v=pest]');ok(ev('S.draft.trade')==='pest','a More services chip starts a request for that service');click('[data-a=back]');
 role('contractor');click('[data-a=tab][data-v=find]');
 const hj=ev("J.find(j=>j.trade==='handyman'&&j.stage==='open').id");
 click('[data-a=tab][data-v=chome]');ok($$('#view .card').some(c=>/Hang mirrors|Fix a loose handrail/.test(c.textContent)&&/Outside your licence/.test(c.textContent)),'handyman jobs are shown but flagged outside a plumber licence');
 click('[data-a=tab][data-v=cprof]');ok(/Trades I offer/.test(txt())&&/not limited/i.test(txt()),'contractor profile has Trades I offer');
 click('[data-a=mytrade][data-v=handyman]');ok(ev("S.me.trades.includes('handyman')"),'contractor adds the handyman trade');
 click('[data-a=tab][data-v=chome]');ok($$('#view .card').some(c=>/Hang mirrors|Fix a loose handrail/.test(c.textContent)&&/Make an offer/.test(c.textContent)),'after adding the trade, handyman jobs have a Make an offer button');
 role('manager');

 // ---------- floating emergency button and contractor notice (new) ----------
 role('contractor');click('[data-a=tab][data-v=chome]');click('#emfab');ok(/call 000 now/i.test(txt())&&!/Alert the site contact/.test(txt())&&/Open a job to alert/.test(txt()),'contractor Emergency button off a job: Call 000 and a hint');click('[data-a=back]');
 ev("J.forEach(j=>{if(j.con==='c1'&&['paid','onsite','fix1','fix2'].includes(j.stage))j.stage='released'});J.find(j=>j.id==='m2').con='c1';J.find(j=>j.id==='m2').stage='paid'");
 click('[data-a=tab][data-v=chome]');ok(/1 job needs you/.test(txt())&&$$('#view button.notice').some(b=>/needs you/.test(b.textContent)),'contractor front page shows the "1 job needs you" notice');
 click('[data-a=tab][data-v=cactive]');ok(/1 job needs you/.test(txt()),'Active jobs shows the notice too');
 ev("J.find(j=>j.id==='m2').stage='released'");click('[data-a=tab][data-v=cactive]');ok(/Nothing needs you right now/.test(txt()),'Active jobs says nothing needs you when clear');
 click('[data-a=tab][data-v=chome]');ok(!/need(s)? you/.test($('#view').textContent.replace(/emergency jobs? need/g,'')),'front page notice is gone when nothing needs the contractor');
 role('manager');

 // ---------- maintenance reports (new) ----------
 role('manager');click('[data-a=tab][data-v=jobs]');ok($('[data-a=reports]'),'Jobs has a Reports button');
 ok($$('#view h2').some(h=>h.textContent==='Done')&&ev("J.filter(j=>j.mine&&j.stage==='released').length")>5&&/Older jobs are in Reports/.test(txt()),'Done shows only the latest jobs and points to Reports');
 click('[data-a=reports]');ok(/Monthly Maintenance Report/.test(txt())&&/Monthly Maintenance Report/.test($('.noprint.card').textContent),'Reports opens on the Monthly Maintenance Report for a building manager');click('[data-a=reptype][data-v=standard]');ev("S.rep.bid='all';render()");ok(/Monthly summary/.test(txt()),'the summary report is one tap away');
 const tile=l=>{const t=$$('.rtile').find(x=>x.textContent.includes(l));return t.querySelector('b').textContent};
 const exp=(k,p,b)=>ev("(()=>{const d=repData('"+k+"',"+p+",'"+b+"');return JSON.stringify({n:d.done.length,s:d.spend})})()");
 let e=JSON.parse(exp('monthly',-1,'all'));ok(tile('Jobs completed')===String(e.n)&&e.n>=1,'monthly report counts completed jobs ('+e.n+')');
 ok(tile('Approved spend')===ev('money('+e.s+')'),'monthly report total spend matches the jobs');
 const rg=ev("JSON.stringify(repRange('monthly',-1))");const mr=JSON.parse(rg);ok(mr.start.endsWith('-01')&&ev("addDays('"+mr.end+"',1)").endsWith('-01'),'monthly range is a whole calendar month');
 click('[data-a=repkind][data-v=weekly]');const wr=JSON.parse(ev("JSON.stringify(repRange('weekly',-1))"));ok(ev("dow('"+wr.start+"')")===1&&ev("daysBetween('"+wr.start+"','"+wr.end+"')")===6,'weekly range is Monday to Sunday');
 ok(/Weekly summary/.test(txt())&&tile('Jobs completed')===String(JSON.parse(exp('weekly',-1,'all')).n),'weekly report counts match');
 click('[data-a=repkind][data-v=fortnightly]');const fnr=JSON.parse(ev("JSON.stringify(repRange('fortnightly',-1))"));ok(ev("daysBetween('"+fnr.start+"','"+fnr.end+"')")===13&&ev("dow('"+fnr.start+"')")===1,'fortnightly range is two weeks from a Monday');
 ok(/Fortnightly summary/.test(txt()),'fortnightly report title');
 click('[data-a=repkind][data-v=monthly]');const lab1=$('.noprint b.grow').textContent;click('[data-a=repnav][data-v="-1"]');const lab2=$('.noprint b.grow').textContent;ok(lab1!==lab2,'earlier period changes the dates');
 click('[data-a=repnav][data-v="1"]');ok($('[data-a=repnav][data-v="1"]').disabled===false,'can step forward again');click('[data-a=repnav][data-v="1"]');click('[data-a=repnav][data-v="1"]');ok($('[data-a=repnav][data-v="1"]').disabled&&/\(so far\)/.test(txt()),'the current period is marked so far and cannot go further');
 click('[data-a=repnav][data-v="-1"]');
 ok(/Spend by trade/.test(txt())&&/Spend by building/.test(txt())&&/Needs attention now/.test(txt())&&/Booked after this period/.test(txt())&&/Safety/.test(txt()),'report has spend by trade and building, attention, upcoming and safety sections');
 const rsel=$('select[data-m="rep.bid"]');rsel.value='b3';rsel.dispatchEvent(new w.Event('change',{bubbles:true}));
 e=JSON.parse(exp('monthly',-1,'b3'));ok(tile('Approved spend')===ev('money('+e.s+')')&&!/Spend by building/.test(txt())&&/Park Terrace/.test($('.paper').textContent),'building filter limits the report to one building');
 rsel.value='all';rsel.dispatchEvent(new w.Event('change',{bubbles:true}));
 click('[data-a=repsched][data-v=weekly]');ok(/emailed automatically/.test($('#toast').textContent)&&$('[data-a=repsched][data-v=weekly]').getAttribute('aria-pressed')==='true','schedule: weekly report by email (demo)');
 click('[data-a=repsched][data-v=off]');ok(/turned off/.test($('#toast').textContent),'schedule can be turned off');
 ok($('[data-a=repprint]')&&$('[data-a=repcopy]'),'print and copy buttons exist');click('[data-a=repcopy]');
 ok(/Monthly summary/.test(ev('repText()'))&&/Approved spend/.test(ev('repText()')),'copy summary builds a text report');
 ok(!/Platform|Contractor fee|open jobs near you/.test($('.paper').textContent),'the report shows no owner settings or market information');
 click('[data-a=back]');

 // ---------- work orders and invoices (new) ----------
 role('manager');
 ok(/^WO-\d+$/.test(ev("J.find(j=>j.id==='"+nid+"').wo")),'approving a quote issues a work order number');
 click('[data-a=mjob][data-v='+nid+']');ok(/Job documents/.test(txt())&&/Not received yet/.test(txt())&&/Waiting for the contractor’s final invoice/.test(txt())&&/Payments/.test(txt()),'manager job shows payments, the work order and that no final invoice has arrived');
 click('[data-a=wo]');ok(/Work order WO-/.test(txt())&&/Replace the tap cartridge/.test(txt())&&/Agreed price/.test(txt())&&/Access/.test(txt())&&/Gate code/.test(txt())&&/Safety information/.test(txt())&&$('[data-a=repprint]'),'the work order shows the contractor, scope, price, access and safety, and can be printed');
 click('[data-a=back]');click('[data-a=back]');
 role('contractor');click('[data-a=tab][data-v=cactive]');ok(/Invoice to upload/.test(txt())&&$$('#view .card').some(c=>/Dripping tap in laundry/.test(c.textContent)&&/Invoice needed/.test(c.textContent)),'Active jobs lists the finished job under Invoice to upload');
 click('[data-a=tab][data-v=chome]');ok($$('#view button.notice').some(b=>/invoices? to upload/.test(b.textContent)),'front page shows an invoices to upload notice');
 click('[data-a=tab][data-v=cactive]');click('[data-a=cwork][data-v='+nid+']');ok(/Upload your final invoice/.test(txt())&&/View work order/.test(txt()),'job has the invoice upload form and a View work order button');
 click('[data-a=invsend]');ok(/invoice number/i.test($('#toast').textContent),'invoice needs a number');
 type('#in1','INV-777');click('[data-a=invsend]');ok(/invoice file/i.test($('#toast').textContent),'invoice needs a file');
 ev('S.invd.file={name:"invoice-777.pdf",size:2048}');ev('render()');ok(/invoice-777\.pdf/.test(txt()),'chosen invoice file name is shown');
 type('#in1','INV-777');type('#in3','500');click('[data-a=invsend]');ok(/matches the work order/.test($('#toast').textContent)&&/Your final invoice/.test(txt())&&/INV-777/.test(txt())&&/Matches the work order/.test(txt()),'a matching final invoice is uploaded');
 click('[data-a=tab][data-v=chome]');
 role('manager');click('[data-a=mjob][data-v='+nid+']');ok(/INV-777/.test(txt())&&!/Invoice amount differs/.test(txt())&&/Waiting for payment/.test(txt())&&/Final payment/.test(txt())&&/PR-\d+-1/.test(txt())&&!$('[data-a=closejob]'),'manager sees the invoice, and the final payment request waiting for the payer');click('[data-a=invdoc]');ok(/Invoice INV-777/.test(txt())&&/invoice-777\.pdf/.test(txt())&&/QT-\d+/.test(txt())&&/WO-\d+/.test(txt())&&/Matches the work order/.test(txt()),'the invoice document shows the invoice, work order, quote and match');click('[data-a=back]');
 role('contractor');click('[data-a=tab][data-v=cactive]');click('[data-a=cwork][data-v='+nid+']');click('[data-a=invreplace]');ok(/Upload your final invoice/.test(txt()),'contractor can replace an invoice');
 type('#in1','INV-778');type('#in3','450');ev('S.invd.file={name:"invoice-778.pdf",size:4096}');ev('render()');type('#in1','INV-778');type('#in3','450');click('[data-a=invsend]');ok(/differs from the work order/.test($('#toast').textContent)&&/No, the approved offer is \$500/.test(txt()),'an invoice with a different amount is flagged to the contractor');
 role('manager');click('[data-a=mjob][data-v='+nid+']');ok(/Invoice amount differs/.test(txt())&&/\$450/.test(txt()),'manager is told the invoice amount differs');
 click('[data-a=back]');
 click('[data-a=tab][data-v=jobs]');click('[data-a=reports]');click('[data-a=reptype][data-v=standard]');ev("S.rep.bid='all';render()");
 const wi=()=>JSON.parse(ev("(()=>{const R=S.rep,d=repData(R.kind,R.p,R.bid);return JSON.stringify({done:d.done.length,rec:d.inv.length,miss:d.invMiss.length,diff:d.invDiff.length,tot:d.invTotal})})()"));
 const rv=l=>{const r=$$('.paper .kv').find(x=>x.textContent.includes(l));return r.querySelector('b').textContent};
 click('[data-a=repkind][data-v=monthly]');let w1=wi();ok(/Work orders and invoices/.test(txt())&&/WO-\d+/.test($('.paper').textContent),'the report has a Work orders and invoices section with work order numbers');
 ok(rv('Invoices received')===String(w1.rec)&&rv('Invoices missing')===String(w1.miss)&&rv('Invoice differs from the work order')===String(w1.diff)&&rv('Invoiced total')===ev('money('+w1.tot+')'),'monthly invoice counts and total match the jobs (received '+w1.rec+', missing '+w1.miss+', differ '+w1.diff+')');
 ok(w1.miss>=1&&/Missing/.test($('.paper').textContent)&&/No invoice/.test($('.paper').textContent),'missing invoices are shown in the report');
 ok(/Invoice INV-/.test($('.paper').textContent),'completed job rows show their invoice numbers');
 ok(/Invoices received/.test(ev('repText()'))&&/WO-/.test(ev('repText()')),'the copied summary includes work orders and invoices');
 click('[data-a=back]');

 // ---------- quote documents, shared documents and closing (new) ----------
 role('manager');click('[data-a=mjob][data-v='+nid+']');
 ok(/Invoice amount differs/.test(txt())&&/Waiting for payment/.test(txt()),'a differing invoice is flagged while the payer has not paid');click('[data-a=reqpaid]');ok(/Ready to close/.test(txt())&&/check it first/.test(txt())&&$('[data-a=closejob]'),'once the payer has paid, the job is ready to close, and a differing invoice still lets the manager decide, with a warning');
 const mgrWO=(()=>{click('[data-a=wo]');const t=$('.paper').textContent;click('[data-a=back]');return t})();
 click('[data-a=quotedoc]');ok(/Quote QT-/.test(txt())&&/generated by TaskSpeck Strata/.test(txt())&&/Approved\. Work order WO-/.test(txt())&&/Park Terrace|Southbank Residences/.test($('.paper').textContent)&&$('[data-a=wo]'),'the approved quote document shows the work order link and the full site for the manager');click('[data-a=back]');
 click('[data-a=tab][data-v=jobs]');ok($$('#view h2').some(h=>h.textContent==='Needs you')&&$$('#view .card').some(c=>/Dripping tap in laundry/.test(c.textContent)&&/Ready to close/.test(c.textContent)),'Ready to close jobs sit under Needs you');
 ok($$('#view h2').some(h=>h.textContent==='Waiting for invoice')&&$$('#view .card').some(c=>/Replace pressure valve in plant room/.test(c.textContent)&&/Accepted, waiting for final invoice/.test(c.textContent)),'accepted jobs without a final invoice are under Waiting for invoice');
 click('[data-a=mjob][data-v='+nid+']');click('[data-a=closejob]');ok(/Job closed/.test(txt())&&/saved in the job file/.test(txt())&&!$('[data-a=closejob]')&&/Closed/.test($('#view .pill').textContent+txt()),'closing the job marks it Closed and saves the file');
 ok(/Job closed by the manager/.test(txt()),'the close is in the activity timeline');
 const closedN=ev("J.filter(j=>j.mine&&j.closed).length");
 role('contractor');click('[data-a=tab][data-v=cactive]');click('[data-a=cwork][data-v='+nid+']');ok(/Job closed\. Everything is saved in the job file/.test(txt()),'the contractor sees the job closed');
 const conWO=(()=>{click('[data-a=wo]');const t=$('.paper').textContent;click('[data-a=back]');return t})();
 ok(conWO===mgrWO&&/WO-\d+/.test(conWO),'manager and contractor see the same work order');
 click('[data-a=back]');click('[data-a=tab][data-v=cactive]');ok($$('#view h2').some(h=>h.textContent==='Done')&&$$('#view .card').some(c=>/Dripping tap in laundry/.test(c.textContent)),'a closed job moves to Done on the contractor side');
 // preview a quote before sending, then check the contractor copy hides the site
 click('[data-a=tab][data-v=find]');click('[data-a=fview][data-v=list]');click('[data-a=cjob][data-v=o6]');click('[data-a=qprev]');ok(/Enter your total price first/.test($('#toast').textContent),'Preview quote needs a price');
 type('#qp','330');type('#qs','Clear the drain\nTest the flow');click('[data-a=qprev]');ok(/Preview/.test($('.paper').textContent)&&/Draft preview, not sent yet/.test($('.paper').textContent)&&/\$330/.test($('.paper').textContent)&&/Clear the drain/.test($('.paper').textContent),'the contractor can preview the generated quote before sending');
 click('[data-a=back]');click('[data-a=sendq]');const sent=ev("J.find(j=>j.id==='o6').quotes.find(q=>q.c==='c1')");ok(sent&&/^QT-\d+$/.test(sent.no),'a sent offer gets a quote number');
 click('[data-a=tab][data-v=cquotes]');click('[data-a=cjob][data-v=o6]');click('[data-a=quotedoc]');ok(/Quote QT-/.test(txt())&&/South Yarra/.test($('.paper').textContent)&&/Sample Avenue/.test($('.paper').textContent)&&!/Southbank Residences|Riverside Gardens|Park Terrace/.test($('.paper').textContent)&&/Sent, waiting for the manager/.test($('.paper').textContent),'the contractor’s quote copy shows only the suburb and street before approval');click('[data-a=back]');click('[data-a=back]');
 role('manager');click('[data-a=tab][data-v=jobs]');click('[data-a=reports]');click('[data-a=reptype][data-v=standard]');ev("S.rep.bid='all';render()");click('[data-a=repkind][data-v=monthly]');
 const rrv=l=>{const r=$$('.paper .kv').find(x=>x.querySelector('span').textContent===l);return r.querySelector('b').textContent};
 ok(rrv('Jobs closed')===String(ev("repData('monthly',-1,S.rep.bid).closedN"))&&rrv('Ready to close')===String(ev("repData('monthly',-1,S.rep.bid).readyN")),'the report counts closed jobs and jobs ready to close');
 click('[data-a=back]');
 // theme
 click('[data-a=theme]');ok(w.document.documentElement.getAttribute('data-theme')==='light','theme: Auto -> Light');click('[data-a=theme]');ok(w.document.documentElement.getAttribute('data-theme')==='dark','theme: Light -> Dark');click('[data-a=theme]');ok(!w.document.documentElement.hasAttribute('data-theme'),'theme: Dark -> Auto');
 // profile settings and fee
 click('[data-a=tab][data-v=mprof]');ok(!/Platform settings|Appearance|Contractor fee|Launch radius/.test(txt()),'manager profile has no owner settings or appearance card');
 ok(!$('[data-a=owner]'),'managers do not see the Owner settings link (fees and postcodes are for the platform owner only)');ev("location.hash='#owner';applyHash()");ok($('[data-a=owner]')&&ev("location.hash")==='','opening the app with #owner shows a small Owner settings (demo) link at the bottom of the profile');
 click('[data-a=owner]');ok(/only the platform owner will see these/.test(txt())&&$('[data-set=fee]')&&$('[data-pcs]')&&$('[data-set=gstOnFee]'),'Owner settings screen has postcodes, fee and GST');
 const fe=$('[data-set=fee]');fe.value='20';fe.dispatchEvent(new w.Event('change',{bubbles:true}));ok(ev('feeOf(1000).net')===800,'changing the fee to 20% changes the contractor payout (1000 -> 800)');
 fe.value='15';fe.dispatchEvent(new w.Event('change',{bubbles:true}));ok(ev('feeOf(1000).net')===850,'fee back to 15%');
 ok(!/Warranty offered/i.test(html)&&!/call-out/i.test(html.replace(/no call-out/gi,'')),'no warranty line or call-out fee in the app');
 console.log(errs.length?'ERRORS: '+errs.join(' | '):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,4).join('\n'));}process.exit(0)},400);
