export function speechCapability(scope = globalThis) {
  return Boolean(scope?.speechSynthesis && scope?.SpeechSynthesisUtterance && typeof scope.speechSynthesis.getVoices === 'function');
}

export function chooseEnglishVoice(voices = []) {
  const english = voices.filter((voice) => /^en(?:-|_)/i.test(voice.lang ?? ''));
  return english.find((voice) => /^en[-_]GB$/i.test(voice.lang))
    ?? english.find((voice) => /^en[-_]GB/i.test(voice.lang))
    ?? english[0]
    ?? null;
}

const contextSensitiveWords = new Set(['read', 'live']);
export function requiresPronunciationContext(word) {
  return contextSensitiveWords.has(String(word).trim().toLocaleLowerCase('en-GB'));
}

export function speakText(text, { slow = false, scope = globalThis, onStatus = () => {} } = {}) {
  if (!speechCapability(scope)) {
    onStatus({ type: 'unavailable', message: 'В этом браузере нет встроенной озвучки. Текст и IPA остаются доступны.' });
    return false;
  }
  try {
    const voice = chooseEnglishVoice(scope.speechSynthesis.getVoices());
    if (!voice) {
      onStatus({ type: 'unavailable', message: 'Браузер пока не предоставил английский голос. Попробуйте позже или проверьте голоса устройства.' });
      return false;
    }
    scope.speechSynthesis.cancel();
    const utterance = new scope.SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = slow ? 0.78 : 1;
    utterance.onerror = (event) => onStatus({ type: 'error', message: `Озвучивание не завершилось (${event.error ?? 'ошибка синтеза'}).` });
    utterance.onend = () => onStatus({ type: 'ended', message: '' });
    scope.speechSynthesis.speak(utterance);
    onStatus({ type: 'playing', message: `Голос: ${voice.name || voice.lang} (${voice.lang})${slow ? ' · медленно' : ''}` });
    return true;
  } catch {
    onStatus({ type: 'error', message: 'Не удалось запустить озвучивание. Можно продолжить работу с текстом.' });
    return false;
  }
}

export function stopSpeech(scope = globalThis) {
  if (scope?.speechSynthesis) scope.speechSynthesis.cancel();
}
