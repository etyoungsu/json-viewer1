/* Keep HTML, UI, Worker and Worker imports on one content-addressed release. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const dist=path.resolve(__dirname,'..');
const names=fs.readdirSync(dist).filter(n=>/\.(js|css)$/.test(n)).sort();
const normalize=s=>s.replace(/const BUILD_VERSION='[^']*';/g,"const BUILD_VERSION='BUILD';").replace(/(\.\/[\w-]+\.(?:js|css))\?v=[\w-]+/g,'$1');
const hash=crypto.createHash('sha256');for(const n of names)hash.update(n+'\n'+normalize(fs.readFileSync(path.join(dist,n),'utf8')));
const version=hash.digest('hex').slice(0,16);
for(const name of ['app.js','worker.js']){
 const file=path.join(dist,name);let s=normalize(fs.readFileSync(file,'utf8')).replace("const BUILD_VERSION='BUILD';",`const BUILD_VERSION='${version}';`);
 if(name==='app.js')s=s.replace("new Worker('./worker.js')",`new Worker('./worker.js?v=${version}')`);
 else s=s.replace(/importScripts\(([^)]*)\);/,(_,list)=>'importScripts('+list.replace(/(\.\/[\w-]+\.js)/g,`$1?v=${version}`)+');');
 fs.writeFileSync(file,s);
}
const file=path.join(dist,'index.html');const html=normalize(fs.readFileSync(file,'utf8')).replace(/(\.\/(?:app\.js|style\.css))/g,`$1?v=${version}`);fs.writeFileSync(file,html);
console.log('Asset release '+version);
