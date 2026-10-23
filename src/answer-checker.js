const canonical = (value, trim = true) => {
  const normal = String(value ?? '').normalize('NFC').replace(/[’‘]/g, "'");
  return trim ? normal.trim() : normal;
};

const americanSpellings = new Map([
  ['colour', 'color'], ['favourite', 'favorite'], ['honour', 'honor'], ['labour', 'labor'], ['neighbour', 'neighbor'],
  ['centre', 'center'], ['theatre', 'theater'], ['metre', 'meter'], ['litre', 'liter'],
  ['organise', 'organize'], ['realise', 'realize'], ['recognise', 'recognize'], ['apologise', 'apologize'],
  ['travelling', 'traveling'], ['travelled', 'traveled'], ['cancelling', 'canceling'], ['cancelled', 'canceled'],
  ['defence', 'defense'], ['offence', 'offense'], ['grey', 'gray'], ['tyre', 'tire'],
]);

function americanEquivalent(value) {
  return canonical(value).replace(/[A-Za-z]+/g, (word) => {
    const lower = word.toLowerCase();
    const plural = lower.endsWith('s') && americanSpellings.has(lower.slice(0, -1));
    const american = americanSpellings.get(plural ? lower.slice(0, -1) : lower);
    if (!american) return word;
    const target = american + (plural ? 's' : '');
    if (word === lower) return target;
    if (word === word.toUpperCase()) return target.toUpperCase();
    return target[0].toUpperCase() + target.slice(1);
  });
}

function explicitlyTargetsBritish(task) {
  return /\b(?:en-GB|British spelling|British English)\b|британск(?:ий|ую)\s+(?:вариант|орфограф)|именно\s+британск/i.test(`${task.objective ?? ''} ${task.prompt ?? ''}`);
}

export function evaluateAnswer(task, rawResponse) {
  const response = canonical(rawResponse, task.validation?.trim_outer_whitespace !== false);
  if (task.type === 'writing' || task.validation?.mode === 'manual' || !response) {
    return { status: 'unreviewed', issues: [], review_required: true };
  }

  const validation = task.validation ?? {};
  const reviewedErrors = validation.reviewed_errors ?? {};
  const knownError = Object.entries(reviewedErrors).find(([known]) => canonical(known) === response);
  if (knownError) {
    const [match, issue] = knownError;
    return {
      status: issue.category === 'grammar' ? 'incorrect' : 'partial',
      issues: [{ category: issue.category, explanation_ru: issue.explanation_ru, match }],
      review_required: false,
    };
  }

  const expected = [...(task.answers ?? []), ...(task.alternatives ?? [])].map((value) => canonical(value));
  const caseSensitive = validation.case_sensitive !== false;
  const acceptedVariant = (validation.accepted_variants ?? []).map((value) => canonical(value)).includes(response);
  const equal = (a, b) => caseSensitive ? a === b : a.toLocaleLowerCase() === b.toLocaleLowerCase();
  if (expected.some((answer) => equal(response, answer))) return { status: 'correct', issues: [], review_required: false };
  if (String(validation.language_variants ?? '').includes('accept_equivalent_en_US') && !explicitlyTargetsBritish(task)
    && expected.some((answer) => equal(americanEquivalent(response), americanEquivalent(answer)))) {
    return { status: 'correct', issues: [{ category: 'language_variant', explanation_ru: 'Допустимый вариант American English; смысл и грамматика сохранены.' }], review_required: false };
  }
  if (acceptedVariant) {
    return {
      status: 'correct',
      issues: [{ category: 'language_variant', explanation_ru: 'Допустимый вариант, указанный для этого задания.' }],
      review_required: false,
    };
  }

  for (const answer of expected) {
    const responseCore = response.replace(/[.?!]+$/u, '');
    const answerCore = answer.replace(/[.?!]+$/u, '');
    if (caseSensitive ? responseCore === answerCore : responseCore.toLocaleLowerCase() === answerCore.toLocaleLowerCase()) {
      return {
        status: 'partial',
        issues: [{ category: 'punctuation', explanation_ru: 'Слова совпадают; проверь конечный знак по условию.' }],
        review_required: false,
      };
    }
    if (responseCore.toLocaleLowerCase() === answerCore.toLocaleLowerCase()) {
      return {
        status: 'partial',
        issues: [{ category: 'capitalization', explanation_ru: 'Проверь заглавную букву в начале предложения и местоимение I.' }],
        review_required: false,
      };
    }
  }

  return { status: 'unreviewed', issues: [], review_required: true };
}

export function normaliseStorageAnswer(value, task) {
  return canonical(value, task.validation?.trim_outer_whitespace !== false);
}
