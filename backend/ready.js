// Boot every service inside this process. Safe to call more than once (cold start and later requests share the promise).
let pending;
function ready(){if(pending)return pending;pending=(async()=>{
  require('./crm');require('./mail');require('./engine');require('./warehouse');require('./hub');
  await new Promise(r=>setImmediate(r));
  await require('./engine').boot();
})();return pending}
module.exports={ready};
