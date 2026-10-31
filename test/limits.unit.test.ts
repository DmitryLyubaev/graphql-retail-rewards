import {test} from 'node:test';import assert from 'node:assert/strict';import {parse} from 'graphql';
const api=await import('../src/limits.js').catch(()=>null);
test('operation limits count roots, aliases and expanded fragments',()=>{
  assert.ok(api,'operation limits missing');
  api.validateOperation(parse('{account(id:"A"){id balance}}'));
  for(const query of ['{a:account(id:"A"){id} b:account(id:"A"){id}}',`{account(id:"A"){${Array.from({length:41},(_,i)=>`b${i}:balance`).join(' ')}}}`,'{__schema{types{name}}}','{a{b{c{d{e{f{g}}}}}}}',`{account(id:"A"){${'...F '.repeat(41)}}} fragment F on RewardsAccount {balance}`,'{account(id:"A"){...F}} fragment F on RewardsAccount {...F}'])assert.throws(()=>api.validateOperation(parse(query)));
});
