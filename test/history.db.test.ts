import {test} from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {fixture,alice,op,input,code} from './helpers.js';import {createDynamoStore} from '../src/dynamodb.js';import {makeRewardsService} from '../src/rewards.js';
test('actual history traversal excludes a new insert without losing prior entries',async t=>{
  const f=await fixture(t);const store=createDynamoStore(f.config);t.after(()=>store.close());const service=makeRewardsService({store,cursorSecret:randomBytes(32)});
  assert.equal(typeof (service as any).history,'function','history service missing');
  for(let n=1;n<=5;n++)await service.adjust(op,input(`inc${n}`,1));
  const page1=await service.history(alice,'A',2);await service.adjust(op,input('later',10));
  const page2=await service.history(alice,'A',2,page1.pageInfo.endCursor!);const page3=await service.history(alice,'A',2,page2.pageInfo.endCursor!);
  assert.deepEqual(page1.edges.map(e=>e.node.sequence),[5,4]);assert.deepEqual(page2.edges.map(e=>e.node.sequence),[3,2]);assert.deepEqual(page3.edges.map(e=>e.node.sequence),[1]);
  assert.equal(page3.upperBound,5);assert.equal(page3.pageInfo.hasNextPage,false);assert.equal((await service.readAccount(alice,'A')).balance,115);
  assert.equal((await service.history(alice,'A',1)).edges[0].node.sequence,6);
});
test('empty pages, page bounds and permission checks operate against real storage',async t=>{
  const f=await fixture(t);const store=createDynamoStore(f.config);t.after(()=>store.close());const service=makeRewardsService({store,cursorSecret:randomBytes(32)});
  assert.equal(typeof (service as any).history,'function','history service missing');
  const before=await f.snapshot();const page=await service.history(alice,'A',20);assert.deepEqual(page.edges,[]);assert.equal(page.pageInfo.endCursor,null);
  for(const size of [0,21])await assert.rejects(service.history(alice,'A',size),code('BAD_USER_INPUT'));
  await assert.rejects(service.history(alice,'B',2),code('FORBIDDEN'));assert.deepEqual(await f.snapshot(),before);
});
