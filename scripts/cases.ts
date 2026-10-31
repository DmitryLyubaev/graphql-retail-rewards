import {encodeCursor} from '../src/cursor.js';
export interface RejectionCase {id:string;actor:string;status:number;code?:string;request:any;raw?:string;method?:string;headers?:Record<string,string>;setupReceipt?:boolean;seedBalance?:number;seedSequence?:number}
export function caseBody(c:RejectionCase,secret:Uint8Array):unknown {
  const request=structuredClone(c.request);const marker=request?.variables?.after;
  if(typeof marker==='string'&&marker.startsWith('#cursor-')){
    const kind=marker.slice(8);
    const cursor=encodeCursor({version:1,actorId:kind==='wrong-actor'?'op':'alice',accountId:kind==='wrong-account'?'B':'A',upperBound:1,beforeSequence:1},secret);
    request.variables.after=kind==='malformed'?'bad':kind==='oversized'?'x'.repeat(1025):kind==='tampered'?cursor+'x':cursor;
  }return request;
}
