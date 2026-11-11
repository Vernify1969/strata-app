// Runs every test suite and prints a summary. Usage: node tests/run-all.js
// Set APP=/path/to/taskspeck-managers.html to test a different copy of the app.
const {spawnSync}=require('child_process');const path=require('path');
const suites=['auth','limits','pm2','setup','msgs','variations','mgr','nf','roles','tiers','payreq','review','gate2','bimg','acc','nbimg','hist','area','report','worlds','qr','resume','ledger','pmwizard','auditfixes','timezones','cents','a11y','features','reportplus','gaps','urgentemail','strikes','certs'];
let checks=0,failed=0;
for(const s of suites){
  const r=spawnSync(process.execPath,[path.join(__dirname,s+'.js')],{encoding:'utf8'});
  const out=(r.stdout||'')+(r.stderr||'');
  const ok=(out.match(/^ok /gm)||[]).length,bad=(out.match(/^FAIL /gm)||[]).length,ex=/EXCEPTION/.test(out);
  checks+=ok;failed+=bad+(ex?1:0);
  console.log((bad||ex?'FAIL':'pass').padEnd(5),s.padEnd(10),ok+' checks'+(bad?', '+bad+' failed':'')+(ex?', exception':''));
  if(bad||ex)console.log(out.split('\n').filter(l=>/^FAIL|EXCEPTION/.test(l)).join('\n'));
}
console.log('\n'+suites.length+' suites, '+checks+' checks passed, '+failed+' problems');
process.exit(failed?1:0);
