import type {AccountId,AccountState,Actor,AdjustmentResult,CanonicalRequest,Receipt} from './domain.js';
export class StoreConflict extends Error {}
export class StoreOutcomeUnknown extends Error {}
export interface Store {
  getAccount(id:AccountId,signal?:AbortSignal):Promise<AccountState|null>;
  getReceipt(actorId:Actor['id'],requestId:string,signal?:AbortSignal):Promise<Receipt|null>;
  queryHistory(id:AccountId,upperBound:number,beforeSequence:number,take:number,signal?:AbortSignal):Promise<AdjustmentResult[]>;
  commitAdjustment(expected:AccountState,result:AdjustmentResult,request:CanonicalRequest,signal:AbortSignal):Promise<void>;
}
