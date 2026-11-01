import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {createDynamoStore} from '../src/dynamodb.js';
import {StoreConflict,StoreOutcomeUnknown} from '../src/store.js';

type Reply=(request:IncomingMessage,response:ServerResponse)=>void;
const expected={id:'A',openingBalance:100,balance:100,sequence:0} as const;
const result={accountId:'A',sequence:1,requestId:'adapter-fixture',delta:7,reason:'correction',balanceAfter:107} as const;
const canonical={version:1,actorId:'op',accountId:'A',delta:7,reason:'correction'} as const;

async function exercise(reply:Reply,check:(error:unknown)=>boolean,signal?:AbortSignal){
  const requests:{target:string|undefined;body:any}[]=[];
  const server=createServer((req,res)=>{const chunks:Buffer[]=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{requests.push({target:req.headers['x-amz-target'] as string,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))});reply(req,res);});});
  await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));
  const store=createDynamoStore({endpoint:`http://127.0.0.1:${(server.address() as any).port}`,tableName:'p26-adapter-fixture',region:'local',credentials:{accessKeyId:'local',secretAccessKey:'local'}});
  try{
    await assert.rejects(store.commitAdjustment(expected,result,canonical,signal??AbortSignal.timeout(3000)),check);
    assert.equal(requests.length,1,'SDK must not retry a submission');
    assert.equal(requests[0].target,'DynamoDB_20120810.TransactWriteItems');
    assert.equal(requests[0].body.TransactItems.length,3);
  }finally{store.close();server.closeAllConnections();await new Promise<void>(ok=>server.close(()=>ok()));}
}
const rpc=(name:string,status=400,extra:object={}):Reply=>(_req,res)=>{res.writeHead(status,{'content-type':'application/x-amz-json-1.0','x-amzn-requestid':'fixture-request'});res.end(JSON.stringify({__type:`com.amazonaws.dynamodb.v20120810#${name}`,message:'Injected local protocol response',...extra}));};
const conflict=(error:unknown)=>error instanceof StoreConflict;
const unknown=(error:unknown)=>error instanceof StoreOutcomeUnknown;
const sdk=(name:string)=>(error:any)=>error instanceof Error&&error.name===name&&!(error instanceof StoreConflict)&&!(error instanceof StoreOutcomeUnknown)&&(error as any).$metadata?.httpStatusCode===400;

test('SDK TransactionConflictException maps to confirmed conflict',()=>exercise(rpc('TransactionConflictException'),conflict));
test('SDK conditional cancellation maps to confirmed conflict',()=>exercise(rpc('TransactionCanceledException',400,{CancellationReasons:[{Code:'ConditionalCheckFailed'},{Code:'None'},{Code:'None'}]}),conflict));
test('SDK transaction-conflict cancellation maps to confirmed conflict',()=>exercise(rpc('TransactionCanceledException',400,{CancellationReasons:[{Code:'TransactionConflict'}]}),conflict));
test('SDK validation cancellation is not retried as a conflict',()=>exercise(rpc('TransactionCanceledException',400,{CancellationReasons:[{Code:'ValidationError'}]}),sdk('TransactionCanceledException')));
test('SDK mixed cancellation preserves definitive failure',()=>exercise(rpc('TransactionCanceledException',400,{CancellationReasons:[{Code:'ConditionalCheckFailed'},{Code:'ValidationError'}]}),sdk('TransactionCanceledException')));
test('SDK cancellation without reasons does not invent a business rejection',()=>exercise(rpc('TransactionCanceledException'),sdk('TransactionCanceledException')));
for(const name of ['ValidationException','ResourceNotFoundException','ProvisionedThroughputExceededException'])test(`SDK ${name} remains a definitive rejected submission`,()=>exercise(rpc(name),sdk(name)));
test('SDK HTTP500 preserves uncertain commit outcome',()=>exercise(rpc('InternalServerError',500),unknown));
test('SDK HTTP503 preserves uncertain commit outcome',()=>exercise(rpc('ServiceUnavailable',503),unknown));
test('SDK successful HTTP response with invalid body remains uncertain',()=>exercise((_req,res)=>{res.writeHead(200,{'content-type':'application/x-amz-json-1.0'});res.end('{');},unknown));
test('SDK post-submission socket reset remains uncertain',()=>exercise(req=>req.socket.destroy(),unknown));
test('SDK request timeout remains uncertain',()=>exercise(()=>{},unknown));
test('SDK in-flight abort remains uncertain',()=>{const controller=new AbortController();return exercise(()=>controller.abort(),unknown,controller.signal);});
