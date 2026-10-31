import {DynamoDBDocumentClient,GetCommand,QueryCommand} from '@aws-sdk/lib-dynamodb';
import {createLocalClient} from '../src/dynamodb.js';import {hostConfig} from './seed.js';
import type {AccountState,AdjustmentResult,Receipt} from '../src/domain.js';
export async function readState(tableName:string):Promise<{accounts:AccountState[];history:AdjustmentResult[];receipts:Receipt[]}>{
  const raw=createLocalClient(hostConfig(tableName)),doc=DynamoDBDocumentClient.from(raw);const result:{accounts:AccountState[];history:AdjustmentResult[];receipts:Receipt[]}={accounts:[],history:[],receipts:[]};
  try{
    for(const id of ['A','B']){
      const state=(await doc.send(new GetCommand({TableName:tableName,Key:{PK:`ACCOUNT#${id}`,SK:'STATE'},ConsistentRead:true}))).Item;
      if(state){const {PK,SK,...value}=state;result.accounts.push(value as AccountState);}
      const items=(await doc.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'PK = :pk AND begins_with(SK,:prefix)',ExpressionAttributeValues:{':pk':`ACCOUNT#${id}`,':prefix':'ADJ#'},ConsistentRead:true}))).Items??[];
      result.history.push(...items.map(({PK,SK,...value})=>value as AdjustmentResult));
    }
    for(const actor of ['alice','bob','op']){
      const items=(await doc.send(new QueryCommand({TableName:tableName,KeyConditionExpression:'PK = :pk',ExpressionAttributeValues:{':pk':`REQUEST#${actor}`},ConsistentRead:true}))).Items??[];
      result.receipts.push(...items.map(x=>({request:x.request,result:x.result} as Receipt)));
    }return result;
  }finally{raw.destroy();}
}
