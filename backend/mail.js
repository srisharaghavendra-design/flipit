// Local SMTP catcher: a real SMTP server (port 2525) that accepts mail from the engine and stores it, plus an HTTP inbox API.
// In production this is replaced by a real email service provider (dedicated IPs, DKIM/SPF/DMARC, bounce handling).
const path=require('path'),Database=require('better-sqlite3');const{SMTPServer}=require('smtp-server');const{simpleParser}=require('mailparser');
const{PORTS,DATA,now,emitter,service,openapi}=require('./lib');const emit=emitter('mail');
const db=new Database(path.join(DATA,'mail.db'));db.pragma('journal_mode=WAL');
db.exec('CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY,message_id TEXT,mail_from TEXT,rcpt TEXT,subject TEXT,html TEXT,headers TEXT,size INT,at TEXT)');
try{db.exec('ALTER TABLE messages ADD COLUMN text TEXT')}catch{}try{db.exec('ALTER TABLE messages ADD COLUMN cc TEXT')}catch{}
const MOPS_BOX=(process.env.MOPS_INBOX||'mops@mops.local').toLowerCase();let loadAccepted=0,loadBytes=0;
const smtp=new SMTPServer({authOptional:true,disabledCommands:['STARTTLS'],logger:false,size:5e6,
  onData(stream,session,cb){
    // Load-test mail (header X-Mops-Load) is fully received over SMTP but only counted, not parsed/stored, so the sink isn't the bottleneck.
    if(session.envelope.rcptTo.some(r=>r.address.endsWith('@load.example'))){stream.on('data',c=>loadBytes+=c.length);stream.on('end',()=>{loadAccepted++;cb()});return}
    simpleParser(stream).then(m=>{const rcpt=session.envelope.rcptTo.map(r=>r.address).join(',');
    const h={};for(const l of m.headerLines||[]){if(['list-unsubscribe','list-unsubscribe-post','x-mops-campaign','x-mops-send','x-mops-trace'].includes(l.key))h[l.key]=l.line.slice(l.line.indexOf(':')+1).trim()}
    for(const l of m.headerLines||[])if(['in-reply-to','x-mops-surface'].includes(l.key))h[l.key]=l.line.slice(l.line.indexOf(':')+1).trim();
    const cc=(m.cc?.value||[]).map(x=>x.address).join(',');const info=db.prepare('INSERT INTO messages(message_id,mail_from,rcpt,subject,html,headers,size,at,text,cc) VALUES(?,?,?,?,?,?,?,?,?,?)').run(m.messageId,session.envelope.mailFrom.address,rcpt,m.subject,m.html||m.textAsHtml||'',JSON.stringify(h),(m.html||'').length,now(),m.text||'',cc);
    if(rcpt.toLowerCase().split(',').includes(MOPS_BOX))emit('inbound',`📥 email to ${MOPS_BOX} from ${session.envelope.mailFrom.address}: "${m.subject}"`,{id:Number(info.lastInsertRowid),from:session.envelope.mailFrom.address},null);
    emit('smtp',`250 accepted → ${rcpt}`,{subject:m.subject},h['x-mops-send','x-mops-trace']?null:null);cb()}).catch(cb)}});
smtp.listen(PORTS.smtp,'127.0.0.1',()=>console.log('[mail] smtp :'+PORTS.smtp+' (loopback catcher, no external delivery)'));
const spec=openapi('Mail sink (SMTP catcher)','Real SMTP server on :'+PORTS.smtp+' that captures every email the engine sends, so nothing reaches real people.',[
 ['GET /messages','Latest captured messages (?rcpt= filter)'],['GET /messages/:id','One message with HTML'],['GET /messages/:id/html','Rendered email'],['GET /health','Health + count'],['GET /load','Load-test counter (mail received over SMTP, counted not stored)'],['POST /admin/reset','Clear the inbox']]);
const S=service('mail',PORTS.mail,spec);
S.get('/messages',c=>db.prepare(`SELECT id,message_id,mail_from,rcpt,subject,headers,at FROM messages ${c.query.rcpt?'WHERE rcpt LIKE ?':''} ORDER BY id DESC LIMIT 200`).all(...(c.query.rcpt?['%'+c.query.rcpt+'%']:[])).map(m=>({...m,headers:JSON.parse(m.headers)})));
S.get('/messages/:id',c=>{const m=db.prepare('SELECT * FROM messages WHERE id=?').get(c.params.id);if(m)m.headers=JSON.parse(m.headers);return m||{__status:404,error:'not found'}});
S.get('/messages/:id/html',(c,res)=>{const m=db.prepare('SELECT html FROM messages WHERE id=?').get(c.params.id);res.writeHead(m?200:404,{'content-type':'text/html'});res.end(m?m.html:'not found')});
S.get('/health',()=>({ok:true,service:'mail',counts:{messages:db.prepare('SELECT count(*) n FROM messages').get().n,loadAccepted},inbox:MOPS_BOX,smtpPort:PORTS.smtp}));
S.get('/load',()=>({accepted:loadAccepted,bytes:loadBytes}));S.post('/admin/reset',()=>{db.exec('DELETE FROM messages');loadAccepted=0;loadBytes=0;return{ok:true}});
S.listen();
