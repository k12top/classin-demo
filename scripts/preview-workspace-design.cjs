// Local-only visual review of the actual React components, with synthetic data.
// No authentication credentials, database, provider API or backend writes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-design-'));
async function main() {
  const mocks = {
    'next/navigation': `const router={push:p=>location.assign(p),replace:p=>location.replace(p)};export const useRouter=()=>router;export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>location.pathname;`,
    '@/lib/auth-context': `export const useAuth=()=>({user:window.designUser,loading:false,logout:async()=>{}});`,
    '@/lib/auth-login': `export const redirectToSsoLogin=()=>{};`,
    '@/lib/auth-refresh-client': `export const tryOAuthRefresh=async()=>false;`,
  };
  const bundle = await esbuild.build({entryPoints:[path.join(root,'tests/fixtures/workspace-design.tsx')],bundle:true,write:false,outfile:path.join(cache,'app.js'),format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'design-fixtures',setup(build){build.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);build.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:root}));}}]});
  execFileSync(process.execPath,[require.resolve('tailwindcss/lib/cli.js'),'-i','src/app/globals.css','-o',path.join(cache,'globals.css'),'--minify'],{cwd:root,stdio:'pipe'});
  const css=fs.readFileSync(path.join(cache,'globals.css'))+'\n'+bundle.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(req.method!=='GET'){res.writeHead(405);return res.end('Design preview is read-only');}
    if(url.pathname==='/app.js'){res.setHeader('content-type','text/javascript');return res.end(bundle.outputFiles.find(f=>f.path.endsWith('.js')).contents);}
    if(url.pathname==='/app.css'){res.setHeader('content-type','text/css');return res.end(css);}
    if(url.pathname.startsWith('/api/')){res.writeHead(404,{'content-type':'application/json'});return res.end('{"error":"Not part of the design fixture"}');}
    if(/^\/(workspace|classroom)\/[a-zA-Z0-9_./-]+$/.test(url.pathname)&&!url.pathname.includes('..')){
      const file=path.join(root,'public',url.pathname);if(fs.existsSync(file)&&fs.statSync(file).isFile()){res.setHeader('content-type',file.endsWith('.svg')?'image/svg+xml':'image/png');return fs.createReadStream(file).pipe(res);}
    }
    res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>课堂工作台 · 设计演示数据</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  server.listen(Number(process.env.DESIGN_PORT||3190),'127.0.0.1',()=>console.log(`Read-only component preview: http://127.0.0.1:${server.address().port}`));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.closeAllConnections();server.close(()=>{fs.rmSync(cache,{recursive:true,force:true});process.exit(0);});});
}
main().catch(error=>{console.error(error);fs.rmSync(cache,{recursive:true,force:true});process.exitCode=1;});
