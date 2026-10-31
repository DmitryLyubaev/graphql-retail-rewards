import {DynamoDBClient,CreateTableCommand,DeleteTableCommand} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,PutCommand,GetCommand,QueryCommand} from '@aws-sdk/lib-dynamodb';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import type {TestContext} from 'node:test';
export const alice={id:'alice',role:'member',accountId:'A'} as const,op={id:'op',role:'operator'} as const;
export const code=(value:string)=>(error:any)=>error?.code===value;
export const input=(requestId='r1',delta=7)=>({accountId:'A',delta,reason:'correction',requestId});
export function databaseConfig(tableName:string){
  const runtime=JSON.parse(readFileSync('.local/runtime.json','utf8'));
  return {endpoint:`http://127.0.0.1:${runtime.dbPort}`,tableName,region:'local',credentials:{accessKeyId:'local',secretAccessKey:'local'}};
}
export async function fixture(t:TestContext,overrides:Record<string,number>={}){
  const tableName=`p26-test-${randomBytes(8).toString('hex')}`;const config=databaseConfig(tableName);
  const raw=new DynamoDBClient({...config,maxAttempts:1});const doc=DynamoDBDocumentClient.from(raw);
  await raw.send(new CreateTableCommand({TableName:tableName,KeySchema:[{AttributeName:'PK',KeyType:'HASH'},{AttributeName:'SK',KeyType:'RANGE'}],AttributeDefinitions:[{AttributeName:'PK',AttributeType:'S'},{AttributeName:'SK',AttributeType:'S'}],BillingMode:'PAY_PER_REQUEST'}));
  for(const id of ['A','B']){const balance=overrides[id]??(id==='A'?100:50);await doc.send(new PutCommand({TableName:tableName,Item:{PK:`ACCOUNT#${id}`,SK:'STATE',id,openingBalance:balance,balance,sequence:overrides.sequence??0}}));}
  t.after(async()=>{await raw.send(new DeleteTableCommand({TableName:tableName}));raw.destroy();});
  const snapshot=async()=>{
    const accounts=[],history=[],receipts=[];
    for(const id of ['A','B']){
      accounts.push((await doc.send(new GetCommand({TableName:tableName,Key:{PK:`ACCOUNT#${id}`,SK:'STATE'},ConsistentRead:true}))).Item);
      history.push(...((await doc.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'PK = :pk AND begins_with(SK,:prefix)',ExpressionAttributeValues:{':pk':`ACCOUNT#${id}`,':prefix':'ADJ#'},ConsistentRead:true}))).Items??[]));
    }
    for(const id of ['alice','bob','op'])receipts.push(...((await doc.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'PK = :pk',ExpressionAttributeValues:{':pk':`REQUEST#${id}`},ConsistentRead:true}))).Items??[]));
    return {accounts,history,receipts};
  };return {config,raw,doc,snapshot};
}
