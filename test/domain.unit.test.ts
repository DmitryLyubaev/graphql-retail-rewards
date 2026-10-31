import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const auth=await import('../src/auth.js').catch(()=>null);
const domain=await import('../src/domain.js').catch(()=>null);
const alice={id:'alice',role:'member',accountId:'A'} as const;
const op={id:'op',role:'operator'} as const;
const code=(value:string)=>(error:any)=>error?.code===value;
const valid={accountId:'A',delta:7,reason:'correction',requestId:'r1'};
test('verifies bearer identity and rejects missing or unknown credentials',()=>{
  assert.ok(auth,'auth implementation missing');
  const token=randomBytes(32).toString('hex');const tokens=new Map([[token,alice]]);
  assert.equal(auth.authenticate(`Bearer ${token}`,tokens).id,'alice');
  for(const value of [undefined,'Bearer unknown',`Basic ${token}`,`Bearer ${token} extra`])
    assert.throws(()=>auth.authenticate(value,tokens),code('UNAUTHENTICATED'));
});
test('permissions deny cross-account reads and all member adjustments',()=>{
  assert.ok(auth,'auth implementation missing');
  auth.assertCanRead(alice,'A');auth.assertCanAdjust(op,'B');
  assert.throws(()=>auth.assertCanRead(alice,'B'),code('FORBIDDEN'));
  assert.throws(()=>auth.assertCanAdjust(alice,'A'),code('FORBIDDEN'));
});
test('canonical request preserves accepted values and reason bytes',()=>{
  assert.ok(domain,'domain implementation missing');
  assert.deepEqual(domain.validateAdjustment(op,valid),{version:1,actorId:'op',accountId:'A',delta:7,reason:'correction'});
  for(const delta of [-1000,-1,1,1000])assert.equal(domain.validateAdjustment(op,{...valid,delta}).delta,delta);
  for(const length of [1,120])assert.equal(domain.validateAdjustment(op,{...valid,reason:'x'.repeat(length)}).reason.length,length);
  domain.validateAdjustment(op,{...valid,requestId:'x'.repeat(64)});
});
test('rejects invalid deltas, reasons and durable request IDs',()=>{
  assert.ok(domain,'domain implementation missing');
  for(const delta of [0,-1001,1001,0.5,NaN,Infinity])assert.throws(()=>domain.validateAdjustment(op,{...valid,delta}),code('BAD_USER_INPUT'));
  for(const reason of ['', 'x'.repeat(121),' padded','padded ','é','x\ny'])assert.throws(()=>domain.validateAdjustment(op,{...valid,reason}),code('BAD_USER_INPUT'));
  for(const requestId of ['', 'x'.repeat(65),'x/y'])assert.throws(()=>domain.validateAdjustment(op,{...valid,requestId}),code('BAD_USER_INPUT'));
  assert.throws(()=>domain.validateAdjustment(op,{...valid,accountId:'Z'}),code('NOT_FOUND'));
});
