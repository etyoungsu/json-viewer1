/* Worker-owned tree index and visual-line layout. No document or window access. */
(function(root){
'use strict';
const markdownTokens=typeof module!=='undefined'?require('./markdown.js').markdownTokens:root.JSONStudioMarkdown;
class TreeModel {
  constructor(result,options={}) {
    this.result=result;this.nodes=[];this.roots=[];this.query='';this.columns=options.columns||100;this.wrap=options.wrap!==false;this.markdown=!!options.markdown;let line=1;
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
  isOpen(item){return this.query?!!this.included[item.id]:item.expanded;}
  layout(){
    const q=this.query;this.matches=0;this.included=new Uint8Array(this.nodes.length);
    if(q){for(let i=this.nodes.length-1;i>=0;i--){const item=this.nodes[i];if(((item.label||'')+' '+(item.node.kind==='string'?item.node.value:item.node.raw||'')).toLocaleLowerCase().includes(q)){this.included[i]=1;this.matches++;}if(this.included[i]&&item.parent>=0)this.included[item.parent]=1;}}
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
      this.rows.push({id:item.id,close,tokens,breaks,visual,count});visual+=count;
    };
    const walk=id=>{const item=this.nodes[id];if(q&&!this.included[id])return;add(item,false);if(item.children.length&&this.isOpen(item)){item.children.forEach(walk);add(item,true);}};
    this.roots.forEach(walk);this.visualLines=visual;
  }
  configure({columns=this.columns,wrap=this.wrap,markdown=this.markdown,query=this.query,action,id}={}){
    this.columns=Math.max(8,Math.floor(columns));this.wrap=wrap;this.markdown=markdown;this.query=query;
    if(action==='toggle'&&this.nodes[id]){this.nodes[id].expanded=!this.isOpen(this.nodes[id]);if(this.query)this.query='';}
    if(action==='expand'||action==='collapse')for(const item of this.nodes)item.expanded=action==='expand';
    this.layout();return this.meta();
  }
  meta(){return {markdown:this.markdown,format:this.result.format,records:this.roots.length,nodes:this.nodes.length,totalLines:this.totalLines,visualLines:this.visualLines,matches:this.matches,maxColumns:this.maxColumns,query:this.query};}
  rowAt(visual){let lo=0,hi=this.rows.length;while(lo<hi){const mid=(lo+hi)>>1,r=this.rows[mid];if(r.visual+r.count<=visual)lo=mid+1;else hi=mid;}return lo;}
  describe(row,fragment=0,clip=null){
    const item=this.nodes[row.id];let a=row.breaks[fragment],b=row.breaks[fragment+1],clipStart=0;if(clip){clipStart=Math.max(0,Math.floor(clip.start)-Math.min(item.depth*2,40)-8);a=row.breaks[fragment]+clipStart;b=Math.min(b,a+clip.count+24);}let offset=0;const tokens=[];
    for(const t of row.tokens){const start=Math.max(0,a-offset),end=Math.min(t.text.length,b-offset);if(end>start)tokens.push({...t,text:t.text.slice(start,end).replace(/\n/g,'')});offset+=t.text.length;}
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
