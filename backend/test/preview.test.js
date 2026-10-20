// Hits a real Vercel preview when PREVIEW_URL is set (for example the URL on the pull request).
// `vercel dev` needs the project owner's login, which this repo does not have, so CI skips this.
const test=require('node:test'),assert=require('node:assert/strict');
const base=process.env.PREVIEW_URL;

async function get(path){const res=await fetch(new URL(path, base),{redirect:'manual'});const text=await res.text();return{status:res.status,text,location:res.headers.get('location')||''}}

test('preview serves /health and the demo sign-in',{skip:base?false:'set PREVIEW_URL to the Vercel preview to run this'},async()=>{
  const health=await get('/health');
  if(health.status===302&&/vercel\.com\/sso/.test(health.location)){
    assert.fail('preview is behind Vercel Authentication: '+health.location)}
  assert.equal(health.status,200,health.text.slice(0,180));
  const body=JSON.parse(health.text);
  assert.equal(body.ok,true);assert.equal(body.service,'mops');assert.equal(body.company,'Northwind Networks');
  const home=await get('/');
  assert.equal(home.status,401);
  if(/passcode/i.test(home.text)) assert.match(home.text,/Enter the passcode/);
  else { assert.match(home.text,/Demo sign-in/); assert.doesNotMatch(home.text,/passcode/i); }
});
