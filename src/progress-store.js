export const DATABASE_NAME = 'friklang-progress';
export const DATABASE_VERSION = 1;
export const EXPORT_FORMAT = 'friklang-progress';
export const EXPORT_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function stateTransaction(mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', mode);
    const store = tx.objectStore('state');
    const request = operation(store);
    let result;
    if (request) {
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
    }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('IndexedDB transaction aborted')); };
  });
}

const emptyProgress = () => ({
  schemaVersion: EXPORT_VERSION,
  updatedAt: new Date().toISOString(),
  lastLocation: { lessonId: 'A0L01', taskId: 'A0L01-T01' },
  lessons: {},
  tasks: {},
});

export async function loadProgress() {
  return (await stateTransaction('readonly', (store) => store.get('progress'))) ?? emptyProgress();
}

export async function saveProgress(progress) {
  const safeProgress = { ...progress, schemaVersion: EXPORT_VERSION, updatedAt: new Date().toISOString() };
  await stateTransaction('readwrite', (store) => store.put(safeProgress, 'progress'));
  return safeProgress;
}

export async function exportProgress() {
  const progress = await loadProgress();
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    progress,
  };
}

export function validateImport(payload, lessonIndex) {
  if (!payload || payload.format !== EXPORT_FORMAT || payload.version !== EXPORT_VERSION) {
    throw new Error('Формат файла или его версия не поддерживаются.');
  }
  const state = payload.progress;
  if (!state || state.schemaVersion !== EXPORT_VERSION || !state.tasks || !state.lessons || !state.lastLocation) {
    throw new Error('В файле отсутствуют обязательные данные прогресса.');
  }
  if (typeof state.tasks !== 'object' || Array.isArray(state.tasks) || typeof state.lessons !== 'object' || Array.isArray(state.lessons)) {
    throw new Error('Списки заданий или уроков имеют неверный формат.');
  }
  const validStatuses = new Set(['not_started', 'in_progress', 'completed', 'skipped']);
  for (const [taskId, record] of Object.entries(state.tasks)) {
    const lesson = lessonIndex.get(taskId.split('-T')[0]);
    if (!lesson?.tasks.some((task) => task.id === taskId) || !validStatuses.has(record.status)) {
      throw new Error(`Некорректная запись прогресса: ${taskId}`);
    }
  }
  if (!lessonIndex.has(state.lastLocation.lessonId)) throw new Error('Последний открытый урок отсутствует в этой версии библиотеки.');
  if (state.lastLocation.taskId && !lessonIndex.get(state.lastLocation.lessonId).tasks.some((task) => task.id === state.lastLocation.taskId)) {
    throw new Error('Последнее открытое задание отсутствует в этой версии библиотеки.');
  }
  for (const [lessonId, record] of Object.entries(state.lessons)) {
    if (!lessonIndex.has(lessonId) || !validStatuses.has(record.status)) throw new Error(`Некорректный статус урока: ${lessonId}`);
  }
  return structuredClone(state);
}

export async function importProgress(payload, lessonIndex) {
  const progress = validateImport(payload, lessonIndex);
  return saveProgress(progress);
}

export function taskRecord(progress, taskId) {
  return progress.tasks[taskId] ?? { status: 'not_started', response: '', attempts: [], reminders: [], skipEvents: [] };
}

export function deriveLessonStatus(lesson, progress) {
  const records = lesson.tasks.map((task) => taskRecord(progress, task.id));
  if (records.every((record) => record.status === 'not_started')) return 'not_started';
  if (records.every((record) => record.status === 'skipped')) return 'skipped';
  if (records.every((record) => record.status === 'completed' || record.status === 'skipped')) return 'completed';
  return 'in_progress';
}
