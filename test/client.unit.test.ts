import {test} from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {setTimeout as delay} from 'node:timers/promises';import {GetItemCommand} from '@aws-sdk/client-dynamodb';import {createLocalClient} from '../src/dynamodb.js';
test('local SDK calls time out when the local listener accepts but never responds',async()=>{
  const server=createServer(()=>{});await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
  const client=createLocalClient({endpoint:`http://127.0.0.1:${(server.address() as any).port}`,tableName:'p26-timeout',region:'local',credentials:{accessKeyId:'local',secretAccessKey:'local'}});
  try{const outcome=await Promise.race([client.send(new GetItemCommand({TableName:'p26-timeout',Key:{PK:{S:'A'},SK:{S:'STATE'}}})).then(()=> 'response',(e:Error)=>e.name),delay(1600).then(()=> 'observer-expired')]);assert.equal(outcome,'TimeoutError');}
  finally{client.destroy();server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
});
