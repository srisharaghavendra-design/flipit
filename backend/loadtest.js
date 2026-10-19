// Scale test: fictional contacts → segmentation → consent checks → in-process sends to the catcher.
// On Vercel Hobby the caller asks for a few thousand rows so it fits the 2 GB / 300s limit. The numbers below are measured, not assumed.
const path=require('path'),fs=require('fs'),os=require('os'),Database=require('better-sqlite3');const{DATA}=require('./lib');
const pct=(a,p)=>{const s=Float64Array.from(a).sort();if(!s.length)return 0;const v=s[Math.min(s.length-1,Math.floor(s.length*p))];return v<0.01?+v.toFixed(4):+v.toFixed(3)};
async function run(opts={},onEvent=()=>{}){const N=+opts.contacts||+process.env.LOAD_CONTACTS||2000,SENDS=+opts.sends||+process.env.LOAD_SENDS||200;
  const out=o=>{try{onEvent(o)}catch{}};
  const f=path.join(DATA,'load.db');for(const x of[f,f+'-wal',f+'-shm'])try{fs.unlinkSync(x)}catch{}
  const db=new Database(f);db.pragma('journal_mode=WAL');db.pragma('synchronous=OFF');db.pragma('cache_size=-64000');
  db.exec(`CREATE TABLE contacts(id INTEGER PRIMARY KEY,email TEXT,title TEXT,region TEXT,segment TEXT,industry TEXT,score INT);CREATE TABLE consent(contact_id INTEGER PRIMARY KEY,status TEXT);`);
  const T=['CIO','CTO','CISO','IT Director','VP Infrastructure','Network Manager','Procurement Manager','Head of Security'],R=['India','Japan','ANZ','ASEAN','EMEA','US'],SG=['Enterprise','Commercial'],IN=['Finance','Energy','Retail','Healthcare','Public','Manufacturing'],CS=['opted_in','opted_in','unknown','opted_out','opted_in'];
  const result={contacts:N,sends:SENDS,label:process.env.VERCEL?'Vercel Hobby sized run (2 GB / 300s)':'local run',phases:{}};
  let t0=Date.now();const ic=db.prepare('INSERT INTO contacts VALUES(?,?,?,?,?,?,?)'),is=db.prepare('INSERT INTO consent VALUES(?,?)');const B=Math.min(5000,Math.max(500,N));const batchMs=[];
  for(let b=0;b<N;b+=B){const tb=Date.now();db.transaction(()=>{for(let i=b;i<Math.min(N,b+B);i++){ic.run(i,`user${i}@load.example`,T[i%8],R[(i>>3)%6],SG[(i>>5)%2],IN[(i>>6)%6],(i*7919)%100);is.run(i,CS[(i*31)%5])}})();batchMs.push(Date.now()-tb);
    const s=Math.max((Date.now()-t0)/1000,0.001);out({phase:'seed',done:Math.min(N,b+B),total:N,rate:Math.round(Math.min(N,b+B)/s),msg:`seeded ${Math.min(N,b+B).toLocaleString()} / ${N.toLocaleString()} contacts`})}
  db.exec('CREATE INDEX ix_t ON contacts(title,region,segment)');const seedS=Math.max((Date.now()-t0)/1000,0.001);result.phases.seed={records:N*2,seconds:+seedS.toFixed(2),recordsPerSec:Math.round(N/seedS),p95BatchMs:pct(batchMs,.95),note:'contact + consent row per record, transactions, plus index build'};out({phase:'seed',final_phase:result.phases.seed,msg:`seed done: ${Math.round(N/seedS).toLocaleString()} contacts/s`});
  const lat=[];t0=Date.now();for(let k=0;k<50;k++){const ts=[T[k%8],T[(k+3)%8]],rs=[R[k%6],R[(k+2)%6],R[(k+4)%6]];const q=process.hrtime.bigint();db.prepare(`SELECT count(*) n FROM contacts c JOIN consent s ON s.contact_id=c.id WHERE c.title IN (?,?) AND c.region IN (?,?,?) AND c.segment=? AND c.score>=?`).get(...ts,...rs,SG[k%2],k%40);lat.push(Number(process.hrtime.bigint()-q)/1e6)}
  const big=process.hrtime.bigint();const ids=db.prepare(`SELECT c.id,c.email,c.region,s.status FROM contacts c JOIN consent s ON s.contact_id=c.id WHERE c.title IN ('CIO','CTO','CISO','IT Director','VP Infrastructure','Head of Security')`).all();const bigMs=Number(process.hrtime.bigint()-big)/1e6;
  const segS=Math.max((Date.now()-t0)/1000,0.001);result.phases.segment={queries:50,p95Ms:pct(lat,.95),p50Ms:pct(lat,.5),contactsScannedPerSec:Math.round(N*50/segS),largestSegment:ids.length,largestSegmentMs:+bigMs.toFixed(3)};out({phase:'segment',...result.phases.segment,msg:`50 segment queries over ${N.toLocaleString()}: p95 ${result.phases.segment.p95Ms}ms; largest segment ${ids.length.toLocaleString()} rows in ${bigMs.toFixed(1)}ms`});
  t0=Date.now();const clat=[];const allowed=[];for(let b=0;b<ids.length;b+=10000){const q=process.hrtime.bigint();for(let i=b;i<Math.min(ids.length,b+10000);i++){const c=ids[i];if(c.status==='opted_in'||(c.status==='unknown'&&c.region==='US'))allowed.push(c)}clat.push(Number(process.hrtime.bigint()-q)/1e6)}
  const cs=Math.max((Date.now()-t0)/1000,0.001);result.phases.consent={checked:ids.length,allowed:allowed.length,suppressed:ids.length-allowed.length,checksPerSec:Math.round(ids.length/cs),p95Per10kMs:pct(clat,.95)};out({phase:'consent',...result.phases.consent,msg:`consent-checked ${ids.length.toLocaleString()}: ${allowed.length.toLocaleString()} allowed, ${(ids.length-allowed.length).toLocaleString()} suppressed`});
  const mail=require('./mail');const before=mail.loadStats();const n=Math.min(SENDS,allowed.length);const sl=new Float64Array(n);let fail=0;t0=Date.now();
  const html=i=>`<p>Hi, invitation #${i}</p><a href="https://northwind.example/e?s=${i}">Register</a>`;
  for(let i=0;i<n;i++){const c=allowed[i];const q=process.hrtime.bigint();try{mail.deliver({from:'events@northwind.example',to:c.email,subject:'Zero Trust Roundtable invite',html:html(i),headers:{'X-Mops-Load':'1'}})}catch{fail++}sl[i]=Number(process.hrtime.bigint()-q)/1e6;
    if(i===n-1||i%5000===0){const s=Math.max((Date.now()-t0)/1000,0.001);out({phase:'send',done:i+1,total:n,rate:Math.round((i+1)/s),p95Ms:pct(sl.slice(0,i+1),.95),msg:`sent ${(i+1).toLocaleString()} / ${n.toLocaleString()}`})}}
  const ss=Math.max((Date.now()-t0)/1000,0.001);const after=mail.loadStats();
  result.phases.send={attempted:n,failed:fail,acceptedBySink:after.accepted-before.accepted,seconds:+ss.toFixed(2),messagesPerSec:Math.round(n/ss),p50Ms:pct(sl,.5),p95Ms:pct(sl,.95),p99Ms:pct(sl,.99),note:'in-process catcher counts load mail and does not store it or send it anywhere'};
  out({phase:'send',...result.phases.send,msg:`sent ${n.toLocaleString()} in ${ss.toFixed(1)}s · ${result.phases.send.messagesPerSec.toLocaleString()} msg/s · p95 ${result.phases.send.p95Ms}ms`});
  result.machine={cpus:os.cpus().length,node:process.version,vercel:process.env.VERCEL==='1',memoryMb:Math.round(os.totalmem()/1024/1024)};result.at=new Date().toISOString();
  const dir=process.env.MOPS_RUNS_DIR||path.join(__dirname,'runs');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'loadtest-latest.json'),JSON.stringify(result,null,1));
  out({final:result,msg:'load test complete'});db.close();for(const x of[f,f+'-wal',f+'-shm'])try{fs.unlinkSync(x)}catch{}
  return result}
module.exports={run};
if(require.main===module)run().then(r=>{process.stdout.write(JSON.stringify({final:r})+'\n')}).catch(e=>{process.stderr.write(e.stack+'\n');process.exit(1)});
