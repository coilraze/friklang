"""Independent reviewed scenarios; expected decisions are explicit fixtures, not inferred from keys."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from answer_check_reference import evaluate


class AnswerReviewCases(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lessons = {json.loads(p.read_text(encoding='utf-8'))['id']:
                       json.loads(p.read_text(encoding='utf-8'))
                       for p in (ROOT / 'content/lessons').glob('*.json')}
        cls.cases = json.loads((ROOT / 'tests/fixtures/answer-review-cases.json').read_text(encoding='utf-8'))

    def test_reviewed_cases(self):
        for case in self.cases:
            with self.subTest(case=case['id']):
                if case['task'].startswith('STYLE-'):
                    contract = {'type':'gap','answers':['colour'], 'alternatives':[], 'criteria':[],
                                'validation':{'mode':'exact','case_sensitive':True,'punctuation_sensitive':True,
                                              'accepted_variants':['color']}}
                else:
                    lesson_id, task_id = case['task'].split('-T')
                    task = next(t for t in self.lessons[lesson_id]['tasks'] if t['id'] == case['task'])
                    contract = task
                result = evaluate(contract, case['response'])
                self.assertEqual(result['status'], case['status'])
                if case['category']:
                    self.assertIn(case['category'], [i['category'] for i in result['issues']])

    def test_she_are_regression_is_task_specific_grammar_error(self):
        task = next(t for t in self.lessons['L02']['tasks'] if t['id']=='L02-T03')
        self.assertEqual(task['prompt'], 'Только слово: She ___ calm.')
        result = evaluate(task, 'are')
        self.assertEqual(result['status'], 'incorrect')
        self.assertEqual(result['issues'][0]['category'], 'grammar')


if __name__ == '__main__':
    unittest.main()
