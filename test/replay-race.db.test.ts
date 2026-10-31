import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,op,input,code} from './helpers.js';import {createDynamoStore} from '../src/dynamodb.js';import {makeRewardsService} from '../src/rewards.js';
for(const scenario of [
  {name:'exact debit drains balance',initial:100,sequence:0,winner:-100,overlap:-100},
  {name:'exact credit reaches balance ceiling',initial:999999,sequence:0,winner:1,overlap:1},
  {name:'exact adjustment reaches sequence ceiling',initial:100,sequence:999999,winner:1,overlap:1},
  {name:'conflicting key takes precedence over new insufficient balance',initial:100,sequence:0,winner:-100,overlap:-99}
])test(`actual receipt interleaving: ${scenario.name}`,async t=>{
  const f=await fixture(t,{A:scenario.initial,sequence:scenario.sequence});const store=createDynamoStore(f.config);t.after(()=>store.close());
  const writer=makeRewardsService({store,cursorSecret:new Uint8Array(32)});let scheduled=false;let winner:any;
  // Control only scheduling: both calls use the actual service and actual transactions.
  const overlappingStore={...store,getReceipt:async(...args:Parameters<typeof store.getReceipt>)=>{
    const receipt=await store.getReceipt(...args);
    if(!scheduled){scheduled=true;assert.equal(receipt,null);winner=await writer.adjust(op,input('overlap',scenario.winner));}
    return receipt;
  }};
  const overlapping=makeRewardsService({store:overlappingStore,cursorSecret:new Uint8Array(32)});
  if(scenario.winner===scenario.overlap)assert.deepEqual(await overlapping.adjust(op,input('overlap',scenario.overlap)),winner);
  else await assert.rejects(overlapping.adjust(op,input('overlap',scenario.overlap)),code('CONFLICTING_REQUEST'));
  const snapshot=await f.snapshot();assert.equal(snapshot.history.length,1);assert.equal(snapshot.receipts.length,1);assert.equal(snapshot.accounts[0]!.balance,scenario.initial+scenario.winner);
});
