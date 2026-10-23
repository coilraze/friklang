"""Compare generated task IDs and checked answers with a prior Git revision."""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LESSON_IDS = ('A0L01', 'A0L02', 'A0L03', 'A0L04', 'A0L05', 'L01', 'L02', 'L03', 'L04', 'L05')


def load_revision(revision: str, path: str):
    raw = subprocess.check_output(['git', 'show', f'{revision}:{path}'], cwd=ROOT)
    return json.loads(raw.decode('utf-8'))


def keys(lesson):
    return [(task['id'], task.get('answers', []), task.get('alternatives', [])) for task in lesson['tasks']]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('revision', help='Git revision to compare with, e.g. 32d4e96')
    args = parser.parse_args()
    for lesson_id in LESSON_IDS:
        relative_path = f'content/lessons/{lesson_id.lower()}.json'
        before = load_revision(args.revision, relative_path)
        after = json.loads((ROOT / relative_path).read_text(encoding='utf-8'))
        if keys(before) != keys(after):
            raise SystemExit(f'Changed task IDs or checked answers: {lesson_id}')
    print(f'OK: all task IDs, answer keys and listed alternatives match {args.revision}.')


if __name__ == '__main__':
    main()
