import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const baseURL = 'http://127.0.0.1:4175';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], { stdio: 'ignore' });
let browser;
let passed = 0;
const check = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
  console.log(`PASS: ${message}`);
};

try {
  let ready = false;
  for (let i = 0; i < 80; i += 1) {
    try { ready = (await fetch(baseURL)).ok; } catch { /* server is still starting */ }
    if (ready) break;
    await delay(250);
  }
  if (!ready) throw new Error('Vite dev server did not start. Run npm install first.');

  const chromePath = process.env.CHROME_PATH ?? [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(chromePath ? { executablePath: chromePath } : {}) });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  const externalRequests = new Set();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => { if (new URL(request.url()).origin !== baseURL) externalRequests.add(new URL(request.url()).origin); });

  await page.goto(`${baseURL}/lessons/L03`);
  await page.getByRole('heading', { name: 'Отрицания и вопросы с be' }).waitFor();
  check(page.url().includes('/lessons/L03/tasks/L03-T01'), 'opens L03 directly without completing L01');
  check(await page.locator('#explanation-box .sample-answer').count() === 0 && await page.locator('#explanation-box button').count() === 0, 'does not reveal the answer sample before an attempt');
  check(await page.getByRole('button', { name: 'Показать объяснение' }).isDisabled(), 'requires an attempt or skip before opening explanations');
  mkdirSync('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/trainer-desktop.png', fullPage: true });

  await page.goto(`${baseURL}/lessons/A0L01`);
  await page.locator('.guide-card').first().locator('summary').click();
  check(await page.locator('.guide-card[open]').count() === 1, 'opens an optional detailed A0 guide without replacing concise review');
  check(await page.locator('[data-action="speak"]').evaluateAll((buttons) => buttons.every((button) => !/[\u0400-\u04ff\u0250-\u02ff]/u.test(button.dataset.text))), 'offers TTS only for curated Latin-script text, never Russian glosses or IPA notation');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/screenshots/theory-deep-a0l01.png' });
  const availableVoiceLanguages = await page.evaluate(() => window.speechSynthesis?.getVoices().map((voice) => voice.lang) ?? []);
  console.log(`Chrome Web Speech voices available: ${availableVoiceLanguages.length ? [...new Set(availableVoiceLanguages)].join(', ') : 'none (fallback message tested)'}`);
  const initialSpeechStatus = await page.locator('#speech-status').innerText();
  await page.locator('[data-action="speak"]').first().click();
  await page.waitForFunction((initial) => document.querySelector('#speech-status')?.textContent !== initial, initialSpeechStatus);
  const normalSpeechStatus = await page.locator('#speech-status').innerText();
  check(normalSpeechStatus !== initialSpeechStatus, 'speech button reports a voice or a usable unavailable state');
  await page.locator('[data-action="speak-slow"]').first().click();
  check(await page.locator('#speech-status').isVisible() && page.url().includes('/lessons/A0L01'), 'slow speech control responds without blocking the lesson');
  await page.locator('[data-action="stop-speech"]').click();
  check(await page.locator('#speech-status').innerText() !== normalSpeechStatus, 'speech can be stopped by explicit user action');

  await page.goto(`${baseURL}/lessons/L04`);
  await page.locator('.vocabulary-panel summary').click();
  check(await page.locator('[data-action="speak"][data-text="read"]').count() === 0, 'does not offer ambiguous read as an isolated TTS word');
  check(await page.locator('[data-action="speak"][data-text="I read English every day."]').count() > 0, 'keeps the homograph available inside a lesson-context example');

  for (const [lessonId, screenshot] of [['L01', 'theory-deep-l01.png'], ['L02', 'theory-deep-l02.png']]) {
    await page.goto(`${baseURL}/lessons/${lessonId}`);
    await page.locator('.guide-card').first().locator('summary').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `docs/screenshots/${screenshot}` });
  }

  await page.goto(`${baseURL}/contractions`);
  check(await page.getByRole('heading', { name: /Сокращённые формы/ }).count() === 1, 'opens the standalone contractions reference');
  check((await page.locator('body').innerText()).includes("I'd") && (await page.locator('body').innerText()).includes('IELTS Academic Writing'), 'reference separates A1 forms from later ambiguous contractions and formal style');

  await page.goto(`${baseURL}/lessons/L03/tasks/L03-T10`);
  await page.getByRole('heading', { name: 'Редактирование записки и самостоятельное продолжение' }).waitFor();
  await page.waitForTimeout(100);
  check(await page.locator('#task-card').evaluate((element) => element.getBoundingClientRect().top < window.innerHeight), 'direct task URL brings its exercise into view');
  check(page.url().endsWith('/L03-T10'), 'opens task 10 directly without tasks 1–9');

  await page.goto(`${baseURL}/lessons/L02/tasks/L02-T01`);
  await page.getByRole('button', { name: 'Пропустить' }).click();
  await page.getByRole('heading', { name: 'Вспомнить порядок' }).waitFor();
  await page.locator('.task-number').first().click();
  await page.waitForURL(/\/lessons\/L02\/tasks\/L02-T01$/);
  check(await page.locator('.task-bottom .status-pill').innerText() === 'Пропущен', 'skips an exercise and returns to it');

  await page.goto(`${baseURL}/lessons/L02/tasks/L02-T03`);
  await page.locator('#task-answer').fill('are');
  await page.getByRole('button', { name: 'Проверить' }).click();
  check((await page.locator('.feedback-panel').innerText()).includes('grammar'), 'shows an incorrect grammar answer without blocking');
  await page.getByRole('link', { name: 'Далее →' }).click();
  await page.waitForURL(/\/lessons\/L02\/tasks\/L02-T04$/);
  check(page.url().endsWith('/L02-T04'), 'moves onward after a wrong answer');
  await page.goto(`${baseURL}/lessons/L02/tasks/L02-T03`);
  await page.locator('#task-answer').fill('is');
  await page.getByRole('button', { name: 'Проверить' }).click();
  check((await page.locator('.feedback-panel').innerText()).includes('Верно'), 'accepts the real L02-T03 key after a previous wrong attempt');

  await page.goto(`${baseURL}/lessons/L01/tasks/L01-T16`);
  await page.locator('#task-answer').fill('I am Noor. I am here.');
  check(await page.locator('#task-card [data-action="speak"]').count() === 0, 'never creates speech controls for private Writing drafts');
  await page.goto(`${baseURL}/lessons/L02`);
  await page.goto(`${baseURL}/lessons/L01/tasks/L01-T16`);
  check(await page.locator('#task-answer').inputValue() === 'I am Noor. I am here.', 'restores Writing draft after switching lessons');
  await page.reload();
  check(await page.locator('#task-answer').inputValue() === 'I am Noor. I am here.', 'restores saved work after reload');
  await page.getByRole('button', { name: 'Свериться с критериями' }).click();
  check(await page.locator('#self-review-box').isVisible(), 'shows Writing sample and criteria without auto-grading');
  check(await page.locator('.sample-answer').count() === 1, 'reveals the Writing sample after a draft exists');
  await page.getByRole('button', { name: 'Отметить как просмотренное' }).click();
  check((await page.locator('.feedback-panel').innerText()).includes('без автоматической оценки'), 'keeps completed Writing unreviewed rather than inventing a score');

  await page.goto(`${baseURL}/lessons/L04/tasks/L04-T18`);
  await page.getByRole('heading', { name: 'Исправить после паузы' }).waitFor();
  check(page.url().includes('/lessons/L04/tasks/L04-T18'), 'opens a direct lesson-and-task URL');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Открыть меню уроков' }).click();
  const drawerWidth = await page.locator('#lesson-drawer').evaluate((element) => element.getBoundingClientRect().width);
  check(drawerWidth <= 390 * 0.85 + 1, 'mobile drawer stays within 85% viewport width');
  await page.keyboard.press('Escape');
  check(await page.locator('#lesson-drawer').getAttribute('aria-hidden') === 'true', 'Escape closes mobile drawer');
  check(await page.evaluate(() => document.activeElement.getAttribute('aria-label')) === 'Открыть меню уроков', 'Escape returns keyboard focus to the menu button');
  await page.getByRole('button', { name: 'Открыть меню уроков' }).click();
  await page.screenshot({ path: 'docs/screenshots/navigation-mobile.png', fullPage: true });
  await page.locator('#lesson-search').fill('местоимения');
  await page.getByRole('link', { name: /Личные местоимения/ }).click();
  await page.waitForURL(/\/lessons\/L02/);
  check(page.url().includes('/lessons/L02'), 'selecting a lesson closes the drawer and navigates');
  await page.getByRole('button', { name: 'Открыть меню уроков' }).click();
  await page.locator('.drawer-backdrop').click({ position: { x: 380, y: 100 } });
  check(await page.locator('#lesson-drawer').getAttribute('aria-hidden') === 'true', 'clicking outside closes drawer');
  await page.getByRole('button', { name: 'Открыть меню уроков' }).click();
  await page.getByRole('button', { name: 'Закрыть меню' }).click();
  check(await page.locator('#lesson-drawer').getAttribute('aria-hidden') === 'true', 'drawer close button closes the panel');
  await page.getByRole('button', { name: 'Открыть меню уроков' }).click();
  await page.getByRole('button', { name: 'Открыть меню уроков' }).click();
  check(await page.locator('#lesson-drawer').getAttribute('aria-hidden') === 'true', 'menu button toggles the mobile drawer closed');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Открыть меню уроков' }).click();
  check(await page.locator('#lesson-drawer').getAttribute('aria-hidden') === 'false', 'desktop sidebar opens and can be collapsed');
  await page.getByRole('button', { name: 'Открыть меню уроков' }).click();

  await page.goto(`${baseURL}/lessons/L03/tasks/L03-T02`);
  await page.locator('#task-answer').fill("She's ready.");
  await page.getByRole('button', { name: 'Проверить' }).click();
  check((await page.locator('.feedback-panel').innerText()).includes('Верно'), 'accepts an explicit alternative answer');

  await page.goto(`${baseURL}/lessons/A2-01`);
  check((await page.getByRole('heading', { name: 'Такого готового урока нет' }).count()) === 1, 'planned lesson shows unavailable content instead of a blank page');

  await page.goto(`${baseURL}/progress`);
  const downloadEvent = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.getByRole('button', { name: 'Экспортировать JSON' }).click();
  const download = await downloadEvent;
  if (!download) throw new Error(`Export did not trigger a download; page errors: ${pageErrors.join('; ')}; progress buttons: ${await page.locator('.export-actions').innerText()}`);
  const filePath = await download.path();
  const exported = await (await import('node:fs/promises')).readFile(filePath, 'utf8');
  const parsed = JSON.parse(exported);
  check(parsed.format === 'friklang-progress' && parsed.version === 1, 'exports a versioned JSON backup');
  await page.goto(`${baseURL}/lessons/L02/tasks/L02-T03`);
  await page.locator('#task-answer').fill('are');
  await page.getByRole('button', { name: 'Проверить' }).click();
  await page.goto(`${baseURL}/progress`);
  await page.locator('#import-file').setInputFiles({ name: 'progress.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  await page.waitForFunction(() => location.pathname.startsWith('/lessons/'));
  await page.goto(`${baseURL}/lessons/L02/tasks/L02-T03`);
  check(await page.locator('#task-answer').inputValue() === 'is', 'imports prior saved state and replaces the later edit');

  const serviceWorkers = await page.evaluate(() => navigator.serviceWorker?.getRegistrations().then((items) => items.length) ?? 0);
  check(serviceWorkers === 0, 'does not claim or register an offline PWA service worker');
  check(externalRequests.size === 0, 'runtime lesson library makes no requests to external services');
  check(pageErrors.length === 0, `browser flow has no uncaught page errors (${pageErrors.join('; ')})`);
  console.log(`Completed ${passed} browser checks.`);
} finally {
  await browser?.close();
  server.kill();
}
