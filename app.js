(() => {
  'use strict';
  const $ = id => document.getElementById(id), parser = window.JSONStudioParser;
  const source = $('source'), tree = $('tree'), search = $('search');
  let result = null, dirty = false, toastTimer, searchTimer, renderCount = 0;
  let matches = new Set(), visible = new Set(), query = '';
  const MAX_BYTES = 10 * 1024 * 1024, PAGE_SIZE = 150, EXPAND_BUDGET = 10000;
  const bytes = text => new TextEncoder().encode(text).length;
  const prettyBytes = size => size >= 1048576 ? (size / 1048576).toFixed(2)+' MB' : size >= 1024 ? (size/1024).toFixed(1)+' KB' : size+' B';
  function el(tag, className, content) { const node = document.createElement(tag); if(className)node.className=className;if(content!==undefined)node.textContent=content;return node; }
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent=message; $('toast').classList.add('show'); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600); }
  // IndexedDB keeps larger drafts without localStorage's small string quota.
  let draftRevision = 0;
  const draftKey = location.pathname.replace(/index\.html$/, '');
  const draftDB = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open('json-studio-drafts', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Draft storage is blocked.'));
    } catch (error) { reject(error); }
  });
  function saveDraft() {
    const revision = ++draftRevision, value = source.value;
    $('draft-status').textContent = 'Saving…';
    draftDB.then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction('drafts', 'readwrite');
      const store = transaction.objectStore('drafts');
      if (value) store.put(value, draftKey); else store.delete(draftKey);
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    })).then(() => {
      if (revision === draftRevision) $('draft-status').textContent = value ? 'Saved locally' : '';
    }).catch(() => {
      if (revision === draftRevision) $('draft-status').textContent = 'Could not save locally';
    });
  }
  function restoreDraft() {
    $('draft-status').textContent = 'Loading saved input…';
    draftDB.then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction('drafts', 'readonly');
      const request = transaction.objectStore('drafts').get(draftKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    })).then(value => {
      // Never overwrite text entered while the stored draft was being loaded.
      if (draftRevision) return;
      if (typeof value === 'string' && value) {
        source.value = value; dirty = true; updateSource(); controls();
        $('draft-status').textContent = 'Saved locally';
      } else $('draft-status').textContent = '';
    }).catch(() => {
      if (!draftRevision) $('draft-status').textContent = 'Local saving unavailable';
    });
  }
  function updateSource() {
    const lines = source.value.split('\n').length;
    $('gutter').textContent = Array.from({length:Math.min(lines,100000)},(_,i)=>i+1).join('\n');
    $('source-stats').textContent = lines.toLocaleString()+(lines===1?' line · ':' lines · ')+prettyBytes(bytes(source.value));
    $('gutter').scrollTop=source.scrollTop;
  }
  function controls() {
    $('stale').hidden=!dirty||!result;
    for(const id of ['copy','download']) $(id).disabled=!result||dirty;
    for(const id of ['expand','collapse']) $(id).disabled=!result;
    search.disabled=!result;
  }
  function setPane(next, focusTab = false) {
    const previousPanel = document.querySelector('.pane:not([hidden])');
    const moveFocus = focusTab || (previousPanel && previousPanel.id !== next+'-panel' && previousPanel.contains(document.activeElement));
    for (const name of ['input', 'output']) {
      const active = name === next;
      $(name+'-panel').hidden = !active;
      $(name+'-tab').setAttribute('aria-selected', String(active));
      $(name+'-tab').tabIndex = active ? 0 : -1;
      $(name+'-tab').classList.toggle('selected', active);
    }
    if (moveFocus) $(next+'-tab').focus();
  }
  function activatePane(next, focusTab = false) {
    if (next === 'output' && (dirty || !result)) {
      // Reuse a valid, unchanged tree so tab switching preserves its open nodes.
      if (!source.value.trim()) {
        empty(false);
        setPane('output', focusTab);
      } else {
        format();
        if (focusTab) $('output-tab').focus();
      }
      return;
    }
    setPane(next, focusTab);
  }
  for (const name of ['input', 'output']) $(name+'-tab').onclick = () => activatePane(name);
  document.querySelector('.workspace-tablist').addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'input' : event.key === 'End' ? 'output' : $('input-panel').hidden ? 'input' : 'output';
    activatePane(next, true);
  });
  $('theme-toggle').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('theme-toggle').setAttribute('aria-pressed', String(dark));
  });
  const wrapToggle = $('wrap-lines');
  wrapToggle.addEventListener('change', () => {
    document.querySelector('.workspace').classList.toggle('wrap-lines', wrapToggle.checked);
    source.wrap = wrapToggle.checked ? 'soft' : 'off';
    source.scrollLeft = 0;
    $('result-area').scrollLeft = 0;
    $('gutter').scrollTop = source.scrollTop;
  });
  // Measure the selected position using the textarea's current visual wrapping.
  function scrollToOffset(offset) {
    const style = getComputedStyle(source), mirror = el('div');
    for (const name of ['font','lineHeight','letterSpacing','tabSize','padding','boxSizing','whiteSpace','overflowWrap','wordBreak']) mirror.style[name] = style[name];
    mirror.style.position = 'fixed';
    mirror.style.visibility = 'hidden';
    mirror.style.width = source.clientWidth + 'px';
    mirror.textContent = source.value.slice(0, offset);
    const marker = el('span', '', '\u200b');
    mirror.append(marker);document.body.append(mirror);
    source.scrollTop = Math.max(0, marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top - source.clientHeight / 3);
    mirror.remove();$('gutter').scrollTop = source.scrollTop;
  }
  function spanText(className, text) {
    const span=el('span',className);
    if(!query) {span.textContent=text;return span;}
    const lower=text.toLocaleLowerCase();let start=0,index;
    while((index=lower.indexOf(query,start))!==-1) {span.append(document.createTextNode(text.slice(start,index)),el('mark','',text.slice(index,index+query.length)));start=index+query.length;}
    span.append(document.createTextNode(text.slice(start)));return span;
  }
  function entries(node) { return node.children.map((item,i)=>node.kind==='object'?{node:item.node,key:item.key.raw,index:i}:{node:item,key:null,index:i}); }
  function renderNode(node, label, depth, path, forceOpen=false) {
    renderCount++;
    const container=!!node.children, outer=el(container?'details':'div','node');
    const row=el(container?'summary':'div','node-row');
    row.append(el('span',container?'twisty':'leaf-space'));
    if(label!==null) row.append(spanText('key',label),el('span','punctuation',': '));
    if(container) {
      outer.dataset.bracketLevel = String(depth % 3);
      const open=node.kind==='object'?'{':'[',close=node.kind==='object'?'}':']';
      row.append(el('span','punctuation bracket',open),el('span','node-preview',node.children.length?' … '+close:close),el('span','node-meta',node.children.length+' '+(node.kind==='object'?'keys':'items')));
      outer.append(row); let loaded=false;
      function populate() {
        if(loaded)return;loaded=true;
        const children=el('div','node-children');let index=0;
        const list=entries(node).filter(item=>!query||visible.has(path+'/'+item.index));
        const more=el('button','load-more');more.style.cssText='font-size:10px;margin:4px 0 4px 20px';
        function page() {
          more.remove();const end=Math.min(index+PAGE_SIZE,list.length);
          for(;index<end;index++) {const item=list[index]; children.append(renderNode(item.node,item.key!==null?item.key:String(item.index),depth+1,path+'/'+item.index));}
          if(index<list.length) {more.textContent='Show next '+Math.min(PAGE_SIZE,list.length-index)+' items ('+(list.length-index)+' remaining)';children.append(more);}
        }
        more.addEventListener('click',page);page();outer.append(children,el('div','node-close',close));
      }
      outer._populate=populate;
      outer.addEventListener('toggle',()=>{if(outer.open)populate();});
      if(depth<2||forceOpen||query) {outer.open=true;populate();}
    } else {row.append(spanText('value-'+node.kind,node.raw));outer.append(row);}
    return outer;
  }
  function searchIndex() {
    matches=new Set();visible=new Set();
    function visit(node,label,path) {
      const text=(label||'')+' '+(node.kind==='string'?node.value:node.raw||'');
      const own=text.toLocaleLowerCase().includes(query);let any=own;
      if(own)matches.add(path);
      if(node.children) for(const item of entries(node)) {const child=visit(item.node,item.key||String(item.index),path+'/'+item.index);any=child||any;}
      if(any) visible.add(path);return any;
    }
    result.records.forEach((node,i)=>visit(node,null,String(i)));
  }
  function drawTree() {
    tree.replaceChildren();renderCount=0;
    if(!result)return;
    if(query)searchIndex();
    $('search-count').textContent=query?matches.size.toLocaleString()+' matches':'';
    const records=result.records.map((node,i)=>({node,i})).filter(item=>!query||visible.has(String(item.i)));
    let recordIndex=0;
    const moreRecords=el('button','load-more');moreRecords.style.cssText='font-size:11px;margin:8px';
    function recordPage() {
      moreRecords.remove();const end=Math.min(recordIndex+PAGE_SIZE,records.length);
      for(;recordIndex<end;recordIndex++) {
        const {node,i}=records[recordIndex];
        const record=el('div',result.format==='JSONL'?'record':'');
        if(result.format==='JSONL') {const label=el('div','record-label');label.append(el('strong','',String(i+1).padStart(2,'0')),document.createTextNode(' / RECORD'));record.append(label);}
        record.append(renderNode(node,null,0,String(i)));tree.append(record);
      }
      if(recordIndex<records.length){moreRecords.textContent='Show next '+Math.min(PAGE_SIZE,records.length-recordIndex)+' records ('+(records.length-recordIndex)+' remaining)';tree.append(moreRecords);}
    }
    moreRecords.onclick=recordPage;recordPage();
    if(query&&!matches.size)tree.append(el('p','node-meta','No matches found.'));
  }
  function showError(error) {
    result=null;dirty=false;tree.replaceChildren();tree.hidden=true;$('empty').hidden=true;
    const box=$('error');box.replaceChildren();box.hidden=false;
    box.append(el('strong','',error.isJSONL?'Check your JSONL records':'Check your JSON syntax'),el('div','',error.message));
    if(error.line) {
      box.append(el('div','','Line '+error.line+' · Column '+error.column));
      const line=source.value.replace(/^\uFEFF/,'').split(/\r\n|\n|\r/)[error.line-1]||'';
      const start=Math.max(0,error.column-60);box.append(el('pre','',(start?'…':'')+line.slice(start,start+150)));
      const jump=el('button','','Go to error');jump.onclick=()=>{
        const normalized=source.value;const lines=normalized.split('\n');const offset=lines.slice(0,error.line-1).reduce((n,s)=>n+s.length+1,0)+error.column-1;
        setPane('input');source.focus();source.setSelectionRange(offset,offset+1);scrollToOffset(offset);
      };box.append(jump);
    }
    $('result-status').textContent='Invalid input';$('result-count').textContent='—';$('input-type').textContent='AUTO';controls();setPane('output');
  }
  function format() {
    clearTimeout(searchTimer);query='';search.value='';$('search-count').textContent='';
    try {
      if(bytes(source.value)>MAX_BYTES)throw new Error('Input must be 10 MB or smaller.');
      result=parser.detect(source.value);dirty=false;
      const output=parser.serialize(result,2);
      if(result.format==='JSON')source.value=output;
      updateSource();$('error').hidden=true;$('empty').hidden=true;
      $('input-type').textContent=result.format;
      drawTree();tree.hidden=false;setPane('output');
      const status=$('result-status');status.replaceChildren(el('span','green-dot'),document.createTextNode('Valid '+result.format));
      $('result-count').textContent=result.format==='JSONL'?result.records.length.toLocaleString()+' records · one record per line':(result.records[0].children?result.records[0].children.length+' '+(result.records[0].kind==='object'?'keys':'items'):'1 value');
      controls();
    } catch(error) {showError(error);}
    saveDraft();
  }
  function empty(shouldFocus = true, persist = true) {
    source.value='';result=null;dirty=false;query='';search.value='';clearTimeout(searchTimer);$('search-count').textContent='';tree.replaceChildren();tree.hidden=true;$('error').hidden=true;$('empty').hidden=false;
    $('input-type').textContent='AUTO';$('result-status').textContent='Ready';$('result-count').textContent='—';updateSource();controls();setPane('input');if(shouldFocus)source.focus();
    if (persist) saveDraft();
  }
  source.addEventListener('input',()=>{dirty=true;updateSource();controls();saveDraft();});
  source.addEventListener('scroll',()=>{$('gutter').scrollTop=source.scrollTop;});
  source.addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();source.setRangeText('  ',source.selectionStart,source.selectionEnd,'end');source.dispatchEvent(new Event('input'));}});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();format();}});
  $('format').onclick=format;$('clear').onclick=()=>empty();
  search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{query=search.value.trim().toLocaleLowerCase();drawTree();},180);});
  $('collapse').onclick=()=>{tree.querySelectorAll('details').forEach(d=>d.open=false);};
  $('expand').onclick=()=>{
    // Populate incrementally; keep very large documents responsive.
    const stack=Array.from(tree.querySelectorAll(':scope > div > details')).reverse();let opened=0;
    while(stack.length&&opened<EXPAND_BUDGET&&renderCount<EXPAND_BUDGET){const d=stack.pop();d.open=true;d._populate();opened++;const kids=d.querySelectorAll(':scope > .node-children > details');for(let i=kids.length-1;i>=0;i--)stack.push(kids[i]);}
    if(stack.length||renderCount>=EXPAND_BUDGET)toast('Large documents are partially expanded. Open individual items to see more.');
  };
  $('copy').onclick=async()=>{
    if(!result||dirty)return;
    const text=parser.serialize(result,2);
    try {await navigator.clipboard.writeText(text);toast(result.format+' copied to clipboard.');}
    catch(_) {const helper=el('textarea');helper.value=text;helper.style.cssText='position:fixed;opacity:0';document.body.append(helper);helper.select();const ok=document.execCommand('copy');helper.remove();toast(ok?'Output copied to clipboard.':'Unable to copy. Download the output file instead.');}
  };
  $('download').onclick=()=>{
    if(!result||dirty)return;
    const blob=new Blob([parser.serialize(result,2)+'\n'],{type:result.format==='JSONL'?'application/x-ndjson;charset=utf-8':'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=result.format==='JSONL'?'formatted.jsonl':'formatted.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Downloading output.');
  };
  $('file').onchange=async event=>{const file=event.target.files[0];if(!file)return;try {if(file.size>MAX_BYTES)throw new Error('Choose a file that is 10 MB or smaller.');source.value=await file.text();format();}catch(error){toast(error.message);}event.target.value='';};
  $('upload-label').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();$('file').click();}});
  if(/Mac|iPhone|iPad/.test(navigator.platform)){$('shortcut').textContent='⌘ ↵';}
  empty(false, false);
  restoreDraft();
})();
