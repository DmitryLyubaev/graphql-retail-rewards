import {createHmac,timingSafeEqual} from 'node:crypto';
import {DomainError,MAX_SEQUENCE,type Actor,type AccountId,type AdjustmentResult} from './domain.js';
export interface CursorPayload {version:1;actorId:Actor['id'];accountId:AccountId;upperBound:number;beforeSequence:number}
export interface Connection {upperBound:number;edges:{node:AdjustmentResult;cursor:string}[];pageInfo:{hasNextPage:boolean;endCursor:string|null}}
function valid(p:unknown):p is CursorPayload {
  if(!p||typeof p!=='object'||Array.isArray(p))return false;const x=p as CursorPayload;
  return Object.keys(x).sort().join(',')==='accountId,actorId,beforeSequence,upperBound,version'&&x.version===1&&['alice','bob','op'].includes(x.actorId)&&['A','B'].includes(x.accountId)&&Number.isInteger(x.upperBound)&&x.upperBound>=1&&x.upperBound<=MAX_SEQUENCE&&Number.isInteger(x.beforeSequence)&&x.beforeSequence>=1&&x.beforeSequence<=x.upperBound;
}
export function encodeCursor(payload:CursorPayload,secret:Uint8Array):string {
  if(!valid(payload)||secret.byteLength<32)throw new DomainError('INVALID_CURSOR');
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');return `${body}.${createHmac('sha256',secret).update(body).digest('base64url')}`;
}
export function decodeCursor(text:string,actor:Actor,id:AccountId,secret:Uint8Array):CursorPayload {
  try{
    if(typeof text!=='string'||text.length>1024||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/.test(text)||secret.byteLength<32)throw new Error();
    const [body,signature]=text.split('.');const decoded=Buffer.from(body,'base64url');const tag=Buffer.from(signature,'base64url');
    if(decoded.toString('base64url')!==body||tag.toString('base64url')!==signature||!timingSafeEqual(tag,createHmac('sha256',secret).update(body).digest()))throw new Error();
    const payload:unknown=JSON.parse(decoded.toString('utf8'));if(!valid(payload)||payload.actorId!==actor.id||payload.accountId!==id)throw new Error();return payload;
  }catch{throw new DomainError('INVALID_CURSOR');}
}
