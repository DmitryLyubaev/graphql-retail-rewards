import {CreateTableCommand} from '@aws-sdk/client-dynamodb';import {DynamoDBDocumentClient,PutCommand} from '@aws-sdk/lib-dynamodb';
import {createLocalClient,type DynamoConfig} from '../src/dynamodb.js';import type {AccountState} from '../src/domain.js';
export function hostConfig(tableName:string):DynamoConfig {
  if(!process.env.P26_ENDPOINT)throw new Error('P26_ENDPOINT must explicitly name the local inspection endpoint');
  return {tableName,endpoint:process.env.P26_ENDPOINT,region:'local',credentials:{accessKeyId:'local',secretAccessKey:'local'}};
}
export async function seed(tableName:string,states:AccountState[]=[{id:'A',openingBalance:100,balance:100,sequence:0},{id:'B',openingBalance:50,balance:50,sequence:0}]){
  const raw=createLocalClient(hostConfig(tableName)),doc=DynamoDBDocumentClient.from(raw);
  try{await raw.send(new CreateTableCommand({TableName:tableName,KeySchema:[{AttributeName:'PK',KeyType:'HASH'},{AttributeName:'SK',KeyType:'RANGE'}],AttributeDefinitions:[{AttributeName:'PK',AttributeType:'S'},{AttributeName:'SK',AttributeType:'S'}],BillingMode:'PAY_PER_REQUEST'}));
    for(const state of states)await doc.send(new PutCommand({TableName:tableName,Item:{PK:`ACCOUNT#${state.id}`,SK:'STATE',...state}}));
  }finally{raw.destroy();}
}
