// One Vercel function. routes in vercel.json send every path here so the passcode gate cannot be skipped.
if(!process.env.MOPS_DATA_DIR)process.env.MOPS_DATA_DIR='/tmp/mops';
if(!process.env.MOPS_RUNS_DIR)process.env.MOPS_RUNS_DIR='/tmp/mops/runs';
const{handleRequest}=require('../server');

function restoreUrl(req){
  const raw=req.url||'/';
  let u;try{u=new URL(raw,'http://localhost')}catch{return raw}
  const pathName=u.pathname;
  if(pathName!=='/api/index'&&pathName!=='/api/index.js'&&pathName!=='/api')return raw;
  const hinted=(req.query&&req.query.__path!=null)?req.query.__path:u.searchParams.get('__path');
  u.searchParams.delete('__path');
  const q=u.searchParams.toString();
  return '/'+(hinted?String(hinted).replace(/^\//,''):'')+(q?'?'+q:'');
}

module.exports=async(req,res)=>{req.url=restoreUrl(req);return handleRequest(req,res)};
