const assert=require('node:assert/strict');
const {chromium}=require(process.env.TEMP+'/nexusbox-browser-check/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  const heroBottom=await page.locator('.welcome').evaluate(e=>e.getBoundingClientRect().bottom);
  assert.ok(heroBottom<=901);
  await page.getByRole('link',{name:'Eventos',exact:true}).filter({visible:true}).click();
  await page.waitForTimeout(600);
  assert.ok(await page.locator('#eventos').evaluate(e=>e.getBoundingClientRect().top)>=95);
  const source=new URL(await page.locator('.facebook-player iframe').getAttribute('src'));
  assert.equal(source.hostname,'www.facebook.com');
  assert.equal(source.searchParams.get('href'),'https://www.facebook.com/61556906195984/videos/1641403047771920/');
  assert.equal(await page.getByRole('link',{name:'Ver en Facebook'}).getAttribute('target'),'_blank');
  for(const width of [1440,820,390,320]){
   await page.setViewportSize({width,height:900});
   await page.locator('#eventos').scrollIntoViewIfNeeded();
   await page.waitForTimeout(500);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.locator('#eventos').screenshot({path:`checks/events-${width}.png`});
   console.log(`PASS events ${width}px`);
  }
  await page.getByRole('link',{name:'Login',exact:true}).click();
  await page.locator('.login-page').waitFor();
  await page.getByRole('button',{name:'Abrir menú'}).click();
  await page.locator('#mobile-navigation').getByRole('link',{name:'Eventos',exact:true}).click();
  await page.locator('#eventos').waitFor();
  await page.waitForTimeout(500);
  assert.ok(await page.locator('#eventos').evaluate(e=>e.getBoundingClientRect().top)<150);
  await page.getByRole('link',{name:'El Calvario, inicio'}).click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>scrollY),0);
  assert.deepEqual(errors,[]);
  console.log('PASS Facebook URL, navigation from login, return to hero, no runtime errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
