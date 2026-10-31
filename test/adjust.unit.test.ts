import {test} from 'node:test';import assert from 'node:assert/strict';import {alice,op,input,code} from './helpers.js';
const api=await import('../src/rewards.js').catch(()=>null);const port=await import('../src/store.js').catch(()=>null);
const state={id:'A',openingBalance:100,balance:100,sequence:0} as const;
test('sixteen confirmed conflicts stop without a seventeenth submission',async()=>{
  assert.ok(api,'service missing');assert.ok(port,'store port missing');let attempts=0;
  const store:any={getAccount:async()=>state,getReceipt:async()=>null,commitAdjustment:async()=>{attempts++;throw new port.StoreConflict();}};
  const service=api.makeRewardsService({store,cursorSecret:new Uint8Array(32),runtime:{now:()=>0,sleep:async()=>{},random:()=>0}});
  await assert.rejects(service.adjust(op,input()),code('RETRYABLE_CONFLICT'));assert.equal(attempts,16);
});
test('ambiguous response with absent receipt remains unknown and later same-key receipt recovers',async()=>{
  assert.ok(api,'service missing');assert.ok(port,'store port missing');let receipt:any=null;let attempts=0;
  const store:any={getAccount:async()=>state,getReceipt:async()=>receipt,commitAdjustment:async()=>{attempts++;throw new port.StoreOutcomeUnknown();}};
  const service=api.makeRewardsService({store,cursorSecret:new Uint8Array(32)});
  await assert.rejects(service.adjust(op,input()),code('OUTCOME_UNKNOWN'));assert.equal(attempts,1);
  receipt={request:{version:1,actorId:'op',accountId:'A',delta:7,reason:'correction'},result:{...input(),sequence:1,balanceAfter:107}};
  assert.deepEqual(await service.adjust(op,input()),receipt.result);assert.equal(attempts,1);
});
test('five-second deadline bounds confirmed contention and business permissions precede storage',async()=>{
  assert.ok(api,'service missing');assert.ok(port,'store port missing');let now=0,calls=0;
  const store:any={getAccount:async()=>state,getReceipt:async()=>null,commitAdjustment:async()=>{calls++;now=5000;throw new port.StoreConflict();}};
  const service=api.makeRewardsService({store,cursorSecret:new Uint8Array(32),runtime:{now:()=>now,sleep:async()=>{},random:()=>0}});
  await assert.rejects(service.adjust(op,input()),code('RETRYABLE_CONFLICT'));assert.equal(calls,1);
  await assert.rejects(service.adjust(alice,input()),code('FORBIDDEN'));assert.equal(calls,1);
});
