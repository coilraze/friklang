import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../../dist/', import.meta.url));
const lessonRoot = fileURLToPath(new URL('../../content/lessons/', import.meta.url));
const lessons = await Promise.all((await readdir(lessonRoot)).filter((name) => name.endsWith('.json')).map(async (name) => JSON.parse(await readFile(join(lessonRoot, name), 'utf8'))));
lessons.sort((left, right) => left.id.localeCompare(right.id));
const mime = { '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/friklang/' || pathname === '/friklang/index.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(await readFile(join(root, 'index.html')));
    return;
  }
  if (pathname.startsWith('/friklang/assets/')) {
    const file = normalize(join(root, pathname.slice('/friklang/'.length)));
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': `${mime[extname(file)] ?? 'application/octet-stream'}; charset=utf-8` });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
    return;
  }
  response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
  response.end(await readFile(join(root, '404.html')));
});

let browser;
let passed = 0;
const check = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
  console.log(`PASS: ${message}`);
};

try {
  await new Promise((resolve) => server.listen(4176, '127.0.0.1', resolve));
  const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(chromePath ? { executablePath: chromePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  const badAssets = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && new URL(response.url()).pathname.includes('/assets/')) badAssets.push(`${response.status()} ${response.url()}`);
  });

  for (const lesson of lessons) {
    await page.goto(`http://127.0.0.1:4176/friklang/lessons/${lesson.id}`);
    await page.getByRole('heading', { name: lesson.title, exact: true }).waitFor();
    check(new URL(page.url()).pathname === `/friklang/lessons/${lesson.id}/tasks/${lesson.tasks[0].id}`, `${lesson.id} opens through the GitHub Pages 404 fallback`);
    check(await page.locator('.guide-card').count() > 0, `${lesson.id} renders lesson content`);
  }

  await page.goto('http://127.0.0.1:4176/friklang/lessons/L02/tasks/L02-T03');
  await page.getByRole('heading', { name: 'Личные местоимения и am/is/are', exact: true }).waitFor();
  await page.locator('#task-answer').fill('is');
  await page.getByRole('button', { name: 'Проверить' }).click();
  check((await page.locator('.feedback-panel').innerText()).includes('Верно'), 'answer checking works at the Pages base path');
  const lessonLinks = await page.locator('.nav-lesson').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  check(lessonLinks.length === lessons.length && lessonLinks.every((href) => href.startsWith('/friklang/lessons/')), 'global lesson menu keeps every link under /friklang/');
  await page.getByRole('button', { name: 'Открыть меню уроков' }).click();
  check(await page.locator('#lesson-drawer').getAttribute('aria-hidden') === 'false', 'lesson menu opens on the Pages build');
  await page.setViewportSize({ width: 390, height: 844 });
  check((await page.locator('#lesson-drawer').evaluate((element) => element.getBoundingClientRect().width)) <= 332, 'mobile drawer fits within 85% width on the Pages build');
  await page.getByRole('link', { name: /Алфавит/ }).click();
  await page.getByRole('heading', { name: 'Алфавит: буквы, регистр и названия', exact: true }).waitFor();
  check(new URL(page.url()).pathname.startsWith('/friklang/lessons/A0L01'), 'lesson navigation remains inside the Pages subpath');
  check(errors.length === 0 && badAssets.length === 0, `Pages routes load without JavaScript errors or missing assets (${[...errors, ...badAssets].join('; ')})`);
  console.log(`Completed ${passed} GitHub Pages routing/browser checks.`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
