import assert from 'node:assert/strict';import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';import {setTimeout as delay} from 'node:timers/promises';import {createConnection} from 'node:net';
import {seed} from './seed.js';import {readState} from './read-state.js';import {caseBody,type RejectionCase} from './cases.js';import {writeReport} from './report.js';
const {compose}=await import(pathToFileURL(resolve('scripts/compose.mjs')).href);
const {loadRuntime}=await import(pathToFileURL(resolve('scripts/local.mjs')).href);
export interface OwnedRuntime {project:string;envPath?:string;dbPort?:number;appPort?:number;deadline?:number}
type Command=(runtime:OwnedRuntime,args:string[])=>unknown|Promise<unknown>;
export async function withOwnedCleanup<T>(runtime:OwnedRuntime,run:()=>Promise<T>,command:Command=compose):Promise<T>{
  if(!/^p26-[a-z0-9-]+$/.test(runtime.project))throw new Error('Expected owned p26 project');
  try{return await run();}finally{await command({...runtime,deadline:undefined},['down','--remove-orphans']);}
}
export function redact(value:unknown,secrets:string[]):unknown {let text=JSON.stringify(value);for(const secret of secrets)if(secret)text=text.replaceAll(secret,'[REDACTED]');return JSON.parse(text);}
export interface RunConfig {runId:string;runtime:OwnedRuntime&{envPath:string;dbPort:number;appPort:number};outputDir:string;fixturePath:string;expectedPath:string}
export interface RunResult {runId:string;source:string;startedAt:string;endedAt?:string;durationMs?:number;status:string;groups:any[];requests:any[];readbacks:number;tables:string[];[key:string]:unknown}
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const git=(...args:string[])=>execFileSync('git',args,{encoding:'utf8'}).trim();
const fields='accountId sequence requestId delta reason balanceAfter';
function envValues(path:string):Record<string,string>{return Object.fromEntries(readFileSync(path,'utf8').split(/\r?\n/).filter(Boolean).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));}
function setEnv(path:string,values:Record<string,string>){const env={...envValues(path),...values};writeFileSync(path,Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n')+'\n');}
async function closed(port:number):Promise<boolean>{return new Promise(ok=>{const socket=createConnection({host:'127.0.0.1',port});socket.setTimeout(500);socket.once('connect',()=>{socket.destroy();ok(false);});socket.once('error',()=>{socket.destroy();ok(true);});socket.once('timeout',()=>{socket.destroy();ok(true);});});}
export async function runAcceptance(config:RunConfig):Promise<RunResult>{
  const {runtime,runId}=config,started=Date.now();runtime.deadline=started+900_000;
  const fixture=JSON.parse(readFileSync(config.fixturePath,'utf8')),expected=JSON.parse(readFileSync(config.expectedPath,'utf8'));
  const env=envValues(runtime.envPath),secrets=[env.ALICE_TOKEN,env.BOB_TOKEN,env.OP_TOKEN,env.CURSOR_SECRET];
  const tokens:Record<string,string>={alice:env.ALICE_TOKEN,bob:env.BOB_TOKEN,op:env.OP_TOKEN,unknown:'unknown'};
  const secret=Buffer.from(env.CURSOR_SECRET,'hex');const url=`http://127.0.0.1:${runtime.appPort}/graphql`;
  process.env.P26_ENDPOINT=`http://127.0.0.1:${runtime.dbPort}`;
  const result:RunResult={runId,source:git('rev-parse','HEAD'),startedAt:new Date(started).toISOString(),status:'running',groups:[],requests:[],readbacks:0,tables:[],fixtureHash:hash(config.fixturePath),expectedHash:hash(config.expectedPath),lockHash:hash('package-lock.json'),node:process.version,images:compose(runtime,['images','--format','json'])};
  let group='',table='',activeApp=false,activeGroup='';const events:any[]=[];result.events=events;
  const checkDeadline=()=>assert.ok(Date.now()<runtime.deadline!,'Acceptance deadline exceeded');
  function collectLogs(){if(!activeApp)return;const lines=compose(runtime,['logs','--no-color','--no-log-prefix','app']).split(/\r?\n/);for(const line of lines)try{events.push({group:activeGroup,table,...JSON.parse(line)});}catch{}activeApp=false;}
  async function ready(){const end=Math.min(Date.now()+60_000,runtime.deadline!);while(Date.now()<end){try{if((await fetch(url.replace('/graphql','/healthz'),{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}await delay(150);}throw new Error('Application readiness exceeded 60 seconds');}
  async function startTable(suffix:string,overrides:{seedBalance?:number;seedSequence?:number}={},barrier=''){
    checkDeadline();collectLogs();table=`${runId}-${suffix}`;result.tables.push(table);
    await seed(table,[{id:'A',openingBalance:overrides.seedBalance??100,balance:overrides.seedBalance??100,sequence:overrides.seedSequence??0},{id:'B',openingBalance:50,balance:50,sequence:0}]);
    setEnv(runtime.envPath,{TABLE_NAME:table,BARRIER_ID:barrier,ACCEPTANCE_PROFILE:barrier?'1':'0'});
    compose(runtime,['up','-d','--no-deps','app']);await ready();activeApp=true;activeGroup=group;
  }
  const snapshot=async()=>{checkDeadline();result.readbacks++;return readState(table);};
  async function request(payload:any,actor='op',options:{method?:string;raw?:string;headers?:Record<string,string>;phase?:string;timeout?:number}={}){
    checkDeadline();const query=payload?.query??'';const row:any={group,table,actor,kind:query.startsWith('mutation')?'mutation':query?'read':'transport',phase:options.phase??'business',request:payload};result.requests.push(row);
    const headers:Record<string,string>={'content-type':'application/json',...options.headers};if(actor!=='missing')headers.authorization=`Bearer ${tokens[actor]}`;
    try{const response=await fetch(url,{method:options.method??'POST',headers,...(options.method==='GET'?{}:{body:options.raw??JSON.stringify(payload)}),signal:AbortSignal.timeout(options.timeout??10_000)});const body=await response.json() as any;row.status=response.status;row.response=body;return {status:response.status,body};}
    catch(error){row.outcome='response-lost';row.error=String(error);throw error;}
  }
  const adjust=(requestId:string,delta:number,accountId='A',reason='correction',phase='business',timeout?:number)=>request({query:fixture.mutation,variables:{i:{accountId,delta,reason,requestId}}},'op',{phase,timeout});
  const account=(id:string,actor:string)=>request({query:`{account(id:"${id}"){balance sequence}}`},actor);
  async function stateMatches(key:string){const actual=await snapshot(),want=expected[key];assert.deepEqual(actual.accounts.map(a=>a.balance),want.balances);assert.deepEqual(actual.accounts.map(a=>a.sequence),want.sequences);assert.equal(actual.history.length,want.effects);assert.equal(actual.receipts.length,want.effects);return actual;}
  async function runGroup(name:string,fn:()=>Promise<unknown>){group=name;checkDeadline();const began=Date.now();console.log(`Starting ${name}`);const entry:any={name,status:'running'};result.groups.push(entry);try{entry.details=await fn();entry.status='passed';}catch(e){entry.status='failed';entry.error=String(e);throw e;}finally{entry.durationMs=Date.now()-began;}}
  try{await withOwnedCleanup(runtime,async()=>{
    await runGroup('A1',async()=>{await startTable('a1');assert.equal((await account('A','alice')).body.data.account.balance,100);assert.equal((await account('B','bob')).body.data.account.balance,50);await adjust('a1-plus',20);await adjust('a1-minus',-5);return stateMatches('A1');});
    await runGroup('A2',async()=>{
      const outcomes=[];
      for(const c of fixture.rejections as RejectionCase[]){await startTable(`a2-${c.id}`,c);if(c.setupReceipt)await adjust('r1',7,'A','correction','setup');const before=await snapshot();
        const response=await request(caseBody(c,secret),c.actor,{method:c.method,raw:c.raw,headers:c.headers});assert.equal(response.status,c.status,c.id);if(c.code)assert.equal(response.body.errors?.[0]?.extensions?.code,c.code,c.id);
        assert.deepEqual(await snapshot(),before,`${c.id}: rejected operation changed storage`);
        if(c.code==='FORBIDDEN'&&response.body.data?.account!==undefined)assert.equal(response.body.data.account,null,c.id);
        outcomes.push({id:c.id,status:response.status,code:response.body.errors?.[0]?.extensions?.code});
      }return {cases:outcomes};
    });
    await runGroup('A3',async()=>{
      await startTable('a3');for(let i=1;i<=5;i++)await adjust(`inc${i}`,1);
      const page=(after?:string)=>request({query:`query($after:String){account(id:"A"){balance history(first:2,after:$after){upperBound edges{cursor node{sequence}} pageInfo{hasNextPage endCursor}}}}`,variables:{after}},'alice');
      const first=(await page()).body.data.account.history;await adjust('newer',10);const second=(await page(first.pageInfo.endCursor)).body.data.account.history;const third=(await page(second.pageInfo.endCursor)).body.data.account.history;
      assert.deepEqual([first,second,third].map(p=>p.edges.map((e:any)=>e.node.sequence)),expected.A3.pages);assert.equal(third.upperBound,5);assert.equal(third.pageInfo.hasNextPage,false);assert.equal((await page()).body.data.account.history.edges[0].node.sequence,6);
      const partial=await request({query:'{account(id:"A"){balance history(after:"bad"){upperBound}}}'},'alice');assert.equal(partial.body.data.account.balance,115);assert.equal(partial.body.data.account.history,null);return stateMatches('A3');
    });
    await runGroup('A4',async()=>{
      await startTable('a4');const replies=await Promise.all(Array.from({length:4},()=>adjust('r1',7)));for(const reply of replies)assert.deepEqual(reply.body,replies[0].body);assert.equal(replies[0].body.data.adjustPoints.balanceAfter,107);
      for(const [delta,id,reason] of [[8,'A','correction'],[7,'A','changed'],[7,'B','correction']] as const){const r=await adjust('r1',delta,id,reason);assert.equal(r.body.errors[0].extensions.code,'CONFLICTING_REQUEST');}
      await adjust('r2',1);assert.deepEqual((await adjust('r1',7)).body,replies[0].body);return stateMatches('A4');
    });
    await runGroup('A5',async()=>{
      await startTable('a5');for(let base=1;base<=8;base+=4){const replies=await Promise.all(Array.from({length:4},(_,i)=>adjust(`inc${base+i}`,1)));for(const r of replies)assert.ok(r.body.data?.adjustPoints);}
      const debits=await Promise.all(['debit1','debit2'].map(id=>adjust(id,-40,'B','debit')));assert.equal(debits.filter(r=>r.body.data?.adjustPoints).length,1);assert.equal(debits.find(r=>r.body.errors)?.body.errors[0].extensions.code,'INSUFFICIENT_POINTS');
      const s=await stateMatches('A5');assert.deepEqual(s.history.filter(a=>a.accountId==='A').map(a=>a.sequence),[1,2,3,4,5,6,7,8]);return s;
    });
    await runGroup('A6',async()=>{
      await startTable('a6',{},'r1');let settled=false;
      const inflight=adjust('r1',9,'A','correction','business',30_000).then(value=>{settled=true;return {kind:'response',value};},error=>{settled=true;return {kind:'lost',error:String(error)};});
      const end=Date.now()+15_000;let committed:any;
      while(Date.now()<end){const s=await snapshot();if(s.receipts.length===1){committed=s;break;}await delay(100);}
      assert.ok(committed,'No committed receipt within barrier bound');assert.equal(committed.accounts[0].balance,109);assert.equal(settled,false,'Response completed before actual kill');
      const logs=compose(runtime,['logs','--no-color','--tail','20','app']);assert.ok(logs.includes('committed-barrier'));
      const containerId=compose(runtime,['ps','-q','app']).trim();assert.match(containerId,/^[a-f0-9]{12,64}$/);compose(runtime,['kill','-s','SIGKILL','app']);const socketOutcome=await inflight;assert.equal(socketOutcome.kind,'lost');collectLogs();
      compose(runtime,['stop','db']);compose(runtime,['up','-d','db']);
      const databaseDeadline=Math.min(Date.now()+60_000,runtime.deadline!);let databaseReady=false;
      while(Date.now()<databaseDeadline){try{await snapshot();databaseReady=true;break;}catch{}await delay(150);}
      assert.ok(databaseReady,'Database restart exceeded readiness bound');
      setEnv(runtime.envPath,{BARRIER_ID:'',ACCEPTANCE_PROFILE:'0'});compose(runtime,['up','-d','--no-deps','app']);await ready();activeApp=true;activeGroup=group;
      const replay=await adjust('r1',9);assert.deepEqual(replay.body.data.adjustPoints,committed.receipts[0].result);assert.equal((await account('A','alice')).body.data.account.balance,109);
      return {containerId,socketOutcome,beforeKill:committed,afterReplay:await stateMatches('A6')};
    });
    collectLogs();
  },async(r,args)=>{try{collectLogs();}finally{compose(r,args);}});
    await runGroup('A7',async()=>{assert.equal(compose({...runtime,deadline:undefined},['ps','-q']).trim(),'');for(const port of [runtime.appPort,runtime.dbPort]){let stopped=false;for(let n=0;n<30;n++){if(await closed(port)){stopped=true;break;}await delay(100);}assert.ok(stopped,`Owned port ${port} still listening`);}return {ownedContainersRunning:0,portsClosed:true,retainedVolume:`${runtime.project}_data`,evidencePreserved:true};});result.status='passed';
  }catch(error){result.status='failed';result.error=String(error);}
  for(const name of ['A1','A2','A3','A4','A5','A6','A7'])if(!result.groups.some(g=>g.name===name))result.groups.push({name,status:'not-run'});
  result.endedAt=new Date().toISOString();result.durationMs=Date.now()-started;if(result.durationMs>900_000){result.status='failed';result.error='Acceptance exceeded fifteen-minute wall-clock ceiling';}
  const mutationRows=result.requests.filter(r=>r.kind==='mutation'&&r.phase==='business'),successes=mutationRows.filter(r=>r.response?.data?.adjustPoints);
  const effects=result.groups.filter(g=>['A1','A3','A4','A5','A6'].includes(g.name)&&g.status==='passed').reduce((n,g)=>n+(g.name==='A6'?g.details.afterReplay.history.length:g.details.history.length),0);
  const seen=new Set<string>();let replayResponses=0;
  for(const r of successes){const id=r.response.data.adjustPoints.requestId,key=`${r.table}:${id}`;if(seen.has(key)||mutationRows.some(prior=>prior.table===r.table&&prior.outcome==='response-lost'&&prior.request?.variables?.i?.requestId===id))replayResponses++;seen.add(key);}
  result.counters={businessRequests:result.requests.filter(r=>r.phase==='business').length,setupRequests:result.requests.filter(r=>r.phase==='setup').length,mutationSubmissions:mutationRows.length,successfulMutationResponses:successes.length,rejectedMutationResponses:mutationRows.filter(r=>r.response?.errors).length,successfulReplayResponses:replayResponses,responseLost:result.requests.filter(r=>r.outcome==='response-lost').length,verifiedBusinessEffects:effects,transactionSubmissionsIncludingSetup:events.filter(e=>e.event==='transaction-attempt').length};
  await writeReport(redact(result,secrets),config.outputDir);return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  assert.equal(git('status','--porcelain'),'','Commit executable source and fixtures before acceptance');
  const runtime=loadRuntime();console.log(compose(runtime,['build','app']));
  const runId=`${runtime.project}-run-${randomBytes(4).toString('hex')}`,outputDir=resolve('.local/runs',runId);assert.equal(existsSync(outputDir),false);
  const result=await runAcceptance({runId,runtime,outputDir,fixturePath:resolve('fixtures/acceptance.json'),expectedPath:resolve('fixtures/expected.json')});
  console.log(JSON.stringify({status:result.status,groups:result.groups.map(g=>({name:g.name,status:g.status})),durationMs:result.durationMs,outputDir}));process.exitCode=result.status==='passed'?0:1;
}
