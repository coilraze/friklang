import './styles.css';
import { levels, lessons, lessonsById, topics, tasksFor } from './catalog.js';
import contractions from '../content/contractions.json';
import { evaluateAnswer } from './answer-checker.js';
import { requiresPronunciationContext, speakText, stopSpeech } from './speech.js';
import {
  deriveLessonStatus, importProgress, loadProgress, saveProgress, taskRecord,
} from './progress-store.js';

const root = document.querySelector('#app');
const lessonStatusLabels = { not_started: 'Не начат', in_progress: 'В процессе', completed: 'Завершён', skipped: 'Пропущен' };
const resultLabels = { correct: 'Верно', partial: 'Частично', incorrect: 'Неверно', ambiguous: 'Нужна проверка', unreviewed: 'Самопроверка' };
let progress;
let drawerOpen = false;
let collapsed = new Set();
let searchText = '';
let errorMessage = '';
let activeTab = 'lesson';
let saveQueue = Promise.resolve();
let restoreFocus = null;
let speechStatus = '';

function route() {
  const match = location.pathname.match(/^\/lessons\/([^/]+)(?:\/tasks\/([^/]+))?\/?$/);
  if (match) return { page: 'lesson', lessonId: decodeURIComponent(match[1]), taskId: match[2] ? decodeURIComponent(match[2]) : null };
  if (location.pathname === '/progress') return { page: 'progress' };
  if (location.pathname === '/diagnostic') return { page: 'diagnostic' };
  if (location.pathname === '/contractions') return { page: 'contractions' };
  return { page: 'home' };
}

let currentRoute = route();

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function linkTo(path, label, className = '', attrs = '') {
  return `<a class="${className}" href="${escapeHtml(path)}" ${attrs}>${label}</a>`;
}

function lessonPath(lessonId, taskId = null) {
  return `/lessons/${encodeURIComponent(lessonId)}${taskId ? `/tasks/${encodeURIComponent(taskId)}` : ''}`;
}

function enqueueSave() {
  saveQueue = saveQueue.then(() => saveProgress(progress)).catch((error) => {
    errorMessage = `Не удалось сохранить в этом браузере: ${error.message}`;
    render();
  });
  return saveQueue;
}

function syncLessonStatus(lesson) {
  progress.lessons[lesson.id] = { status: deriveLessonStatus(lesson, progress), updatedAt: new Date().toISOString() };
}

function lessonNavItem(lesson) {
  const status = deriveLessonStatus(lesson, progress);
  const selected = currentRoute.lessonId === lesson.id;
  return `<a class="nav-lesson ${selected ? 'is-current' : ''}" href="${lessonPath(lesson.id)}" data-nav-link>
    <span>${escapeHtml(lesson.title)}</span><small>${lessonStatusLabels[status]}</small>
  </a>`;
}

function filteredLevels() {
  const query = searchText.trim().toLocaleLowerCase('ru');
  return levels.map((level) => ({
    ...level,
    topics: level.topics.map((topic) => {
      const topicMatches = !query || `${topic.title} ${topic.id}`.toLocaleLowerCase('ru').includes(query);
      return { ...topic, lessons: topic.lessons.filter((lesson) => !query || topicMatches || lesson.title.toLocaleLowerCase('ru').includes(query)), matches: topicMatches };
    }).filter((topic) => !query || topic.matches || topic.lessons.length),
  })).filter((level) => level.topics.length);
}

function renderDrawer() {
  const visibleLevels = filteredLevels();
  return `<div class="drawer-backdrop ${drawerOpen ? 'is-visible' : ''}" data-action="close-drawer"></div>
    <aside class="drawer ${drawerOpen ? 'is-open' : ''}" id="lesson-drawer" aria-label="Библиотека уроков" aria-hidden="${!drawerOpen}" ${drawerOpen ? '' : 'inert'}>
      <div class="drawer-heading"><div><span class="eyebrow">БИБЛИОТЕКА</span><h2>Уроки</h2></div><button class="icon-button drawer-close" data-action="close-drawer" aria-label="Закрыть меню">×</button></div>
      <label class="search-box"><span class="sr-only">Поиск по урокам и темам</span><span aria-hidden="true">⌕</span><input id="lesson-search" type="search" placeholder="Найти тему или урок" value="${escapeHtml(searchText)}"></label>
      <nav class="lesson-tree" aria-label="Уровни и уроки">${visibleLevels.map((level) => `<section class="level-group">
        <button class="tree-toggle level-toggle" data-action="toggle" data-id="${level.id}" aria-expanded="${!collapsed.has(level.id)}"><span>${level.id}</span><span>${collapsed.has(level.id) ? '+' : '−'}</span></button>
        ${!collapsed.has(level.id) ? level.topics.map((topic) => {
          const groupId = `${level.id}:${topic.id}`;
          const open = !collapsed.has(groupId) || Boolean(searchText);
          const actualLessons = topic.lessons;
          return `<section class="topic-group">
            <button class="tree-toggle topic-toggle" data-action="toggle" data-id="${groupId}" aria-expanded="${open}"><span>${escapeHtml(topic.title)}</span><span>${open ? '−' : '+'}</span></button>
            ${open ? (actualLessons.length ? actualLessons.map(lessonNavItem).join('') : `<div class="planned-topic"><span>${escapeHtml(topic.title)}</span><small>Урок пока не подготовлен</small></div>`) : ''}
          </section>`;
        }).join('') : ''}
      </section>`).join('')}</nav>
      <div class="drawer-footer">Доступ к урокам не зависит от прогресса и рекомендаций.</div>
    </aside>`;
}

function currentLesson() {
  return lessonsById.get(currentRoute.lessonId) ?? null;
}

function currentTask(lesson = currentLesson()) {
  return tasksFor(lesson).find((task) => task.id === currentRoute.taskId) ?? tasksFor(lesson)[0] ?? null;
}

function pageTitle() {
  if (currentRoute.page === 'progress') return 'Мой прогресс';
  if (currentRoute.page === 'diagnostic') return 'Входная диагностика';
  if (currentRoute.page === 'contractions') return 'Сокращённые формы';
  const lesson = currentLesson();
  return lesson?.title ?? (currentRoute.page === 'lesson' ? 'Урок не найден' : 'Английский в своём темпе');
}

function renderHeader() {
  return `<header class="topbar"><button class="menu-button" data-action="toggle-drawer" aria-label="Открыть меню уроков" aria-expanded="${drawerOpen}" aria-controls="lesson-drawer">☰</button>
    <a class="brand" href="/" data-link>friklang</a><div class="topbar-current">${escapeHtml(pageTitle())}</div>
    <nav class="top-actions" aria-label="Основные разделы">${linkTo('/', 'Библиотека', 'top-link', 'data-link')}${linkTo('/contractions', 'Сокращения', 'top-link', 'data-link')}${linkTo('/progress', 'Прогресс', 'top-link', 'data-link')}</nav>
  </header>`;
}

function renderHome() {
  const started = Object.values(progress.tasks).filter((item) => item.status !== 'not_started').length;
  return `<main class="page-shell"><section class="welcome-card">
    <span class="eyebrow">АНГЛИЙСКИЙ · GRAMMAR · READING · WRITING</span><h1>Учитесь в своём темпе</h1>
    <p>Открывайте любой урок, возвращайтесь к упражнениям и продолжайте с того места, где остановились.</p>
    <div class="welcome-actions"><button class="primary-button" data-action="open-drawer">Выбрать урок</button>${linkTo('/progress', 'Мой прогресс', 'secondary-button', 'data-link')}</div>
  </section>
  <section class="home-section"><div class="section-heading"><div><span class="eyebrow">ВАША БИБЛИОТЕКА</span><h2>Готовые уроки</h2></div><span class="quiet">${lessonsById.size} уроков · ${lessons.reduce((sum, lesson) => sum + lesson.tasks.length, 0)} заданий</span></div>
    <div class="lesson-cards">${lessons.map((lesson) => `<a class="lesson-card" href="${lessonPath(lesson.id)}" data-link><span class="card-level">${lesson.level.split(' ')[0]}</span><h3>${escapeHtml(lesson.title)}</h3><p>${escapeHtml(lesson.objective)}</p><span class="card-meta">${lesson.tasks.length} заданий · ${lessonStatusLabels[deriveLessonStatus(lesson, progress)]}</span></a>`).join('')}</div>
  </section><p class="quiet progress-note">Начато заданий: ${started}. Диагностика и предпосылки — только рекомендации.</p></main>`;
}

function speakControl(text) {
  if (/[\u0400-\u04ff\u0250-\u02ff]/u.test(String(text))) return '';
  return `<span class="speak-controls"><button class="speak-button" data-action="speak" data-text="${escapeHtml(text)}" aria-label="Озвучить: ${escapeHtml(text)}" title="Озвучить на английском">🔊</button><button class="speak-button slow-speak" data-action="speak-slow" data-text="${escapeHtml(text)}" aria-label="Озвучить медленно: ${escapeHtml(text)}" title="Медленно">0.78×</button></span>`;
}

function renderGuide(section, index) {
  return `<details class="guide-card"><summary>${escapeHtml(section.heading)}</summary><div class="guide-content"><p>${escapeHtml(section.body)}</p>${section.examples?.length ? `<div class="guide-examples">${section.examples.map((example) => `<div><p><strong>${escapeHtml(example.en)}</strong>${speakControl(example.en)}</p><p class="quiet">${escapeHtml(example.ru)}</p></div>`).join('')}</div>` : ''}${section.table ? `<div class="table-scroll"><table><thead><tr>${section.table.headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>${section.table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}${section.errors?.length ? `<div class="guide-errors">${section.errors.map((error) => `<p><del>${escapeHtml(error.incorrect)}</del> → <strong>${escapeHtml(error.correct)}</strong><br><span>${escapeHtml(error.why)}</span></p>`).join('')}</div>` : ''}</div></details>`;
}

function renderTheory(lesson) {
  return `<section class="theory-section" id="theory"><div class="section-heading"><div><span class="eyebrow">ТЕОРИЯ</span><h2>Разберём тему</h2></div></div>
    <details class="theory-summary" open><summary>Кратко · повторение</summary><div class="theory-grid">${lesson.theory.map((paragraph, index) => `<article class="theory-card"><span class="theory-number">${String(index + 1).padStart(2, '0')}</span><p>${escapeHtml(paragraph)}</p></article>`).join('')}</div></details>
    ${lesson.theory_detail?.length ? `<div class="deep-theory"><h3>Подробно · изучение с нуля</h3>${lesson.theory_detail.map(renderGuide).join('')}</div>` : ''}
    ${Object.keys(lesson.vocabulary ?? {}).length ? `<details class="vocabulary-panel"><summary>Словарь урока · ${Object.keys(lesson.vocabulary).length} слов и выражений</summary><div class="vocabulary-grid">${Object.entries(lesson.vocabulary).map(([word, meaning]) => { const detail = lesson.vocabulary_detail?.[word] ?? {}; const example = detail.example || ''; const contextNote = requiresPronunciationContext(word) ? '<small class="quiet">У этого написания несколько произношений: нажмите озвучивание у примера целиком.</small>' : ''; return `<span><b>${escapeHtml(word)} ${requiresPronunciationContext(word) ? '' : speakControl(word)}</b><span>${escapeHtml(detail.meaning_ru ?? meaning)}${detail.part_of_speech ? ` · ${escapeHtml(detail.part_of_speech)}` : ''}${detail.forms ? ` · формы: ${escapeHtml(detail.forms)}` : ''}${detail.ipa ? ` · IPA ${escapeHtml(detail.ipa)}` : ''}${detail.stress ? ` · ${escapeHtml(detail.stress)}` : ''}${contextNote}${example ? `<br><em>${escapeHtml(example)}</em>${speakControl(example)}` : ''}</span></span>`; }).join('')}</div></details>` : ''}
    ${lesson.examples?.length ? `<div class="examples-block"><h3>Примеры</h3>${lesson.examples.map((example) => `<article class="example-row"><div><span class="example-label">Так</span><p>${escapeHtml(example.correct)} ${speakControl(example.correct)}</p></div><div><span class="example-label">Не так</span><p class="wrong-example">${escapeHtml(example.incorrect)}</p></div><p class="example-fix">${escapeHtml(example.explanation_ru)}</p></article>`).join('')}</div>` : ''}
    ${lesson.theory_links?.length ? `<nav class="related-lessons" aria-label="Связанные уроки"><strong>Связанные темы</strong>${lesson.theory_links.map((id) => { const related = lessonsById.get(id); return related ? `<a href="${lessonPath(id)}" data-link>${escapeHtml(related.title)} →</a>` : ''; }).join('')}</nav>` : ''}
    <div class="speech-toolbar" aria-live="polite"><span id="speech-status">${escapeHtml(speechStatus || 'Озвучивание по нажатию · en-GB при наличии; голос зависит от устройства.')}</span><button class="text-button" data-action="stop-speech">Остановить</button></div>
  </section>`;
}

function renderContractions() {
  return `<main class="page-shell"><header class="page-heading"><span class="eyebrow">СПРАВОЧНИК · GRAMMAR</span><h1>${escapeHtml(contractions.title)}</h1><p>Откройте нужную группу. Сокращение помогает узнать естественную речь, но не всегда подходит любому жанру.</p></header><section class="contraction-principles">${contractions.principles.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}</section>${contractions.groups.map((group) => `<section class="contraction-group"><h2>${escapeHtml(group.level)}</h2>${group.items.map((item) => `<article class="contraction-card"><h3>${escapeHtml(item.short)} <span>← ${escapeHtml(item.full)}</span> ${speakControl(item.short)}</h3><p>${escapeHtml(item.context)}</p></article>`).join('')}</section>`).join('')}<section class="contraction-group"><h2>Где нужна осторожность</h2>${contractions.unavailable.map((item) => `<p class="contraction-card">${escapeHtml(item)}</p>`).join('')}</section></main>`;
}

function taskReading(lesson, task) {
  const source = task.reading_id && lesson.assessment_reading?.id === task.reading_id ? lesson.assessment_reading : lesson.reading;
  if (!source) return '';
  const used = task.type === 'reading' || task.type === 'word_recognition' || task.reading_id || /A0L\d\d-R/.test(task.prompt) || task.prompt.includes('по карточкам') || task.prompt.includes('в A0L');
  if (!used) return '';
  const title = source.skill === 'word_recognition' ? 'Карточка для распознавания слов' : 'Текст для понимания';
  return `<section class="reading-card"><span class="eyebrow">${title}</span><pre>${escapeHtml(source.text)}</pre>${source.glossary && Object.keys(source.glossary).length ? `<div class="glossary">${Object.entries(source.glossary).map(([word, meaning]) => `<span><b>${escapeHtml(word)}</b> — ${escapeHtml(meaning)}</span>`).join('')}</div>` : ''}${source.context_ru ? `<p class="quiet">${escapeHtml(source.context_ru)}</p>` : ''}</section>`;
}

function taskFeedback(task, record) {
  const latest = record.attempts?.at(-1);
  if (!latest) return '';
  const label = resultLabels[latest.result.status] ?? latest.result.status;
  const issue = latest.result.issues?.[0];
  const feedback = latest.result.status === 'correct' ? task.feedback_ru : issue?.explanation_ru ?? (latest.result.status === 'unreviewed' && (task.type === 'writing' || task.validation?.mode === 'manual') ? 'Свободный ответ сохранён без автоматической оценки. Сверьтесь с критериями или попросите преподавателя.' : latest.result.status === 'unreviewed' ? 'Ответ не совпал с явно перечисленными вариантами. Автоматическая проверка не распознала его и не помечает как неправильный.' : task.feedback_ru);
  return `<div class="feedback-panel feedback-${latest.result.status}" role="status"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(feedback)}</p>${issue?.category ? `<span class="feedback-category">${escapeHtml(issue.category)}</span>` : ''}</div>`;
}

function renderTask(lesson, task, taskIndex) {
  const record = taskRecord(progress, task.id);
  const writing = task.type === 'writing' || task.validation?.mode === 'manual';
  const canRevealExplanation = record.attempts.length > 0 || record.status === 'skipped';
  const canRevealSample = Boolean(record.response?.trim()) || record.status === 'completed';
  const reading = taskReading(lesson, task);
  const inputTag = writing ? 'textarea' : 'input';
  const valueAttr = escapeHtml(record.response ?? '');
  const input = writing
    ? `<textarea id="task-answer" rows="5" placeholder="Напишите свой ответ…">${valueAttr}</textarea>`
    : `<input id="task-answer" type="text" value="${valueAttr}" autocomplete="off" spellcheck="false" aria-label="Ваш ответ">`;
  const hint = task.hint ? `<button class="text-button" data-action="hint">Подсказка</button>` : '';
  return `<article class="task-card" id="task-card">
    <div class="task-topline"><div><span class="eyebrow">ЗАДАНИЕ ${taskIndex + 1} ИЗ ${lesson.tasks.length}</span><h2>${escapeHtml(task.objective)}</h2></div><span class="task-type">${escapeHtml(task.type)}</span></div>
    ${reading}
    <p class="task-prompt">${escapeHtml(task.prompt)}</p>
    <label class="answer-label" for="task-answer">${writing ? 'Ваш текст' : 'Ваш ответ'}</label>${input}
    <div class="task-actions">${writing ? `<button class="primary-button" data-action="self-review">Свериться с критериями</button><button class="secondary-button" data-action="mark-writing-done">Отметить как просмотренное</button>` : `<button class="primary-button" data-action="check-answer">Проверить</button>`}${hint}<button class="text-button" data-action="explanation" ${canRevealExplanation ? '' : 'disabled title="Сначала ответьте или пропустите задание"'}>Показать объяснение</button></div>
    ${taskFeedback(task, record)}
    <div class="explanation-box ${record.explanationOpen ? 'is-open' : ''}" id="explanation-box"><p>${escapeHtml(task.feedback_ru ?? '')}</p>${task.sample_answer && canRevealSample ? `<p><strong>Возможный образец:</strong> ${escapeHtml(task.sample_answer)}</p>` : ''}</div>
    ${writing ? `<div class="self-review-box ${record.selfReviewOpen ? 'is-open' : ''}" id="self-review-box"><h3>Самопроверка</h3><p>Образец показывает один возможный ответ. Совпадение строк не требуется.</p>${task.sample_answer && canRevealSample ? `<div class="sample-answer">${escapeHtml(task.sample_answer)}</div>` : task.sample_answer ? '<p class="quiet">Сначала напишите свой ответ; тогда можно будет открыть пример для сравнения.</p>' : ''}<ul>${(task.criteria ?? []).map((criterion) => `<li>${escapeHtml(criterion)}</li>`).join('')}</ul>${task.writing_support?.checklist_ru?.length ? `<h4>Проверьте себя</h4><ul>${task.writing_support.checklist_ru.map((criterion) => `<li>${escapeHtml(criterion)}</li>`).join('')}</ul>` : ''}<p class="quiet">Не уверены — оставьте ответ без оценки или попросите преподавателя проверить его.</p></div>` : ''}
    <div class="task-bottom"><span class="status-pill status-${record.status}">${lessonStatusLabels[record.status]}</span><div class="task-bottom-actions"><button class="text-button" data-action="remind">Напомнить позже</button><button class="secondary-button" data-action="skip">Пропустить</button></div></div>
  </article>`;
}

function renderTaskRail(lesson, activeTask) {
  return `<nav class="task-rail" aria-label="Переход к заданию"><span class="eyebrow">ЗАДАНИЯ</span><div class="task-numbers">${lesson.tasks.map((task, index) => `<a href="${lessonPath(lesson.id, task.id)}" data-link class="task-number ${activeTask.id === task.id ? 'is-current' : ''} status-${taskRecord(progress, task.id).status}" aria-label="Задание ${index + 1}, ${lessonStatusLabels[taskRecord(progress, task.id).status]}">${index + 1}</a>`).join('')}</div></nav>`;
}

function renderLesson() {
  const lesson = currentLesson();
  if (!lesson) return `<main class="page-shell"><section class="empty-state"><span class="eyebrow">МАТЕРИАЛ НЕ НАЙДЕН</span><h1>Такого готового урока нет</h1><p>В программе может быть тема, для которой урок ещё не подготовлен. Мы не откроем пустую страницу.</p><a class="secondary-button" href="/" data-link>Вернуться в библиотеку</a></section></main>`;
  const task = currentTask(lesson);
  const taskIndex = lesson.tasks.findIndex((item) => item.id === task.id);
  const previous = lesson.tasks[taskIndex - 1];
  const next = lesson.tasks[taskIndex + 1];
  const topic = topics.find((item) => lesson.curriculum_topics?.includes(item.id));
  return `<main class="page-shell lesson-page"><div class="lesson-heading"><div><span class="eyebrow">${lesson.level.split(' ')[0]} · ${escapeHtml(topic?.title ?? '')}</span><h1>${escapeHtml(lesson.title)}</h1><p>${escapeHtml(lesson.objective)}</p></div><span class="status-pill status-${deriveLessonStatus(lesson, progress)}">${lessonStatusLabels[deriveLessonStatus(lesson, progress)]}</span></div>
    <div class="lesson-columns"><section class="lesson-main">${renderTheory(lesson)}<div class="practice-heading" id="practice"><div><span class="eyebrow">ПРАКТИКА · ${lesson.tasks.length} ЗАДАНИЙ</span><h2>Попробуйте сами</h2></div><button class="text-button" data-action="return-theory">↑ К теории</button></div>${renderTask(lesson, task, taskIndex)}
      <nav class="task-pager" aria-label="Навигация по упражнениям"><a class="secondary-button ${previous ? '' : 'is-disabled'}" ${previous ? `href="${lessonPath(lesson.id, previous.id)}" data-link` : 'aria-disabled="true"'}>← Назад</a><span>${taskIndex + 1} / ${lesson.tasks.length}</span><a class="primary-button" href="${next ? lessonPath(lesson.id, next.id) : '/'}" data-link>${next ? 'Далее →' : 'К библиотеке'}</a></nav>
    </section>${renderTaskRail(lesson, task)}</div></main>`;
}

function renderProgress() {
  const allTasks = lessons.flatMap((lesson) => lesson.tasks.map((task) => ({ lesson, task, record: taskRecord(progress, task.id) })));
  const counts = Object.fromEntries(['not_started', 'in_progress', 'completed', 'skipped'].map((status) => [status, allTasks.filter((item) => item.record.status === status).length]));
  const attempts = allTasks.flatMap(({ lesson, task, record }) => record.attempts.map((attempt, index) => ({ lesson, task, attempt, index })));
  const due = allTasks.flatMap(({ lesson, task, record }) => record.reminders.map((reminder) => ({ lesson, task, reminder }))).filter(({ reminder }) => reminder.dueAt);
  const issueCounts = Object.fromEntries([...new Set(attempts.flatMap(({ attempt }) => attempt.result.issues?.map((issue) => issue.category) ?? []))].map((category) => [category, attempts.filter(({ attempt }) => attempt.result.issues?.some((issue) => issue.category === category)).length]));
  const lastLesson = lessonsById.get(progress.lastLocation?.lessonId);
  const lastTask = lastLesson?.tasks.find((task) => task.id === progress.lastLocation?.taskId);
  return `<main class="page-shell"><div class="page-heading"><span class="eyebrow">ЛОКАЛЬНО В ЭТОМ БРАУЗЕРЕ</span><h1>Мой прогресс</h1><p>Пропуски и ошибки не ограничивают доступ. Незавершённые и пропущенные задания показаны отдельно и не считаются правильными.</p>${lastLesson && lastTask ? `<a class="primary-button" href="${lessonPath(lastLesson.id, lastTask.id)}" data-link>Продолжить: ${escapeHtml(lastLesson.title)} · ${escapeHtml(lastTask.id)}</a>` : ''}</div>
    <section class="stat-grid">${Object.entries(counts).map(([key, count]) => `<article class="stat-card"><span>${lessonStatusLabels[key]}</span><strong>${count}</strong></article>`).join('')}</section>
    <section class="progress-section"><div class="section-heading"><div><span class="eyebrow">ИСТОРИЯ</span><h2>Попытки и ответы</h2></div><span class="quiet">${attempts.length} попыток · ${attempts.filter((item) => item.attempt.result.status === 'incorrect').length} ошибок</span></div>
    ${Object.keys(issueCounts).length ? `<p class="issue-summary">Ошибки по категориям: ${Object.entries(issueCounts).map(([category, count]) => `<span>${escapeHtml(category)} · ${count}</span>`).join('')}</p>` : ''}${attempts.length ? `<div class="history-list">${attempts.slice().reverse().map(({ lesson, task, attempt, index }) => `<article class="history-row"><div><strong>${escapeHtml(lesson.id)} · ${escapeHtml(task.id)}</strong><p>${escapeHtml(attempt.response)}</p><small>${new Date(attempt.at).toLocaleString('ru-RU')} · попытка ${index + 1} · ${escapeHtml(attempt.reviewMethod)}</small></div><span class="status-pill status-${attempt.result.status}">${resultLabels[attempt.result.status]}</span></article>`).join('')}</div>` : '<p class="quiet">Пока нет проверенных попыток.</p>'}</section>
    <section class="progress-section"><div class="section-heading"><div><span class="eyebrow">ОТЛОЖЕННОЕ</span><h2>Задания на потом</h2></div></div>${due.length ? `<div class="history-list">${due.map(({ lesson, task, reminder }) => `<a class="history-row" href="${lessonPath(lesson.id, task.id)}" data-link><span>${escapeHtml(task.id)} · ${escapeHtml(task.objective)}</span><small>${new Date(reminder.dueAt).toLocaleDateString('ru-RU')}</small></a>`).join('')}</div>` : '<p class="quiet">Вы пока ничего не отложили.</p>'}</section>
    <section class="progress-section"><div class="section-heading"><div><span class="eyebrow">РЕЗЕРВНАЯ КОПИЯ</span><h2>Перенос прогресса</h2></div></div><p>Экспортируйте ответы и черновики в файл JSON. Импорт заменит текущую локальную копию.</p><div class="export-actions"><button class="secondary-button" data-action="export">Экспортировать JSON</button><label class="secondary-button file-button">Импортировать JSON<input type="file" id="import-file" accept="application/json,.json"></label></div></section>
  </main>`;
}

function renderDiagnostic() {
  return `<main class="page-shell"><section class="welcome-card"><span class="eyebrow">РЕКОМЕНДАЦИИ, НЕ ЭКЗАМЕН</span><h1>Начните с того, что вам полезно</h1><p>Диагностика в документах курса описывает навыки Grammar, Reading Comprehension, Writing, Punctuation и Spelling / Word Recognition. Любой урок можно открыть без неё.</p><div class="welcome-actions"><a class="primary-button" href="/lessons/A0L01" data-link>Начать с A0</a><button class="secondary-button" data-action="open-drawer">Выбрать любой урок</button></div></section><section class="progress-section"><h2>Материалы диагностики</h2><p>Письменные задания диагностики пока не подключены как интерактивный блок. Спецификация и банк пунктов доступны в документации курса: <code>docs/diagnostic-assessment.md</code>.</p></section></main>`;
}

function render() {
  const content = currentRoute.page === 'lesson' ? renderLesson()
    : currentRoute.page === 'progress' ? renderProgress()
      : currentRoute.page === 'diagnostic' ? renderDiagnostic()
        : currentRoute.page === 'contractions' ? renderContractions() : renderHome();
  root.innerHTML = `${renderHeader()}${renderDrawer()}${content}${errorMessage ? `<div class="toast" role="alert">${escapeHtml(errorMessage)}<button data-action="dismiss-error" aria-label="Закрыть сообщение">×</button></div>` : ''}`;
  document.title = `${pageTitle()} · friklang`;
  if (drawerOpen) {
    const search = document.querySelector('#lesson-search');
    search?.focus({ preventScroll: true });
  }
}

async function navigate(path, { replace = false } = {}) {
  stopSpeech();
  const openTaskDirectly = new URL(path, location.origin).pathname.includes('/tasks/');
  await enqueueSave();
  if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
  currentRoute = route();
  if (currentRoute.page === 'lesson' && lessonsById.has(currentRoute.lessonId)) {
    const lesson = lessonsById.get(currentRoute.lessonId);
    const task = lesson.tasks.find((item) => item.id === currentRoute.taskId) ?? lesson.tasks[0];
    currentRoute.taskId = task.id;
    if (!location.pathname.endsWith(encodeURIComponent(task.id))) history.replaceState({}, '', lessonPath(lesson.id, task.id));
    progress.lastLocation = { lessonId: lesson.id, taskId: task.id };
    syncLessonStatus(lesson);
    const record = taskRecord(progress, task.id);
    if (record.status === 'skipped') record.status = 'skipped';
    await enqueueSave();
  }
  drawerOpen = false;
  activeTab = 'lesson';
  errorMessage = '';
  render();
  if (openTaskDirectly) document.querySelector('#task-card')?.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, 0);
}

function writeCurrentResponse(response) {
  if (currentRoute.page !== 'lesson') return;
  const lesson = currentLesson();
  const task = currentTask(lesson);
  if (!task) return;
  const record = taskRecord(progress, task.id);
  record.response = response;
  if (record.status === 'not_started' || record.status === 'skipped') record.status = 'in_progress';
  record.updatedAt = new Date().toISOString();
  progress.tasks[task.id] = record;
  syncLessonStatus(lesson);
  enqueueSave();
  refreshStatusIndicators(lesson, task);
}

function refreshStatusIndicators(lesson, task) {
  const status = taskRecord(progress, task.id).status;
  const taskStatus = document.querySelector('.task-bottom .status-pill');
  if (taskStatus) {
    taskStatus.className = `status-pill status-${status}`;
    taskStatus.textContent = lessonStatusLabels[status];
  }
  const lessonStatus = document.querySelector('.lesson-heading > .status-pill');
  if (lessonStatus) {
    const lessonValue = deriveLessonStatus(lesson, progress);
    lessonStatus.className = `status-pill status-${lessonValue}`;
    lessonStatus.textContent = lessonStatusLabels[lessonValue];
  }
  const navStatus = document.querySelector(`.nav-lesson[href="${lessonPath(lesson.id)}"] small`);
  if (navStatus) navStatus.textContent = lessonStatusLabels[deriveLessonStatus(lesson, progress)];
}

function attemptAction() {
  const lesson = currentLesson();
  const task = currentTask(lesson);
  const response = document.querySelector('#task-answer')?.value ?? '';
  if (!response.trim()) {
    errorMessage = 'Введите ответ или пропустите задание. Пустой ответ не будет засчитан.';
    render();
    return;
  }
  const record = taskRecord(progress, task.id);
  record.response = response;
  record.status = 'completed';
  const result = evaluateAnswer(task, response);
  record.attempts.push({ at: new Date().toISOString(), response, result, reviewMethod: result.status === 'unreviewed' ? 'unreviewed' : 'automatic' });
  progress.tasks[task.id] = record;
  syncLessonStatus(lesson);
  enqueueSave();
  render();
}

function markWritingDone() {
  const lesson = currentLesson();
  const task = currentTask(lesson);
  const response = document.querySelector('#task-answer')?.value ?? '';
  if (!response.trim()) {
    errorMessage = 'Сначала напишите ответ или пропустите задание.';
    render();
    return;
  }
  const record = taskRecord(progress, task.id);
  record.response = response;
  record.status = 'completed';
  record.attempts.push({ at: new Date().toISOString(), response, result: { status: 'unreviewed', issues: [], review_required: true }, reviewMethod: 'self_review_pending' });
  progress.tasks[task.id] = record;
  syncLessonStatus(lesson);
  enqueueSave();
  render();
}

function skipTask() {
  const lesson = currentLesson();
  const task = currentTask(lesson);
  const record = taskRecord(progress, task.id);
  record.status = 'skipped';
  record.skippedAt = new Date().toISOString();
  record.skipEvents ??= [];
  record.skipEvents.push({ at: record.skippedAt });
  progress.tasks[task.id] = record;
  syncLessonStatus(lesson);
  const next = lesson.tasks[lesson.tasks.findIndex((item) => item.id === task.id) + 1];
  enqueueSave();
  if (next) navigate(lessonPath(lesson.id, next.id)); else render();
}

function addReminder() {
  const lesson = currentLesson();
  const task = currentTask(lesson);
  const record = taskRecord(progress, task.id);
  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  record.reminders.push({ createdAt: new Date().toISOString(), dueAt });
  progress.tasks[task.id] = record;
  enqueueSave();
  errorMessage = 'Добавлено в отложенные задания на завтра. Это напоминание необязательно.';
  render();
}

function exportFile() {
  const payload = { format: 'friklang-progress', version: progress.schemaVersion, exportedAt: new Date().toISOString(), progress };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `friklang-progress-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importFile(file) {
  try {
    const payload = JSON.parse(await file.text());
    const imported = await importProgress(payload, lessonsById);
    progress = imported;
    await navigate(progress.lastLocation?.lessonId ? lessonPath(progress.lastLocation.lessonId, progress.lastLocation.taskId) : '/progress');
  } catch (error) {
    errorMessage = `Импорт отклонён: ${error.message}`;
    render();
  }
}

function toggleDrawer() {
  if (drawerOpen) closeDrawer();
  else {
    restoreFocus = document.activeElement;
    drawerOpen = true;
    render();
  }
}

function closeDrawer() {
  drawerOpen = false;
  render();
  if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
  else document.querySelector('.menu-button')?.focus({ preventScroll: true });
}

root.addEventListener('click', async (event) => {
  const link = event.target.closest('a[data-link], a[data-nav-link]');
  if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
    event.preventDefault();
    await navigate(link.getAttribute('href'));
    return;
  }
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const { action, id } = control.dataset;
  if (action === 'toggle-drawer' || action === 'open-drawer') toggleDrawer();
  if (action === 'close-drawer') closeDrawer();
  if (action === 'toggle') { collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id); render(); }
  if (action === 'check-answer') attemptAction();
  if (action === 'skip') skipTask();
  if (action === 'self-review') { const record = taskRecord(progress, currentTask().id); record.selfReviewOpen = !record.selfReviewOpen; enqueueSave(); render(); }
  if (action === 'explanation') { const record = taskRecord(progress, currentTask().id); record.explanationOpen = !record.explanationOpen; enqueueSave(); render(); }
  if (action === 'mark-writing-done') markWritingDone();
  if (action === 'return-theory') document.querySelector('#theory')?.scrollIntoView({ behavior: 'smooth' });
  if (action === 'speak' || action === 'speak-slow') speakText(control.dataset.text, { slow: action === 'speak-slow', onStatus: ({ message, type }) => {
    speechStatus = message || 'Озвучивание завершено.';
    const status = document.querySelector('#speech-status');
    if (status) status.textContent = speechStatus;
    if (type === 'error' || type === 'unavailable') errorMessage = message;
  } });
  if (action === 'stop-speech') { stopSpeech(); speechStatus = 'Озвучивание остановлено.'; const status = document.querySelector('#speech-status'); if (status) status.textContent = speechStatus; }
  if (action === 'remind') addReminder();
  if (action === 'export') exportFile();
  if (action === 'dismiss-error') { errorMessage = ''; render(); }
  if (action === 'hint') { errorMessage = 'Для этого задания автор не подготовил отдельную подсказку.'; render(); }
});

root.addEventListener('input', (event) => {
  if (event.target.id === 'lesson-search') {
    const caret = event.target.selectionStart;
    searchText = event.target.value;
    render();
    const nextSearch = document.querySelector('#lesson-search');
    nextSearch?.focus({ preventScroll: true });
    nextSearch?.setSelectionRange(caret, caret);
  }
  if (event.target.id === 'task-answer') writeCurrentResponse(event.target.value);
});

root.addEventListener('change', (event) => {
  if (event.target.id === 'import-file' && event.target.files[0]) importFile(event.target.files[0]);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && drawerOpen) closeDrawer();
  if (event.key === 'Tab' && drawerOpen) {
    const focusable = [...document.querySelectorAll('#lesson-drawer button:not([disabled]), #lesson-drawer input:not([disabled]), #lesson-drawer a[href]')];
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
  }
});

window.addEventListener('popstate', async () => {
  const openTaskDirectly = location.pathname.includes('/tasks/');
  currentRoute = route();
  drawerOpen = false;
  if (currentRoute.page === 'lesson') {
    const lesson = currentLesson();
    const task = lesson?.tasks.find((item) => item.id === currentRoute.taskId) ?? lesson?.tasks[0];
    if (lesson && task) {
      currentRoute.taskId = task.id;
      progress.lastLocation = { lessonId: lesson.id, taskId: task.id };
      syncLessonStatus(lesson);
      await enqueueSave();
    }
  }
  render();
  if (openTaskDirectly) document.querySelector('#task-card')?.scrollIntoView({ block: 'start' });
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') enqueueSave();
});

progress = await loadProgress();
if (!location.pathname.startsWith('/lessons/')) {
  currentRoute = route();
} else if (!lessonsById.has(currentRoute.lessonId)) {
  // Unknown or planned lessons show an informative state instead of a blank route.
} else {
  const lesson = currentLesson();
  const task = lesson.tasks.find((item) => item.id === currentRoute.taskId) ?? lesson.tasks[0];
  currentRoute.taskId = task.id;
  if (location.pathname !== lessonPath(lesson.id, task.id)) history.replaceState({}, '', lessonPath(lesson.id, task.id));
  progress.lastLocation = { lessonId: lesson.id, taskId: task.id };
  syncLessonStatus(lesson);
  await saveProgress(progress);
}
render();
if (location.pathname.includes('/tasks/')) requestAnimationFrame(() => document.querySelector('#task-card')?.scrollIntoView({ block: 'start' }));
