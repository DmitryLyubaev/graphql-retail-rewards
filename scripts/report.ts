import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';
export async function writeReport(result:unknown,outputDir:string):Promise<void>{await mkdir(outputDir,{recursive:true});await writeFile(resolve(outputDir,'result.json'),JSON.stringify(result,null,2)+'\n');}
