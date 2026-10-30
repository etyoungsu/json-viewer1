const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dist=path.resolve(__dirname,'..');const read=n=>fs.readFileSync(path.join(dist,n),'utf8');
const version=read('app.js').match(/const BUILD_VERSION='([^']+)'/)[1];
assert(read('index.html').includes('app.js?v='+version));assert(read('index.html').includes('style.css?v='+version));
assert(read('app.js').includes('worker.js?v='+version));assert(read('worker.js').includes("BUILD_VERSION='"+version+"'"));
for(const name of ['parser.js','tree-model.js','markdown.js'])assert(read('worker.js').includes(name+'?v='+version));
console.log('PASS UI, CSS, worker and Markdown imports share the same release');
