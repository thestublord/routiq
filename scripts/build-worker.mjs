import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const assets={};
async function collect(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const filename=path.join(dir,entry.name);
    if(entry.isDirectory()){
      if(entry.name!=='server'&&!entry.name.startsWith('.'))await collect(filename);
    }else{
      const extension=path.extname(filename),type=types[extension];
      if(!type)continue;
      const bytes=await readFile(filename);
      assets['/'+path.relative('dist',filename).split(path.sep).join('/')]=[type,bytes.toString(extension==='.png'?'base64':'utf8')];
    }
  }
}
await collect('dist');
const worker=await readFile('worker/main.mjs','utf8');
await mkdir('dist/server',{recursive:true});
await writeFile('dist/server/index.js','const STATIC_FILES='+JSON.stringify(assets)+';\n'+worker);
