import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CATEGORIES,
  createClassifier,
  classifyDocument,
  classifierInfo,
  normalizeText,
} from '../src/classifier.js';

test('Portable Node inference matches sklearn probabilities on all held-out and Unicode fixtures', () => {
  const model = JSON.parse(
    readFileSync(new URL('../../ai/artifacts/model.json', import.meta.url), 'utf8'),
  );
  const fixtures = JSON.parse(
    readFileSync(new URL('../../ai/artifacts/parity.json', import.meta.url), 'utf8'),
  );
  const classifier = createClassifier(model);
  assert.ok(fixtures.length >= 72);
  for (const fixture of fixtures) {
    const scores = classifier.scores(fixture.title, fixture.description);
    for (const s of scores)
      assert.ok(
        Math.abs(s.score - fixture.scores[s.category]) < 1e-8,
        `${fixture.title}: ${s.category}`,
      );
    assert.ok(Math.abs(scores.reduce((sum, s) => sum + s.score, 0) - 1) < 1e-10);
  }
});
test('Classifier suggests a relevant category and handles unaccented Vietnamese', () => {
  assert.equal(
    classifyDocument('Giáo trình Java và lập trình hướng đối tượng', 'Class và interface')
      .predicted_category,
    'cntt',
  );
  assert.equal(
    classifyDocument('IELTS Writing Task 2', 'Luyện viết bài luận tiếng Anh').predicted_category,
    'ngoai_ngu',
  );
  const accented = classifyDocument('Giải tích một biến', 'Đạo hàm, giới hạn và tích phân');
  const plain = classifyDocument('Giai tich mot bien', 'Dao ham, gioi han va tich phan');
  assert.equal(accented.predicted_category, 'toan');
  assert.deepEqual(accented, plain);
  assert.equal(normalizeText('  ĐẠI  SỐ! e\u0301  '), 'dai so e');
});
test('Uninformative and unknown text abstains instead of assigning a category', () => {
  for (const [t, d] of [
    ['Sách còn mới', 'Mình bán lại, nhận tại trường'],
    ['zxqv zzzz qqqq', 'xyzxyz'],
  ]) {
    const result = classifyDocument(t, d);
    assert.equal(result.abstained, true);
    assert.equal(result.predicted_category, null);
    assert.equal(result.suggestions.length, 3);
  }
  assert.equal(classifierInfo().ready, true);
  assert.equal(CATEGORIES.length, 8);
  assert.equal(classifierInfo().dataset_source, 'authored_synthetic_demo');
});
