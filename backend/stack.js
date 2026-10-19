// Boots the whole @mops stack as separate processes: CRM, mail (SMTP), engine, warehouse, and the app/hub on :8787.
const{spawn}=require('child_process'),path=require('path');
async function up(url,ms=30000){const t=Date.now();while(Date.now()-t<ms){try{const r=await fetch(url);if(r.ok)return true}catch{}await new Promise(r=>setTimeout(r,200))}throw new Error('timeout waiting for '+url)}
async function start(env={},{quiet=false}={}){const E={...process.env,MOPS_AUTOPILOT:'0',MOPS_PARENT:String(process.pid),...env};E.PORT=E.MOPS_PORT||E.PORT||'8787';const kids=[];const root=path.join(__dirname,'..');
  const go=(f,cwd=__dirname)=>{const k=spawn(process.execPath,[f],{cwd,env:E,stdio:quiet?'ignore':['ignore','inherit','inherit']});kids.push(k);return k};
  const P=n=>E[n];const port=(k,d)=>+(P(k)||d);
  go(path.join(root,'server.js'),root);await up(`http://127.0.0.1:${port('MOPS_PORT',8787)}/api/engine/log`);
  go('crm.js');go('mail.js');await Promise.all([up(`http://127.0.0.1:${port('CRM_PORT',8802)}/health`),up(`http://127.0.0.1:${port('MAIL_PORT',8803)}/health`)]);
  go('engine.js');go('warehouse.js');await Promise.all([up(`http://127.0.0.1:${port('ENGINE_PORT',8801)}/health`),up(`http://127.0.0.1:${port('WH_PORT',8804)}/health`)]);
  const stop=()=>kids.forEach(k=>{try{k.kill()}catch{}});return{kids,stop}}
module.exports={start,up};
