import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {compose,root} from './compose.mjs';
export const runtimeFile=resolve(root,'.local/runtime.json');
export function loadRuntime(){return JSON.parse(readFileSync(runtimeFile,'utf8'));}
async function freePort(){const s=createServer();await new Promise((ok,fail)=>s.once('error',fail).listen(0,'127.0.0.1',ok));const port=s.address().port;await new Promise(ok=>s.close(ok));return port;}
export async function createRuntime(){
  mkdirSync(resolve(root,'.local'),{recursive:true});
  const runtime={project:`p26-${Date.now().toString(36)}`,dbPort:await freePort(),appPort:await freePort(),envPath:resolve(root,'.local/runtime.env')};
  const secret=()=>randomBytes(32).toString('hex');
  writeFileSync(runtime.envPath,`DDB_PORT=${runtime.dbPort}\nAPP_PORT=${runtime.appPort}\nALICE_TOKEN=${secret()}\nBOB_TOKEN=${secret()}\nOP_TOKEN=${secret()}\nCURSOR_SECRET=${secret()}\nTABLE_NAME=${runtime.project}-manual\nBARRIER_ID=\n`);
  writeFileSync(runtimeFile,JSON.stringify(runtime,null,2));return runtime;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const action=process.argv[2];
  if(action==='up'){const r=existsSync(runtimeFile)?loadRuntime():await createRuntime();console.log(compose(r,['up','-d','db']));console.log(`Local database inspection port: ${r.dbPort}`);}
  else if(action==='down'){console.log(compose(loadRuntime(),['down','--remove-orphans']));}
  else throw new Error('Use up or down');
}
