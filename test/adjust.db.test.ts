import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,alice,op,input,code} from './helpers.js';
const api=await import('../src/rewards.js').catch(()=>null);const db=await import('../src/dynamodb.js').catch(()=>null);
function setup(t:any,f:any){assert.ok(api,'rewards implementation missing');assert.ok(db,'DynamoDB adapter missing');const store=db.createDynamoStore(f.config);t.after(()=>store.close());return {store,service:api.makeRewardsService({store,cursorSecret:new Uint8Array(32)})};}
test('actual DB saves original success and rejects conflicting cross-account key reuse',async t=>{
  const f=await fixture(t);const {service}=setup(t,f);const first=await service.adjust(op,input());
  await service.adjust(op,input('r2',1));assert.deepEqual(await service.adjust(op,input()),first);
  await assert.rejects(service.adjust(op,{...input(),accountId:'B'}),code('CONFLICTING_REQUEST'));
  assert.equal((await service.readAccount(alice,'A')).balance,108);
  const s=await f.snapshot();assert.equal(s.history.length,2);assert.equal(s.receipts.length,2);
});
test('actual DB four concurrent identical submissions have one effect',async t=>{
  const f=await fixture(t);const {service}=setup(t,f);const results=await Promise.all(Array.from({length:4},()=>service.adjust(op,input())));
  results.forEach(r=>assert.deepEqual(r,results[0]));const s=await f.snapshot();assert.equal(s.accounts[0]!.balance,107);assert.equal(s.history.length,1);assert.equal(s.receipts.length,1);
});
test('actual DB two competing debits cannot overdraw',async t=>{
  const f=await fixture(t);const {service}=setup(t,f);const r=await Promise.allSettled(['d1','d2'].map(requestId=>service.adjust(op,{accountId:'B',delta:-40,reason:'debit',requestId})));
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal((r.find(x=>x.status==='rejected') as PromiseRejectedResult).reason.code,'INSUFFICIENT_POINTS');
  const s=await f.snapshot();assert.equal(s.accounts[1]!.balance,10);assert.equal(s.history.length,1);assert.equal(s.receipts.length,1);
});
test('actual condition failure rolls back receipt and history along with state',async t=>{
  const f=await fixture(t);const {store,service}=setup(t,f);const stale=await store.getAccount('A');assert.ok(stale);
  await service.adjust(op,input());const before=await f.snapshot();
  await assert.rejects(store.commitAdjustment(stale,{accountId:'A',sequence:1,requestId:'late',delta:1,reason:'late',balanceAfter:101},{version:1,actorId:'op',accountId:'A',delta:1,reason:'late'},AbortSignal.timeout(1000)));
  assert.deepEqual(await f.snapshot(),before);
});
test('failed request has no receipt and can succeed after funding; bounds are enforced',async t=>{
  const f=await fixture(t);const {service}=setup(t,f);await assert.rejects(service.adjust(op,input('debit',-101)),code('INSUFFICIENT_POINTS'));
  assert.equal((await f.snapshot()).receipts.length,0);await service.adjust(op,input('fund',10));await service.adjust(op,input('debit',-101));assert.equal((await service.readAccount(op,'A')).balance,9);
});
