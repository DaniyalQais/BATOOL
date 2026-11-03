// Render the actual Footer under both build states. Mock only layout dependencies;
// use the real release-copy implementation. No completed suites or hosted calls.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import * as releaseCopy from '../src/features/checkout/model/release-copy.ts';
const source=await readFile(new URL('../src/components/layout/footer.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const imports={
 'react/jsx-runtime':jsxRuntime,
 'next/link':{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)},
 '@/features/catalog/model/catalog':{collectionHref:()=>'/#collection'},
 '@/features/catalog/model/types':{stitchedCategories:[]},
 './private-list-form':{PrivateListForm:()=>null},
 './footer.module.css':{__esModule:true,default:new Proxy({},{get:(_,name)=>String(name)})},
 '@/features/settings/model/generated/public-settings':{publicBusinessSettings:{public_whatsapp:null,support_email:null}},
 '@/features/checkout/model/release-copy':releaseCopy,
};
const exports={};new Function('require','exports',compiled)(name=>{assert.ok(name in imports,'Unexpected footer dependency');return imports[name];},exports);
function render(release,endpoint){const old={release:process.env.NEXT_PUBLIC_CHECKOUT_RELEASE,endpoint:process.env.NEXT_PUBLIC_CHECKOUT_ENDPOINT};try{process.env.NEXT_PUBLIC_CHECKOUT_RELEASE=release;process.env.NEXT_PUBLIC_CHECKOUT_ENDPOINT=endpoint;return renderToStaticMarkup(React.createElement(exports.Footer));}finally{for(const [name,value]of [['NEXT_PUBLIC_CHECKOUT_RELEASE',old.release],['NEXT_PUBLIC_CHECKOUT_ENDPOINT',old.endpoint]])if(value===undefined)delete process.env[name];else process.env[name]=value;}}
test('closed or incomplete footer wiring stays closed and preserves image provenance',()=>{
 for(const [release,endpoint]of [['false','https://example.invalid'],['true','']]){
  const html=render(release,endpoint);assert.match(html,/Orders and payments are not enabled/);assert.match(html,/Concept and sample images are illustrative/);assert.doesNotMatch(html,/Products and prices are illustrative/);
 }
});
test('released footer defers to runtime availability without approving illustrative imagery or payments',()=>{
 const html=render('true','https://example.invalid');assert.match(html,/Check checkout for current ordering and payment availability/);assert.match(html,/Concept and sample images are illustrative/);assert.doesNotMatch(html,/Orders and payments are not enabled|payments are enabled|automatically verified|free delivery/i);
});
