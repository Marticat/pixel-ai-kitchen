import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {WORKFLOW} from '../lib/kitchen-checks.mjs';
test('the actual Actions preview script bundles a small Vite page into one HTML artifact',()=>{
 mkdirSync(resolve('work'),{recursive:true});
 const root=mkdtempSync(resolve('work','preview-')),artifact=join(root,'artifact').replaceAll('\\','/'),output=join(root,'preview').replaceAll('\\','/');mkdirSync(artifact);
 writeFileSync(join(root,'package.json'),JSON.stringify({type:'module'}));
 writeFileSync(join(root,'index.html'),'<html><head><title>Preview test</title></head><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>');
 writeFileSync(join(root,'main.js'),'import "./style.css"; document.querySelector("#app").textContent="Cooked";');writeFileSync(join(root,'style.css'),'body{color:green}');
 const script=WORKFLOW.split("node --input-type=module <<'NODE'\n")[1].split('\n          NODE')[0].split('\n').map(l=>l.slice(10)).join('\n').replaceAll('/tmp/kitchen-artifact',artifact).replaceAll('/tmp/kitchen-preview',output);
 writeFileSync(join(root,'build-preview.mjs'),script);
 const result=spawnSync(process.execPath,['build-preview.mjs'],{cwd:root,encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
 const html=readFileSync(join(artifact,'preview.html'),'utf8');assert.match(html,/Cooked/);assert.match(html,/<style>.*green/s);assert.doesNotMatch(html,/<script\b[^>]*src=/);assert.doesNotMatch(html,/<link\b[^>]*\.css/);
});
