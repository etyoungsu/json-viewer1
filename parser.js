/* A lossless JSON syntax tree: number spelling and duplicate keys are preserved. */
(function (root) {
  'use strict';
  class ParseError extends Error {
    constructor(message, source, position) {
      super(message); this.name = 'ParseError'; this.position = position;
      const before = source.slice(0, position);
      this.line = before.split('\n').length;
      this.column = position - before.lastIndexOf('\n');
    }
  }
  function parseOne(source) {
    let p = 0;
    const fail = message => { throw new ParseError(message, source, p); };
    const ws = () => { while (/[\x20\t\n\r]/.test(source[p] || '\0')) p++; };
    function string() {
      const start = p++;
      while (p < source.length) {
        const code = source.charCodeAt(p);
        if (code === 34) { p++; const raw = source.slice(start, p); return {kind:'string', value:JSON.parse(raw), raw}; }
        if (code < 32) fail('Line breaks and control characters inside strings must be escaped.');
        if (code === 92) {
          p++;
          if (source[p] === 'u') {
            if (!/^[0-9a-fA-F]{4}$/.test(source.slice(p + 1, p + 5))) fail('Invalid Unicode escape sequence.');
            p += 5; continue;
          }
          if (!'"\\/bfnrt'.includes(source[p] || '\0')) fail('Invalid escape sequence.');
        }
        p++;
      }
      fail('Expected a closing double quote.');
    }
    function value(depth) {
      ws(); if (depth > 200) fail('Nesting depth exceeds the 200-level limit.');
      const c = source[p];
      if (c === '"') return string();
      if (c === '{' || c === '[') {
        const object = c === '{', close = object ? '}' : ']'; p++; ws(); const children = [];
        if (source[p] === close) { p++; return {kind:object?'object':'array', children}; }
        while (p < source.length) {
          ws(); let key;
          if (object) {
            if (source[p] !== '"') fail('Property names must be enclosed in double quotes.');
            key = string(); ws(); if (source[p] !== ':') fail('Expected a colon (:) after the property name.'); p++;
          }
          const child = value(depth + 1); children.push(object ? {key, node:child} : child);
          ws(); if (source[p] === close) { p++; return {kind:object?'object':'array',children}; }
          if (source[p] !== ',') fail('Expected a comma between items or a closing bracket.');
          p++; ws(); if (source[p] === close) fail('Trailing commas are not allowed.');
        }
        fail('Expected a closing bracket.');
      }
      for (const word of ['true','false','null']) if (source.startsWith(word,p)) { p += word.length; return {kind:word==='null'?'null':'boolean',raw:word}; }
      const number = source.slice(p).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (number) { p += number[0].length; return {kind:'number',raw:number[0]}; }
      fail(p >= source.length ? 'Expected a JSON value.' : 'Invalid JSON value. Check brackets and double quotes.');
    }
    const node = value(0); ws(); if (p !== source.length) fail('Unexpected characters after the JSON value.'); return node;
  }
  function detect(input) {
    const source = input.replace(/^\uFEFF/, '');
    if (!source.trim()) throw new ParseError('Paste JSON or JSONL to get started.', source, 0);
    let jsonError;
    try { return {format:'JSON', records:[parseOne(source)]}; } catch (e) { if (!(e instanceof ParseError)) throw e; jsonError = e; }
    const lines = source.split(/\r\n|\n|\r/);
    const nonempty = lines.map((text,i)=>({text,line:i+1})).filter(x=>x.text.trim());
    if (nonempty.length < 2) throw jsonError;
    // An opening brace on its own is a multiline JSON document, not a JSONL record.
    try { parseOne(nonempty[0].text); } catch (_) { throw jsonError; }
    const records = [];
    for (const item of nonempty) {
      try { records.push(parseOne(item.text)); }
      catch (e) { if (!(e instanceof ParseError)) throw e; e.line = item.line; e.isJSONL = true; throw e; }
    }
    return {format:'JSONL',records};
  }
  function stringify(node, indent = 2, depth = 0) {
    if (!node.children) return node.raw;
    const object = node.kind === 'object', open = object ? '{' : '[', close = object ? '}' : ']';
    if (!node.children.length) return open + close;
    const pad = n => ' '.repeat(indent * n);
    const rows = node.children.map(child => object ? child.key.raw + (indent ? ': ' : ':') + stringify(child.node,indent,depth+1) : stringify(child,indent,depth+1));
    return indent ? open+'\n'+rows.map(row=>pad(depth+1)+row).join(',\n')+'\n'+pad(depth)+close : open+rows.join(',')+close;
  }
  function serialize(result, indent = 2) {
    return result.records.map(node=>stringify(node,result.format==='JSONL'?0:indent)).join('\n');
  }
  const api = {ParseError,parseOne,detect,stringify,serialize};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JSONStudioParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
