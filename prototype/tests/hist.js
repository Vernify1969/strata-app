const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync((process.env.APP||require('path').join(__dirname,'..','taskspeck-managers.html')),'utf8');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mk=(url,pre)=>{const errs=[];const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:url||'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message));if(pre)pre(w)}});const w=dom.window,d=w.document;
 return{w,d,errs,$:s=>d.querySelector(s),$$:s=>[...d.querySelectorAll(s)],ev:c=>w.eval(c),txt:()=>d.querySelector('#view').textContent,click:s=>{const e=typeof s==='string'?d.querySelector(s):s;if(!e)throw new Error('missing '+s);e.click()},typeIn:(s,v)=>{const e=d.querySelector(s);if(!e)throw new Error('missing '+s);e.value=v;e.dispatchEvent(new w.Event('input',{bubbles:true}))},chg:(e,v)=>{e.value=v;e.dispatchEvent(new w.Event('change',{bubbles:true}))},toast:()=>d.querySelector('#toast').textContent}};
(async()=>{try{
 const I=mk();await sleep(300);const {$,$$,ev,txt,click,typeIn,chg,toast}=I,w=I.w;
 ev("S.prof.role='OC manager';S.prof.pay='bank';S.prof.consent=true;S.prof.oc='OC';S.prof.abn='12 345 678 319';S.prof.billing='a@b.co';S.stack=[];B.forEach(b=>{b.tiers=[{limit:1000,quotes:1},{limit:4999,quotes:2},{limit:30000,quotes:3}];b.payer='accounts';b.payEmail='a@example.com';b.terms=14})");
 const prev=ev("addYm(todayIso().slice(0,7),-1)");
 ev("window.QB=JSON.parse(JSON.stringify(J.find(j=>j.id==='m1').quotes[0]))");
 const mkJob=(id,o)=>ev("(()=>{const q={...QB,price:"+o.price+",date:'"+o.date+"',time:'09:00',dep:{type:'none'},no:'QT-"+id+"'};J.push({id:'"+id+"',mine:true,title:'"+o.title+"',trade:'"+(o.trade||'plumbing')+"',bid:'"+(o.bid||'b1')+"',area:'"+o.area+"',stage:'"+(o.stage||'released')+"',closed:"+(o.stage&&o.stage!=='released'?'false':'true')+",quote:"+(o.stage&&o.stage!=='released'?'null':'q')+",quotes:[q],con:"+(o.stage&&o.stage!=='released'?'undefined':"'c1'")+",price:"+(o.stage&&o.stage!=='released'?'0':o.price)+",base:"+o.price+",wo:'WO-"+id+"',tier:1,urgency:'"+(o.urg||'Standard')+"',date:'"+o.date+"',pay:{reqs:[{id:'r"+id+"',no:'PR-"+id+"',kind:'final',amount:"+o.price+",due:'"+(o.due||o.date)+"',status:'paid',paidOn:'"+o.date+"',sentOn:'"+o.date+"',to:'x',held:false}]},vars:[],msgs:[],appr:{},log:[],chal:[],ev:{before:[],after:[],fix1:[],fix2:[]},inv:"+(o.noinv?'null':"{no:'INV-"+id+"',date:'"+o.date+"',amount:"+o.price+",gst:"+(o.nogst?'false':'true')+",file:{name:'f.pdf',size:1}}")+"})})()");
 ev("J.splice(0,J.length,...J.filter(j=>!(j.mine&&['b1','b2'].includes(j.bid)||j.id==='m1')))");
 ev("J.unshift({id:'m1',mine:true,title:'seed',trade:'plumbing',bid:'b3',area:'x',stage:'open',quotes:[],ev:{before:[],after:[],fix1:[],fix2:[]},log:[],chal:[],vars:[],msgs:[],appr:{}})");
 mkJob('r1',{title:'Fix dripping tap',area:'Level 4 corridor',price:800,date:prev+'-10'});
 mkJob('r2',{title:'Tap leaking again',area:'level 4  corridor',price:600,date:addD(-80)});
 function addD(n){return ev("addDays(todayIso(),"+n+")")}
 mkJob('r3',{title:'Tap washer replaced',area:'Level 4 Corridor',price:700,date:addD(-150)});
 mkJob('r4',{title:'Lobby light open',area:'Lobby',price:300,trade:'electrical',stage:'open',date:addD(3)});
 mkJob('r5',{title:'Old burst pipe',area:'Plant room',price:2500,urg:'Emergency',date:addD(-400)});
 // ================= history =================
 ev("S.role='manager';S.tab.manager='bld';S.stack=[];S.bopen={b:'b1',s:{'b1:hist':true,'b1:qlinks':true},add:false};render()");
 const hs=$('.bsec[data-k="b1:hist"]');ok(/Building history/.test(hs.textContent)&&/5 jobs · \$4,600 finished/.test(hs.querySelector('.bsec-h').textContent)&&$('[data-a=bhist][data-v=b1]'),'each building has a history group showing its job count and what was spent');
 click('[data-a=bhist][data-v=b1]');ok(/Building history/.test($('#view h1').textContent)&&$$('#hb option').map(o=>o.textContent).join('|')==='Southbank Residences|Riverside Gardens|Park Terrace Apartments','the history opens with a switcher listing every building');
 click('[data-a=hist][data-v="p|all"]');
 const tile=l=>$$('.rtile').find(t=>t.textContent.includes(l)).querySelector('b').textContent;
 ok(tile('Jobs')==='5'&&tile('Spent on finished jobs')==='$4,600'&&tile('Open now')==='1'&&tile('Emergencies')==='1','all time: 5 jobs, $4,600 spent, 1 open, 1 emergency');
 ok(/Repeat issues/.test(txt())&&/Level 4 corridor · Plumbing/.test(txt())&&/3 jobs in the last 12 months/.test(txt())&&/\$2,100/.test(txt())&&!/Lobby · Electrical/.test(txt())&&!/Plant room · Plumbing/.test(txt()),'a place that keeps coming back is flagged with its cost, even when typed differently, and one-off jobs are not');
 ok(/Contractors used/.test(txt())&&/Aqua Flow Plumbing/.test(txt())&&/4 jobs/.test(txt()),'the contractors used are listed with jobs and spend');
 click('[data-a=hist][data-v="f|open"]');ok($$('#view [data-a=mjob]').length===1&&/Lobby light open/.test(txt()),'the Open filter shows only open jobs');
 click('[data-a=hist][data-v="f|em"]');ok($$('#view [data-a=mjob]').length===1&&/Old burst pipe/.test(txt()),'the Emergencies filter shows emergencies');
 click('[data-a=hist][data-v="f|done"]');ok($$('#view [data-a=mjob]').length===4,'the Done filter shows finished jobs');
 click('[data-a=hist][data-v="f|all"]');click('[data-a=hist][data-v="p|12m"]');ok(!/Old burst pipe/.test(txt())&&tile('Jobs')==='4','the last 12 months leaves out older jobs');
 click('[data-a=hist][data-v="p|fy"]');ok(/Fix dripping tap/.test(txt()),'this financial year shows this year’s jobs');
 click('[data-a=hist][data-v="p|all"]');click($$('#view [data-a=mjob]').find(b=>/Fix dripping tap/.test(b.textContent)));ok(/Fix dripping tap/.test($('#view h1,#view h2').textContent+txt().slice(0,300))&&ev("cur().n")==='mjob','a job in the history opens the job');
 click('[data-a=back]');chg($('#hb'),'b2');ok(/Requests for this building will appear here/.test(txt())&&tile('Jobs')==='0'&&!/Repeat issues/.test(txt()),'switching building shows that building’s history, empty if it has no jobs');
 ev("S.prof.role='Property manager';render()");ok(/Property history/.test($('#view h1').textContent)&&/Requests for this property will appear here/.test(txt()),'property managers see Property history');ev("S.prof.role='OC manager'");
 // jobs list switcher
 ev("S.stack=[];S.tab.manager='jobs';S.jobB='all';render()");ok($$('#jb option').map(o=>o.textContent).join('|')==='All buildings|Southbank Residences|Riverside Gardens|Park Terrace Apartments'&&!$('[data-a=bhist]'),'the Jobs list can switch between buildings');
 const n0=$$('#view [data-a=mjob]').length;chg($('#jb'),'b1');ok($$('#view [data-a=mjob]').length>0&&$$('#view [data-a=mjob]').length<=n0&&$$('#view [data-a=mjob]').every(b=>ev("job('"+b.dataset.v+"').bid")==='b1')&&$('[data-a=bhist][data-v=b1]'),'choosing a building shows only its jobs, with a link to its history');
 click('[data-a=bhist][data-v=b1]');ok(/Building history/.test($('#view h1').textContent),'which opens that building’s history');
 // ================= quick links =================
 ev("S.stack=[];S.tab.manager='bld';S.bopen={b:'b1',s:{'b1:qlinks':true},add:false};render()");
 const QL=()=>$('.bsec[data-k="b1:qlinks"]');
 ok(!QL().querySelector('textarea')&&/Quick links are not ready yet/.test(QL().textContent)&&/permanent web address/.test(QL().textContent)&&/Do not print QR codes from a prototype address/.test(QL().textContent)&&!/claude/i.test(QL().textContent),'with no permanent web address set, quick links are not made, and the app says not to print QR codes from a prototype address');
 ev("S.role='manager';S.stack=[];S.tab.manager='mprof';render();A.owner()");
 ok($('#appurl')&&$('#appurl').value===''&&/App web address/.test(txt())&&/on your own domain/.test(txt())&&/No links are made while it is blank/.test(txt()),'Owner settings has an App web address, blank to start');
 for(const bad of ['http://app.example.com','foo','https://nodot','https://','ftp://x.example.com','https://a b.example.com']){chg($('#appurl'),bad);ok(/Enter an address that starts with https:\/\//.test($('#toast').textContent)&&ev("S.set.appUrl")==='','an address like '+bad+' is refused')}
 chg($('#appurl'),'https://app.taskspeck.example#quick-b1-lobby');ok(ev("S.set.appUrl")==='https://app.taskspeck.example'&&/App web address saved/.test($('#toast').textContent)&&/Links now use https:\/\/app\.taskspeck\.example\//.test(txt()),'a proper https address is saved, without anything after a #');
 ev("S.stack=[];S.tab.manager='bld';S.bopen={b:'b1',s:{'b1:qlinks':true},add:false};render()");const ql=QL().querySelector('textarea').value;
 ok(ql.split('\n').length===10&&/Plant room: https:\/\/app\.taskspeck\.example\/#quick-b1-plantroom/.test(ql)&&/Lobby: https:\/\/app\.taskspeck\.example\/#quick-b1-lobby/.test(ql)&&/free QR maker/.test(QL().textContent)&&/keep it permanent/.test(QL().textContent)&&!/claude/i.test(ql),'once the address is set, each building lists ten quick links on that address, with a warning to keep it permanent');
 ev("S.set.appUrl='https://www.example.com.au/app'");ev("render()");ok(/https:\/\/www\.example\.com\.au\/app\/#quick-b1-lift/.test(QL().querySelector('textarea').value),'an address with a path keeps the path');
 ev("S.set.appUrl=''");ev("render()");ok(!QL().querySelector('textarea')&&/not ready yet/.test(QL().textContent),'clearing it stops the links again');
 {const R=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://app.taskspeck.example/'});await sleep(250);ok(R.window.eval("qrBase()")==='https://app.taskspeck.example/','when the app is running on a real web address, that address is used without setting anything');R.window.close()}
 {const R=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://abc123.claudeusercontent.com/x'});await sleep(250);ok(R.window.eval("qrBase()")==='','but a prototype address is never used');R.window.close()}
 {const R=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://app.taskspeck.example/?demo=1'});await sleep(250);R.window.eval("S.set.appUrl='https://other.example/'");ok(R.window.eval("qrBase()")==='https://other.example/','and the owner’s setting takes priority');R.window.close()}
 // ================= quick request =================
 ev("S.stack=[];S.tab.manager='mhome';S.draft=null;render()");ok($('[data-a=quick]')&&/Quick request: photo first/.test(txt()),'Home has a Quick request button');
 click('[data-a=quick]');ok(/Quick request/.test($('#view h1').textContent)&&['1. Photos','2. Where','3. What is wrong','4. Is anything unsafe?','5. How soon'].every(h=>$$('#view h2').some(x=>x.textContent===h))&&$('#qrph').getAttribute('capture')==='environment'&&$('#qrph').accept==='image/*'&&$('#qrph').multiple,'it has five short steps, and the photo button opens the phone camera');
 const addPhotos=n=>{const inp=$('#qrph');Object.defineProperty(inp,'files',{value:Array.from({length:n},(_,i)=>({name:'p'+i+'.jpg',type:'image/jpeg',size:1000})),configurable:true});inp.dispatchEvent(new w.Event('change',{bubbles:true}))};
 const send=()=>click('[data-a=qrsend]');
 send();ok(/Add at least 1 photo/.test(toast()),'it asks for a photo first');
 addPhotos(2);ok(ev("S.qr.photos.length")===2&&/2<\/b> of 10 photos/.test($('#view').innerHTML),'photos are added and counted');
 send();ok(/Add the level or area/.test(toast()),'then the place');
 click('[data-a=qarea][data-v="Plant room"]');ok($('#qra').value==='Plant room'&&ev("S.qr.area")==='Plant room','one tap fills a common place');
 send();ok(/Say what is wrong/.test(toast()),'then what is wrong');
 click('[data-a=qtrade][data-v=electrical]');typeIn('#qrt','Light flickering and buzzing near the pump');
 send();ok(/Tell us if anything is unsafe/.test(toast()),'then whether anything is unsafe');
 click('[data-a=qsafe][data-v=ask]');send();ok(/Answer every safety question/.test(toast()),'and every safety question if it is');
 click('[data-a=qsq][data-v="asbestos|yes"]');ok(/Do not disturb it/.test(txt()),'a possible asbestos answer is explained');
 ['danger','hazard','isolate','height','people','pets'].forEach(k=>click('[data-a=qsq][data-v="'+k+'|no"]'));send();ok(/licensed assessor must clear possible asbestos/.test(toast())&&ev("J.filter(j=>j.title==='Electrical: Light flickering and buzzing near the pump').length")===0,'possible asbestos stops the request, as in the full form');
 click('[data-a=qsq][data-v="asbestos|no"]');click('[data-a=qsq][data-v="height|yes"]');
 ev("S.draft=newDraft();S.draft.title='Keep me'");
 click('[data-a=qwhen][data-v="3d"]');
 const nj=ev("J.length");send();
 ok(ev("J.length")===nj+1,'with the answers in, the request is sent');
 const j=JSON.parse(ev("JSON.stringify(J[0])"));
 ok(j.title==='Electrical: Light flickering and buzzing near the pump'&&j.trade==='electrical'&&j.bid==='b1'&&j.area==='Plant room'&&j.photos===2&&j.stage==='open'&&j.mine===true&&/Light flickering/.test(j.instr)&&j.urgency==='Standard'&&j.flex===true&&j.safety.height==='yes'&&j.safety.asbestos==='no'&&j.safety.danger==='no','the job has the photos, place, trade, description and safety answers');
 ok(ev("dayOK(bld('b1'),J[0].date,false)")&&ev("J[0].date>=addDays(todayIso(),3)"),'its date is a working day, at least three days away as chosen');
 ev("window.__s=S.draft");ok(ev("S.draft&&S.draft.title")==='Keep me','a half-finished full request is kept untouched');
 ok(ev("cur().n")==='mjob'&&ev("S.lastB")==='b1'&&ev("S.qr")===null&&/Quick|Electrical/.test(txt()),'it opens the new job, and remembers the building');
 ev("S.draft=null");
 click((ev("S.stack=[];S.tab.manager='mhome';render()"),'[data-a=quick]'));ok(ev("S.qr.bid")==='b1','the next quick request starts from the last building');
 // urgent, danger
 addPhotos(1);typeIn('#qra','Lobby');typeIn('#qrt','Water coming through the ceiling');click('[data-a=qsafe][data-v=ask]');SAFE=['danger','hazard','asbestos','isolate','height','people','pets'];SAFE.forEach(k=>click('[data-a=qsq][data-v="'+k+'|'+(k==='danger'?'yes':'no')+'"]'));ok(/Call 000 now/.test(txt()),'if someone is in danger the screen says to call 000');
 send();ok(ev("J[0].urgency")==='Emergency'&&ev("J[0].title")==='Plumbing: Water coming through the ceiling','and the request is sent as an Emergency');
 // location
 ev("S.stack=[];S.tab.manager='mhome';render()");click('[data-a=quick]');
 const geo=(la,lo,err)=>Object.defineProperty(w.navigator,'geolocation',{value:{getCurrentPosition:(ok,no)=>err?no({code:1}):ok({coords:{latitude:la,longitude:lo}})},configurable:true});
 geo(-37.8390,144.9930);click('[data-a=qrgps]');ok(ev("S.qr.bid")==='b1'||ev("S.qr.bid")==='b2','the location button picks the nearest building');
 const sb=ev("B.map(b=>b.id+':'+b.suburb).join()");
 geo(-37.8230,144.9980);click('[data-a=qrgps]');ok(ev("bld(S.qr.bid).suburb")==='Richmond'&&/Nearest building: Riverside Gardens/.test(toast()),'standing in Richmond picks the Richmond building');
 geo(-33.87,151.21);click('[data-a=qrgps]');ok(/do not seem to be near/.test(toast())&&ev("bld(S.qr.bid).suburb")==='Richmond','far away it does not guess');
 geo(0,0,true);click('[data-a=qrgps]');ok(/Could not get your location/.test(toast()),'if the phone will not share its location it says so');
 // speech
 ev("S.qr.text='';render()");ok(!$('[data-a=qrspeak]')&&/microphone on your keyboard/.test(txt()),'without voice typing it points to the keyboard microphone');
 w.SpeechRecognition=class{start(){this.onresult({results:[[{transcript:'water on the floor'}]]})}};ev("render()");click('[data-a=qrspeak]');ok(ev("S.qr.text")==='water on the floor'&&$('#qrt').value==='water on the floor','speaking fills in what is wrong');
 // profile gate
 ev("S.prof.consent=false");addPhotos(1);typeIn('#qra','Lobby');click('[data-a=qsafe][data-v=no]');send();ok(/Finish your profile to send this request/.test(toast()),'an unfinished profile is sent to finish it first');
 ev("S.prof.consent=true");
 // video
 ev("S.stack=[];S.tab.manager='mhome';render()");click('[data-a=quick]');const vi=$('#qrvd');Object.defineProperty(vi,'files',{value:[{name:'v.mp4'}],configurable:true});vi.dispatchEvent(new w.Event('change',{bubbles:true}));ok(ev("S.qr.video")===true&&/Video added/.test(txt()),'a short video can be added');
 // max photos
 addPhotos(12);ok(ev("S.qr.photos.length")===10&&/Maximum 10 photos/.test(toast()),'no more than 10 photos');
 // ================= deep link =================
 const L=mk('https://example.org/?demo=1#quick-b2-plantroom');await sleep(300);ok(L.ev("cur().n")==='quick'&&L.ev("S.qr.bid")==='b2'&&L.ev("S.qr.area")==='Plant room'&&/Quick request/.test(L.$('#view h1').textContent),'opening a quick link goes straight to a request for that building and place');
 ok(L.w.location.hash==='','and the link is cleared from the address');
 L.w.location.hash='#quick-b1-lift';L.w.dispatchEvent(new L.w.HashChangeEvent('hashchange'));ok(L.ev("S.qr.bid")==='b1'&&L.ev("S.qr.area")==='Lift','a link opened while the app is already running works too');
 const L2=mk('https://example.org/?demo=1#quick-b9-lobby');await sleep(300);ok(L2.ev("cur().n")!=='quick'&&!L2.errs.length,'a link for a building that does not exist is ignored');
 const L3=mk('https://example.org/#quick-b1-lobby');await sleep(300);ok(/Maintenance quotes for buildings and properties/.test(L3.txt()),'a signed-out person is asked to sign in first');
 // ================= accounting export =================
 ev("S.role='manager';S.stack=[];S.tab.manager='jobs';render();A.reports();S.rep.bid='b1';S.rep.ym='"+prev+"';render()");
 ev("A.repexport()");click('[data-a=expset][data-v=bills]');
 ok(/Bills for accounting/.test(txt())&&$$('[data-a=explay]').map(b=>b.textContent).join('|')==='Bills with tax type|Bills with tax code|General'&&/Enter your expense account code/.test(txt())&&/needed for this layout/.test(txt()),'Bills for accounting offers three layouts, and asks for an expense account code for the first');
 let rows=$('#cs').value.split(/\r?\n/);
 ok(rows[0]==='*ContactName,EmailAddress,*InvoiceNumber,Reference,*InvoiceDate,*DueDate,*Description,*Quantity,*UnitAmount,*AccountCode,*TaxType,TrackingName1,TrackingOption1,Currency','the first layout uses the bills import columns');
 ok(rows.length===2&&/^Aqua Flow Plumbing,,INV-r1,WO-r1,/.test(rows[1]),'one row for each invoice received that month');
 const cells=rows[1].split(',');const dmy=iso=>iso.split('-').reverse().join('/');
 ok(cells[4]===dmy(prev+'-10')&&cells[5]===dmy(prev+'-10')&&cells[7]==='1'&&cells[8]==='727.27'&&cells[10]==='GST on Expenses'&&cells[11]==='Building'&&cells[12]==='Southbank Residences'&&cells[13]==='AUD'&&/Fix dripping tap \(Southbank Residences\)/.test(rows[1]),'dates are day, month, year, the amount is without GST ($800 less $72.73), the tax type is GST on Expenses, and the building is the tracking option');
 typeIn('#eac','4-1000');rows=$('#cs').value.split(/\r?\n/);ok(rows[1].split(',')[9]==='4-1000'&&$('#eacwarn').hidden,'the account code is put on every line and the warning goes');
 ev("J.find(j=>j.id==='r1').inv.gst=false");ev("render()");rows=$('#cs').value.split(/\r?\n/);ok(rows[1].split(',')[8]==='800.00'&&rows[1].split(',')[10]==='BAS Excluded','a supplier without GST has the full amount and the tax type BAS Excluded');
 ev("J.find(j=>j.id==='r1').inv.gst=true;J.find(j=>j.id==='r1').pay.reqs[0].due='"+prev+"-24'");ev("render()");rows=$('#cs').value.split(/\r?\n/);ok(rows[1].split(',')[5]===dmy(prev+'-24'),'the due date is the date on the payment request');
 ev("J.find(j=>j.id==='r1').pay.reqs=[]");ev("render()");rows=$('#cs').value.split(/\r?\n/);ok(rows[1].split(',')[5]===dmy(ev("addDays('"+prev+"-10',14)")),'without a payment request it is the invoice date plus the building’s terms (14 days)');
 click('[data-a=explay][data-v=imp2]');rows=$('#cs').value.split(/\r?\n/);ok(rows[0]==='Date,Supplier,Invoice number,Description,Account,Amount ex GST,Tax code,GST,Total,Due date,Reference,Building'&&/,GST,72\.73,800\.00,/.test(rows[1])&&/4-1000/.test(rows[1]),'the second layout has a tax code and the GST');
 click('[data-a=explay][data-v=general]');rows=$('#cs').value.split(/\r?\n/);ok(rows[0]==='Supplier,Invoice number,Invoice date,Due date,Description,Reference,Amount ex GST,GST,Total,Building,Account','the General layout keeps the earlier columns');
 click('[data-a=expset][data-v=ledger]');ok(/^Completed date,Building,Job/.test($('#cs').value.split(/\r?\n/)[0])&&!$('[data-a=explay]'),'the job ledger export is unchanged');
 ok(/Column names are from memory/.test(txt().replace(/\s+/g,' '))||(click('[data-a=expset][data-v=bills]'),/Column names are from memory/.test(txt())),'it says the column names should be checked against the software’s own template');
 console.log(I.errs.length?'ERRORS '+I.errs.join('|'):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)})();
