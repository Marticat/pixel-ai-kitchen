import {inflateRawSync} from 'node:zlib';
import {KitchenError} from './kitchen-errors.mjs';
export const WORKFLOW_PATH='.github/workflows/pixel-kitchen.yml';
export const WORKFLOW=`name: Pixel Kitchen checks
on:
  push:
    branches: ['kitchen/**']
permissions:
  contents: read
defaults:
  run:
    shell: bash
jobs:
  verify:
    name: Kitchen build and tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      CI: 'true'
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Prepare report
        run: mkdir -p /tmp/kitchen-artifact
      - name: Install dependencies
        run: npm ci --ignore-scripts 2>&1 | tee /tmp/kitchen-artifact/install.txt
      - name: Build
        run: npm run build 2>&1 | tee /tmp/kitchen-artifact/build.txt
      - name: Test
        run: |
          if node -e 'process.exit(JSON.parse(require("fs").readFileSync("package.json")).scripts?.test ? 0 : 1)'; then
            npm test 2>&1 | tee /tmp/kitchen-artifact/test.txt
          else
            echo 'No test script: tests were not run.' > /tmp/kitchen-artifact/test.txt
          fi
      - name: Prepare preview
        continue-on-error: true
        run: |
          node --input-type=module <<'NODE'
          import {build} from 'vite';
          import fs from 'node:fs';
          import path from 'node:path';
          const out='/tmp/kitchen-preview';
          await build({base:'./',build:{outDir:out,emptyOutDir:true,assetsInlineLimit:10000000,cssCodeSplit:false,rollupOptions:{output:{inlineDynamicImports:true}}}});
          let html=fs.readFileSync(path.join(out,'index.html'),'utf8');
          const read=(url)=>{const p=path.resolve(out,url.replace(/^\\.\\//,''));if(!p.startsWith(path.resolve(out)+path.sep))throw Error('Unsupported asset');return fs.readFileSync(p,'utf8');};
          html=html.replace(/<script\\b[^>]*src="([^" ]+)"[^>]*>\\s*<\\/script>/g,(_,url)=>'<script type="module">'+read(url).replace(/<\\/script/gi,'<\\\\/script')+'</script>');
          html=html.replace(/<link\\b[^>]*href="([^" ]+\\.css)"[^>]*>/g,(_,url)=>'<style>'+read(url).replace(/<\\/style/gi,'<\\\\/style')+'</style>');
          html=html.replace(/<link\\b[^>]*rel="modulepreload"[^>]*>/g,'');
          if(Buffer.byteLength(html)>4000000)throw Error('Preview exceeds 4 MB');
          fs.writeFileSync('/tmp/kitchen-artifact/preview.html',html);
          NODE
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: kitchen-report
          path: /tmp/kitchen-artifact
          retention-days: 3
          if-no-files-found: error
`;
export function matchesRun(job,run){return run.head_sha===job.headSha&&run.head_branch===job.branch&&run.path===WORKFLOW_PATH&&run.event==='push';}
export function extractArtifact(input){
 const b=Buffer.from(input);if(b.length>5*1024*1024||b.length<22)throw new KitchenError('Unsupported report archive.');
 let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw new KitchenError('Invalid report archive.');const count=b.readUInt16LE(end+10);let pos=b.readUInt32LE(end+16),total=0;const result=/** @type {Record<string,string>} */({});
 if(count>20)throw new KitchenError('Too many report files.');
 for(let i=0;i<count;i++){
  if(pos+46>b.length||b.readUInt32LE(pos)!==0x02014b50)throw new KitchenError('Invalid report directory.');
  const flags=b.readUInt16LE(pos+8),method=b.readUInt16LE(pos+10),packed=b.readUInt32LE(pos+20),size=b.readUInt32LE(pos+24),nl=b.readUInt16LE(pos+28),el=b.readUInt16LE(pos+30),cl=b.readUInt16LE(pos+32),offset=b.readUInt32LE(pos+42),name=b.subarray(pos+46,pos+46+nl).toString('utf8');pos+=46+nl+el+cl;
  if(!['preview.html','build.txt','test.txt','install.txt'].includes(name))continue;
  total+=size;if(flags&1||size>4000000||total>4500000||offset+30>b.length||b.readUInt32LE(offset)!==0x04034b50||Object.hasOwn(result,name))throw new KitchenError('Unsafe report archive.');
  const start=offset+30+b.readUInt16LE(offset+26)+b.readUInt16LE(offset+28);if(start+packed>b.length)throw new KitchenError('Incomplete report archive.');
  const data=b.subarray(start,start+packed),decoded=method===0?data:method===8?inflateRawSync(data,{maxOutputLength:Math.min(size+1,4000001)}):null;
  if(!decoded||decoded.length!==size)throw new KitchenError('Invalid report compression.');result[name]=decoded.toString('utf8');
 }return result;
}
