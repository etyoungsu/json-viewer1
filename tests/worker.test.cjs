const assert=require('node:assert/strict');
const {Worker}=require('node:worker_threads');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
function create(){return new Worker(`const {parentPort}=require('node:worker_threads');const fs=require('node:fs'),vm=require('node:vm');global.module=undefined;global.self=global;global.importScripts=(...files)=>files.forEach(f=>vm.runInThisContext(fs.readFileSync(require('node:path').join(${JSON.stringify(base)},f.split('?')[0]),'utf8')));self.postMessage=m=>parentPort.postMessage(m);vm.runInThisContext(fs.readFileSync(${JSON.stringify(path.join(base,'worker.js'))},'utf8'));parentPort.on('message',data=>self.onmessage({data}));`,{eval:true});}
function response(worker,id,type){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{worker.terminate();reject(Error('Worker timed out'));},30000);const handler=m=>{if(m.id!==id)return;if(m.type==='error'){cleanup();reject(Error(m.error.message));}else if(m.type===type){cleanup();resolve(m);}};const cleanup=()=>{clearTimeout(timer);worker.off('message',handler);};worker.on('message',handler);});}
(async()=>{
 const worker=create();let ticks=0;const heartbeat=setInterval(()=>ticks++,5);
 let promise=response(worker,1,'ready');worker.postMessage({type:'load',id:1,text:'{"text":"'+'x'.repeat(12*1024*1024)+'TAIL"}',layout:{columns:100,wrap:true}});
 const ready=await promise;clearInterval(heartbeat);assert(ready.bytes>10*1024*1024);assert(ticks>0);
 promise=response(worker,2,'viewport');worker.postMessage({type:'viewport',id:2,start:ready.meta.visualLines-8,count:8});const view=await promise;assert(view.rows.length<=8);assert(JSON.stringify(view).length<10000);assert(view.rows.some(r=>r.tokens.some(t=>t.text.includes('TAIL'))));
 console.log('PASS real worker parses beyond former cap while caller heartbeat runs; replies contain only viewport rows');
 promise=response(worker,3,'ready');worker.postMessage({type:'load',id:3,text:'{"id":9007199254740993,"id":-0}\n[1,true]'});await promise;
 promise=response(worker,4,'export');worker.postMessage({type:'export',id:4,download:false});assert.equal(await (await promise).blob.text(),'{"id":9007199254740993,"id":-0}\n[1,true]');
 console.log('PASS worker export preserves JSONL, duplicate keys and number spelling');
 const nested=JSON.stringify([{steps:[{curr_prompt:'first\n**important**'},{curr_prompt:'next\n**deep value**'}]}]);
 promise=response(worker,6,'ready');worker.postMessage({type:'load',id:6,text:nested,layout:{markdown:true}});const mdReady=await promise;assert.equal(mdReady.meta.markdown,true);assert(mdReady.version);
 promise=response(worker,7,'layout');worker.postMessage({type:'layout',id:7,layout:{action:'expand',markdown:true}});await promise;
 promise=response(worker,8,'viewport');worker.postMessage({type:'viewport',id:8,start:0,count:50});const mdView=await promise;assert(mdView.rows.some(r=>r.tokens.some(t=>t.type.includes('md-bold')&&t.text==='deep value')));assert(!mdView.rows.some(r=>r.tokens.some(t=>t.type==='value-string'&&t.text.includes('\\n'))));
 promise=response(worker,9,'layout');worker.postMessage({type:'layout',id:9,layout:{markdown:false}});assert.equal((await promise).meta.markdown,false);
 promise=response(worker,10,'viewport');worker.postMessage({type:'viewport',id:10,start:0,count:50});const rawView=await promise;assert(rawView.rows.some(r=>r.tokens.some(t=>t.type==='value-string'&&t.text.includes('**deep value**'))));
 console.log('PASS versioned worker applies Markdown before parsing and to deeply nested values, then reverses it');
 promise=response(worker,11,'layout');worker.postMessage({type:'layout',id:11,layout:{query:'curr_prompt'}});assert.equal((await promise).meta.navigation.total,2);
 promise=response(worker,12,'navigate');worker.postMessage({type:'navigate',id:12,step:-1});const navigation=(await promise).navigation;assert.equal(navigation.index,1);
 promise=response(worker,13,'viewport');worker.postMessage({type:'viewport',id:13,start:navigation.target.visual,count:10});assert((await promise).rows.some(r=>r.tokens.some(t=>t.matches.some(match=>match.active))));
 console.log('PASS worker navigation returns a target and active-match ranges');
 await worker.terminate();
 const cancelled=create();cancelled.postMessage({type:'load',id:5,text:'"'+'x'.repeat(16*1024*1024)+'"'});await cancelled.terminate();console.log('PASS in-flight worker can be terminated');
})().catch(e=>{console.error(e);process.exitCode=1;});
