// Boot every service inside this process. Safe to call more than once (cold start and later requests share the promise).
// A failed seed is logged and remembered so a later request cannot crash the isolate by retrying forever.
let pending;
function ready(){if(pending)return pending;pending=(async()=>{
  try{
    require('./crm');require('./mail');require('./engine');require('./warehouse');require('./hub');
    await new Promise(r=>setImmediate(r));
    await require('./engine').boot();
  }catch(e){console.error('boot',e&&e.stack||e)}
})();return pending}
module.exports={ready};
