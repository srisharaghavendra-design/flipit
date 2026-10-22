// Boots the whole @mops stack as one process. The app and the five services share it.
const{spawn}=require('child_process'),path=require('path');
async function up(url,ms=60000){const t=Date.now();while(Date.now()-t<ms){try{const r=await fetch(url);if(r.ok)return true}catch{}await new Promise(r=>setTimeout(r,200))}throw new Error('timeout waiting for '+url)}
async function start(env={}, {quiet=false}={}){const E={...process.env,MOPS_AUTOPILOT:'0',...env};E.PORT=E.MOPS_PORT||E.PORT||'8787';E.MOPS_PORT=E.PORT;const root=path.join(__dirname,'..');
  const k=spawn(process.execPath,[path.join(root,'server.js')],{cwd:root,env:E,stdio:quiet?'ignore':['ignore','inherit','inherit']});
  const port=(key,d)=>+(E[key]||d);
  await up(`http://127.0.0.1:${port('MOPS_PORT',8787)}/health`);
  await Promise.all(['ENGINE_PORT','CRM_PORT','MAIL_PORT','WH_PORT'].map((key,i)=>up(`http://127.0.0.1:${port(key,[8801,8802,8803,8804][i])}/health`)));
  const stop=()=>{try{k.kill()}catch{}};return{kids:[k],stop}}
module.exports={start,up};
