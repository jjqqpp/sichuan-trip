import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
let chromium;

try {
  ({ chromium } = require('playwright'));
} catch {
  chromium = null;
}

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium'
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
const browserTest = chromium ? test : test.skip;

async function withStaticServer(run) {
  const root = process.cwd();
  const server = http.createServer(async (request, response) => {
    const requestPath = new URL(request.url, 'http://localhost').pathname;
    const relativePath = requestPath === '/' ? 'index.html' : requestPath.slice(1);
    const filePath = path.resolve(root, relativePath);

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    try {
      const body = await fsp.readFile(filePath);
      const type = filePath.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8';
      response.writeHead(200, { 'Content-Type': type });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}/index.html`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

browserTest('route map toolbar button downloads the generated PNG', async () => {
  const launchOptions = chromePath ? { executablePath: chromePath, headless: true } : { headless: true };
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ acceptDownloads: true });

  try {
    await withStaticServer(async (pageUrl) => {
      await page.goto(pageUrl, { waitUntil: 'load' });

      const button = page.getByRole('button', { name: '导出路线图' });
      await assert.doesNotReject(() => button.waitFor({ state: 'visible', timeout: 1000 }));

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 3000 }),
        button.click()
      ]);

      assert.equal(download.suggestedFilename(), 'western-sichuan-route-map.png');
    });
  } finally {
    await browser.close();
  }
});
