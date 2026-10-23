"""Учебная reference-политика для явно описанных сценариев, не NLP-проверяющий."""
import unicodedata


def _canon(value):
    return unicodedata.normalize('NFC', value.strip()).replace('’', "'")


def evaluate(task, response):
    """Ответ: status, issues. Неопознанный свободный ответ всегда остаётся для проверки."""
    if task.get('type') == 'writing' or task.get('validation', {}).get('mode') == 'manual':
        return {'status': 'unreviewed', 'issues': [], 'review_required': True}
    answer = _canon(response)
    if not answer:
        return {'status': 'unreviewed', 'issues': [], 'review_required': True}
    policy = task.get('validation', {})
    for known, issue in policy.get('reviewed_errors', {}).items():
        if answer == _canon(known):
            category = issue['category']
            return {'status': 'incorrect' if category == 'grammar' else 'partial',
                    'issues': [{'category': category, 'explanation_ru': issue['explanation_ru']}],
                    'review_required': False}
    expected = [_canon(v) for v in task.get('answers', []) + task.get('alternatives', [])]
    variants = [_canon(v) for v in policy.get('accepted_variants', [])]
    if answer in expected:
        return {'status': 'correct', 'issues': [], 'review_required': False}
    if answer in variants:
        return {'status': 'correct', 'issues': [{'category': 'language_variant',
                'explanation_ru': 'Допустимый вариант, явно указанный для этого задания.'}],
                'review_required': False}
    # Формат распознаётся как отдельная ошибка, только если сама словесная форма совпала.
    case_sensitive = policy.get('case_sensitive', True)
    punc_sensitive = policy.get('punctuation_sensitive', True)
    for key in expected:
        same_words = (answer == key) if case_sensitive else (answer.casefold() == key.casefold())
        if not same_words:
            clean_a, clean_k = answer.rstrip('.?!'), key.rstrip('.?!')
            same_words = (clean_a == clean_k) if case_sensitive else clean_a.casefold() == clean_k.casefold()
            if same_words and punc_sensitive:
                return {'status': 'partial', 'issues': [{'category': 'punctuation',
                        'explanation_ru': 'Слова совпадают; проверь конечный знак по условию.'}], 'review_required': False}
            if same_words and not case_sensitive:
                return {'status': 'correct', 'issues': [], 'review_required': False}
    return {'status': 'unreviewed', 'issues': [], 'review_required': True}
