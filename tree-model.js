/* Worker-owned tree index and visual-line layout. No document or window access. */
(function(root){
'use strict';
const markdownTokens=typeof module!=='undefined'?require('./markdown.js').markdownTokens:root.JSONStudioMarkdown;
class TreeModel {
  constructor(result,options={}) {
    this.result=result;this.nodes=[];this.roots=[];this.query='';this.columns=options.columns||100;this.wrap=options.wrap!==false;this.markdown=!!options.markdown;this.activeIndex=-1;this.hits=[];this.previousQuery='';let line=1;
    const visit=(node,parent,depth,label,record)=>{
      const id=this.nodes.length, item={id,node,parent,depth,label,record,start:line++,end:0,children:[],expanded:depth<2};
      this.nodes.push(item);
      if(node.children?.length){node.children.forEach((entry,i)=>item.children.push(visit(node.kind==='object'?entry.node:entry,id,depth+1,node.kind==='object'?entry.key.raw:String(i),record)));item.end=line++;}
      else item.end=item.start;
      return id;
    };
    result.records.forEach((node,i)=>this.roots.push(visit(node,-1,0,null,i)));
    this.totalLines=line-1;this.layout();
  }
  tokens(item,close=false){
    const n=item.node, bracket=n.kind==='object'?['{','}']:['[',']'];
    if(close)return [{type:'bracket',text:bracket[1]}];
    const tokens=[];
    if(item.label!==null)tokens.push({type:'key',text:item.label},{type:'punctuation',text:': '});
    if(n.children){
      tokens.push({type:'bracket',text:bracket[0]});
      if(!n.children.length)tokens.push({type:'bracket',text:bracket[1]});
      else if(!this.isOpen(item))tokens.push({type:'punctuation',text:' … '},{type:'bracket',text:bracket[1]});
      tokens.push({type:'node-meta',text:'  '+n.children.length+' '+(n.kind==='object'?'keys':'items')});
    }else if(this.markdown&&n.kind==='string'){for(const token of markdownTokens(n.value))tokens.push(token);}
    else tokens.push({type:'value-'+n.kind,text:n.raw});
    return tokens;
  }
  isOpen(item){return item.expanded||!!(this.query&&this.included[item.id]);}
  searchableFields(item){
    const fields=[];let text='';
    for(const token of this.tokens(item)){
      if(token.type==='key'||token.type.startsWith('value-'))text+=token.text;
      else if(text){fields.push(text);text='';}
    }
    if(text)fields.push(text);return fields;
  }
  layout(){
    const previous=this.previousQuery===this.query?this.hits[this.activeIndex]:null;
    this.previousQuery=this.query;this.hits=[];
    const q=this.query;this.matches=0;this.included=new Uint8Array(this.nodes.length);
    if(q){for(let i=this.nodes.length-1;i>=0;i--){const item=this.nodes[i];if(this.searchableFields(item).some(text=>text.toLocaleLowerCase().includes(q))){this.included[i]=1;}if(this.included[i]&&item.parent>=0)this.included[item.parent]=1;}}
    this.rows=[];this.headerRows=new Int32Array(this.nodes.length).fill(-1);let visual=0;this.maxColumns=0;
    const add=(item,close)=>{
      const tokens=this.tokens(item,close), text=tokens.map(t=>t.text).join('');
      const breaks=[0], columns=Math.max(8,this.columns-Math.min(item.depth*2,40));let width=0;
      for(let p=0;p<text.length;){const cp=text.codePointAt(p),size=cp>65535?2:1;
        if(cp===10){breaks.push(p+1);width=0;p++;continue;}
        const w=cp===9?2:(cp>=0x1100&&(cp<=0x115f||cp>=0x2e80&&cp<=0xa4cf||cp>=0xac00&&cp<=0xd7a3||cp>=0xf900&&cp<=0xfaff||cp>=0xfe10&&cp<=0xfe6f||cp>=0xff00&&cp<=0xff60||cp>=0x1f300)?2:1);
        if(this.wrap&&width+w>columns&&p>breaks.at(-1)){breaks.push(p);width=0;}width+=w;p+=size;
      }
      breaks.push(text.length);const count=breaks.length-1;
      let longest=0;for(let i=1;i<breaks.length;i++)longest=Math.max(longest,breaks[i]-breaks[i-1]);
      this.maxColumns=Math.max(this.maxColumns,longest+item.depth*2);
      if(!close)this.headerRows[item.id]=this.rows.length;
      const row={id:item.id,close,tokens,breaks,visual,count,hits:[]};
      if(q&&!close){
        let offset=0,fieldStart=0,field='';
        const flush=()=>{let index=0,lower=field.toLocaleLowerCase();while((index=lower.indexOf(q,index))>=0){const hit={id:item.id,offset:fieldStart+index,length:q.length,index:this.hits.length,row:this.rows.length};this.hits.push(hit);row.hits.push(hit);index+=q.length;}field='';};
        for(const token of tokens){if(token.type==='key'||token.type.startsWith('value-')){if(!field)fieldStart=offset;field+=token.text;}else if(field)flush();offset+=token.text.length;}
        if(field)flush();
      }
      this.rows.push(row);visual+=count;
    };
    const walk=id=>{const item=this.nodes[id];add(item,false);if(item.children.length&&this.isOpen(item)){item.children.forEach(walk);add(item,true);}};
    this.roots.forEach(walk);this.visualLines=visual;this.matches=this.hits.length;
    const retained=previous?this.hits.findIndex(hit=>hit.id===previous.id&&hit.offset===previous.offset):-1;
    this.activeIndex=retained>=0?retained:this.hits.length?0:-1;
  }
  configure({columns=this.columns,wrap=this.wrap,markdown=this.markdown,query=this.query,action,id}={}){
    this.columns=Math.max(8,Math.floor(columns));this.wrap=wrap;this.markdown=markdown;this.query=query;
    if(action==='toggle'&&this.nodes[id]){this.nodes[id].expanded=!this.isOpen(this.nodes[id]);if(this.query)this.query='';}
    if(action==='expand'||action==='collapse')for(const item of this.nodes)item.expanded=action==='expand';
    this.layout();return this.meta();
  }
  navigation(){
    const hit=this.hits[this.activeIndex];if(!hit)return {index:-1,total:0,target:null};
    const row=this.rows[hit.row];let lo=0,hi=row.breaks.length-1;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(row.breaks[mid]<=hit.offset)lo=mid;else hi=mid-1;}
    return {index:this.activeIndex,total:this.hits.length,target:{id:hit.id,offset:hit.offset,visual:row.visual+lo,column:hit.offset-row.breaks[lo]+Math.min(this.nodes[hit.id].depth*2,40)}};
  }
  navigate(step){if(this.hits.length)this.activeIndex=((this.activeIndex+step)%this.hits.length+this.hits.length)%this.hits.length;return this.navigation();}
  meta(){return {navigation:this.navigation(),markdown:this.markdown,format:this.result.format,records:this.roots.length,nodes:this.nodes.length,totalLines:this.totalLines,visualLines:this.visualLines,matches:this.matches,maxColumns:this.maxColumns,query:this.query};}
  rowAt(visual){let lo=0,hi=this.rows.length;while(lo<hi){const mid=(lo+hi)>>1,r=this.rows[mid];if(r.visual+r.count<=visual)lo=mid+1;else hi=mid;}return lo;}
  describe(row,fragment=0,clip=null){
    const item=this.nodes[row.id];let a=row.breaks[fragment],b=row.breaks[fragment+1],clipStart=0;if(clip){clipStart=Math.max(0,Math.floor(clip.start)-Math.min(item.depth*2,40)-8);a=row.breaks[fragment]+clipStart;b=Math.min(b,a+clip.count+24);}let offset=0;const tokens=[];
    for(const t of row.tokens){const start=Math.max(0,a-offset),end=Math.min(t.text.length,b-offset);if(end>start){
      const absolute=offset+start,limit=offset+end,ranges=[];let lo=0,hi=row.hits.length;
      while(lo<hi){const mid=(lo+hi)>>1;if(row.hits[mid].offset+row.hits[mid].length<=absolute)lo=mid+1;else hi=mid;}
      for(let i=lo;i<row.hits.length&&row.hits[i].offset<limit;i++){const hit=row.hits[i];ranges.push({start:Math.max(0,hit.offset-absolute),end:Math.min(end-start,hit.offset+hit.length-absolute),active:hit.index===this.activeIndex});}
      tokens.push({...t,text:t.text.slice(start,end).replace(/\n/g,''),matches:ranges});
    }offset+=t.text.length;}
    return {clipStart,id:item.id,depth:item.depth,line:row.close?item.end:item.start,close:row.close,fragment,visual:row.visual+fragment,tokens,container:!!item.children.length,open:this.isOpen(item),record:item.record};
  }
  viewport(start,count,horizontal=0,anchorLine=start){
    start=Math.max(0,Math.floor(start));const rows=[];let index=this.rowAt(start),remaining=count;
    for(let i=index;i<this.rows.length&&remaining>0;i++){const row=this.rows[i];for(let f=Math.max(0,start-row.visual);f<row.count&&remaining>0;f++,remaining--)rows.push(this.describe(row,f,this.wrap?null:{start:horizontal,count:this.columns}));}
    const parents=[];const anchor=this.rows[this.rowAt(anchorLine+3)];let id=anchor?.id??-1;
    if(anchor&&!anchor.close)id=this.nodes[id].parent;
    while(id>=0){const item=this.nodes[id];const r=this.headerRows[id];if(r>=0&&this.rows[r].visual<anchorLine)parents.unshift({...this.describe(this.rows[r],0,{start:0,count:this.columns}),target:this.rows[r].visual});id=item.parent;}
    return {rows,parents:parents.slice(-4)};
  }
}
if(typeof module!=='undefined')module.exports={TreeModel};else root.JSONStudioTreeModel=TreeModel;
})(typeof globalThis!=='undefined'?globalThis:this);
