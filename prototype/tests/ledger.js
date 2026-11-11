const {JSDOM}=require('jsdom');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.APP||path.join(__dirname,'..','taskspeck-managers.html'),'utf8');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{try{
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/?demo=1'});await sleep(300);const w=dom.window,ev=c=>w.eval(c),txt=()=>w.document.querySelector('#view').textContent;
 ev("S.prof.role='OC manager';S.prof.pay='bank';S.prof.consent=true;S.prof.abn='12 345 678 319';S.prof.billing='a@b.co';S.prof.oc='OC (sample)'");
 const month=id=>ev("J.find(j=>j.id==='"+id+"').quote.date.slice(0,7)");
 const rows=id=>{ev("S.stack=[];S.tab.manager='jobs';render();A.reports();S.rep.type='committee';S.rep.bid='b1';S.rep.ym='"+month(id)+"';render()");const r=JSON.parse(ev("JSON.stringify(ledgerRows(repD(S.rep)))")),h=r[0];return{h,rows:r.slice(1).map(x=>Object.fromEntries(h.map((k,i)=>[k,x[i]])))}};
 // ===== the painting job with a $120 difference =====
 const j=JSON.parse(ev("JSON.stringify((j=>({id:j.id,price:j.price,inv:j.inv.amount,settled:j.settled,paid:paidSum(j),closed:j.closed}))(J.find(j=>j.id==='h7')))"));
 ok(j.price===1380&&j.inv===1500&&j.settled&&j.settled.over===120&&j.closed===true,'the painting job was invoiced $1,500 against the approved $1,380, and was settled at the approved amount (the $120 extra not paid)');
 ok(j.paid===1380,'only the approved $1,380 was paid, not the invoice total');
 let L=rows('h7');const r7=L.rows.find(r=>/Touch up paint/.test(r.Job));
 ok(r7&&r7['Invoice total (inc GST)']==='1500.00'&&r7['Agreed price']==='1380.00'&&r7['Invoice matches']==='No'&&r7['Invoice variance']==='120.00'&&r7['Invoice review']==='Settled at the approved amount'&&r7['Amount paid']==='1380.00'&&r7.Status==='Closed'&&r7['Payment status']==='Paid','the spreadsheet row now explains the difference: settled at the approved amount, and the amount paid is $1,380');
 ok(JSON.parse(ev("JSON.stringify(J.find(j=>j.id==='h7').log.map(l=>l.x))")).some(x=>/settled at the approved amount. The extra \$120 was not paid/.test(x)),'the job’s history says the extra was not paid');
 // a job with no difference is unchanged
 const r11=L.rows.find(r=>/Clean the bin room/.test(r.Job))||rows('h11').rows.find(r=>/Clean the bin room/.test(r.Job));ok(r11&&r11['Invoice matches']==='Yes'&&r11['Invoice variance']==='0.00'&&r11['Invoice review']===''&&r11['Amount paid']===r11['Agreed price'],'a job whose invoice matches is unchanged, with nothing in the review column');
 // ===== the report agrees with the spreadsheet =====
 const smonth=ev("J.find(j=>j.id==='h7').settled.on.slice(0,7)");ev("S.stack=[];S.tab.manager='jobs';render();A.reports();S.rep.type='committee';S.rep.bid='b1';S.rep.ym='"+smonth+"';render()");
 const t=txt();ok(!/No invoice variances in this period/.test(t.slice(t.indexOf('Invoice variances')))&&/Touch up paint in the level 3 corridor/.test(t.slice(t.indexOf('Invoice variances')))&&/settled at the approved amount, the extra was not paid/.test(t),'the monthly report lists that job under Invoice variances in the month it was settled, matching the spreadsheet');
 // ===== a difference with no recorded decision is never hidden =====
 ev("J.find(j=>j.id==='h4').inv.amount+=50");
 L=rows('h4');const r4=L.rows.find(r=>/abandoned furniture/.test(r.Job));
 ok(r4&&r4['Invoice matches']==='No'&&r4['Invoice variance']==='50.00'&&r4['Invoice review']==='Difference, no decision recorded','if an invoice differs and nobody decided, the spreadsheet says so');
 ev("S.stack=[];S.tab.manager='jobs';render();A.reports();S.rep.type='committee';S.rep.bid='b1';S.rep.ym='"+month('h4')+"';render()");const t2=txt();const vs=t2.slice(t2.indexOf('Invoice variances'));
 ok(/Remove abandoned furniture/.test(vs)&&/no decision recorded/.test(vs)&&/\+\$50/.test(vs),'and the report lists it as no decision recorded, with the amount');
 // settled jobs are not counted as unexplained
 ok(!/Touch up paint[^]*no decision recorded/.test(vs.slice(vs.indexOf('Touch up paint'),vs.indexOf('Touch up paint')+160)),'a settled job is not reported as undecided');
 // the other sample jobs all match
 const all=JSON.parse(ev("JSON.stringify(J.filter(j=>j.mine&&j.stage==='released'&&j.inv).map(j=>[j.id,j.inv.amount,j.price,!!j.settled,paidSum(j)]))"));
 ok(all.every(([id,inv,price,set,paid])=>id==='h4'||id==='h7'||(inv===price&&paid===inv)),'every other finished sample job was invoiced and paid exactly the approved amount');
 ok(all.every(([id,inv,price,set,paid])=>paid<=price||id==='h4'),'no finished sample job was paid more than its approved amount');
 console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)})();
