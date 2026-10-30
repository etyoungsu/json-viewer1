/* A text-only Markdown preview: output is styled tokens, never executable HTML. */
(function(root){
'use strict';
const safeLink=href=>/^(https?:\/\/|mailto:|#)/i.test(href.trim())?href.trim():null;
function markdownTokens(value){
  const tokens=[];
  const emit=(text,style='',href)=>{if(text)tokens.push({type:'value-string'+(style?' '+style:''),text,...(href?{href}:{})});};
  function inline(text,style='',href=null,depth=0){
    if(depth>16){emit(text,style,href);return;}
    const marker=/\\([\\`*_[\]~])|(`+)|(\*\*|__|~~|\*|_)|\[([^\]\n]+)\]\(([^)\n]+)\)/g;
    let cursor=0,match;
    while((match=marker.exec(text))){
      emit(text.slice(cursor,match.index),style,href);
      if(match[1]){emit(match[1],style,href);cursor=marker.lastIndex;continue;}
      if(match[4]!==undefined){const target=safeLink(match[5]);inline(match[4],style+(target?' md-link':''),target,depth+1);cursor=marker.lastIndex;continue;}
      const delimiter=match[2]||match[3],end=text.indexOf(delimiter,marker.lastIndex);
      if(end<0){emit(delimiter,style,href);cursor=marker.lastIndex;continue;}
      const body=text.slice(marker.lastIndex,end);
      if(match[2])emit(body,style+' md-code',href);
      else inline(body,style+(delimiter.length===1?' md-em':delimiter==='~~'?' md-strike':' md-bold'),href,depth+1);
      cursor=end+delimiter.length;marker.lastIndex=cursor;
    }
    emit(text.slice(cursor),style,href);
  }
  let fenced=false;
  const lines=value.replace(/\r\n?/g,'\n').split('\n');
  lines.forEach((line,index)=>{
    if(index)emit('\n');
    if(/^\s*```/.test(line)){fenced=!fenced;return;}
    if(fenced){emit(line,'md-code');return;}
    const heading=line.match(/^ {0,3}#{1,6}\s+(.*)$/);
    if(heading){inline(heading[1],'md-heading md-bold');return;}
    const quote=line.match(/^ {0,3}>\s?(.*)$/);
    if(quote){emit('│ ','md-quote');inline(quote[1],'md-quote');return;}
    const list=line.match(/^(\s*)(?:[-+*]|\d+[.)])\s+(.*)$/);
    if(list){emit(list[1]+'• ');inline(list[2]);return;}
    inline(line);
  });
  return tokens;
}
if(typeof module!=='undefined')module.exports={markdownTokens};else root.JSONStudioMarkdown=markdownTokens;
})(typeof globalThis!=='undefined'?globalThis:this);
