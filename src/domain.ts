export type AccountId='A'|'B';
export type Actor=Readonly<{id:'alice'|'bob'|'op';role:'member'|'operator';accountId?:AccountId}>;
export interface AccountState {id:AccountId;openingBalance:number;balance:number;sequence:number}
export interface AdjustInput {accountId:string;delta:number;reason:string;requestId:string}
export interface CanonicalRequest {version:1;actorId:Actor['id'];accountId:AccountId;delta:number;reason:string}
export interface AdjustmentResult {accountId:AccountId;sequence:number;requestId:string;delta:number;reason:string;balanceAfter:number}
export interface Receipt {request:CanonicalRequest;result:AdjustmentResult}
export const MAX_BALANCE=1_000_000,MAX_SEQUENCE=1_000_000,MAX_DELTA=1_000;
export type ErrorCode='UNAUTHENTICATED'|'FORBIDDEN'|'NOT_FOUND'|'BAD_USER_INPUT'|'INVALID_CURSOR'|'INSUFFICIENT_POINTS'|'BALANCE_LIMIT'|'SEQUENCE_LIMIT'|'CONFLICTING_REQUEST'|'RETRYABLE_CONFLICT'|'OUTCOME_UNKNOWN'|'INTERNAL_ERROR';
export class DomainError extends Error {
  constructor(public readonly code:ErrorCode){super(code);this.name='DomainError';}
}
export function accountId(value:string):AccountId {
  if(value!=='A'&&value!=='B')throw new DomainError('NOT_FOUND');return value;
}
export function validateAdjustment(actor:Actor,input:AdjustInput):CanonicalRequest {
  const id=accountId(input.accountId);
  if(!Number.isInteger(input.delta)||input.delta===0||Math.abs(input.delta)>MAX_DELTA||
    typeof input.reason!=='string'||!/^[\x20-\x7e]{1,120}$/.test(input.reason)||input.reason.trim()!==input.reason||
    typeof input.requestId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(input.requestId))throw new DomainError('BAD_USER_INPUT');
  return {version:1,actorId:actor.id,accountId:id,delta:input.delta,reason:input.reason};
}
