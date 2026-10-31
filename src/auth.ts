import {DomainError,type Actor} from './domain.js';
export function authenticate(header:string|undefined,tokens:ReadonlyMap<string,Actor>):Actor {
  const match=header?.match(/^Bearer ([A-Za-z0-9_-]+)$/);const actor=match?tokens.get(match[1]):undefined;
  if(!actor)throw new DomainError('UNAUTHENTICATED');return Object.freeze({...actor});
}
export function assertCanRead(actor:Actor,id:string):void {
  if(actor.role!=='operator'&&(actor.role!=='member'||actor.accountId!==id))throw new DomainError('FORBIDDEN');
}
export function assertCanAdjust(actor:Actor,_id:string):void {
  if(actor.role!=='operator')throw new DomainError('FORBIDDEN');
}
