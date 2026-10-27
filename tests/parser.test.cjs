const assert = require('node:assert/strict');
const {parseOne,detect,stringify,serialize,ParseError} = require('../parser.js');
let checks = 0;
function test(name, run) {run();checks++;console.log('PASS '+name);}
test('JSON values agree with native parser after formatting',()=>{
  const fixtures=['{}','[]','null','true','false','-0','1e-7','"한글 \\uD83D\\uDE00 \\n \\\" \\\\ \\/"','{"a":[1,true,null,{"x":"<script>"}],"b":{}}','{"__proto__":{"polluted":true},"constructor":1}'];
  for(const text of fixtures) assert.deepEqual(JSON.parse(stringify(parseOne(text))),JSON.parse(text));
  assert.equal({}.polluted,undefined);
});
test('JSONL automatic detection, blanks, CRLF and BOM',()=>{
  const result=detect('\uFEFF {"id":1}\r\n\r\n{"id":2}\r\n');
  assert.equal(result.format,'JSONL');assert.equal(result.records.length,2);
  assert.equal(serialize(result),'{"id":1}\n{"id":2}');
});
test('pretty JSON is not misclassified as JSONL',()=>{
  assert.equal(detect('{\n "a": [\n 1, 2\n ]\n}').format,'JSON');
  assert.equal(detect('{"single":"record"}').format,'JSON');
});
test('JSONL scalar and array records',()=>{
  const result=detect('42\ntrue\nnull\n"hello"\n[1,2]\n{}');
  assert.equal(result.format,'JSONL');assert.equal(result.records.length,6);
  assert.equal(serialize(result),'42\ntrue\nnull\n"hello"\n[1,2]\n{}');
});
test('unsafe integers, exponent spelling, negative zero and duplicate keys remain exact',()=>{
  const text='{"id":9007199254740993,"big":123456789012345678901234567890,"exponent":1.2300e+400,"negative":-0,"id":2}';
  assert.equal(stringify(parseOne(text),0),text);
  assert.equal(parseOne(text).children.length,5);
});
test('invalid syntax is rejected',()=>{
  for(const text of ['', '{"a":1,}', '[1,]', '{a:1}', "{'a':1}",'01','+1','NaN','Infinity','[undefined]','/*x*/{}','{"a":1} x','"bad\nline"','"\\x12"','"\\uZZZZ"','"unterminated','[1','{"a" 1}','truefalse','1e','-'])assert.throws(()=>parseOne(text),ParseError,text);
});
test('invalid JSONL reports the original line and column',()=>{
  assert.throws(()=>detect('{"ok":1}\n\n{"bad":}\n'),e=>e.isJSONL&&e.line===3&&e.column===8);
});
test('pretty JSON errors retain document coordinates',()=>{
  assert.throws(()=>detect('{\n "a": [1,]\n}'),e=>!e.isJSONL&&e.line===2);
});
test('depth limit fails cleanly',()=>assert.throws(()=>parseOne('['.repeat(202)+'0'+']'.repeat(202)),e=>e instanceof ParseError&&e.message.includes('200')));
test('large collection survives round trip',()=>{
  const data=Array.from({length:5000},(_,i)=>({id:i,value:'문자열 '+i,active:i%2===0}));
  assert.deepEqual(JSON.parse(stringify(parseOne(JSON.stringify(data)),0)),data);
});
console.log(checks+' test groups passed.');
