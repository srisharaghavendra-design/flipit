// npm run demo → boots every service, seeds fictional data, loads the warehouse, prints where to look.
const{start}=require('./stack');const B='http://127.0.0.1:'+(process.env.MOPS_PORT||8787);
(async()=>{process.env.MOPS_PORT=process.env.MOPS_PORT||'8787';const s=await start();process.on('SIGINT',()=>{s.stop();process.exit()});process.on('SIGTERM',()=>{s.stop();process.exit()});
  const login=await fetch(B+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({user:'admin'})});if(!login.ok)throw new Error('admin sign-in failed before reset');const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
  const r=await(await fetch(B+'/api/engine/reset',{method:'POST',headers:{cookie}})).json();if(r.error)throw new Error(r.error);
  console.log(`\n  @mops stack is up (fictional data: Northwind Networks)\n  seeded → CRM bulk-loaded ${r.crmLoaded} records\n\n  Engine room   ${B.replace('127.0.0.1','localhost')}/engine\n  App (v4 UI)   ${B.replace('127.0.0.1','localhost')}/\n  API docs      /svc/engine/docs · /svc/crm/docs · /svc/mail/docs · /svc/warehouse/docs\n  Ctrl-C stops everything.\n`);
  if(process.argv.includes('--run')){const x=await(await fetch(B+'/api/engine/run',{method:'POST',headers:{'content-type':'application/json'},body:'{"wait":true}'})).json();console.log('run',x.ok?'OK':'FAILED',(x.wallMs/1000).toFixed(1)+'s',x.error||'');}
})().catch(e=>{console.error(e);process.exit(1)});
