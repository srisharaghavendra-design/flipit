// Fake OpenAI-compatible endpoint: first call -> tool call, second -> final text. Verifies the tool-calling loop.
require('http').createServer((q,s)=>{let b='';q.on('data',c=>b+=c);q.on('end',()=>{const j=JSON.parse(b);const last=j.messages[j.messages.length-1];s.setHeader('content-type','application/json');
 if(last.role==='tool')return s.end(JSON.stringify({choices:[{message:{role:'assistant',content:'Done – chart is in the thread.'}}]}));
 s.end(JSON.stringify({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'1',type:'function',function:{name:'query_insight',arguments:JSON.stringify({question:'pipeline by region'})}}]}}]}));});}).listen(9999);
