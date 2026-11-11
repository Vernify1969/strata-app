const {JSDOM}=require('jsdom');const fs=require('fs');const nodeCrypto=require('crypto');
const html=fs.readFileSync((process.env.APP||require('path').join(__dirname,'..','taskspeck-managers.html')),'utf8');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mk=(url,store)=>{const errs=[];const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:url||'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message));Object.defineProperty(w,'crypto',{value:nodeCrypto.webcrypto,configurable:true});w.TextEncoder=TextEncoder;if(store)Object.keys(store).forEach(k=>w.localStorage.setItem(k,store[k]))}});const w=dom.window,d=w.document;
 return{w,d,errs,$:s=>d.querySelector(s),$$:s=>[...d.querySelectorAll(s)],ev:c=>w.eval(c),txt:()=>d.querySelector('#view').textContent,click:s=>{const e=typeof s==='string'?d.querySelector(s):s;if(!e)throw new Error('missing '+s);e.click()},typeIn:(s,v)=>{const e=typeof s==='string'?d.querySelector(s):s;if(!e)throw new Error('missing '+s);e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}))},chg:(e,v)=>{if(!e)throw new Error('missing element');e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))},chk:(id,v)=>{const e=d.getElementById(id);e.checked=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))},toast:()=>d.querySelector('#toast').textContent,store:()=>{const o={};for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);o[k]=w.localStorage.getItem(k)}return o}}};
const STRATA=/\bcommittee\b|owners corporation|OC Manager|Plan PS|PS 0|lobby|corridor|plant room|car park|\blift\b|stairwell|\bgym\b|strata/i;
const PROP=/tenant|rental|property owner|\bproperty\b|properties|\bhouse\b|\bshop\b|townhouse/i;
const reg=async(I,o)=>{I.ev("A.authgo('register');A.authtype('manager')");const rl=I.$('#au-role');I.chg(rl,o.role);I.typeIn('#au-name',o.name);I.typeIn('#au-email',o.email);I.typeIn('#au-mob','0411 222 333');I.typeIn('#au-pw',o.pw);I.typeIn('#au-pw2',o.pw);I.chk('au-terms',true);await I.ev("A.authreg()");await sleep(250)};
(async()=>{try{
 // ===== main page, registration and the drop-down =====
 let A=mk('https://example.org/');await sleep(300);
 ok(/Maintenance quotes for buildings and properties/.test(A.txt())&&A.$$('[data-a=authguest]').map(b=>b.textContent).join('|')==='Building manager|OC manager|Property manager|Contractor'&&/different roles, and an account is one or the other/.test(A.txt()),'the main page offers the demo for Building manager, OC manager, Property manager and Contractor, and says they are different roles');
 A.ev("A.authgo('register')");ok(A.$$('[data-a=authtype]').map(b=>b.textContent).join('|')==='Manager|Contractor','registration is Manager or Contractor');
 A.ev("A.authtype('manager')");ok(A.$$('#au-role option').map(o=>o.textContent).join('|')==='Choose your role|Building manager|OC manager|Property manager'&&/An account is one or the other/.test(A.txt()),'Manager opens a drop-down with Building manager, OC manager and Property manager');
 A.ev("A.authtype('contractor')");ok(A.$('#au-biz')&&!A.$('#au-role'),'Contractor asks for a business name');A.w.close();
 // ===== demo: the header drop-down =====
 let D=mk();await sleep(300);
 ok(D.$('select[data-rolesel]')&&D.$$('select[data-rolesel] option').map(o=>o.textContent).join('|')==='Manager|Building manager|OC manager|Property manager'&&D.$$('.seg button').map(b=>b.textContent).join('|')==='Contractor','in the demo the Manager button is a drop-down with the three roles');
 ev=c=>D.ev(c);const pick=r=>{D.ev("S.stack=[];render()");D.chg(D.$('select[data-rolesel]'),r)};
 ok(/Building and owners corporation management/.test(D.txt())&&D.$$('.nav button').some(b=>/Buildings/.test(b.textContent))&&ev("B.map(b=>b.name).join('|')")==='Southbank Residences|Riverside Gardens|Park Terrace Apartments','a building manager sees buildings: Southbank Residences, Riverside Gardens and Park Terrace Apartments');
 D.chg(D.$('select[data-rolesel]'),'Property manager');
 ok(ev("S.prof.role")==='Property manager'&&/Property management/.test(D.txt())&&D.$$('.nav button').some(b=>/Properties/.test(b.textContent))&&ev("B.map(b=>b.ptype).join('|')")==='Apartment|House|Shop|Townhouse or unit'&&ev("B.every(b=>b.world==='property')"),'choosing Property manager gives a separate world of private properties: an apartment, a house, a shop and a townhouse');
 D.chg(D.$('select[data-rolesel]'),'OC manager');
 ok(ev("S.prof.role")==='OC manager'&&ev("B.map(b=>b.name).join('|')")==='Southbank Residences|Riverside Gardens|Park Terrace Apartments'&&ev("B.every(b=>!b.world)"),'choosing OC manager goes back to the buildings, with nothing from the property world');
 D.chg(D.$('select[data-rolesel]'),'Building manager');ok(ev("S.prof.role")==='Building manager'&&ev("B.length")===3,'Building manager and OC manager share the common property world');
 D.click('[data-a=role][data-v=contractor]');ok(D.$('select[data-rolesel]').value===''&&D.$$('select[data-rolesel] option')[0].textContent==='Manager'&&ev("S.role")==='contractor','in the contractor view the drop-down shows Manager, so any choice returns to the manager side');
 D.chg(D.$('select[data-rolesel]'),'Property manager');ok(ev("S.role")==='manager'&&ev("S.prof.role")==='Property manager'&&D.$('select[data-rolesel]').value==='Property manager','and choosing a role returns to that manager world');
 // ===== nothing from one world appears in the other =====
 const seen=(role)=>{D.chg(D.$('select[data-rolesel]'),role);const out=[];const t=nm=>out.push([nm,D.txt()]);
  ev("S.stack=[];S.tab.manager='mhome';render()");t('home');ev("S.tab.manager='jobs';render()");t('jobs');
  ev("S.tab.manager='bld';S.bopen={b:'b1',s:{'b1:photos':true,'b1:budgets':true,'b1:payer':true,'b1:contacts':true,'b1:tenant':true,'b1:site':true,'b1:hist':true,'b1:qlinks':true},add:false;render()");
  return out};

 const scan=(role,bad,pages)=>{ev("S.stack=[];render();A.mgrrole('"+role+"')");const hits=[];for(const [nm,code] of pages){ev(code);const t=D.txt(),m=t.match(bad);if(m){const i=t.indexOf(m[0]);hits.push(nm+': ...'+t.slice(Math.max(0,i-40),i+45).replace(/\s+/g,' ')+'...')}}return hits};
 const pagesS=[['home',"S.stack=[];S.tab.manager='mhome';render()"],['jobs',"S.tab.manager='jobs';render()"],['buildings',"S.tab.manager='bld';S.bopen={b:'b1',s:{'b1:photos':true,'b1:budgets':true,'b1:payer':true,'b1:contacts':true,'b1:site':true,'b1:hist':true,'b1:qlinks':true},add:false};render()"],['add form',"S.tab.manager='bld';S.stack=[];S.bopen={b:null,s:{},add:false};render();A.bnew()"],['request step 1',"S.stack=[];A.new();S.draft.bid='b1';S.step=1;render()"],['request step 3',"S.step=3;render()"],['profile',"S.stack=[];S.tab.manager='mprof';render()"],['reports',"S.stack=[];S.tab.manager='jobs';render();A.reports()"],['quick request',"S.stack=[];A.quick()"],['a finished job',"S.stack=[];go('mjob',{id:'h1'})"]];
 const tenantWords=/tenant|rental|property owner|townhouse or unit|\bshop\b|Property manager/i;
 let h=scan('Building manager',tenantWords,pagesS);ok(h.length===0,'a building manager never sees tenant, rental, property owner or property manager wording '+(h.length?JSON.stringify(h):''));
 h=scan('OC manager',tenantWords,pagesS);ok(h.length===0,'nor does an OC manager '+(h.length?JSON.stringify(h):''));
 const pagesP=[['home',"S.stack=[];S.tab.manager='mhome';render()"],['jobs',"S.tab.manager='jobs';render()"],['properties',"S.tab.manager='bld';S.bopen={b:'b1',s:{'b1:photos':true,'b1:budgets':true,'b1:payer':true,'b1:contacts':true,'b1:tenant':true,'b1:site':true,'b1:hist':true},add:false};render()"],['add form',"S.tab.manager='bld';S.stack=[];S.bopen={b:null,s:{},add:false};render();A.bnew()"],['request step 1',"S.stack=[];A.new();S.draft.bid='b1';S.step=1;render()"],['request step 3',"S.step=3;render()"],['request step 4',"S.step=4;render()"],['profile',"S.stack=[];S.tab.manager='mprof';render()"],['reports',"S.stack=[];S.tab.manager='jobs';render();A.reports()"],['quick request',"S.stack=[];A.quick()"],['a finished job',"S.stack=[];go('mjob',{id:'h1'})"],['job report',"S.stack=[];A.jrview('h1')"]];
 h=scan('Property manager',/committee|owners corporation|OC Manager|Plan PS|PS 0|lobby|corridor|plant room|car park|\blift\b|stairwell|\bgym\b|(?<!TaskSpeck )strata|\bbuildings?\b/i,pagesP);ok(h.length===0,'a property manager never sees committee, owners corporation, plan, lobby, lift or building wording '+(h.length?JSON.stringify(h):''));
 // ===== the property card =====
 pick('Property manager');ev("S.stack=[];S.tab.manager='bld';S.bopen={b:'b1',s:{'b1:contacts':true,'b1:tenant':true,'b1:site':true,'b1:budgets':true,'b1:qlinks':true},add:false};render()");
 const card=D.$('.bcard[data-b=b1]').textContent;
 ok(/Type\s*Apartment/.test(card)&&/Tenant\s*J\. Smith/.test(card)&&!/OC or plan/.test(card)&&!/Annual budgets/.test(card)&&!D.$('.bsec[data-k="b1:qlinks"]')&&/Entry hours/.test(card)&&D.$('.bsec[data-k="b1:tenant"]')&&/Tenant and entry/.test(card),'a property shows its type and tenant, has Tenant and entry and Entry hours, and has no plan number, annual budgets or QR links');
 ok(D.$('#tnb1').value==='J. Smith'&&D.$('#enb1').value==='Tenant will let you in'&&D.$$('#enb1 option').length===6&&D.$('#opb1').value==='0400 000 201 (sample)'&&D.$('#owb1').value==='R. Patel','the tenant and owner details are there, with a choice of how the contractor gets in');
 D.chg(D.$('#tnb1'),'A. Tenant');D.chg(D.$('#tpb1'),'0400 111 222');D.chg(D.$('#enb1'),'Lockbox or key safe');D.chg(D.$('#ennb1'),'Code 1234 at the side gate');D.chg(D.$('#tpeb1'),'Cat');
 ok(ev("bld('b1').tenant.name")==='A. Tenant'&&ev("bld('b1').tenant.phone")==='0400 111 222'&&ev("bld('b1').entry")==='Lockbox or key safe'&&ev("bld('b1').entryNote")==='Code 1234 at the side gate'&&ev("bld('b1').tenant.pets")==='Cat','the tenant and entry details can be changed');
 ok(ev("accOf(bld('b1'))")==='Tenant: A. Tenant, 0400 111 222\nEntry: Lockbox or key safe. Code 1234 at the side gate\nPets: Cat','they become the entry and access details for contractors');
 // wizard
 ev("S.stack=[];A.new();S.draft.bid='b1';S.step=1;render()");
 ok(/Which part of the property\?/.test(D.txt())&&PAREAS_OK(D)&&/Type\s*Apartment/.test(D.txt())&&/Tenant\s*A\. Tenant/.test(D.txt())&&/Property owner\s*R\. Patel/.test(D.txt())&&!/OC or plan/.test(D.txt()),'the request starts with the property’s type, owner and tenant, and asks which part of the property, with rooms to tap');
 function PAREAS_OK(I){return I.$$('[data-a=darea]').map(b=>b.textContent).join('|')==='Kitchen|Bathroom|Laundry|Bedroom|Living area|Roof or gutters|Garden or fence|Garage|Heating or cooling|Front door or locks|Whole property'}
 D.click('[data-a=darea][data-v="Kitchen"]');ok(ev("S.draft.area")==='Kitchen','one tap picks the room');
 ev("S.step=3;render()");
 ok(/Entry and access \(private\)/.test(D.txt())&&/Tenant: A\. Tenant, 0400 111 222/.test(D.$('#ac').value)&&/Entry: Lockbox or key safe/.test(D.$('#ac').value)&&/Tenants must be given proper notice of entry/.test(D.txt())&&/Entry hours/.test(D.txt())&&!/Lift booking or loading dock/.test(D.txt())&&/Other notes about the property/.test(D.txt()),'step 3 starts the entry details from the tenant, mentions notice of entry, and has no lift or loading dock');
 // ===== adding a property and a building =====
 ev("S.stack=[];S.tab.manager='bld';S.bopen={b:null,s:{},add:false};S.nb=null;render()");D.click('[data-a=bnew]');
 ok(D.$$('#nbt option').map(o=>o.textContent).join('|')==='Apartment|House|Townhouse or unit|Shop|Office or commercial|Other'&&!/OC or plan number/.test(D.txt()),'adding a property asks for its type (apartment, house, townhouse, shop, office or other), not a plan number');
 D.typeIn('[data-m="nb.name"]','Corner shop');D.typeIn('[data-m="nb.street"]','2 Sample Road');D.chg(D.$('#nbt'),'Shop');D.typeIn('input[data-m="nb.suburb"]','Richmond');D.typeIn('input[data-m="nb.pc"]','3121');D.click('[data-a=bsave]');
 const np=JSON.parse(ev("JSON.stringify(B[B.length-1])"));ok(np.name==='Corner shop'&&np.ptype==='Shop'&&np.world==='property'&&np.oc===''&&np.tenant&&np.entry==='Tenant will let you in'&&np.hrs.from==='09:00','the new property is saved as a shop in the property world, with tenant and entry fields and no plan number');
 ev("S.draft=newDraft()");pick('Building manager');ev("S.stack=[];S.tab.manager='bld';S.bopen={b:null,s:{},add:false};S.nb=null;render()");D.click('[data-a=bnew]');
 ok(D.$$('#nbt option').map(o=>o.textContent).join('|')==='Apartment building|Townhouse or villa complex|Mixed-use or commercial building|Other common property'&&/OC or plan number/.test(D.txt()),'adding a building asks for the type of common property and the OC or plan number');
 D.typeIn('[data-m="nb.name"]','Harbour Towers');D.typeIn('[data-m="nb.street"]','9 Sample Road');D.chg(D.$('#nbt'),'Mixed-use or commercial building');D.typeIn('input[data-m="nb.suburb"]','Southbank');D.typeIn('input[data-m="nb.pc"]','3006');D.typeIn('[data-m="nb.oc"]','PS 555');D.click('[data-a=bsave]');
 const nbd=JSON.parse(ev("JSON.stringify(B[B.length-1])"));ok(nbd.name==='Harbour Towers'&&nbd.ptype==='Mixed-use or commercial building'&&nbd.oc==='PS 555'&&!nbd.world&&!nbd.tenant,'the new building has its type and plan number, and no tenant or property fields');
 ev("S.bopen={b:'"+nbd.id+"',s:{},add:false};render()");ok(/Type\s*Mixed-use or commercial building/.test(D.$('.bcard[data-b='+nbd.id+']').textContent)&&D.$('.bsec[data-k="'+nbd.id+':qlinks"]')&&!D.$('.bsec[data-k="'+nbd.id+':tenant"]'),'a building shows its type and QR links, and has no tenant group');
 // ===== quick request areas =====
 ev("S.stack=[];A.quick()");ok(D.$$('[data-a=qarea]').map(b=>b.textContent).join('|')==='Lobby|Car park|Lift|Plant room|Roof|Bin room|Corridor|Garden|Gym|Pool','a building manager’s quick request offers the common areas');
 pick('Property manager');ev("S.stack=[];A.quick()");ok(D.$$('[data-a=qarea]').map(b=>b.textContent).join('|')==='Kitchen|Bathroom|Laundry|Bedroom|Living area|Roof or gutters|Garden or fence|Garage|Heating or cooling|Front door or locks|Whole property','a property manager’s quick request offers rooms');
 // ===== the contractor sees the right access after booking =====
 ev("S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m2'})");ok(/Access details/.test(D.txt())&&/Tenant: The Nguyen family, 0400 000 302 \(sample\)/.test(D.txt())&&/Entry: Tenant will let you in\. Please knock first/.test(D.txt())&&/Pets: Small friendly dog/.test(D.txt()),'after booking, a contractor on a property job sees the tenant, the entry arrangement and the pets');
 pick('Building manager');ev("S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'m2'})");ok(/Access details/.test(D.txt())&&/Gate code|Concierge|Key safe|caretaker|Site contact/i.test(D.txt())&&!/Tenant:/.test(D.txt()),'and on a building job they see the building’s access details, with no tenant');
 pick('Property manager');ev("S.stack=[];S.role='contractor';S.tab.contractor='find';render();go('cjob',{id:'m1'})");ok(/Notice to the tenant/.test(D.txt())&&/Entry hours/.test(D.txt())&&!/Lift or dock|Notice to residents/.test(D.txt())&&!/\bbuilding\b|residents|lobby/i.test(D.txt().replace(/Building supplies/g,'')),'a contractor looking at a property job sees tenant notice and entry hours, with no lift, residents or building wording');
 pick('Building manager');ev("S.stack=[];S.role='contractor';S.tab.contractor='find';render();go('cjob',{id:'m1'})");ok(/Notice to residents/.test(D.txt())&&/Lift or dock/.test(D.txt())&&!/tenant/i.test(D.txt()),'and on a building job sees notice to residents and the lift, with no tenant wording');
 D.w.close();
 // ===== accounts are one role only =====
 let P=mk('https://example.org/');await sleep(250);await reg(P,{role:'Property manager',name:'Pat Property',email:'pat@example.com',pw:'Rentals2026x'});
 ok(P.ev("AUTH.user.kind")==='property'&&P.ev("S.prof.role")==='Property manager'&&P.ev("B.every(b=>b.world==='property')")&&P.ev("B.length")===4,'registering as a property manager starts in the property world');
 ok(!P.$('select[data-rolesel]')&&P.$$('.seg button').map(b=>b.textContent).join('|')==='Property manager|Contractor','a signed-in account has no role drop-down: the role is fixed, and the button shows it');
 P.ev("A.mgrrole('Building manager')");ok(P.ev("S.prof.role")==='Property manager'&&P.ev("B.length")===4,'a property manager account cannot be switched to a building manager');
 P.ev("S.stack=[];S.tab.manager='mprof';render()");ok(!P.$('select[data-m="prof.role"]')&&/Property manager/.test(P.txt())&&/Agency or company/.test(P.txt())&&!/OC or company/.test(P.txt()),'the profile shows the role fixed, and asks for the agency or company');
 const pst=P.store();P.w.close();
 let B=mk('https://example.org/');await sleep(250);await reg(B,{role:'Building manager',name:'Bob Building',email:'bob@example.com',pw:'Towers2026x'});
 ok(B.ev("AUTH.user.kind")==='strata'&&B.ev("B.every(b=>!b.world)")&&B.ev("B.length")===3&&!B.$('select[data-rolesel]')&&B.$$('.seg button')[0].textContent==='Building manager','registering as a building manager starts in the buildings world, with the role fixed');
 B.ev("S.stack=[];S.tab.manager='mprof';render()");ok(B.$$('select[data-m="prof.role"] option').map(o=>o.textContent).join('|')==='Choose your role|Building manager|OC manager','a building manager’s role list has Building manager and OC manager only');
 B.w.close();
 // coming back
 let P2=mk('https://example.org/',pst);await sleep(300);ok(P2.ev("AUTH.user.kind")==='property'&&P2.ev("B.every(b=>b.world==='property')"),'coming back, a property manager is still in the property world with their properties');
 // reset keeps the world
 P2.ev("S.stack=[];S.tab.manager='mprof';render()");P2.click('[data-a=resetask]');P2.click('[data-a=resetyes]');ok(P2.ev("B.every(b=>b.world==='property')")&&P2.ev("B.length")===4&&P2.ev("S.prof.role")==='Property manager','resetting a property manager’s data brings back property samples, not buildings');
 // demo addresses
 let U=mk('https://example.org/?demo=property');await sleep(250);ok(U.ev("B.every(b=>b.world==='property')")&&U.ev("S.prof.role")==='Property manager','?demo=property opens the property demo');
 let U2=mk('https://example.org/?demo=oc');await sleep(250);ok(U2.ev("S.prof.role")==='OC manager'&&U2.ev("B.every(b=>!b.world)"),'?demo=oc opens the OC manager demo');
 let U3=mk('https://example.org/?demo=1');await sleep(250);ok(!U3.ev("isPM()")&&U3.ev("B.length")===3&&U3.ev("B.every(b=>!b.world)"),'?demo=1 opens the buildings demo, with no role chosen yet');
 console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)})();
