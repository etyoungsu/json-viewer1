'use strict';
const BUILD_VERSION='acd28c9f12f402c0';
importScripts('./parser.js?v=acd28c9f12f402c0','./markdown.js?v=acd28c9f12f402c0','./tree-model.js?v=acd28c9f12f402c0');
let model=null;
self.onmessage=async({data:m})=>{
  const reply=(type,payload={})=>self.postMessage({version:BUILD_VERSION,type,id:m.id,...payload});
  try{
    if(m.type==='load'){
      reply('progress',{message:m.file?'Reading file…':'Parsing input…'});
      const text=m.file?await m.file.text():m.text;
      reply('progress',{message:'Parsing JSON / JSONL…'});
      const parsed=JSONStudioParser.detect(text);
      reply('progress',{message:'Indexing tree…'});
      model=new JSONStudioTreeModel(parsed,m.layout);
      let lines=1;for(let p=0;p<text.length;p++)if(text.charCodeAt(p)===10)lines++;
      reply('ready',{meta:model.meta(),input:m.file?text:undefined,bytes:new Blob([text]).size,lines});
    }else if(m.type==='layout')reply('layout',{meta:model.configure(m.layout)});
    else if(m.type==='navigate')reply('navigate',{navigation:model.navigate(m.step)});
    else if(m.type==='viewport')reply('viewport',{...model.viewport(m.start,m.count,m.horizontal,m.anchor),start:m.start});
    else if(m.type==='export'){
      reply('progress',{message:'Preparing '+(m.download?'download':'clipboard')+'…'});
      const text=JSONStudioParser.serialize(model.result,2)+(m.download?'\n':'');
      reply('export',{blob:new Blob([text],{type:'text/plain;charset=utf-8'}),format:model.result.format});
    }
  }catch(error){reply('error',{error:{message:error.message,line:error.line,column:error.column,isJSONL:error.isJSONL,position:error.position}});}
};
