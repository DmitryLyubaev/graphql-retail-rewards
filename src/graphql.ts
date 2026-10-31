import {readFileSync} from 'node:fs';
import type {IncomingMessage,RequestListener,ServerResponse} from 'node:http';
import {GraphQLError,parse,validate} from 'graphql';
import {createSchema,createYoga} from 'graphql-yoga';
import {authenticate} from './auth.js';import {DomainError,type Actor} from './domain.js';import type {RewardsService} from './rewards.js';import {validateOperation} from './limits.js';
class HttpError extends Error {constructor(public status:number){super('Invalid HTTP request');}}
function body(req:IncomingMessage):Promise<Buffer>{
  return new Promise((resolve,reject)=>{let bytes=0,done=false;const chunks:Buffer[]=[];
    req.on('data',(chunk:Buffer)=>{if(done)return;bytes+=chunk.length;if(bytes>16384){done=true;chunks.length=0;reject(new HttpError(413));return;}chunks.push(chunk);});
    req.once('end',()=>{if(!done){done=true;resolve(Buffer.concat(chunks));}});
    req.once('error',reject);req.once('aborted',()=>reject(new HttpError(400)));
  });
}
function send(res:ServerResponse,status:number,code:string){res.writeHead(status,{'content-type':'application/json','connection':'close'});res.end(JSON.stringify({errors:[{message:code,extensions:{code}}]}));}
export function createGraphqlHandler(service:RewardsService,tokens:ReadonlyMap<string,Actor>):RequestListener {
  const call=async<T>(fn:()=>Promise<T>):Promise<T>=>{try{return await fn();}catch(error){const code=error instanceof DomainError?error.code:'INTERNAL_ERROR';throw new GraphQLError(code,{extensions:{code}});}};
  const schema=createSchema({typeDefs:readFileSync(new URL('./schema.graphql',import.meta.url),'utf8'),resolvers:{
    Query:{account:(_:unknown,{id}:{id:string},context:{actor:Actor})=>call(()=>service.readAccount(context.actor,id))},
    RewardsAccount:{history:(parent:{id:string},{first,after}:{first:number;after?:string|null},context:{actor:Actor})=>call(()=>service.history(context.actor,parent.id,first,after??undefined))},
    Mutation:{adjustPoints:(_:unknown,{input}:{input:any},context:{actor:Actor})=>call(()=>service.adjust(context.actor,input))}
  }});
  const yoga=createYoga({schema,graphiql:false,landingPage:false,batching:false,logging:false,context:({request})=>({actor:authenticate(request.headers.get('authorization')??undefined,tokens)})});
  return (req,res)=>{void(async()=>{
    try{
      if(req.url==='/healthz'){res.writeHead(200,{'content-type':'application/json'});res.end('{"live":true}');return;}
      if(req.url!=='/graphql'){send(res,404,'NOT_FOUND');return;}
      if(req.method!=='POST'){send(res,405,'METHOD_NOT_ALLOWED');return;}
      authenticate(req.headers.authorization,tokens);
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??'')){send(res,415,'UNSUPPORTED_MEDIA_TYPE');return;}
      const raw=await body(req);let payload:any;
      try{payload=JSON.parse(raw.toString('utf8'));}catch{throw new HttpError(400);}
      if(!payload||Array.isArray(payload)||typeof payload.query!=='string'||payload.operationName!==undefined&&typeof payload.operationName!=='string')throw new HttpError(400);
      try{const document=parse(payload.query,{maxTokens:2000});validateOperation(document,payload.operationName);if(validate(schema,document).length)throw new Error();}catch{throw new HttpError(400);}
      const response=await yoga.fetch('http://local/graphql',{method:'POST',headers:{'content-type':'application/json','accept':'application/graphql-response+json','authorization':req.headers.authorization!},body:raw.toString('utf8')});
      res.writeHead(response.status,{'content-type':'application/json'});res.end(await response.text());
    }catch(error){if(!res.headersSent){if(error instanceof DomainError)send(res,401,error.code);else if(error instanceof HttpError)send(res,error.status,'BAD_REQUEST');else send(res,500,'INTERNAL_ERROR');}else res.destroy();}
  })();};
}
