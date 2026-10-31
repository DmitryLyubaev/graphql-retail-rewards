import {test} from 'node:test';import assert from 'node:assert/strict';import {createHmac,randomBytes} from 'node:crypto';
import {alice,op,code} from './helpers.js';
const api=await import('../src/cursor.js').catch(()=>null);const secret=randomBytes(32);
const payload={version:1,actorId:'alice',accountId:'A',upperBound:5,beforeSequence:4} as const;
test('signed cursor preserves its frozen bound and rejects tampering or context changes',()=>{
  assert.ok(api,'cursor implementation missing');const cursor=api.encodeCursor(payload,secret);
  assert.deepEqual(api.decodeCursor(cursor,alice,'A',secret),payload);
  for(const [actor,id,key] of [[op,'A',secret],[alice,'B',secret],[alice,'A',randomBytes(32)]] as const)assert.throws(()=>api.decodeCursor(cursor,actor,id,key),code('INVALID_CURSOR'));
  for(const text of ['',cursor+'x','x'.repeat(1025),'invalid'])assert.throws(()=>api.decodeCursor(text,alice,'A',secret),code('INVALID_CURSOR'));
});
test('even correctly signed cursor payloads reject unknown versions, extra fields and invalid ranges',()=>{
  assert.ok(api,'cursor implementation missing');
  const sign=(p:any)=>{const body=Buffer.from(JSON.stringify(p)).toString('base64url');return `${body}.${createHmac('sha256',secret).update(body).digest('base64url')}`;};
  for(const p of [{...payload,version:2},{...payload,extra:true},{...payload,upperBound:1000001},{...payload,beforeSequence:0},{...payload,beforeSequence:6},{...payload,beforeSequence:1.5}])assert.throws(()=>api.decodeCursor(sign(p),alice,'A',secret),code('INVALID_CURSOR'));
});
