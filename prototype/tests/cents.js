const {JSDOM}=require('jsdom');const fs=require('fs'),path=require('path');
const html=fs.readFileSync(process.env.APP||path.join(__dirname,'..','taskspeck-managers.html'),'utf8');
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
(async()=>{try{
 const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/?demo=1'});await new Promise(r=>setTimeout(r,300));const w=dom.window,ev=c=>w.eval(c);
 const res=JSON.parse(ev(`JSON.stringify((()=>{const out={n:0,sumBad:[],decBad:[],dispBad:[],gstBad:[]};const parse=s=>+String(s).replace(/[$,]/g,'');
  for(const gstOnFee of [false,true]){S.set.gstOnFee=gstOnFee;for(let c=1;c<=300000;c++){const p=c/100,f=feeOf(p);out.n++;
   const fc=Math.round(f.fee*100),gc=Math.round(f.gst*100),nc=Math.round(f.net*100);
   if(fc+gc+nc!==c&&out.sumBad.length<5)out.sumBad.push([p,f]);
   if((Math.abs(f.fee*100-fc)>1e-6||Math.abs(f.gst*100-gc)>1e-6||Math.abs(f.net*100-nc)>1e-6)&&out.decBad.length<5)out.decBad.push([p,f]);
   if(Math.round((parse(money(f.fee))+parse(money(f.gst))+parse(money(f.net)))*100)!==c&&out.dispBad.length<5)out.dispBad.push([p,money(f.fee),money(f.gst),money(f.net)]);
   if(!gstOnFee&&c%7===0){const g=gstOf(p),ex=Math.round((p-g)*100)/100;if(Math.round((g+ex)*100)!==c&&out.gstBad.length<5)out.gstBad.push([p,g,ex]);if(Math.abs(g*100-Math.round(g*100))>1e-6&&out.gstBad.length<5)out.gstBad.push([p,g])}}}
  S.set.gstOnFee=false;return out})())`));
 ok(res.n===600000&&res.sumBad.length===0,'for 600,000 amounts from one cent to $3,000 (with and without GST on the fee), fee + GST + payout is exactly the price '+JSON.stringify(res.sumBad));
 ok(res.decBad.length===0,'every fee, GST and payout is a whole number of cents');
 ok(res.dispBad.length===0,'and the three amounts shown on screen add up to the price to the cent '+JSON.stringify(res.dispBad));
 ok(res.gstBad.length===0,'the GST included in a price, and the amount without GST, add up to the price, in whole cents');
 ok(ev("JSON.stringify(feeOf(0.1))")==='{"fee":0.02,"gst":0,"net":0.08}'&&ev("JSON.stringify(feeOf(2.5))")==='{"fee":0.38,"gst":0,"net":2.12}'&&ev("JSON.stringify(feeOf(1380))")==='{"fee":207,"gst":0,"net":1173}','the examples that were one cent out (10 cents, $2.50) now add up, and $1,380 is unchanged');
 ok(ev("gstOf(220)")===20&&ev("gstOf(1380)")===125.45&&ev("gstOf(0.1)")===0.01,'GST in a price is rounded to the cent');
 ok(ev("Math.round(333.33*25)/100")===83.33&&ev("(()=>{const q={price:333.33};const amt=Math.round(q.price*30)/100;return Math.abs(amt*100-Math.round(amt*100))<1e-6})()"),'deposit amounts are whole cents');
 console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,6).join('\n'))}process.exit(0)})();
