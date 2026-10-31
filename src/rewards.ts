import {isDeepStrictEqual} from 'node:util';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {assertCanRead,assertCanAdjust} from './auth.js';
import {accountId,validateAdjustment,DomainError,MAX_BALANCE,MAX_SEQUENCE,type Actor,type AdjustInput,type AdjustmentResult,type CanonicalRequest,type Receipt} from './domain.js';
import {StoreConflict,StoreOutcomeUnknown,type Store} from './store.js';
export interface Runtime {now():number;sleep(ms:number,signal:AbortSignal):Promise<void>;random():number}
const defaultRuntime:Runtime={now:()=>performance.now(),sleep:async(ms,signal)=>{await delay(ms,undefined,{signal});},random:Math.random};
export function makeRewardsService({store,runtime=defaultRuntime,afterCommit}:{store:Store;cursorSecret:Uint8Array;runtime?:Runtime;afterCommit?:(result:AdjustmentResult)=>Promise<void>}){
  const replay=(receipt:Receipt|null,request:CanonicalRequest)=>{
    if(!receipt)return null;if(!isDeepStrictEqual(receipt.request,request))throw new DomainError('CONFLICTING_REQUEST');return receipt.result;
  };
  return {
    async readAccount(actor:Actor,id:string){assertCanRead(actor,id);const state=await store.getAccount(accountId(id));if(!state)throw new DomainError('NOT_FOUND');return state;},
    async adjust(actor:Actor,input:AdjustInput):Promise<AdjustmentResult>{
      assertCanAdjust(actor,input.accountId);const request=validateAdjustment(actor,input);
      const deadline=runtime.now()+5000,signal=AbortSignal.timeout(5000);
      const saved=async()=>replay(await store.getReceipt(actor.id,input.requestId,signal),request);
      for(let attempt=0;attempt<16;attempt++){
        if(runtime.now()>=deadline||signal.aborted)break;
        let existing;let state;
        try{existing=await saved();if(existing)return existing;state=await store.getAccount(request.accountId,signal);}
        catch(e){if(e instanceof DomainError)throw e;throw new DomainError('INTERNAL_ERROR');}
        if(!state)throw new DomainError('NOT_FOUND');const balanceAfter=state.balance+request.delta;
        if(balanceAfter<0)throw new DomainError('INSUFFICIENT_POINTS');
        if(balanceAfter>MAX_BALANCE)throw new DomainError('BALANCE_LIMIT');
        if(state.sequence>=MAX_SEQUENCE)throw new DomainError('SEQUENCE_LIMIT');
        const result:AdjustmentResult={accountId:request.accountId,sequence:state.sequence+1,requestId:input.requestId,delta:request.delta,reason:request.reason,balanceAfter};
        try{await store.commitAdjustment(state,result,request,signal);}
        catch(error){
          if(error instanceof StoreOutcomeUnknown){try{const found=await saved();if(found)return found;}catch(e){if(e instanceof DomainError)throw e;}throw new DomainError('OUTCOME_UNKNOWN');}
          if(!(error instanceof StoreConflict))throw new DomainError('INTERNAL_ERROR');
          if(runtime.now()<deadline&&!signal.aborted)try{await runtime.sleep(Math.min(50,Math.floor(runtime.random()*51),deadline-runtime.now()),signal);}catch{}
          continue;
        }
        await afterCommit?.(result);return result;
      }
      if(!signal.aborted&&runtime.now()<deadline){try{const found=await saved();if(found)return found;}catch(e){if(e instanceof DomainError)throw e;}}
      throw new DomainError('RETRYABLE_CONFLICT');
    }
  };
}
export type RewardsService=ReturnType<typeof makeRewardsService>;
