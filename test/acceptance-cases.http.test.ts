import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createServer} from 'node:http';import {randomBytes} from 'node:crypto';
import {fixture,alice,op,input} from './helpers.js';import {createDynamoStore} from '../src/dynamodb.js';import {makeRewardsService} from '../src/rewards.js';import {createGraphqlHandler} from '../src/graphql.js';import {caseBody,type RejectionCase} from '../scripts/cases.js';import type {Actor} from '../src/domain.js';
const manifest=JSON.parse(readFileSync('fixtures/acceptance.json','utf8'));
for(const c of manifest.rejections as RejectionCase[])test(`frozen HTTP rejection: ${c.id}`,async t=>{
  const f=await fixture(t,{...(c.seedBalance===undefined?{}:{A:c.seedBalance}),...(c.seedSequence===undefined?{}:{sequence:c.seedSequence})});
  const store=createDynamoStore(f.config);t.after(()=>store.close());const secret=randomBytes(32),service=makeRewardsService({store,cursorSecret:secret});
  const tokens=new Map<string,Actor>([['alice',alice],['bob',{id:'bob',role:'member',accountId:'B'}],['op',op]]);
  const server=createServer(createGraphqlHandler(service,tokens));await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));t.after(()=>new Promise<void>((ok,fail)=>server.close(e=>e?fail(e):ok())));
  if(c.setupReceipt)await service.adjust(op,input());const before=await f.snapshot();
  const headers:Record<string,string>={'content-type':'application/json',...c.headers};if(c.actor!=='missing')headers.authorization=`Bearer ${c.actor}`;
  const r=await fetch(`http://127.0.0.1:${(server.address() as any).port}/graphql`,{method:c.method??'POST',headers,...(c.method==='GET'?{}:{body:c.raw??JSON.stringify(caseBody(c,secret))})});
  assert.equal(r.status,c.status);const body=await r.json() as any;if(c.code)assert.equal(body.errors[0].extensions.code,c.code);
  assert.deepEqual(await f.snapshot(),before);if(c.code==='FORBIDDEN'&&body.data?.account!==undefined)assert.equal(body.data.account,null);
});
