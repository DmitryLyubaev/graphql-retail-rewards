import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,GetCommand,QueryCommand,TransactWriteCommand} from '@aws-sdk/lib-dynamodb';
import type {AccountId,AccountState,AdjustmentResult,Receipt} from './domain.js';
import {MAX_BALANCE,MAX_SEQUENCE} from './domain.js';
import {StoreConflict,StoreOutcomeUnknown,type Store} from './store.js';
export interface DynamoConfig {endpoint:string;tableName:string;region:string;credentials:{accessKeyId:string;secretAccessKey:string}}
export function createLocalClient(config:DynamoConfig){
  const u=new URL(config.endpoint);
  if(u.protocol!=='http:'||!(u.hostname==='127.0.0.1'||u.hostname==='db'&&u.port==='8000')||u.username||u.password||u.search||u.hash||u.pathname!=='/'||
    config.region!=='local'||config.credentials.accessKeyId!=='local'||config.credentials.secretAccessKey!=='local'||!/^p26-[a-zA-Z0-9_-]{1,240}$/.test(config.tableName))throw new Error('Explicit local DynamoDB configuration required');
  return new DynamoDBClient({endpoint:config.endpoint,region:'local',credentials:{accessKeyId:'local',secretAccessKey:'local'},maxAttempts:1,requestHandler:{connectionTimeout:1000,requestTimeout:1000,throwOnRequestTimeout:true}});
}
const sk=(sequence:number)=>`ADJ#${String(sequence).padStart(7,'0')}`;
export function createDynamoStore(config:DynamoConfig):Store&{close():void}{
  const raw=createLocalClient(config),doc=DynamoDBDocumentClient.from(raw),TableName=config.tableName;
  const options=(signal?:AbortSignal)=>({abortSignal:signal?AbortSignal.any([signal,AbortSignal.timeout(1000)]):AbortSignal.timeout(1000)});
  return {
    close:()=>raw.destroy(),
    async getAccount(id,signal){const r=await doc.send(new GetCommand({TableName,Key:{PK:`ACCOUNT#${id}`,SK:'STATE'},ConsistentRead:true}),options(signal));if(!r.Item)return null;const {PK,SK,...state}=r.Item;return state as AccountState;},
    async getReceipt(actorId,requestId,signal){const r=await doc.send(new GetCommand({TableName,Key:{PK:`REQUEST#${actorId}`,SK:requestId},ConsistentRead:true}),options(signal));return r.Item?{request:r.Item.request,result:r.Item.result} as Receipt:null;},
    async queryHistory(id,upperBound,beforeSequence,take,signal){
      const high=Math.min(upperBound,beforeSequence-1);if(high<1)return [];
      const r=await doc.send(new QueryCommand({TableName,KeyConditionExpression:'PK = :pk AND SK BETWEEN :low AND :high',ExpressionAttributeValues:{':pk':`ACCOUNT#${id}`,':low':sk(1),':high':sk(high)},ConsistentRead:true,ScanIndexForward:false,Limit:take}),options(signal));
      return (r.Items??[]).map(({PK,SK,...result})=>result as AdjustmentResult);
    },
    async commitAdjustment(expected,result,request,signal){
      try{await doc.send(new TransactWriteCommand({TransactItems:[
        {Update:{TableName,Key:{PK:`ACCOUNT#${expected.id}`,SK:'STATE'},UpdateExpression:'SET balance = :balance, #seq = :next',ConditionExpression:'#seq = :old AND :balance BETWEEN :zero AND :max AND :next <= :maxseq',ExpressionAttributeNames:{'#seq':'sequence'},ExpressionAttributeValues:{':balance':result.balanceAfter,':next':result.sequence,':old':expected.sequence,':zero':0,':max':MAX_BALANCE,':maxseq':MAX_SEQUENCE}}},
        {Put:{TableName,Item:{PK:`ACCOUNT#${result.accountId}`,SK:sk(result.sequence),...result},ConditionExpression:'attribute_not_exists(PK)'}},
        {Put:{TableName,Item:{PK:`REQUEST#${request.actorId}`,SK:result.requestId,request,result},ConditionExpression:'attribute_not_exists(PK)'}}
      ]}),options(signal));}
      catch(error){
        const e=error as {name?:string;CancellationReasons?:{Code?:string}[]};
        if(e.name==='TransactionConflictException'||e.name==='TransactionCanceledException'&&e.CancellationReasons?.some(r=>r.Code==='ConditionalCheckFailed'||r.Code==='TransactionConflict')&&e.CancellationReasons.every(r=>['None','ConditionalCheckFailed','TransactionConflict'].includes(r.Code??'None')))throw new StoreConflict();
        if(['AbortError','TimeoutError','NetworkingError'].includes(e.name??'')||!(error instanceof Error)||!('$metadata' in error))throw new StoreOutcomeUnknown();
        throw error;
      }
    }
  };
}
