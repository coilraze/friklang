import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const lessonIds = ['A0L01','A0L02','A0L03','A0L04','A0L05','L01','L02','L03','L04','L05'];

test('all ten existing lessons have layered guided theory and dictionary extensions', async () => {
  const lessons = await Promise.all(lessonIds.map(async (id) => JSON.parse(await readFile(resolve(`content/lessons/${id.toLowerCase()}.json`), 'utf8'))));
  assert.equal(lessons.length, 10);
  assert.equal(lessons.reduce((sum, lesson) => sum + lesson.tasks.length, 0), 150);
  for (const lesson of lessons) {
    assert.ok(lesson.theory?.length, `${lesson.id} keeps concise review`);
    assert.ok(lesson.theory_detail?.length >= 3, `${lesson.id} has detailed sections`);
    assert.deepEqual(Object.keys(lesson.vocabulary).sort(), Object.keys(lesson.vocabulary_detail).sort(), `${lesson.id} preserves and annotates every vocabulary entry`);
    assert.ok(lesson.theory_links?.every((id) => lessonIds.includes(id)), `${lesson.id} links only to existing lessons`);
    assert.ok(lesson.tasks.every((task) => task.id && Array.isArray(task.answers)), `${lesson.id} retains stable exercise identifiers and answer fields`);
  }
});

test('contraction reference distinguishes A1 forms and later ambiguous forms', async () => {
  const reference = JSON.parse(await readFile(resolve('content/contractions.json'), 'utf8'));
  const items = reference.groups.flatMap((group) => group.items);
  for (const form of ["I'm", "You're", "He's / She's / It's", "We're / They're", "I've", "I'll", "I'd", "don't / doesn't / didn't", "can't / cannot", "won't", "isn't / aren't / I'm not", "there's", "let's", "couldn't / wouldn't / shouldn't"]) {
    assert.ok(items.some((item) => item.short === form), `documents ${form}`);
  }
  assert.ok(reference.unavailable.length >= 3);
});
