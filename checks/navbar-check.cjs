const assert = require('node:assert/strict');
const { chromium } = require(process.env.TEMP + '/nexusbox-browser-check/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  for (const width of [1440,1200,1199,1024,768,640,390,320]) {
   await page.setViewportSize({width,height:900});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);
   if (width>=1200) {
    await page.locator('.desktop-link').filter({hasText:'Inicio'}).click();
    assert.equal(await page.locator('.navigation-feedback').textContent(),'');
    for (const label of ['Nosotros','Ministerios','Grupos de Comunión','Eventos','Contacto']) {
     await page.locator('.desktop-link').filter({hasText:label}).click();
     assert.match(await page.getByRole('status').innerText(),new RegExp(label));
    }
   } else {
    await page.getByRole('button',{name:'Abrir menú'}).click();
    assert.equal(await page.locator('#mobile-navigation').isVisible(),true);
    assert.equal(await page.locator('#mobile-navigation a').count(),6);
    await page.locator('#mobile-navigation').getByRole('link',{name:'Grupos de Comunión'}).click();
    assert.match(await page.getByRole('status').innerText(),/Grupos de Comunión/);
    assert.equal(await page.locator('#mobile-navigation').isVisible(),false);
    await page.getByRole('button',{name:'Abrir menú'}).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#mobile-navigation').isVisible(),false);
    await page.getByRole('button',{name:'Abrir menú'}).click();
    await page.mouse.click(16, 650);
    assert.equal(await page.locator('#mobile-navigation').isVisible(),false);
   }
   await page.getByRole('link',{name:'Login'}).click();
   await page.getByRole('heading',{name:'Qué bueno verte de nuevo.'}).waitFor();
   await page.getByRole('link',{name:'El Calvario, inicio'}).click();
   await page.screenshot({path:`checks/navbar-local-${width}.png`});
   console.log(`PASS ${width}px: navigation and layout`);
  }
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
