import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseEnglishVoice, requiresPronunciationContext, speechCapability, speakText, stopSpeech } from '../../src/speech.js';

const voice = (name, lang) => ({ name, lang });

test('prefers an en-GB voice and clearly exposes a fallback language', () => {
  const voices = [voice('US voice', 'en-US'), voice('British voice', 'en-GB')];
  assert.equal(chooseEnglishVoice(voices).name, 'British voice');
  assert.equal(chooseEnglishVoice([voices[0]]).lang, 'en-US');
  assert.equal(chooseEnglishVoice([voice('French', 'fr-FR')]), null);
});

test('does not request context-sensitive homographs as isolated pronunciation samples', () => {
  assert.equal(requiresPronunciationContext('read'), true);
  assert.equal(requiresPronunciationContext('live'), true);
  assert.equal(requiresPronunciationContext('ready'), false);
});

test('handles unavailable API and missing English voices without throwing', () => {
  const statuses = [];
  assert.equal(speechCapability({}), false);
  assert.equal(speakText('hello', { scope: {}, onStatus: (status) => statuses.push(status) }), false);
  const scope = { speechSynthesis: { getVoices: () => [], cancel() {}, speak() {} }, SpeechSynthesisUtterance: class {} };
  assert.equal(speakText('hello', { scope, onStatus: (status) => statuses.push(status) }), false);
  assert.equal(statuses.length, 2);
  assert.ok(statuses.every((status) => status.type === 'unavailable'));
  const failingScope = { speechSynthesis: { getVoices() { throw new Error('unavailable'); }, cancel() {}, speak() {} }, SpeechSynthesisUtterance: class {} };
  assert.equal(speakText('hello', { scope: failingScope, onStatus: (status) => statuses.push(status) }), false);
  assert.equal(statuses.at(-1).type, 'error');
});

test('uses selected English voice, supports slow mode, cancellation and synthesis errors', () => {
  const calls = [];
  class MockUtterance { constructor(text) { this.text = text; } }
  const british = voice('English UK', 'en-GB');
  const scope = {
    SpeechSynthesisUtterance: MockUtterance,
    speechSynthesis: { getVoices: () => [british], cancel: () => calls.push('cancel'), speak: (utterance) => calls.push(utterance) },
  };
  const statuses = [];
  assert.equal(speakText('She is ready.', { slow: true, scope, onStatus: (status) => statuses.push(status) }), true);
  const utterance = calls.at(-1);
  assert.equal(utterance.voice, british);
  assert.equal(utterance.lang, 'en-GB');
  assert.equal(utterance.rate, 0.78);
  assert.equal(statuses.at(-1).type, 'playing');
  utterance.onerror({ error: 'network' });
  assert.equal(statuses.at(-1).type, 'error');
  stopSpeech(scope);
  assert.equal(calls.filter((call) => call === 'cancel').length, 2);
});
