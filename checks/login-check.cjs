const assert = require('node:assert/strict');
const {chromium} = require(process.env.TEMP+'/nexusbox-browser-check/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  await page.getByRole('link',{name:'Login',exact:true}).click();
  await page.getByRole('heading',{name:'Qué bueno verte de nuevo.'}).waitFor();
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  assert.equal(await page.locator('#login-email').evaluate(e=>e.validity.valueMissing),true);
  await page.getByLabel('Correo electrónico', {exact:true}).fill('prueba@example.com');
  await page.getByLabel('Contraseña',{exact:true}).fill('solo-prueba');
  await page.getByRole('button',{name:'Mostrar contraseña'}).click();
  assert.equal(await page.locator('#login-password').getAttribute('type'),'text');
  await page.getByRole('button',{name:'Ocultar contraseña'}).click();
  assert.equal(await page.locator('#login-password').getAttribute('type'),'password');
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  assert.match(await page.getByRole('status').innerText(),/Correo o contraseña incorrectos/);
  await page.getByRole('button',{name:'¿Olvidaste tu contraseña?'}).click();
  assert.match(await page.getByRole('status').innerText(),/recuperar tu acceso/);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Qué bueno verte de nuevo.'}).waitFor();
  for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[1280,720],[1024,768],[820,1180],[390,844],[375,667],[320,667]]){
   await page.setViewportSize({width,height});
   await page.waitForTimeout(800);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${width}`);
   assert.ok(await page.locator('.login-page').evaluate(e=>e.getBoundingClientRect().bottom)<=height+1,`login requires scrolling ${width}x${height}`);
   await page.getByRole('button',{name:'¿Olvidaste tu contraseña?'}).click();
   assert.ok(await page.locator('.login-page').evaluate(e=>e.getBoundingClientRect().bottom)<=height+1,`message requires scrolling ${width}x${height}`);
   await page.screenshot({path:`checks/login-${width}.png`,fullPage:true});
   console.log(`PASS login ${width}px`);
  }
  await page.getByRole('link',{name:'Volver al inicio'}).click();
  await page.locator('.welcome').waitFor();
  await page.goBack();
  await page.locator('.login-page').waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS required fields, password toggle, honest access message, recovery, refresh and history');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
