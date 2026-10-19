// Single Vercel Hobby function. Every page and API route comes through here so the passcode gate cannot be skipped.
if(!process.env.MOPS_DATA_DIR)process.env.MOPS_DATA_DIR='/tmp/mops';
if(!process.env.MOPS_RUNS_DIR)process.env.MOPS_RUNS_DIR='/tmp/mops/runs';
const{handleRequest}=require('../server');

function restoreUrl(req){
  const invoked=req.headers&&(req.headers['x-invoke-path']||req.headers['x-vercel-original-path']||req.headers['x-forwarded-uri']);
  if(invoked){const path=Array.isArray(invoked)?invoked[0]:invoked;const q=req.headers['x-invoke-query'];
    if(q&&!String(path).includes('?'))return path+(String(q).startsWith('?')?q:'?'+q);return path}
  const raw=req.url||'/';
  let u;try{u=new URL(raw,'http://localhost')}catch{return raw}
  const hinted=(req.query&&req.query.__path!=null)?req.query.__path:u.searchParams.get('__path');
  if(hinted!=null&&(u.pathname==='/api/index'||u.pathname==='/api/index.js'||u.pathname==='/api')){
    u.searchParams.delete('__path');const q=u.searchParams.toString();
    return'/'+String(hinted).replace(/^\//,'')+(q?'?'+q:'')}
  return raw}

module.exports=async(req,res)=>{req.url=restoreUrl(req);return handleRequest(req,res)};
module.exports.config={maxDuration:300};
