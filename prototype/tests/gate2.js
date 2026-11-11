const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync((process.env.APP||require('path').join(__dirname,'..','taskspeck-managers.html')),'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/?demo=1'});
const w=dom.window,d=w.document,ev=c=>w.eval(c);let fail=0;
const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const $=s=>d.querySelector(s),$$=s=>[...d.querySelectorAll(s)],txt=()=>$('#view').textContent;
const click=s=>{const e=typeof s==='string'?$(s):s;if(!e)throw new Error('missing '+s);e.click()};
const type=(s,v)=>{const e=$(s);e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}));e.dispatchEvent(new w.Event('change',{bubbles:true}))};
setTimeout(()=>{try{
 // fresh manager: nothing chosen
 const before=ev("J.length");
 click($$('#view button').find(b=>/New request/.test(b.textContent)));
 ok(ev("cur().n")==='new'&&/Building and place/.test(txt()),'New request opens the form straight away');
 // fill the request by the form
 type('#ar','Level 2 corridor');
 click('[data-a=step][data-v=next]');
 type('#ti','Dripping tap near the lift');
 click('[data-a=step][data-v=next]');
 ok(/Safety|safety/.test(txt()),'step 3 reached');
 ev("Object.keys(S.draft.safety).forEach(k=>{if(['danger','hazard','asbestos','isolate','height','people','pets'].includes(k))S.draft.safety[k]='no'});render()");
 click('[data-a=step][data-v=next]');
 ok(/When and requirements|Urgency/.test(txt()),'step 4 reached');
 ev("S.draft.date=addBiz(todayIso(),3);S.draft.slot='any';S.draft.time='09:00';render()");
 click('[data-a=step][data-v=next]');
 ok(ev("S.step")===5&&/Finish your profile to send this request/.test(txt())&&$('[data-a=post]').disabled,'the last step shows what is missing, and Send request is locked');
 click('[data-a=finishprof]');
 ok(/Choose your role/.test(txt())&&/Your request is saved/.test(txt()),'Finish my profile shows what to choose');
 type('select[data-m="prof.role"]','Building manager');type('select[data-m="prof.pay"]','bank');
 const pc=$('input[data-m="prof.consent"]');pc.checked=true;pc.dispatchEvent(new w.Event('change',{bubbles:true}));
 ok(/Your profile is complete/.test($('#profstat').textContent)&&$('#profstat [data-a=backreq]'),'once complete, a Back to my request button appears');
 click('#profstat [data-a=backreq]');
 ok(ev("S.step")===5&&!$('[data-a=post]').disabled&&!/Finish your profile to send this request/.test(txt()),'the request is back at the last step with Send request ready');
 click('[data-a=post]');
 ok(ev("J.length")===before+1&&/Request sent/.test($('#toast').textContent)&&ev("J[0].title")==='Dripping tap near the lift'&&ev("S.draft")===null,'the request is sent, and appears as a job');
 console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,4).join('\n'))}process.exit(0)},400);
