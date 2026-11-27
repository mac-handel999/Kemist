const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function takeScreenshots() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const screenshotsDir = path.join(__dirname, 'docs', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // Test pages - use /library for Clinical Library
  const baseUrl = 'http://localhost:3000';
  const libraryUrl = `${baseUrl}/#/library`;

  // Viewport configurations
  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 }
  ];

  // Themes
  const themes = ['light', 'dark'];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const theme of themes) {
      try {
        // Navigate to Clinical Library page
        await page.goto(libraryUrl, { waitUntil: 'networkidle', timeout: 30000 });

        // Wait for the library to load
        await page.waitForSelector('.library-page', { timeout: 10000 });

        // Set theme
        await page.evaluate((t) => {
          document.documentElement.setAttribute('data-theme', t);
          localStorage.setItem('theme', t);
        }, theme);

        // Wait for theme to apply
        await page.waitForTimeout(500);

        // Take screenshot
        const filename = `clinical-library-${viewport.name}-${theme}.png`;
        const filepath = path.join(screenshotsDir, filename);
        await page.screenshot({ path: filepath, fullPage: true });
        console.log(`Saved: ${filename}`);
      } catch (err) {
        console.error(`Error taking screenshot for ${viewport.name}-${theme}:`, err.message);
      }
    }
  }

  await browser.close();
  console.log('All Clinical Library screenshots completed!');
}

takeScreenshots().catch(console.error);