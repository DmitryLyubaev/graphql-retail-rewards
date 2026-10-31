import {test} from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {randomBytes} from 'node:crypto';
import {fixture,alice,op,input} from './helpers.js';import {createDynamoStore} from '../src/dynamodb.js';import {makeRewardsService} from '../src/rewards.js';
import type {Actor} from '../src/domain.js';
const api=await import('../src/graphql.js').catch(()=>null);
async function setup(t:any){const f=await fixture(t);assert.ok(api,'HTTP handler missing');const store=createDynamoStore(f.config);t.after(()=>store.close());const service=makeRewardsService({store,cursorSecret:randomBytes(32)});
  const tokens=new Map<string,Actor>([['alice',alice],['op',op]]);const server=createServer(api.createGraphqlHandler(service,tokens));await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));t.after(()=>new Promise<void>((ok,fail)=>server.close(e=>e?fail(e):ok())));
  const url=`http://127.0.0.1:${(server.address() as any).port}/graphql`;
  const post=(body:any,token='alice',headers:Record<string,string>={})=>fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`,...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  return {f,service,url,post};}
test('actual HTTP preserves partial errors and enforces business permission below resolvers',async t=>{
  const {post,f}=await setup(t);const r=await post({query:'{account(id:"A"){balance history(after:"bad"){upperBound}}}'});const b=await r.json() as any;
  assert.equal(r.status,200);assert.equal(b.data.account.balance,100);assert.equal(b.data.account.history,null);assert.equal(b.errors[0].extensions.code,'INVALID_CURSOR');
  const denied=await (await post({query:'{account(id:"B"){balance}}'},'alice',{'x-role':'operator','x-account':'B'})).json() as any;
  assert.equal(denied.data.account,null);assert.equal(denied.errors[0].extensions.code,'FORBIDDEN');assert.equal(JSON.stringify(denied).includes('50'),false);
  assert.equal((await f.snapshot()).history.length,0);
});
test('actual HTTP applies adjustment once and denies member receipt replay',async t=>{
  const {post,f}=await setup(t);const body={query:'mutation($i:AdjustPointsInput!){adjustPoints(input:$i){balanceAfter sequence requestId}}',variables:{i:input()}};
  const first=await (await post(body,'op')).json() as any;assert.equal(first.data.adjustPoints.balanceAfter,107);
  assert.deepEqual(await (await post(body,'op')).json(),first);
  const denied=await (await post(body,'alice')).json() as any;assert.equal(denied.data.adjustPoints,null);assert.equal(denied.errors[0].extensions.code,'FORBIDDEN');
  assert.equal((await f.snapshot()).receipts.length,1);
});
test('HTTP transport and GraphQL validation failures use bounded safe 4xx responses',async t=>{
  const {post,url}=await setup(t);
  assert.equal((await fetch(url)).status,405);
  assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
  assert.equal((await post('{}','unknown')).status,401);
  assert.equal((await post('{}','alice',{'content-type':'text/plain'})).status,415);
  for(const body of ['{',JSON.stringify([{query:'{account(id:"A"){id}}'}]),JSON.stringify({query:'{missing}'}),JSON.stringify({query:'mutation($i:AdjustPointsInput!){adjustPoints(input:$i){sequence}}',variables:{i:{...input(),delta:1.5}}})])assert.equal((await post(body,'op')).status,400);
  assert.equal((await post('x'.repeat(16385))).status,413);
  for(const q of ['{__schema{types{name}}}','{a:account(id:"A"){id} b:account(id:"A"){id}}','{account(id:"A"){...F}} fragment F on RewardsAccount {...F}',`{account(id:"A"){${'...F '.repeat(41)}}} fragment F on RewardsAccount{balance}`])assert.equal((await post({query:q})).status,400);
});
