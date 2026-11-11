const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync((process.env.APP||require('path').join(__dirname,'..','taskspeck-managers.html')),'utf8');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message))}});
const w=dom.window,d=w.document;let fail=0;
const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const $=s=>d.querySelector(s),$$=s=>[...d.querySelectorAll(s)],ev=c=>w.eval(c),txt=()=>$('#view').textContent;
const click=s=>{const e=typeof s==='string'?$(s):s;if(!e)throw new Error('missing '+s);e.click()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{try{
 await sleep(300);
 ev("S.prof.role='Building manager';S.prof.pay='bank';S.prof.consent=true;render()");
 ev("bld('b1').budget=60000;bld('b2').budget=48000;bld('b3').budget=36000;bld('b1').tiers=[{limit:1000,quotes:1},{limit:4999,quotes:2},{limit:30000,quotes:3}];bld('b3').tiers=[{limit:500,quotes:1},{limit:2500,quotes:2},{limit:15000,quotes:3}]");
 click('[data-a=tab][data-v=jobs]');click('[data-a=reports]');click('[data-a=reptype][data-v=standard]');
 // ---- quarterly (standard reports) ----
 click('[data-a=repkind][data-v=quarterly]');const qr=JSON.parse(ev("JSON.stringify(repRange('quarterly',0))"));
 ok(['07','10','01','04'].includes(qr.start.slice(5,7))&&qr.start.endsWith('-01')&&ev("daysBetween('"+qr.start+"','"+qr.end+"')")>=89,'quarterly range is a financial-year quarter ('+qr.start+' to '+qr.end+')');
 // ---- monthly committee report, submitted at month end ----
 click('[data-a=reptype][data-v=committee]');
 const rv=l=>{const r=$$('.paper .kv').find(x=>x.querySelector('span')&&x.querySelector('span').textContent===l);return r.querySelector('b').textContent};
 ok(/Monthly Maintenance Report/.test(txt())&&!$('[data-a=repkind]')&&!$$('select[data-m="rep.bid"] option').some(o=>o.value==='all'),'the committee report is monthly only and for one building at a time');
 const ym0=ev('S.rep.ym');ok(ym0===ev("addYm(todayIso().slice(0,7),-1)")&&$('.noprint b.grow').textContent===ev("monthLabel('"+ym0+"')"),'it opens on the last full month ('+ym0+')');
 ok(/Budgets and approvals/.test(txt())&&/Spend against the annual budget/.test(txt())&&/Approved by the committee/.test(txt())&&/Appendix: job documents/.test(txt()),'it has budget, approvals and the attached job documents');
 const bg=JSON.parse(ev("(()=>{const g=budgetData(S.rep.bid,monthRange(S.rep.ym));return JSON.stringify({b:g.budget,s:g.spent,r:g.remaining,p:g.pct})})()"));
 ok(bg.b===60000&&rv('Annual maintenance budget')==='$60,000'&&rv('Approved this financial year to date')===ev('money('+bg.s+')')&&rv('Budget used')===bg.p+'%','budget figures match for the first building');
 ok($('input[data-m="rep.docs"]').checked&&$('input[data-m="rep.docs"]').disabled,'documents are always attached in the committee report');
 ok(/Submitted/.test($('.noprint.card').textContent)&&$('[data-a=subview]')&&/Monthly Maintenance Reports are submitted at the end of each month|Submitted .* by/.test($('.noprint.card').textContent),'last month’s report shows as submitted');
 click('.noprint.card [data-a=subview]');ok(/Submitted/.test($('#view .notice').textContent)&&/regenerated from the records/.test(txt())&&/Monthly Maintenance Report/.test($('.paper').textContent)&&$('[data-a=pdf]'),'the submitted copy opens with its details');click('[data-a=back]');
 click('[data-a=repnav][data-v="1"]');ok(ev('S.rep.ym')===ev("todayIso().slice(0,7)")&&/Month in progress/.test($('.noprint.card').textContent)&&$('[data-a=cmsubmit]').disabled&&/last day of the month/.test($('.noprint.card').textContent),'the current month cannot be submitted yet');
 ev("A.cmsubmit()");ok(/last day of the month/.test($('#toast').textContent),'submitting early is refused');
 ok($('[data-a=repnav][data-v="1"]').disabled,'cannot go past the current month');
 click('[data-a=repnav][data-v="-1"]');
 // submit at month end
 const tv=l=>$$('.paper .rtile').find(t=>t.textContent.includes(l)).querySelector('b').textContent;
 const spendBefore=tv('Approved spend');
 ev("S.subs=S.subs.filter(s=>!(s.bid==='b1'&&s.ym==='"+ym0+"'));render()");
 ok(/Due/.test($('.noprint.card .pill').textContent)&&!$('[data-a=cmsubmit]').disabled&&/chair\.southbank@example\.com/.test($('.noprint.card').textContent),'a finished month shows Due and lists who it goes to');
 click('[data-a=cmsubmit]');ok(/Submitted to 2 committee members/.test($('#toast').textContent)&&/Submitted/.test($('.noprint.card .pill').textContent)&&ev("subOf('b1','"+ym0+"').html.length")>500,'submitting records who it went to and keeps a copy');
 ev("J.filter(j=>j.mine&&j.bid==='b1'&&j.stage==='released'&&j.quote&&j.quote.date.startsWith('"+ym0+"'))[0].price+=1000;render()");
 click('.noprint.card [data-a=subview]');ok($('.paper').textContent.includes(spendBefore),'the submitted copy is frozen and does not change with later edits');click('[data-a=back]');
 ok($('[data-a=cmsubmit]')===null,'a submitted month cannot be submitted again');
 // no committee emails
 ev("S.subs=S.subs.filter(s=>!(s.bid==='b1'&&s.ym==='"+ym0+"'));bld('b1').committee='';render()");ok($('[data-a=cmsubmit]').disabled&&/no committee emails yet/.test($('.noprint.card').textContent),'without committee emails the report cannot be submitted');
 ev("bld('b1').committee='chair.southbank@example.com, treasurer.southbank@example.com'");
 // approvals above the limit
 ev("S.rep.bid='b3';S.rep.ym=J.find(j=>j.id==='h15').quote.date.slice(0,7);render()");ok(/Replace hot water unit in the plant room/.test($('.paper').textContent)&&/Approved by the committee/.test($('.paper').textContent)&&rv('Annual maintenance budget')==='$36,000','committee approvals list the job above the building’s limit');
 // Home reminder
 ev("S.subs=S.subs.filter(s=>!(s.bid==='b2'&&s.ym==='"+ym0+"'));if(!subOf('b1','"+ym0+"'))S.subs.push({id:'x',bid:'b1',ym:'"+ym0+"',on:todayIso(),to:['a@example.com'],by:'x'});S.stack=[];S.tab.manager='mhome';render()");
 ok(/1 Monthly Maintenance Report is due/.test(txt()),'Home shows a reminder when a committee report is due');
 click('[data-a=cmdue]');ok(ev('S.rep.bid')==='b2'&&ev('S.rep.ym')===ym0&&ev('S.rep.type')==='committee','the reminder opens that building’s report for that month');
 click('[data-a=cmmode][data-v=auto]');ok(/automatically/.test($('#toast').textContent)&&ev('S.cmte.mode')==='auto','month-end automatic submission can be switched on (demo)');
 ev("S.stack=[];S.tab.manager='mhome';render()");ok(!/Monthly Maintenance Report/.test(txt()),'the Home reminder is hidden when automatic submission is on');
 ev("S.cmte.mode='remind'");
 // committee emails editable
 ev("S.stack=[];S.tab.manager='bld';render()");const ce=$('[data-cm=b1]');ce.value='a@example.com, b@example.com, c@example.com';ce.dispatchEvent(new w.Event('input',{bubbles:true}));ok(ev("emailsOf(bld('b1')).length")===3,'committee emails can be edited per building');
 ev("S.stack=[];S.tab.manager='jobs';render();go('reports')");
 // standard report with attached documents
 click('[data-a=reptype][data-v=standard]');click('[data-a=repkind][data-v=quarterly]');ok(!/Appendix: job documents/.test(txt())&&!$('input[data-m="rep.docs"]').disabled&&$$('select[data-m="rep.bid"] option').some(o=>o.value==='all'),'standard report has no appendix by default and offers All buildings');
 click('[data-a=repnav][data-v="1"]');const dc=$('input[data-m="rep.docs"]');dc.checked=true;dc.dispatchEvent(new w.Event('change',{bubbles:true}));
 ok(/Appendix: job documents/.test(txt())&&/Quote QT-/.test($('.appendix').textContent)&&/Work order WO-/.test($('.appendix').textContent)&&/Invoice number/.test($('.appendix').textContent),'ticking attach adds each job’s quote, work order and invoice');
 // ---- spreadsheet export ----
 ev("S.rep.bid='all';S.rep.kind='monthly';S.rep.p=-1;render()");click('[data-a=repexport]');
 const done=ev("repData('monthly',-1,'all').done.length"),withInv=ev("repData('monthly',-1,'all').done.filter(j=>j.inv).length");
 const lines1=$('#cs').value.split(/\r?\n/);ok(/^Completed date,Building,Job/.test(lines1[0])&&lines1.length===done+1,'job ledger CSV has a header and one row per completed job ('+done+')');
 click('[data-a=expset][data-v=bills]');click('[data-a=explay][data-v=general]');const lines2=$('#cs').value.split(/\r?\n/);ok(/^Supplier,Invoice number,Invoice date,Due date/.test(lines2[0])&&lines2.length===withInv+1,'bills CSV has one row per invoice received ('+withInv+')');
 ok(ev("csv([['a,b','c\"d','e']])")==='"a,b","c""d",e','CSV quotes commas and quotes properly');
 ok(lines2.slice(1).every(r=>r.split(',').length>=11),'every bills row has all columns');
 click('[data-a=csvdl]');ok(/Download|blocked|CSV created/.test($('#toast').textContent),'Download CSV reports its result without error');
 click('[data-a=csvcopy]');await sleep(50);ok(/Select and copy|copied/.test($('#toast').textContent),'Copy CSV has a fallback');
 // ---- PDF ----
 const pdf=JSON.parse(ev("(()=>{const L=[];for(let i=0;i<120;i++)L.push({t:'Line '+i+' with (brackets) and a backslash \\\\ and ’quotes’ · dot'});const r=buildPdf(L);return JSON.stringify({t:r.text,n:r.pages})})()"));
 ok(pdf.t.startsWith('%PDF-1.4')&&pdf.t.trim().endsWith('%%EOF')&&pdf.n>=2&&/xref/.test(pdf.t),'buildPdf makes a valid PDF structure with several pages ('+pdf.n+')');
 const xrefPos=+pdf.t.match(/startxref\n(\d+)/)[1];ok(pdf.t.slice(xrefPos,xrefPos+4)==='xref','startxref points at the xref table');
 const offs=[...pdf.t.slice(xrefPos).matchAll(/(\d{10}) 00000 n/g)].map(m=>+m[1]);ok(offs.length>=6&&offs.every((o,i)=>pdf.t.slice(o).startsWith((i+1)+' 0 obj')),'every xref offset points at its object');
 ok(!/[^\x00-\x7F]/.test(pdf.t)&&/\\\(brackets\\\)/.test(pdf.t),'PDF text is plain ASCII with brackets escaped');
 ev("S.stack=[];S.rep.p=-1;go('reports')");const pl=ev("JSON.stringify(paperLines(document.querySelector('.paper')).map(l=>l.t))");ok(/Monthly summary/.test(pl)&&/Approved spend/.test(pl)&&/Work orders and invoices/.test(pl),'the report page converts to PDF lines');
 click('[data-a=pdf]');ok(/PDF created|blocked/.test($('#toast').textContent),'Download PDF runs on the report');
 ev("go('wo',{id:'m2'})");click('[data-a=pdf]');ok(/PDF created|blocked/.test($('#toast').textContent),'Download PDF runs on a work order');
 ev("S.stack=[];render()");
 // ---- TaskSpeck Strata fee invoice goes to the contractor only ----
 ev("S.stack=[];S.role='manager';render();go('mjob',{id:'h2'})");ok(!/TaskSpeck Strata fee invoice/.test(txt()),'the manager never sees the TaskSpeck Strata fee invoice');
 ev("S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'h2'})");ok(/TaskSpeck Strata fee invoice/.test(txt())&&/TS-\d+/.test(txt()),'the contractor’s job lists the TaskSpeck Strata fee invoice');
 click('[data-a=tsinv]');ok(/Invoice TS-/.test($('.paper').textContent)&&/not registered for GST/.test($('.paper').textContent)&&/Bright Spark Electrical/.test($('.paper').textContent)&&/\$172\.50/.test($('.paper').textContent)&&/\$977\.50/.test($('.paper').textContent)&&/Final payment/.test($('.paper').textContent)&&/does not receive this invoice/.test($('.paper').textContent),'fee invoice: $172.50 fee on a $1,150 payment, contractor receives $977.50, no GST, manager gets none');
 ev("S.set.gstOnFee=true;render()");ok(/Tax invoice TS-/.test($('.paper').textContent)&&/GST on the fee/.test($('.paper').textContent)&&/\$17\.25/.test($('.paper').textContent)&&/\$189\.75/.test($('.paper').textContent)&&/\$960\.25/.test($('.paper').textContent),'with GST on, it becomes a tax invoice with GST on the fee ($17.25, total $189.75, contractor receives $960.25)');
 ev("S.set.gstOnFee=false");
 // ---- real invoice file ----
 ev("S.stack=[];S.tab.contractor='cactive';render();go('cwork',{id:'h1'})");
 ok(/Upload your final invoice/.test(txt()),'h1 has no invoice yet');
 const fin=$('#in4');const f=new w.File(['PNGDATA'],'inv.png',{type:'image/png'});Object.defineProperty(fin,'files',{value:[f]});fin.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(200);
 ok(ev("S.invd.file&&S.invd.file.data&&S.invd.file.data.startsWith('data:image/png')")&&/inv\.png/.test(txt())&&$('img[alt="Preview of the chosen invoice"]'),'the chosen image is really read and previewed');
 const fin2=$('#in4');const big=new w.File([new Uint8Array(3*1024*1024+10)],'big.pdf',{type:'application/pdf'});Object.defineProperty(fin2,'files',{value:[big]});fin2.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(100);ok(/over 3 MB/.test($('#toast').textContent),'files over 3 MB are refused');
 const in1=$('#in1');in1.value='INV-900';in1.dispatchEvent(new w.Event('input',{bubbles:true}));const in3=$('#in3');in3.value='290';in3.dispatchEvent(new w.Event('input',{bubbles:true}));click('[data-a=invsend]');
 ok(/matches the work order/.test($('#toast').textContent)&&ev("J.find(j=>j.id==='h1').inv.file.data.startsWith('data:image/png')"),'the invoice is saved with the real file contents');
 ev("S.stack=[];S.role='manager';render();go('inv',{id:'h1'})");ok($('img[alt="Uploaded invoice file"]')&&/kept while this page is open/.test(txt()),'the manager sees the actual uploaded image on the invoice');
 const pf=new w.File(['%PDF-1.4'],'real.pdf',{type:'application/pdf'});
 ev("J.find(j=>j.id==='h10').inv=null;S.stack=[];S.role='contractor';S.tab.contractor='cactive';render();go('cwork',{id:'h10'})");const fin3=$('#in4');Object.defineProperty(fin3,'files',{value:[pf]});fin3.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(200);
 const i1=$('#in1');i1.value='INV-901';i1.dispatchEvent(new w.Event('input',{bubbles:true}));const i3=$('#in3');i3.value='2150';i3.dispatchEvent(new w.Event('input',{bubbles:true}));click('[data-a=invsend]');
 ev("S.stack=[];S.role='manager';render();go('inv',{id:'h10'})");ok($('a[download="real.pdf"]')&&/Open the uploaded PDF/.test(txt()),'an uploaded PDF can be opened from the invoice');
 // ---- budget and owner fields ----
 ev("S.stack=[];S.tab.manager='bld';render()");const bu=$('[data-bud="b1|0"]');bu.value='72000';bu.dispatchEvent(new w.Event('change',{bubbles:true}));ok(ev("bld('b1').budget")===72000&&ev("bld('b1').annualT[0]")===72000&&/Annual budget saved/.test($('#toast').textContent),'the annual budget can be edited per building');
 ev("S.stack=[];S.tab.manager='mprof';render();go('owner')");const on=$('[data-settext=name]');on.value='TaskSpeck Strata Pty Ltd';on.dispatchEvent(new w.Event('input',{bubbles:true}));ok(ev('S.set.name')==='TaskSpeck Strata Pty Ltd'&&/never to the manager/.test(txt()),'owner can set the name and ABN on fee invoices');
 console.log(errs.length?'ERRORS '+errs.join('|'):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,4).join('\n'))}process.exit(0)})();
