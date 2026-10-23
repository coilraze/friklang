"""Проверка структуры учебного пакета; не языковая экспертиза. Python 3.10+."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
errors = []
def require(condition, message):
    if not condition:
        errors.append(message)

expected_docs = ['README.md', 'docs/research/source-analysis.md', 'docs/curriculum.md',
                 'docs/lesson-standard.md', 'docs/answer-validation.md', 'docs/content-quality.md',
                 'docs/content-audit.md','docs/language-standard.md','docs/writing-feedback.md',
                 'docs/diagnostic-assessment.md']
for name in expected_docs:
    require((ROOT / name).is_file(), f'Нет файла {name}')

curriculum = (ROOT / 'docs/curriculum.md').read_text(encoding='utf-8')
topic_ids = re.findall(r'^### ((?:A0|A1|A2|B1|B2)-\d+) —', curriculum, re.M)
require(len(topic_ids) == len(set(topic_ids)), 'Повтор ID темы')
known_topics = set()
for block in re.split(r'\n### ', curriculum)[1:]:
    ident = block.split(' —')[0]
    pre = re.search(r'Предпосылки: ([^.]+)', block)
    require(pre is not None, f'{ident}: нет предпосылок')
    if pre:
        for dep in re.findall(r'(?:A0|A1|A2|B1|B2)-\d+', pre.group(1)):
            require(dep in known_topics, f'{ident}: неизвестная/поздняя зависимость {dep}')
    for field in ['Результат:', 'Правила и содержание:', 'Типичные ошибки:', 'Упражнения:', 'Проверка:', 'После темы:']:
        require(field in block, f'{ident}: нет {field}')
    known_topics.add(ident)

paths = sorted((ROOT / 'content/lessons').glob('*.json'))
require(len(paths) == 10, 'Должно быть пять исходных и пять A0-уроков')
all_ids = set()
seen_lessons = set()
total = 0
for path in paths:
    try:
        lesson = json.loads(path.read_text(encoding='utf-8'))
    except (ValueError, OSError) as exc:
        errors.append(f'{path.name}: {exc}')
        continue
    lid = lesson.get('id', path.name)
    for key in ['schema_version','title','level','objective','prerequisites','curriculum_topics','vocabulary','theory','examples','reading','tasks','review','quality','language_standard']:
        require(key in lesson and (key=='prerequisites' or bool(lesson[key])), f'{lid}: нет {key}')
    for dep in lesson.get('prerequisites', []):
        require(dep in seen_lessons or dep in known_topics, f'{lid}: неизвестная зависимость {dep}')
    require(set(lesson.get('curriculum_topics',[])) <= known_topics, f'{lid}: неизвестная тема')
    require(lid not in seen_lessons, f'Повтор урока {lid}')
    seen_lessons.add(lid)
    require(bool(lesson.get('reading',{}).get('text')), f'{lid}: нет текста Reading')
    require(len(lesson.get('examples', [])) >= 3, f'{lid}: мало контрастных примеров')
    for ex in lesson.get('examples', []):
        for key in ['correct','incorrect','correction','explanation_ru']:
            require(bool(ex.get(key)), f'{lid}: пример без {key}')
        require(ex.get('correct') != ex.get('incorrect'), f'{lid}: одинаковые правильный и неверный примеры')
    tasks = lesson.get('tasks', [])
    is_a0 = lid.startswith('A0L')
    require(len(tasks) == (12 if is_a0 else 18), f'{lid}: неверное число заданий')
    require(sum(t.get('type')=='writing' for t in tasks)>=2, f'{lid}: нет двух Writing')
    require(sum(t.get('type')=='reading' for t in tasks)>=(2 if lid=='A0L05' else 4 if not is_a0 else 0), f'{lid}: мало Reading Comprehension')
    require(sum(t.get('type')=='word_recognition' for t in tasks)>=(2 if is_a0 and lid!='A0L05' else 0), f'{lid}: мало Word Recognition')
    require(len({t.get('type') for t in tasks})>=(3 if is_a0 else 5), f'{lid}: мало разных типов')
    for i,t in enumerate(tasks, 1):
        tid = t.get('id')
        require(tid == f'{lid}-T{i:02}', f'{lid}: нарушена последовательность ID {tid}')
        require(tid not in all_ids, f'Повтор задания {tid}')
        all_ids.add(tid)
        for key in ['objective','type','difficulty','phase','prompt','answers','alternatives','criteria','validation','feedback_ru']:
            require(key in t, f'{tid}: нет {key}')
        require(t.get('difficulty') in [1,2,3], f'{tid}: неверная сложность')
        require(bool(re.search('[А-Яа-яЁё]', t.get('feedback_ru',''))), f'{tid}: нет русского пояснения')
        require(t.get('type') in ['identify','gap','reorder','correct','form','punctuation','reading','word_recognition','writing','checkpoint'], f'{tid}: неверный тип')
        mode = t.get('validation',{}).get('mode')
        require(mode in ['exact','semantic_short','manual'], f'{tid}: неверный режим')
        if t.get('type')=='writing':
            require(mode=='manual' and not t.get('answers') and bool(t.get('criteria')), f'{tid}: Writing должен иметь рубрику, не строковый ключ')
            require(bool(t.get('sample_answer')), f'{tid}: нет образца Writing')
            support=t.get('writing_support',{})
            require(bool(support.get('typical_errors')) and bool(support.get('checklist_ru')), f'{tid}: нет поддержки самопроверки')
            require(support.get('checklist_ru')==t.get('criteria'), f'{tid}: чек-лист расходится с критериями')
        else:
            require(bool(t.get('answers')), f'{tid}: нет ключа')
        if t.get('type')=='punctuation':
            require(t.get('validation',{}).get('punctuation_sensitive') is True, f'{tid}: игнорируется цель пунктуации')
        if t.get('type')=='reading':
            rid=t.get('reading_id')
            require(rid in [lesson.get('reading',{}).get('id'),lesson.get('assessment_reading',{}).get('id')], f'{tid}: неизвестный Reading-текст')
            require(bool(t.get('reading_focus')), f'{tid}: нет фокуса понимания')
        if t.get('type')=='word_recognition':
            require(is_a0 and lesson.get('reading',{}).get('skill')=='word_recognition', f'{tid}: decoding смешан с comprehension')
        variants = t.get('answers',[]) + t.get('alternatives',[])
        require(all(isinstance(a,str) and a.strip() for a in variants), f'{tid}: пустой/нестроковый ответ')
        require(len(variants)==len(set(variants)), f'{tid}: повтор альтернативы')
    total += len(tasks)

require(seen_lessons == {f'A0L{i:02}' for i in range(1,6)} | {f'L{i:02}' for i in range(1,6)}, 'Неверный набор уроков')
audit = (ROOT / 'docs/content-audit.md').read_text(encoding='utf-8') if (ROOT/'docs/content-audit.md').exists() else ''
for lid in [f'L{i:02}' for i in range(1,6)]:
    for i in range(1,19):
        require(f'{lid}-T{i:02}' in audit, f'В аудите нет {lid}-T{i:02}')

diagnostic=(ROOT/'docs/diagnostic-assessment.md').read_text(encoding='utf-8')
diagnostic_ids=re.findall(r'^\| (D\d{2}) /',diagnostic,re.M)
require(diagnostic_ids==[f'D{i:02}' for i in range(1,29)], 'Нарушен набор 28 диагностических пунктов')
require('R2 — отдельный оригинальный текст' in diagnostic, 'Нет второго независимого Reading текста диагностики')
for skill in ['Grammar','Reading Comprehension','Writing','Punctuation','Spelling / Word Recognition']:
    require(f'| {skill} |' in diagnostic, f'Нет отдельного диагностического результата {skill}')

for path in ROOT.rglob('*.md'):
    for target in re.findall(r'\]\(([^)]+)\)', path.read_text(encoding='utf-8')):
        if '://' in target or target.startswith('#'):
            continue
        require((path.parent / target.split('#')[0]).exists(), f'{path.name}: битая ссылка {target}')

if errors:
    print('\n'.join(errors))
    raise SystemExit(1)
print(f'OK: {len(topic_ids)} topics, {len(paths)} lessons, {total} tasks; metadata, keys, dependencies and local links checked.')
print('Language accuracy and pedagogical suitability require separate substantive review.')
