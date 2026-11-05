const { chromium } = require(process.env.TEMP + '/nexusbox-browser-check/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({headless: true, channel: 'msedge'});
 try {
 const page = await browser.newPage({viewport: {width: 1440, height: 900}});
 await page.goto('https://www.tasteskill.dev/', {waitUntil: 'domcontentloaded', timeout: 60000});
 await page.waitForTimeout(3500);
 await page.screenshot({path: 'checks/navbar-reference.png'});
 console.log(await page.evaluate(() => [...document.querySelectorAll('header,nav')].map(e => ({html:e.outerHTML, styles: {background:getComputedStyle(e).background,border:getComputedStyle(e).border,borderRadius:getComputedStyle(e).borderRadius,position:getComputedStyle(e).position},rect:e.getBoundingClientRect().toJSON()}))));
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path: 'checks/navbar-reference-mobile.png'});
 console.log('TOGGLE',await page.locator('header button').evaluateAll(es=>es.map(e=>e.outerHTML)));
 await page.locator('header button').click();
 await page.waitForTimeout(500);
 console.log('OPEN',await page.locator('header').innerText());
 await page.screenshot({path:'checks/navbar-reference-open.png'});
 } finally {await browser.close();}
})().catch(e=>{console.error(e); process.exit(1)});
