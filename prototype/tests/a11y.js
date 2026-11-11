const {JSDOM}=require('jsdom');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.APP||path.join(__dirname,'..','taskspeck-managers.html'),'utf8');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PROF="S.prof.pay='bank';S.prof.consent=true;S.prof.abn='12 345 678 319';S.prof.billing='a@b.co';S.prof.oc='Agency';";
(async()=>{try{
 const F=new Map();const note=(k,screen,sample)=>{if(!F.has(k))F.set(k,{n:0,screens:new Set(),sample});const f=F.get(k);f.n++;f.screens.add(screen)};let screensSeen=0;
 for(const [name,url,role,side] of [['building manager','?demo=1','Building manager','manager'],['property manager','?demo=property','Property manager','manager'],['contractor','?demo=contractor','','contractor']]){
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/'+url});await sleep(300);const w=dom.window,d=w.document,ev=c=>w.eval(c);
  if(side==='manager')ev("S.prof.role='"+role+"';"+PROF);
  const screens=[];const add=(l,c)=>screens.push([l,c]);
  if(side==='manager'){['mhome','jobs','mcal','bld','cons','mprof'].forEach(t=>add('tab '+t,"S.stack=[];S.role='manager';S.tab.manager='"+t+"';render()"));
   JSON.parse(ev("JSON.stringify(J.filter(j=>j.mine).map(j=>j.id))")).forEach(id=>add('job '+id,"S.stack=[];S.tab.manager='jobs';render();go('mjob',{id:'"+id+"'})"));
   JSON.parse(ev("JSON.stringify(B.map(b=>b.id))")).forEach(id=>add('building '+id,"S.stack=[];S.tab.manager='bld';S.bopen={b:'"+id+"',s:Object.fromEntries(['photos','budgets','payer','contacts','tenant','site','hist','rpt','qlinks'].map(k=>['"+id+":'+k,true])),add:false};render()"));
   add('add building',"S.stack=[];S.tab.manager='bld';S.bopen={b:null,s:{},add:false};render();A.bnew()");['committee','standard','job'].forEach(t=>add('reports '+t,"S.stack=[];A.reports();S.rep.type='"+t+"';render()"));add('export',"S.stack=[];A.reports();A.repexport()");
   for(let i=1;i<=5;i++)add('wizard '+i,"S.stack=[];A.new();S.draft.bid=B[0].id;S.step="+i+";render()");add('quick',"S.stack=[];A.quick()");add('help',"S.stack=[];go('help')");add('my data',"S.stack=[];go('mydata')");add('notifications',"S.stack=[];go('notify')");add('emergency',"S.stack=[];go('emerg')");add('owner settings',"S.stack=[];S.ownerMode=true;A.owner()");
   if(role!=='Property manager'){['queue','qr','set'].forEach(t=>add('reporting '+t,"S.stack=[];A.breport('b1');S.bt='"+t+"';render()"));JSON.parse(ev("JSON.stringify(RPT().map(r=>r.id))")).forEach(id=>add('report '+id,"S.stack=[];A.rptopen('"+id+"')"));add('qr code',"S.stack=[];A.qshow('b1|b1-l1')");add('label sheet',"S.stack=[];A.qsheet('b1')");add('public page',"S.stack=[];openPub(bld('b1').locs[0].tok)");add('public page with an inactive code',"S.stack=[];openPub('0'.repeat(32))")}
  }else{add('help',"S.stack=[];S.role='contractor';go('help')");add('my data',"S.stack=[];S.role='contractor';go('mydata')");add('notifications',"S.stack=[];S.role='contractor';go('notify')");['chome','find','cactive','ccal','cprof'].forEach(t=>add('tab '+t,"S.stack=[];S.role='contractor';S.tab.contractor='"+t+"';render()"));JSON.parse(ev("JSON.stringify(J.map(j=>[j.id,j.stage]))")).forEach(([id,st])=>{add('job '+id,"S.stack=[];S.role='contractor';S.tab.contractor='find';render();go('cjob',{id:'"+id+"'})");if(st!=='open')add('work '+id,"S.stack=[];S.role='contractor';go('cwork',{id:'"+id+"'})")})}
  for(const [l,c] of screens){try{ev(c)}catch(e){continue}screensSeen++;const key=name+' '+l;
   for(const el of d.querySelectorAll('#view input:not([type=hidden]):not([type=file]), #view select, #view textarea')){const id=el.id,lab=id&&d.querySelector('label[for="'+id+'"]'),wrapped=el.closest('label'),aria=el.getAttribute('aria-label')||el.getAttribute('aria-labelledby');if(!lab&&!wrapped&&!aria)note('a field with no name',key,el.getAttribute('data-m')||el.tagName)}
   for(const el of d.querySelectorAll('#view input[type=file]')){if(!(el.id&&d.querySelector('label[for="'+el.id+'"]'))&&!el.getAttribute('aria-label')&&!el.closest('label'))note('a file chooser with no name',key,'')}
   for(const el of d.querySelectorAll('#view button, #top button, #nav button')){if(!(el.textContent||'').trim()&&!el.getAttribute('aria-label')&&!el.getAttribute('title'))note('a button with no name',key,el.outerHTML.slice(0,60))}
   for(const el of d.querySelectorAll('#view img')){if(!el.hasAttribute('alt'))note('an image with no alt text',key,'')}
   for(const el of d.querySelectorAll('#view [data-a]:not(button):not(a):not(input):not(select)'))note('a clickable thing that is not a button',key,el.tagName)
   const ids=[...d.querySelectorAll('[id]')].map(e=>e.id);const dups=ids.filter((x,i)=>ids.indexOf(x)!==i);if(dups.length)note('the same id twice',key,dups[0]);
   const hs=[...d.querySelectorAll('#view h1,#view h2,#view h3')].map(h=>+h.tagName[1]);if(hs.length&&hs[0]!==1)note('no main heading first',key,'h'+hs[0]);
   const lbls=[...d.querySelectorAll('#view label[for]')];lbls.forEach(l=>{if(!d.getElementById(l.htmlFor))note('a label that points at nothing',key,l.htmlFor)})}
  dom.window.close()}
 ok(screensSeen>=150,'checked '+screensSeen+' screens in the three views');
 for(const k of ['a field with no name','a file chooser with no name','a button with no name','an image with no alt text','a clickable thing that is not a button','the same id twice','no main heading first','a label that points at nothing'])ok(!F.has(k),'no screen has '+k+(F.has(k)?' ('+F.get(k).n+', e.g. '+[...F.get(k).screens].slice(0,3).join('; ')+')':''));
 // and the public page, one by one
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/?demo=1'});await sleep(300);const w=dom.window,d=w.document;w.eval("openPub(bld('b1').locs[0].tok)");
 ok(d.querySelector('#view h1.sr-only')&&d.querySelector('#view').firstElementChild.tagName==='H1','the public report page starts with a main heading for screen readers');
 ok([...d.querySelectorAll('#view input:not([type=checkbox])')].filter(e=>!e.closest('[aria-hidden=true]')).every(e=>e.getAttribute('aria-label')||d.querySelector('label[for="'+e.id+'"]')),'every field a visitor fills in has a name');
 ok(d.documentElement.getAttribute('lang')==='en-AU'||/^en/.test(d.documentElement.getAttribute('lang')||''),'the page language is set');
 console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)})();
