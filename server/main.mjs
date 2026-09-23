import { resolve } from 'node:path';
import { createAppServer, ROOT } from './app.mjs';

// Environment already supplied by the launcher wins over ignored local files.
if (process.env.OPENAI_API_KEY===undefined) {
  for (const name of ['.env','.env.hackalem']) {
    try {process.loadEnvFile(resolve(ROOT,name));} catch(error) {if(error.code!=='ENOENT') console.error(`Could not load ${name}; continuing without it.`);}
    if(process.env.OPENAI_API_KEY!==undefined) break;
  }
}
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535) throw new Error('PORT must be between 1 and 65535.');
const server=createAppServer();
server.listen(port,'127.0.0.1',()=>console.log(`Akim Lab: http://localhost:${port} (AI ${process.env.OPENAI_API_KEY?'configured':'offline'})`));
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is busy. Set PORT to another port.`:'Server failed to start.');process.exitCode=1;});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));
