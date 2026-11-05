const assert = require('node:assert/strict');
const { chromium } = require(process.env.TEMP + '/nexusbox-browser-check/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page = await browser.newPage({viewport:{width:1672,height:941}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  await page.locator('.hero-slide').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  const first = await page.locator('.hero-slide.is-active').getAttribute('src');
  await page.clock.runFor(4999);
  assert.equal(await page.locator('.hero-slide.is-active').getAttribute('src'),first);
  await page.clock.runFor(1);
  assert.notEqual(await page.locator('.hero-slide.is-active').getAttribute('src'),first);
  const seen = new Set([first,await page.locator('.hero-slide.is-active').getAttribute('src')]);
  for(let i=0;i<6;i++){await page.clock.runFor(5000);seen.add(await page.locator('.hero-slide.is-active').getAttribute('src'));}
  assert.equal(seen.size,8);
  await page.clock.runFor(5000);
  assert.equal(await page.locator('.hero-slide.is-active').getAttribute('src'),first);
  await page.getByRole('button',{name:'Pausar fotografías'}).click();
  await page.clock.runFor(10000);
  assert.equal(await page.locator('.hero-slide.is-active').getAttribute('src'),first);
  await page.getByRole('button',{name:'Reanudar fotografías'}).click();
  await page.clock.runFor(5000);
  assert.notEqual(await page.locator('.hero-slide.is-active').getAttribute('src'),first);
  await page.clock.runFor(35000);
  await page.getByRole('button',{name:'Pausar fotografías'}).click();
  await page.clock.runFor(1000);
  for(const [width,height] of [[1920,1080],[1672,941],[1440,900],[1366,768],[1280,720],[1024,768],[820,1180],[390,844],[375,667],[320,667]]){
   await page.setViewportSize({width,height});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);
   const heroBottom = await page.locator('.welcome').evaluate(e=>e.getBoundingClientRect().bottom);
   assert.ok(heroBottom <= height + 1, `hero requires scrolling at ${width}x${height}: ${heroBottom}`);
   await page.screenshot({path:`checks/hero-${width}.png`,fullPage:true});
   console.log(`PASS layout ${width}px`);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS eight photographs, 5000ms interval, wraparound, pause and resume; no runtime errors');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
