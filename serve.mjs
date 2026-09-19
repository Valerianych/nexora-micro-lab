import http from 'node:http';
import {stat,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = await realpath(fileURLToPath(new URL('./dist/',import.meta.url)));
const port = Number(process.env.PORT || 8080);
const host = process.env.NEXORA_HOST || '127.0.0.1';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const server = http.createServer(async (request,response) => {
  if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405,{Allow:'GET, HEAD'}).end(); return; }
  try {
    const url = new URL(request.url,'http://localhost');
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (relative.split('/').some(part=>part.startsWith('.'))) { response.writeHead(404).end(); return; }
    let file = path.resolve(root,relative);
    if (file !== root && !file.startsWith(root+path.sep)) { response.writeHead(404).end(); return; }
    let info = await stat(file);
    if (info.isDirectory()) { file=path.join(file,'index.html'); info=await stat(file); }
    file=await realpath(file);
    if (!file.startsWith(root+path.sep) || !info.isFile()) { response.writeHead(404).end(); return; }
    const etag = `"${info.size}-${Math.floor(info.mtimeMs)}"`;
    const headers = {'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache',ETag:etag,'X-Content-Type-Options':'nosniff'};
    if (request.headers['if-none-match'] === etag) { response.writeHead(304,headers).end(); return; }
    response.writeHead(200,{...headers,'Content-Length':info.size});
    if (request.method==='HEAD') { response.end(); return; }
    const stream=createReadStream(file); stream.on('error',()=>response.destroy()); stream.pipe(response);
  } catch { response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Файл не найден'); }
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Порт ${port} уже занят. Закрой другой сервер или укажи PORT.`:error.message);process.exitCode=1;});
server.listen(port,host,()=>console.log(`NEXORA: http://${host}:${port}\nОстановить: Ctrl+C`));
