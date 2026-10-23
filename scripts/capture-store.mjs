import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : '@playwright/test');
const repo=fileURLToPath(new URL('../', import.meta.url));
const out=path.join(repo,'docs/store/images');
await mkdir(out,{recursive:true});
const temp=await mkdtemp(path.join(tmpdir(),'tabstash-docs-'));
const extension=path.join(temp,'extension');
await cp(path.join(repo,'extension'),extension,{recursive:true});
const manifest=JSON.parse(await readFile(path.join(extension,'manifest.json'),'utf8'));
manifest.host_permissions=manifest.optional_host_permissions;delete manifest.optional_host_permissions;
// Pregrant screenshots only in this disposable copy; the release manifest is untouched.
await writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest));
const samples=[
 ['Kyoto, at your own pace','A field guide to slower days','THE WEEKEND JOURNAL','#dce8cf','#294b35','50% 50% 0 0','journal.example/kyoto'],
 ['Small places, good coffee','A few stops worth slowing down for','THE QUIET GUIDE','#f0dbc8','#6f4a34','45% 45% 8% 8%','quietguide.example/coffee'],
 ['Art around the corner','Galleries, gardens, and unexpected finds','CITY NOTEBOOK','#d9e4ef','#345171','50%','notebook.example/galleries'],
 ['A space to make things','Objects for everyday rituals','FORM & FUNCTION','#e8deed','#674c74','40%','studio.example/workspaces'],
 ['Color, collected','Finding a palette in everyday places','PALETTE NOTES','#f1e4bd','#7e6631','50% 0 50% 0','palette.example/collections'],
 ['Room for a new idea','Essays to keep you curious','THE READING ROOM','#e5dfd4','#575147','50% 50% 5% 5%','reading.example/ideas']
];
function html(p){return `<!doctype html><title>${p[0]}</title><style>*{box-sizing:border-box}body{margin:0;background:${p[3]};color:${p[4]};font-family:Arial}nav{padding:28px 5%;display:flex;justify-content:space-between;border-bottom:1px solid #0002;font-size:12px;letter-spacing:2px}main{padding:8% 8%;display:flex;align-items:center;gap:8%}section{width:58%}small{letter-spacing:3px;font-size:10px}h1{font:64px Georgia;line-height:1.1;letter-spacing:-2px;margin:26px 0}p{font:18px Georgia}button{margin-top:22px;padding:14px 22px;color:${p[3]};background:${p[4]};border:0;border-radius:4px}aside{width:34%;height:330px;border-radius:${p[5]};background:linear-gradient(140deg,#ffffff99,${p[4]});position:relative}aside:after{content:'';position:absolute;inset:25%;border:1px solid #ffffff88;border-radius:50%}footer{padding:20px 5%;font-size:10px;letter-spacing:2px;border-top:1px solid #0002}</style><nav><b>${p[2]}</b><span>EXPLORE &nbsp; STORIES &nbsp; ABOUT</span></nav><main><section><small>A LITTLE INSPIRATION FOR LATER</small><h1>${p[0]}</h1><p>${p[1]}</p><button>Read the story ↗</button></section><aside></aside></main><footer>SAVE SOMETHING WORTH COMING BACK TO.</footer>`;}
let context;
const errors=[];
async function until(fn){const deadline=Date.now()+30000;while(Date.now()<deadline){if(await fn())return;await new Promise(r=>setTimeout(r,150));}throw Error('Timed out');}
async function shot(page,name){if(await page.locator('#toast').count())await page.locator('#toast').waitFor({state:'hidden'});await page.mouse.move(1260,10);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});const png=await page.screenshot({path:path.join(out,name),animations:'disabled'});
 assert.equal(png.readUInt32BE(16),1280);assert.equal(png.readUInt32BE(20),800);assert.equal(png[25],2,'Screenshots must be RGB without alpha');}
try{
 context=await chromium.launchPersistentContext(path.join(temp,'profile'),{executablePath:process.env.CHROMIUM_PATH || undefined,headless:false,viewport:{width:1280,height:800},deviceScaleFactor:1,locale:'en-US',timezoneId:'Asia/Tokyo',reducedMotion:'reduce',args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--no-first-run','--no-default-browser-check']});
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.route('https://**.example/**',route=>{const p=samples.find(p=>route.request().url()===`https://${p[6]}`);return route.fulfill({contentType:'text/html',body:html(p||samples[0])});});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
 for(const p of context.pages())await p.close();
 for(const p of samples){const page=await context.newPage();await page.goto(`https://${p[6]}`);}
 const library=await context.newPage();await library.goto(`chrome-extension://${id}/library.html`);
 await library.evaluate(()=>chrome.storage.local.set({themePreference:'light',palettePreference:'blue'}));
 await library.locator('#new-deck').click();await library.locator('#deck-name').fill('A little inspiration');await library.locator('#save-submit').click();
 await until(()=>library.evaluate(async()=>{const s=(await chrome.storage.session.get('capture')).capture;return s?.running===false;}));
 const [captured]=await library.evaluate(async()=>(await import('./db.js')).getDecks());
 assert.equal(captured.tabs.filter(t=>t.screenshot).length,6);
 const when=Date.parse('2026-10-22T14:30:00+09:00');
 await library.evaluate(async({captured,when})=>{const {deleteDeck,addDecks}=await import('./db.js');await deleteDeck(captured.id);const defs=[['A little inspiration',[0,1,2,3,4,5]],['A weekend in Kyoto',[0,1,2]],['Creative workspace',[3,4,5]],['Places to slow down',[1,0,2]],['Colors & objects',[4,3,5]],['Sunday reading',[5,2,0]]];await addDecks(defs.map(([name,indices],i)=>({...captured,id:`demo-${i}`,name,createdAt:when-i*86400000,tabs:indices.map((j,index)=>({...captured.tabs[j],index,pinned:j===0}))})));const {commitRecovery}=await import('./recovery-db.js');for(let i=0;i<4;i++){const tabs=captured.tabs.map(t=>({title:t.title,url:t.url,pinned:false}));const windows=[{tabs:tabs.slice(0,3)},{tabs:tabs.slice(3,i===0?6:5)}];const record={id:`recovery-demo-${i}`,createdAt:when-i*300000,windows,fingerprint:`demo-${i}`};record.bytes=JSON.stringify(record).length*2;await commitRecovery(record,50,null);}}, {captured,when});
 await library.reload();await library.locator('.deck-card').first().waitFor();assert.equal(await library.locator('.deck-card').count(),6);await shot(library,'library.png');
 await library.locator('.deck-card').first().click();await library.locator('#detail-view').waitFor();await library.locator('label[for=theme-dark]').click();await library.waitForFunction(()=>document.documentElement.dataset.theme==='dark');assert.equal(await library.locator('.tab-card').count(),6);await shot(library,'deck-dark.png');
 await library.goto(`chrome-extension://${id}/recovery.html`);await library.locator('.recovery-save').first().waitFor();await library.locator('label[for=theme-light]').click();await library.waitForFunction(()=>document.documentElement.dataset.theme==='light');assert.equal(await library.locator('.recovery-window').count(),2);await shot(library,'recovery.png');
 await library.goto(`chrome-extension://${id}/settings.html`);await library.locator('#palette-control label').first().waitFor();await library.evaluate(()=>window.scrollTo(0,135));await shot(library,'settings.png');
 assert.deepEqual(errors,[]);console.log('Captured four 1280 × 800 RGB store screenshots from the real extension with fictional sample data.');
}finally{await context?.close();await rm(temp,{recursive:true,force:true});}
