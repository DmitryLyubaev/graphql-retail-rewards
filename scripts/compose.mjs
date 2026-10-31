import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
export const root=resolve(import.meta.dirname,'..');
const linuxPath=p=>p.replace(/^([A-Za-z]):/,(_,d)=>`/mnt/${d.toLowerCase()}`).replaceAll('\\','/');
export function compose(runtime,args){
  if(!/^p26-[a-z0-9-]+$/.test(runtime.project))throw new Error('Invalid owned project');
  const wsl=process.platform==='win32'&&!process.env.P26_DOCKER;
  const path=wsl?linuxPath:resolve;
  const dockerArgs=['compose','--project-directory',path(root),'--env-file',path(runtime.envPath),'-p',runtime.project,'-f',path(resolve(root,'compose.yaml')),...args];
  const command=wsl?'wsl.exe':process.env.P26_DOCKER||'docker';
  const commandArgs=wsl?['-d','Ubuntu','--','docker',...dockerArgs]:dockerArgs;
  const result=spawnSync(command,commandArgs,{encoding:'utf8',timeout:Math.max(1,Math.min(240_000,(runtime.deadline??Infinity)-Date.now())),maxBuffer:8*1024*1024});
  if(result.status!==0)throw new Error(`Compose ${args[0]} failed: ${result.stderr||result.error||result.stdout}`);
  return result.stdout;
}
