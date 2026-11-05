const { chromium } = require(process.env.TEMP + '/nexusbox-browser-check/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('https://www.tasteskill.dev/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'checks/tasteskill-desktop.png', fullPage: true });
  await page.screenshot({ path: 'checks/tasteskill-hero.png' });
  console.log(await page.evaluate(() => ({
    fonts: [...new Set([...document.querySelectorAll('h1,h2,p')].map(e => getComputedStyle(e).fontFamily))],
    background: getComputedStyle(document.body).backgroundColor,
    animations: document.getAnimations().map(a => ({ name: a.animationName, duration: a.effect.getTiming().duration })).slice(0, 20),
  })));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'checks/tasteskill-mobile.png', fullPage: true });
  await page.screenshot({ path: 'checks/tasteskill-mobile-hero.png' });
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
