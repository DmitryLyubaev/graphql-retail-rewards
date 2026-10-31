import {test} from 'node:test';import assert from 'node:assert/strict';
const api=await import('../scripts/acceptance.js').catch(()=>null);const hook=await import('../src/commit-barrier.js').catch(()=>null);
test('harness retains failure and cleans only owned resources without volume removal',async()=>{
  assert.ok(api,'acceptance harness missing');const calls:any[]=[];const other={running:true};
  const failure=new Error('barrier timed out');
  await assert.rejects(api.withOwnedCleanup({project:'p26-owned'},async()=>{throw failure;},async(_runtime:any,args:string[])=>{calls.push(args);}),/barrier timed out/);
  assert.deepEqual(calls,[['down','--remove-orphans']]);assert.equal(other.running,true);
  await assert.rejects(api.withOwnedCleanup({project:'other-project'},async()=>{},async()=>{}),/owned/);
});
test('evidence redaction removes generated credentials from nested error text',()=>{
  assert.ok(api,'acceptance harness missing');const secret='very-private-token';
  assert.equal(JSON.stringify(api.redact({nested:{error:`failure ${secret}`}},[secret])).includes(secret),false);
});
test('only matching newly committed request pauses at the local barrier',async()=>{
  assert.ok(hook,'commit barrier missing');const events:any[]=[];const pause=hook.createCommitBarrier('target',e=>events.push(e));
  await pause({accountId:'A',sequence:1,requestId:'other',delta:9,reason:'test',balanceAfter:109});assert.equal(events.length,0);
  let finished=false;void pause({accountId:'A',sequence:1,requestId:'target',delta:9,reason:'test',balanceAfter:109}).then(()=>{finished=true;});
  await new Promise(ok=>setImmediate(ok));assert.equal(finished,false);assert.equal(events[0].event,'committed-barrier');
});
