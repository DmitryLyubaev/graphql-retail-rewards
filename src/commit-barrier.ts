import type {AdjustmentResult} from './domain.js';
export function createCommitBarrier(requestId:string,log:(event:object)=>void):(result:AdjustmentResult)=>Promise<void>{
  return async result=>{if(result.requestId===requestId){log({event:'committed-barrier',requestId});await new Promise<void>(()=>{});}};
}
