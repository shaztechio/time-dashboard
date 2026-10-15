/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { CATALOG_VERSION } from '../src/catalog.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = await mkdtemp(join(tmpdir(), 'clock-offline-'));
await cp('dist', join(root,'app'), { recursive:true });
await writeFile(join(root,'outside.html'), '<!doctype html><title>Outside app scope</title>');
const server = spawn(process.execPath, ['scripts/serve.mjs'], { env:{...process.env,SERVE_DIR:root,PORT:'0'}, stdio:['ignore','pipe','inherit'] });
const origin = await new Promise((resolve,reject) => { server.stdout.on('data',chunk=>{const match=String(chunk).match(/Local: (http:\/\/[^\s]+)/);if(match)resolve(match[1]);}); server.on('error',reject);server.on('exit',code=>reject(new Error(`Server exited ${code}`))); });
const base=origin+'/app/';
const search=`data/cities-${CATALOG_VERSION}.json`;
const lookup=`data/clock-catalog-${CATALOG_VERSION}.json`;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark'});
let page=await context.newPage();
const responses=[];
page.on('response', response => { if (response.ok()) responses.push(response.url()); });
const errors=[];
context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
page.on('pageerror',e=>errors.push(e.message));
const cacheKeys=()=>page.evaluate(async()=>{
 const result={};for(const name of await caches.keys()) result[name]=(await(await caches.open(name)).keys()).map(r=>r.url);return result;
});
const ready=async()=>{
 await page.waitForFunction(()=>document.querySelectorAll('.clock-slot').length===4 && document.querySelector('#clocks').getAttribute('aria-busy')==='false');
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller && document.querySelector('#offline-status').textContent.includes('Ready offline'));
};
const raw=(path,headers={})=>new Promise((resolve,reject)=>get(base+path,{headers},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));}).on('error',reject));
try {
 const original=await readFile(join(root,'app',search));
 const br=await raw(search,{'Accept-Encoding':'br, gzip'});
 assert.equal(br.headers['content-encoding'],'br');assert.deepEqual(brotliDecompressSync(br.body),original);
 assert.equal(br.headers['cache-control'],'public, max-age=31536000, immutable');assert.equal(br.headers.vary,'Accept-Encoding');
 const gz=await raw(search,{'Accept-Encoding':'br;q=0, gzip;q=1'});
 assert.equal(gz.headers['content-encoding'],'gzip');assert.deepEqual(gunzipSync(gz.body),original);
 const identity=await raw(search,{'Accept-Encoding':'identity'});assert.deepEqual(identity.body,original);
 const unchanged=await raw(search,{'Accept-Encoding':'br','If-None-Match':br.headers.etag});assert.equal(unchanged.status,304);assert.equal(unchanged.body.length,0);
 assert.equal((await raw('sw.js')).headers['cache-control'],'no-cache');
 const published=JSON.parse(await readFile(join(root,'app/build-manifest.json')));
 assert.equal((await raw(published.assets['styles.css'])).headers['cache-control'],'public, max-age=31536000, immutable');
 console.log(`PASS negotiated Brotli (${br.body.length} bytes), gzip, identity, immutable headers and ETag 304.`);
 const explicit=await raw(search+'.gz',{'Accept-Encoding':'br, gzip'});
 assert.equal(explicit.headers['content-encoding'],undefined);
 assert.deepEqual(gunzipSync(explicit.body),original);
 const entryPath=join(root,'app/index.html');
 const entry=await readFile(entryPath,'utf8');
 await writeFile(entryPath,entry+'\n<!-- mutable CDN entry response -->');
 for(const ext of ['.br','.gz']) await rm(entryPath+ext);
 await page.goto(base);await ready();
 assert.ok(responses.includes(base+lookup+'.gz'),'First lookup explicitly requests gzip');
 assert.ok(!responses.includes(base+lookup),'No raw lookup download on successful gzip');
 assert.ok(!responses.some(url=>url.includes('/data/cities-')),'Search stays lazy');
 const initial=await cacheKeys();
 assert.ok(Object.values(initial).flat().some(url=>url.endsWith(lookup)));
 assert.ok(!Object.values(initial).flat().some(url=>url.endsWith(search)),'Search must not be precached');
 assert.ok(Object.keys(initial).every(name=>name.includes('/app/')));
 // A new compact URL created from the default page must reload offline too.
 await page.locator('.reorder-handle').first().press('ArrowRight');
 const custom=page.url();
 await context.setOffline(true);await page.reload();await ready();assert.equal(page.url(),custom);
 await page.locator('#add-clock').click();
 await page.waitForSelector('#search-error:not([hidden])');
 assert.match(await page.locator('#search-error').textContent(),/Connect once/);
 await context.setOffline(false);await page.locator('#retry-search').click();
 await page.waitForFunction(()=>document.querySelector('#search-error').hidden && document.querySelectorAll('.city-option').length>1);
 await page.locator('#cancel-dialog').click();
 assert.ok(Object.values(await cacheKeys()).flat().some(url=>url.endsWith(search)));
 assert.ok(responses.includes(base+search+'.gz'),'Search explicitly requests gzip');
 assert.ok(!responses.includes(base+search),'No raw search download on successful gzip');
 assert.ok(!Object.values(await cacheKeys()).flat().some(url=>url.endsWith('.json.gz')),'Only decoded canonical JSON is cached');
 await context.setOffline(true);await page.reload();await ready();
 await page.locator('#add-clock').click();await page.locator('#city-search').fill('London');
 await page.waitForSelector('.city-option[data-city-id="geonames:2643743"]');
 await page.locator('.city-option[data-city-id="geonames:2643743"]').click();await page.locator('#confirm-add').click();
 assert.equal(await page.locator('.clock-slot').count(),5);
 await page.locator('#time-travel').click();await page.locator('#freeze-now').click();
 const frozen=page.url();await page.reload();
 await page.waitForFunction(()=>document.querySelectorAll('.clock-slot').length===5 && document.body.classList.contains('time-frozen'));
 assert.equal(page.url(),frozen);
 await mkdir('test-results',{recursive:true});
 await page.screenshot({path:'test-results/offline-dashboard.png'});
 console.log('PASS lazy catalog caching, offline default/custom links, offline search/add and Time Travel, subdirectory deployment.');
 await context.setOffline(false);
 // Poisoned caches are removed and retried rather than persisting a bad catalog.
 await page.evaluate(async url=>{const name=(await caches.keys()).find(name=>name.startsWith('world-clock-catalogs:'));await(await caches.open(name)).put(url,new Response('{bad json'));},base+lookup);
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.clock-slot').length===5 && document.querySelector('#notice').hidden);
 const manifest=JSON.parse(await readFile(join(root,'app/build-manifest.json')));
 const workerPath=join(root,'app/sw.js');
 const oldWorker=await readFile(workerPath,'utf8');
 for(const ext of ['.br','.gz']) await rm(workerPath+ext);
 const cssPath=join(root,'app',manifest.assets['styles.css']);
 const oldCSS=await readFile(cssPath,'utf8');
 const hash=value=>createHash('sha256').update(value).digest('hex');
 const newCSS=oldCSS+'\n/* offline update test */\n';
 // Failed/mixed release cannot replace the current working worker.
 await writeFile(workerPath,oldWorker.replace(manifest.revision,'broken-update').replace(hash(oldCSS),hash(newCSS)));
 await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
 await page.waitForFunction(async()=>!(await navigator.serviceWorker.getRegistration()).installing);
 assert.equal(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting),false);
 assert.ok(Object.keys(await cacheKeys()).some(name=>name.endsWith(manifest.revision)));
 await writeFile(cssPath,newCSS);
 for(const ext of ['.br','.gz']) await rm(cssPath+ext);
 await writeFile(workerPath,oldWorker.replace(manifest.revision,'working-update').replace(hash(oldCSS),hash(newCSS)));
 await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});
 await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
 // Registration state can become observable before the UI's statechange handler runs.
 await page.waitForFunction(()=>document.querySelector('#offline-status').textContent.includes('Update ready'));
 assert.match(await page.locator('#offline-status').textContent(),/Update ready/);
 assert.ok(Object.keys(await cacheKeys()).some(name=>name.endsWith(manifest.revision)),'Old tabs retain their assets');
 // A page outside the scope can watch activation without keeping the old worker alive.
 const observer=await context.newPage();await observer.goto(origin+'/outside.html');await page.close();
 await observer.waitForFunction(async()=>{
  const keys=await caches.keys();return keys.some(name=>name.endsWith(':working-update')) && keys.filter(name=>name.startsWith('world-clock-shell:')).length===1;
 });
 page=await context.newPage();await page.goto(frozen);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller && document.querySelectorAll('.clock-slot').length===5);
 assert.ok(Object.values(await cacheKeys()).flat().some(url=>url.endsWith(search)),'Retain current catalog across app upgrades');
 await context.setOffline(true);await page.reload();await page.waitForSelector('.clock-card');
 assert.equal(page.url(),frozen);
 assert.deepEqual(errors,[]);
 console.log('PASS corrupt-cache recovery, rejected mixed build, waiting update, safe activation, old-shell cleanup, and offline updated app.');
 // Cache storage and worker availability are enhancements, never prerequisites.
 const blocked=await browser.newContext({serviceWorkers:'block'});
 const fallback=await blocked.newPage();
 await fallback.addInitScript(()=>Object.defineProperty(window,'caches',{get(){throw new Error('Storage disabled');}}));
 await fallback.goto(base);await fallback.waitForSelector('.clock-card');
 assert.equal(await fallback.locator('.clock-slot').count(),4);
 await blocked.close();
 console.log('PASS online fallback when persistent caching is unavailable.');
} finally {await browser.close();server.kill();await rm(root,{recursive:true,force:true});}
