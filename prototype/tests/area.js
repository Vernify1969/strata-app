const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync((process.env.APP||require('path').join(__dirname,'..','taskspeck-managers.html')),'utf8');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message))}});
const w=dom.window,d=w.document;let fail=0;
const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const $=s=>d.querySelector(s),$$=s=>[...d.querySelectorAll(s)],ev=c=>w.eval(c),txt=()=>$('#view').textContent;
const click=s=>{const e=typeof s==='string'?$(s):s;if(!e)throw new Error('missing '+s);e.click()};
const typeIn=(s,v)=>{const e=typeof s==='string'?$(s):s;if(!e)throw new Error('missing '+s);e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}))};
const chg=(e,v)=>{e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))};
const addB=(name,street,sub,pc)=>{ev("S.stack=[];S.role='manager';S.tab.manager='bld';S.nb=null;S.bopen={b:null,s:{},add:false};render()");click('[data-a=bnew]');typeIn('[data-m="nb.name"]',name);typeIn('[data-m="nb.street"]',street);typeIn('input[data-m="nb.suburb"]',sub);typeIn('input[data-m="nb.pc"]',pc);click('[data-a=bsave]')};
setTimeout(()=>{try{
 ev("S.prof.role='OC manager';S.prof.pay='bank';S.prof.consent=true;S.prof.oc='OC';S.prof.abn='12 345 678 319';S.prof.billing='a@b.co';S.stack=[];B.forEach(b=>{b.tiers=[{limit:1000,quotes:1},{limit:4999,quotes:2},{limit:30000,quotes:3}];b.payer='accounts';b.payEmail='a@example.com';b.terms=14})");
 // ===== the Melbourne list =====
 const L=ev("S.set.pcs");
 ok(ev("S.set.radius")===12&&L.length===39&&['3000','3006','3103','3121','3141','3182','3186'].every(p=>L.includes(p))&&['3128','3150','3108','3076','3030'].every(p=>!L.includes(p)),'to start, only Melbourne is served: 39 postcodes within about 12 km of Flinders Street Station, with Box Hill, Doncaster, Glen Waverley, Epping and Point Cook outside');
 ok(ev("inArea('3121','Richmond')")===true&&ev("inArea('3128','Box Hill')")===false&&ev("inArea('','Richmond')")===true&&ev("inArea('','Nowhere')")===true,'the check uses the postcode (an old building with no postcode is judged by its suburb, or allowed if unknown)');
 // ===== adding a building: address and postcode, no suburb list =====
 ev("S.stack=[];S.tab.manager='bld';S.bopen={b:null,s:{},add:false};render()");click('[data-a=bnew]');
 ok($('input[data-m="nb.suburb"]')&&!$('datalist')&&!$('select[data-m="nb.state"]')&&$('input[data-m="nb.pc"]').getAttribute('inputmode')==='numeric'&&$('input[data-m="nb.pc"]').maxLength===4&&/We serve Melbourne to start, about 12 km around Flinders Street Station\. Enter the building’s address and postcode and we check it\./.test(txt()),'a manager types the address, suburb and postcode, with no list of suburbs and no state box');
 typeIn('[data-m="nb.name"]','Harbour Court');typeIn('[data-m="nb.street"]','12 Sample Road');
 click('[data-a=bsave]');ok(/Add the suburb/.test($('#toast').textContent),'the suburb is needed');
 typeIn('input[data-m="nb.suburb"]','Collingwood');click('[data-a=bsave]');ok(/Add the postcode: 4 digits/.test($('#toast').textContent),'and so is the postcode');
 typeIn('input[data-m="nb.pc"]','31');click('[data-a=bsave]');ok(/Add the postcode: 4 digits/.test($('#toast').textContent),'which must have 4 digits');
 typeIn('input[data-m="nb.pc"]','3066');click('[data-a=bsave]');
 const nb=JSON.parse(ev("JSON.stringify(B[B.length-1])"));ok(nb.name==='Harbour Court'&&nb.suburb==='Collingwood'&&nb.pc==='3066'&&nb.state==='VIC'&&ev("B.length")===4,'an address in an open postcode is added, with any suburb name typed');
 ok(ev("addrLine(B[B.length-1])")==='12 Sample Road, Collingwood VIC 3066'&&ev("addrLine(B[0])")==='45 Sample Street, Southbank VIC 3006','addresses show the postcode');
 // outside Melbourne
 addB('Box Hill Towers','1 Sample Road','Box Hill','3128');
 ok(/We do not cover this area yet/.test(txt())&&/Postcode 3128 \(Box Hill\) is outside the area we serve at the moment: Melbourne, about 12 km around Flinders Street Station/.test(txt())&&$('[data-a=wait]')&&ev("B.length")===4,'a postcode outside the list is refused and offered the waiting list');
 click('[data-a=wait]');ok(ev("S.waitlist[S.waitlist.length-1]")==='Box Hill Towers, 1 Sample Road, Box Hill 3128'&&/waiting list/i.test($('#toast').textContent),'the waiting list keeps the address and postcode');
 // ===== the owner controls the postcodes =====
 ev("S.role='manager';S.stack=[];S.tab.manager='mprof';render();A.owner()");
 ok(/Postcodes we serve/.test(txt())&&$('#pcs').value.split(', ').length===39&&/39 postcodes\. Melbourne only to start\. The starting list is from memory, so check it against a postcode map/.test(txt())&&!$('[data-set=radius]'),'Owner settings has the list of postcodes, and says it should be checked');
 chg($('#pcs'),$('#pcs').value+', 3128 and 3128, abc');ok(ev("S.set.pcs.length")===40&&ev("S.set.pcs.includes('3128')")&&/40 postcodes saved/.test($('#toast').textContent),'adding a postcode opens that area (letters and repeats are ignored)');
 chg($('#pcs'),'nothing here');ok(/Add at least one postcode/.test($('#toast').textContent)&&ev("S.set.pcs.length")===40,'a list with no postcodes is refused');
 addB('Box Hill Towers','1 Sample Road','Box Hill','3128');ok(ev("B.some(b=>b.name==='Box Hill Towers'&&b.pc==='3128')")&&!/do not cover/.test(txt()),'once the postcode is opened the building can be added');
 ev("S.role='manager';S.stack=[];S.tab.manager='mprof';render();A.owner()");click('[data-a=pcsreset]');ok(ev("S.set.pcs.length")===39&&!ev("S.set.pcs.includes('3128')"),'one tap goes back to the starting Melbourne list');
 // a building whose postcode is closed cannot post requests
 ev("S.stack=[];S.tab.manager='mhome';S.draft=null;render();A.new();S.draft.bid='b1';S.step=1;render()");ok(!/do not cover/.test(txt()),'a building inside the area can start a request');
 ev("S.set.pcs=S.set.pcs.filter(p=>p!=='3006');S.draft.bid='b1';render()");ok(/We do not cover this area yet/.test(txt())&&/Postcode 3006 is outside the area we serve at the moment/.test(txt()),'if its postcode is closed, the request says so');
 ev("S.draft.area='Lobby';A.step('next')");ok(/We do not cover this area yet/.test($('#toast').textContent)&&ev('S.step')===1,'and cannot go on');
 ev("S.set.pcs=DEFAULT_PCS.slice();S.draft=null");
 // ===== contractors =====
 ev("S.stack=[];S.role='contractor';S.tab.contractor='find';S.find.view='list';S.find.km=0;render()");const nAll=$$('#view [data-a=cjob]').length;
 ev("S.set.pcs=S.set.pcs.filter(p=>p!=='3121');S.find.view='list';render()");ok($$('#view [data-a=cjob]').length<nAll,'jobs in a closed postcode are not shown to contractors');
 ev("S.set.pcs=DEFAULT_PCS.slice();render()");ok($$('#view [data-a=cjob]').length===nAll,'and come back when it is opened');
 ev("S.stack=[];S.tab.contractor='cprof';render()");
 ok($('#cwb')&&$('#cwb').value==='3121'&&$('#cwb').maxLength===4&&!$('datalist')&&/Where you work from \(postcode\)/.test(txt()),'contractors say where they work from with a postcode, with no list of suburbs');
 ev("S.stack=[];S.tab.contractor='find';S.find.km=0;render()");const t0=txt().match(/\d+\.\d km from you/g)||[];ok(t0.length>0,'jobs show how far they are from the contractor');
 ev("S.me.base='3182';render()");const t1=txt().match(/\d+\.\d km from you/g)||[];ok(t1.length>0&&t1.join()!==t0.join(),'changing the postcode changes the distances');
 ev("S.me.base='9999';render()");ok(!/\d+\.\d km from you/.test(txt())&&/Distance not known/.test(txt()),'a postcode the app does not know gives Distance not known');
 ev("S.me.base='3121'");
 // an open postcode the app has no position for
 ev("S.set.pcs=S.set.pcs.concat('3999')");addB('Far Court','5 Far Road','Somewhere','3999');ok(ev("B.some(b=>b.pc==='3999')"),'a postcode the owner has opened is accepted even if the app has no position for it');
 ev("S.draft=newDraft();Object.assign(S.draft,{bid:B[B.length-1].id,title:'Fix the gate',trade:'handyman',area:'Gate',instr:'Gate sticks',photos:1,dl:'3d',flex:true,slot:'any',time:'09:00',urgency:'Standard',safety:{danger:'no',hazard:'no',asbestos:'no',isolate:'no',height:'no',people:'no',pets:'no',note:''}});S.draft.date=(()=>{for(let i=3;i<20;i++){const x=addDays(todayIso(),i);if(dayOK(B[B.length-1],x,false))return x}})();S.role='manager';A.post()");
 ev("S.stack=[];S.role='contractor';S.tab.contractor='find';S.find.view='list';S.find.km=0;render()");ok(/Fix the gate/.test(txt())&&/Distance not known/.test(txt())&&!errs.length,'its jobs are shown to contractors, with the distance not known');
 ev("S.find.view='map';render()");ok($('.map')&&/not shown on the map/.test(txt())&&/12 km launch area/.test($('.map').textContent),'on the map it is left off with a note, and the 12 km ring is drawn');
 // ===== property managers =====
 ev("S.prof.role='Property manager';S.role='manager';S.stack=[];S.tab.manager='bld';S.bopen={b:null,s:{},add:false};S.nb=null;render()");click('[data-a=bnew]');ok(/Enter the property’s address and postcode and we check it/.test(txt())&&/Postcode/.test(txt()),'property managers enter the property’s address and postcode');
 ev("S.prof.role='OC manager'");
 // ===== quick request location =====
 ev("S.stack=[];S.tab.manager='mhome';S.role='manager';render();A.quick()");Object.defineProperty(w.navigator,'geolocation',{value:{getCurrentPosition:(ok)=>ok({coords:{latitude:-37.8230,longitude:144.9980}})},configurable:true});click('[data-a=qrgps]');ok(ev("S.qr.bid")==='b2'||ev("bld(S.qr.bid).pc")==='3121','standing in Richmond picks the Richmond building, using the postcode position');
 // ===== saved data from before =====
 const snap=()=>JSON.parse(ev("snapshot()"));
 let s1=snap();s1.S.set.radius=0;delete s1.S.set.pcs;s1.B.forEach(b=>{delete b.pc;delete b.state});s1.S.me.base='Richmond';ev("applyRaw("+JSON.stringify(JSON.stringify(s1))+")");
 ok(ev("S.set.radius")===12&&ev("S.set.pcs.length")===39&&ev("bld('b2').pc")==='3121'&&ev("bld('b2').state")==='VIC'&&ev("S.me.base")==='3121','saved data from before gets the Melbourne list, postcodes for its buildings, and the contractor’s suburb as a postcode');
 console.log(errs.length?'ERRORS '+errs.join('|'):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)},400);
