// Event-driven core: an append-only event log (SQLite, offsets) + consumer groups with committed offsets.
// Every service publishes to it (via the hub); workers subscribe and react. Also: the single tag entry point (agent) used by
// every surface (in-app, email to mops@, Webex-style webhook), the self-healing autopilot, and the efficiency report.
const path=require('path'),Database=require('better-sqlite3');
const{DATA,PORTS,URLS,call}=require('./lib');
const db=new Database(path.join(DATA,'bus.db'));db.pragma('journal_mode=WAL');db.pragma('synchronous=NORMAL');
db.exec(`CREATE TABLE IF NOT EXISTS log(offset INTEGER PRIMARY KEY AUTOINCREMENT,topic TEXT,svc TEXT,kind TEXT,msg TEXT,data TEXT,trace TEXT,at TEXT);
CREATE TABLE IF NOT EXISTS consumers(name TEXT PRIMARY KEY,offset INTEGER,processed INTEGER DEFAULT 0,errors INTEGER DEFAULT 0,updated TEXT);
CREATE TABLE IF NOT EXISTS dead_letters(id INTEGER PRIMARY KEY,consumer TEXT,offset INTEGER,error TEXT,at TEXT);
CREATE TABLE IF NOT EXISTS conversations(id INTEGER PRIMARY KEY,surface TEXT,sender TEXT,text TEXT,reply TEXT,action TEXT,ms INTEGER,at TEXT);
CREATE TABLE IF NOT EXISTS covered(id TEXT PRIMARY KEY,rule TEXT,title TEXT,risk TEXT,status TEXT,before TEXT,after TEXT,actions TEXT,undo TEXT,key TEXT UNIQUE,at TEXT,undone_at TEXT);`);
const ins=db.prepare('INSERT INTO log(topic,svc,kind,msg,data,trace,at) VALUES(?,?,?,?,?,?,?)');
const append=ev=>Number(ins.run(`${ev.svc}.${ev.kind}`,ev.svc,ev.kind,ev.msg,JSON.stringify(ev.data||{}),ev.trace||null,ev.at||new Date().toISOString()).lastInsertRowid);
const workers=[];
// subscribe(name, topicRegex, handler): at-least-once delivery from the last committed offset; failures retried 3x then dead-lettered.
function subscribe(name,topic,handler,{batch=200}={}){db.prepare('INSERT OR IGNORE INTO consumers(name,offset,updated) VALUES(?,(SELECT COALESCE(MAX(offset),0) FROM log),?)').run(name,new Date().toISOString());const w={name,topic,handler,busy:false,tries:{}};workers.push(w);
  w.tick=async()=>{if(w.busy)return;w.busy=true;try{const c=db.prepare('SELECT offset FROM consumers WHERE name=?').get(name);const rows=db.prepare('SELECT * FROM log WHERE offset>? ORDER BY offset LIMIT ?').all(c.offset,batch);
    for(const r of rows){if(topic.test(r.topic)){try{await handler({...r,data:JSON.parse(r.data)});db.prepare('UPDATE consumers SET processed=processed+1 WHERE name=?').run(name)}catch(e){w.tries[r.offset]=(w.tries[r.offset]||0)+1;db.prepare('UPDATE consumers SET errors=errors+1 WHERE name=?').run(name);
        if(w.tries[r.offset]<3)break;db.prepare('INSERT INTO dead_letters(consumer,offset,error,at) VALUES(?,?,?,?)').run(name,r.offset,e.message,new Date().toISOString())}}
      db.prepare('UPDATE consumers SET offset=?,updated=? WHERE name=?').run(r.offset,new Date().toISOString(),name)}}finally{w.busy=false}};return w}
const pump=setInterval(()=>workers.forEach(w=>w.tick()),250);if(pump.unref)pump.unref();
async function drain(ms=8000){const t0=Date.now();while(Date.now()-t0<ms){for(const w of workers)await w.tick();
  const max=db.prepare('SELECT COALESCE(MAX(offset),0) m FROM log').get().m;
  const lag=workers.some(w=>db.prepare('SELECT offset o FROM consumers WHERE name=?').get(w.name).o<max);if(!lag)return true;await new Promise(r=>setTimeout(r,30))}return false}
function stats(){const max=db.prepare('SELECT COALESCE(MAX(offset),0) m FROM log').get().m;return{events:max,topics:db.prepare('SELECT topic,count(*) n FROM log GROUP BY topic ORDER BY n DESC LIMIT 30').all(),
  consumers:db.prepare('SELECT * FROM consumers').all().map(c=>({...c,lag:max-c.offset})),deadLetters:db.prepare('SELECT count(*) n FROM dead_letters').get().n,ratePerSec:db.prepare("SELECT count(*) n FROM log WHERE at>?").get(new Date(Date.now()-10000).toISOString()).n/10}}
function reset(){db.exec('DELETE FROM log;DELETE FROM consumers;DELETE FROM dead_letters;DELETE FROM conversations;DELETE FROM covered');workers.forEach(w=>db.prepare('INSERT OR IGNORE INTO consumers(name,offset,updated) VALUES(?,0,?)').run(w.name,new Date().toISOString()))}
module.exports={db,append,subscribe,stats,reset,drain};
