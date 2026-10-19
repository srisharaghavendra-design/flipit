// In-process email catcher. Messages are stored in SQLite. Nothing is handed to a network or a real inbox.
const path=require('path'),crypto=require('crypto'),Database=require('better-sqlite3');
const{DATA,now,emitter,service,openapi}=require('./lib');const emit=emitter('mail');
const db=new Database(path.join(DATA,'mail.db'));db.pragma('journal_mode=WAL');
db.exec('CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY,message_id TEXT,mail_from TEXT,rcpt TEXT,subject TEXT,html TEXT,headers TEXT,size INT,at TEXT)');
try{db.exec('ALTER TABLE messages ADD COLUMN text TEXT')}catch{}try{db.exec('ALTER TABLE messages ADD COLUMN cc TEXT')}catch{}
const MOPS_BOX=(process.env.MOPS_INBOX||'mops@mops.local').toLowerCase();let loadAccepted=0,loadBytes=0;
const KEEP=['list-unsubscribe','list-unsubscribe-post','x-mops-campaign','x-mops-send','x-mops-trace','in-reply-to','x-mops-surface'];
function addr(v){return String(v||'').replace(/^.*</,'').replace(/>.*$/,'').trim()}
function list(v){return [].concat(v||[]).flatMap(x=>String(x).split(',')).map(s=>s.trim()).filter(Boolean)}
// deliver() writes every message into mail.db. Nothing is handed to a provider.
function deliver(opts={}){const from=addr(opts.from||'events@northwind.example');const to=list(opts.to),cc=list(opts.cc);
  const envelope=[...to,...cc];const load=envelope.some(r=>r.toLowerCase().endsWith('@load.example'))||!!(opts.headers&&(opts.headers['X-Mops-Load']||opts.headers['x-mops-load']));
  const h={};for(const[k,v]of Object.entries(opts.headers||{})){const key=String(k).toLowerCase();if(KEEP.includes(key)||key==='x-mops-load')h[key]=v}
  if(opts.inReplyTo)h['in-reply-to']=opts.inReplyTo;if(opts.references&&!h.references)h.references=opts.references;
  const messageId=opts.messageId||('<'+crypto.randomBytes(8).toString('hex')+'@mops.local>');
  const html=opts.html||'',text=opts.text||'';
  const info=db.prepare('INSERT INTO messages(message_id,mail_from,rcpt,subject,html,headers,size,at,text,cc) VALUES(?,?,?,?,?,?,?,?,?,?)').run(messageId,from,envelope.join(','),opts.subject||'',html,JSON.stringify(h),(html||text).length,now(),text,cc.join(','));
  const id=Number(info.lastInsertRowid);
  if(load){loadAccepted++;loadBytes+=(html||text).length;return{messageId,id,accepted:loadAccepted,stored:true,deliveredToProvider:0}}
  const box=[...envelope.map(a=>addr(a).toLowerCase())];
  if(box.includes(MOPS_BOX))emit('inbound',`📥 email to ${MOPS_BOX} from ${from}: "${opts.subject||''}"`,{id,from},opts.headers&&(opts.headers['X-Mops-Trace']||opts.headers['x-mops-trace'])||null);
  emit('smtp',`250 accepted → ${envelope.join(',')}`,{subject:opts.subject||''},null);return{messageId,id,stored:true,deliveredToProvider:0}}
function loadStats(){return{accepted:loadAccepted,bytes:loadBytes}}
const spec=openapi('Mail sink (in-process catcher)','Captures every email the engine sends inside this process. Nothing reaches real people.',[
 ['GET /messages','Latest captured messages (?rcpt= filter)'],['GET /messages/:id','One message with HTML'],['GET /messages/:id/html','Rendered email'],['GET /health','Health + count'],['GET /load','Load-test counter. Rows are stored in mail.db and are not sent to a provider.'],['POST /admin/reset','Clear the inbox'],['POST /deliver','Accept one message over HTTP and write it to mail.db',{to:'a@northwind.example',subject:'Hello',text:'Hi'}]]);
const S=service('mail',require('./lib').PORTS.mail,spec);
S.get('/messages',c=>db.prepare(`SELECT id,message_id,mail_from,rcpt,subject,headers,at FROM messages ${c.query.rcpt?'WHERE rcpt LIKE ?':''} ORDER BY id DESC LIMIT 200`).all(...(c.query.rcpt?['%'+c.query.rcpt+'%']:[])).map(m=>({...m,headers:JSON.parse(m.headers)})));
S.get('/messages/:id',c=>{const m=db.prepare('SELECT * FROM messages WHERE id=?').get(c.params.id);if(m)m.headers=JSON.parse(m.headers);return m||{__status:404,error:'not found'}});
S.get('/messages/:id/html',(c,res)=>{const m=db.prepare('SELECT html FROM messages WHERE id=?').get(c.params.id);res.writeHead(m?200:404,{'content-type':'text/html'});res.end(m?m.html:'not found')});
S.get('/health',()=>({ok:true,service:'mail',counts:{messages:db.prepare('SELECT count(*) n FROM messages').get().n,loadAccepted},inbox:MOPS_BOX,catcher:'in-process',smtpPort:null,realRecipients:0}));
S.get('/load',()=>loadStats());S.post('/admin/reset',()=>{db.exec('DELETE FROM messages');loadAccepted=0;loadBytes=0;return{ok:true}});
S.post('/deliver',c=>({ok:true,...deliver(c.body)}));
module.exports={deliver,loadStats,db};
