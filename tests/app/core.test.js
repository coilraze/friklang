import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAnswer } from '../../src/answer-checker.js';
import { deriveLessonStatus, taskRecord, validateImport } from '../../src/progress-store.js';

const task = (answers, extra = {}) => ({
  type: 'gap',
  answers,
  alternatives: [],
  validation: { mode: 'exact', trim_outer_whitespace: true, case_sensitive: true, punctuation_sensitive: true, ...extra },
});

test('keeps the She ___ calm regression task-specific', () => {
  const checked = { ...task(['is'], { reviewed_errors: { are: { category: 'grammar', explanation_ru: 'С she нужна is.' } } }), prompt: 'Только слово: She ___ calm.' };
  assert.equal(evaluateAnswer(checked, 'is').status, 'correct');
  assert.deepEqual(evaluateAnswer(checked, 'are').issues.map((issue) => issue.category), ['grammar']);
});

test('uses only listed contractions and alternatives; preserves punctuation and case', () => {
  assert.equal(evaluateAnswer(task(['She is ready.'], { typographic_apostrophe_equivalent: true }), 'She is ready.').status, 'correct');
  assert.equal(evaluateAnswer(task(['She is ready.'], { case_sensitive: false }), 'she is ready').status, 'partial');
  assert.equal(evaluateAnswer(task(['She is ready.']), "She's ready.").status, 'unreviewed');
  assert.equal(evaluateAnswer(task(['She is ready.'], { accepted_variants: ["She's ready."] }), "She's ready.").status, 'correct');
  assert.equal(evaluateAnswer(task(['She is ready.']), 'She is not ready.').status, 'unreviewed');
  assert.equal(evaluateAnswer(task(["She isn't ready."]), 'She isn’t ready.').status, 'correct');
  assert.equal(evaluateAnswer(task(['I am here.']), 'I am here').issues[0].category, 'punctuation');
  assert.equal(evaluateAnswer(task(['I am here.']), 'i am here.').issues[0].category, 'capitalization');
});

test('never string-grades free Writing', () => {
  assert.equal(evaluateAnswer({ type: 'writing', validation: { mode: 'manual' }, answers: [] }, 'A correct but original answer.').status, 'unreviewed');
});

test('accepts listed equivalent US spelling unless British spelling is the exercise target', () => {
  const spelling = task(['colour'], { language_variants: 'accept_equivalent_en_US' });
  assert.equal(evaluateAnswer(spelling, 'color').status, 'correct');
  assert.equal(evaluateAnswer({ ...spelling, prompt: 'Напиши именно британский вариант.' }, 'color').status, 'unreviewed');
  assert.equal(evaluateAnswer(task(['colour']), 'color').status, 'unreviewed');
});

test('derives lesson status independently from answer correctness', () => {
  const lesson = { id: 'L1', tasks: [{ id: 'L1-T01' }, { id: 'L1-T02' }] };
  const progress = { tasks: { 'L1-T01': { status: 'completed', attempts: [{ result: { status: 'incorrect' } }] }, 'L1-T02': { status: 'skipped' } } };
  assert.equal(deriveLessonStatus(lesson, progress), 'completed');
  assert.equal(taskRecord(progress, 'L1-T02').status, 'skipped');
  assert.equal(deriveLessonStatus(lesson, { tasks: { 'L1-T01': { status: 'skipped' }, 'L1-T02': { status: 'skipped' } } }), 'skipped');
});

test('rejects wrong export versions, unknown tasks and statuses', () => {
  const lessonIndex = new Map([['L1', { tasks: [{ id: 'L1-T01' }] }]]);
  const valid = { format: 'friklang-progress', version: 1, progress: { schemaVersion: 1, lessons: {}, tasks: {}, lastLocation: { lessonId: 'L1', taskId: 'L1-T01' } } };
  assert.equal(validateImport(valid, lessonIndex).schemaVersion, 1);
  assert.throws(() => validateImport({ ...valid, version: 2 }, lessonIndex));
  assert.throws(() => validateImport({ ...valid, progress: { ...valid.progress, tasks: { 'L1-T99': { status: 'completed' } } } }, lessonIndex));
  assert.throws(() => validateImport({ ...valid, progress: { ...valid.progress, tasks: { 'L1-T01': { status: 'unknown' } } } }, lessonIndex));
});
