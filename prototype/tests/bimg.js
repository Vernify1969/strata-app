const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync((process.env.APP||require('path').join(__dirname,'..','taskspeck-managers.html')),'utf8');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/?demo=1',beforeParse(w){w.addEventListener('error',e=>errs.push(e.message))}});
const w=dom.window,d=w.document;let fail=0;
const ok=(c,m)=>{if(!c){fail++;console.log('FAIL',m)}else console.log('ok  ',m)};
const $=s=>d.querySelector(s),$$=s=>[...d.querySelectorAll(s)],ev=c=>w.eval(c),txt=()=>$('#view').textContent;
const click=s=>{const e=typeof s==='string'?$(s):s;if(!e)throw new Error('missing '+s);e.click()};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const addFile=async(sel,file)=>{const el=$(sel);Object.defineProperty(el,'files',{value:[file],configurable:true});el.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(150)};
(async()=>{try{
 await sleep(300);
 ev("S.prof.role='Building manager';S.prof.pay='bank';S.prof.consent=true;S.stack=[];S.tab.manager='bld';render()");
 ok(ev("B.every(b=>!b.imgs||!b.imgs.length)")&&$$('[data-bimg]').length===3&&/Building photos/.test(txt())&&/Add 1 or 2 photos of the building/.test(txt())&&/No photos yet/.test(txt()),'every building has a Building photos section, empty to start');
 await addFile('[data-bimg=b1]',new w.File(['AAA'],'front.png',{type:'image/png'}));
 ok(ev("bld('b1').imgs.length")===1&&$$('img[alt^="Building photo"]').length===1&&/Photo added/.test($('#toast').textContent),'a photo can be added to a building');
 await addFile('[data-bimg=b1]',new w.File(['TXT'],'a.txt',{type:'text/plain'}));ok(/Choose an image file/.test($('#toast').textContent)&&ev("bld('b1').imgs.length")===1,'a file that is not an image is refused');
 await addFile('[data-bimg=b1]',new w.File([new Uint8Array(3*1024*1024+10)],'big.jpg',{type:'image/jpeg'}));ok(/over 3 MB/.test($('#toast').textContent)&&ev("bld('b1').imgs.length")===1,'a photo over 3 MB is refused');
 await addFile('[data-bimg=b1]',new w.File(['BBB'],'lobby.jpg',{type:'image/jpeg'}));
 ok(ev("bld('b1').imgs.length")===2&&$$('[data-bimg=b1]').length===0&&$$('img[alt^="Building photo"]').length===2,'a second photo can be added, and then the Add a photo button goes');
 ok(ev("bld('b2').imgs")===undefined||ev("bld('b2').imgs.length")===0,'photos belong to their own building');
 // contractor sees them on this building's jobs
 ev("J.find(j=>j.id==='m1').bid='b1';S.stack=[];S.role='contractor';S.tab.contractor='find';render();go('cjob',{id:'m1'})");
 ok(/The building/.test(txt())&&$$('#view img[alt^="Building photo"]').length===2&&/unlock once the job is booked/.test(txt())&&!/and pays/.test(txt()),'a contractor sees the building photos on the job before quoting, and the address unlocks once booked');
 ev("J.find(j=>j.id==='m1').bid='b2';S.stack=[];render();go('cjob',{id:'m1'})");
 ok(!/The building/.test(txt())&&$$('#view img[alt^="Building photo"]').length===0,'a building with no photos shows nothing');
 ev("J.find(j=>j.id==='m1').bid='b1'");
 // remove
 ev("S.stack=[];S.role='manager';S.tab.manager='bld';render()");click('[data-a=bimgdel][data-v="b1|0"]');
 ok(ev("bld('b1').imgs.length")===1&&/Photo removed/.test($('#toast').textContent)&&$('[data-bimg=b1]'),'a photo can be removed, which brings the Add a photo button back');
 console.log(errs.length?'ERRORS '+errs.join('|'):'no script errors');console.log(fail?fail+' FAILED':'ALL PASSED');
}catch(e){console.log('EXCEPTION',e.message,'\n',e.stack.split('\n').slice(0,4).join('\n'))}process.exit(0)})();
