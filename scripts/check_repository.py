"""Локальная проверка состава и явных секретов. Не гарантирует их полного отсутствия."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
patterns = {
    'private_key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'github_token': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b'),
    'aws_access_id': re.compile(r'\bAKIA[A-Z0-9]{16}\b'),
    'api_key_assignment': re.compile(r'''(?i)(?:api[_-]?key|access[_-]?token|password)\s*[:=]\s*["'][A-Za-z0-9_./+\-=]{20,}["']'''),
}
allowed_roots={'docs','content','scripts','tests','src'}
allowed_top={'README.md','.gitignore','.gitattributes','package.json','package-lock.json','index.html','vite.config.js'}
ignored_parts={'.git','__pycache__','.venv','venv','.pytest_cache','.mypy_cache','.ruff_cache','node_modules','dist','test-results'}
files=[]
problems=[]
for p in sorted(ROOT.rglob('*')):
    rel=p.relative_to(ROOT)
    if any(part in ignored_parts for part in rel.parts) or not p.is_file():
        continue
    files.append(p)
    if (len(rel.parts)==1 and rel.name not in allowed_top) or (len(rel.parts)>1 and rel.parts[0] not in allowed_roots):
        problems.append(f'Unexpected path: {rel.as_posix()}')
    screenshot=p.suffix.lower()=='.png' and rel.parts[:2]==('docs','screenshots')
    if p.suffix.lower() not in {'.md','.json','.py','.js','.mjs','.css','.html'} and p.name not in {'.gitignore','.gitattributes'} and not screenshot:
        problems.append(f'Unexpected file type: {rel.as_posix()}')
    if screenshot:
        continue
    try:
        data=p.read_text(encoding='utf-8')
    except (UnicodeError,OSError):
        problems.append(f'Non-readable UTF-8: {rel.as_posix()}')
        continue
    for name, pattern in patterns.items():
        if pattern.search(data):
            # Значения потенциальных секретов намеренно не печатаются.
            problems.append(f'Potential {name}: {rel.as_posix()}')
if problems:
    print('\n'.join(problems))
    raise SystemExit(1)
print(f'OK: {len(files)} project text files inventoried; no unexpected paths or credential-pattern matches.')
print('Pattern scan plus manual inventory review; not a guarantee that every possible secret is detectable.')
