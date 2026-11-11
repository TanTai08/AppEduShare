import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { one } from './db.js';
import { fail } from './domain.js';

export const CATEGORIES = JSON.parse(
  readFileSync(new URL('../../ai/categories.json', import.meta.url), 'utf8'),
);
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
export const inputHash = (title, description) =>
  createHash('sha256')
    .update(JSON.stringify([title.trim(), description.trim()]))
    .digest('hex');

// Portable trained weights: no Python process, external AI service or API key at runtime.
export function createClassifier(model) {
  if (
    model.format_version !== 1 ||
    !['word', 'char'].includes(model.analyzer) ||
    model.classes.length !== CATEGORY_IDS.length ||
    model.classes.some((c) => !CATEGORY_IDS.includes(c)) ||
    model.coefficients.some((row) => row.length !== model.idf.length)
  )
    throw new Error('Invalid classifier artifact');
  const vocab = new Map(Object.entries(model.vocabulary));
  function scores(title, description) {
    const text = normalizeText(`${title} ${title} ${description}`);
    const counts = new Map();
    const add = (feature) => {
      const index = vocab.get(feature);
      if (index !== undefined) counts.set(index, (counts.get(index) || 0) + 1);
    };
    const tokens = model.analyzer === 'word' ? text.match(/[a-z0-9]{2,}/g) || [] : null;
    for (let n = model.ngram_range[0]; n <= model.ngram_range[1]; n++) {
      const length = tokens ? tokens.length : text.length;
      for (let i = 0; i <= length - n; i++)
        add(tokens ? tokens.slice(i, i + n).join(' ') : text.slice(i, i + n));
    }
    const features = [...counts].map(([i, count]) => [i, (1 + Math.log(count)) * model.idf[i]]);
    const norm = Math.sqrt(features.reduce((sum, [, tfidf]) => sum + tfidf ** 2, 0)) || 1;
    const logits = model.classes.map((_, c) =>
      features.reduce(
        (sum, [i, value]) => sum + (value / norm) * model.coefficients[c][i],
        model.intercepts[c],
      ),
    );
    const max = Math.max(...logits);
    const exp = logits.map((v) => Math.exp(v - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return model.classes
      .map((id, i) => ({
        category: id,
        label: CATEGORIES.find((c) => c.id === id).label,
        score: exp[i] / sum,
      }))
      .sort((a, b) => b.score - a.score);
  }
  return {
    model,
    scores,
    predict(title, description) {
      const ranked = scores(title, description);
      const abstained =
        ranked[0].score < model.policy.threshold ||
        ranked[0].score - ranked[1].score < model.policy.margin;
      return {
        model_version: model.version,
        dataset_source: model.provenance,
        predicted_category: abstained ? null : ranked[0].category,
        abstained,
        suggestions: ranked.slice(0, 3),
      };
    },
  };
}

let classifier;
try {
  classifier = createClassifier(
    JSON.parse(readFileSync(new URL('../../ai/artifacts/model.json', import.meta.url), 'utf8')),
  );
} catch (error) {
  console.error('AI classifier unavailable:', error.message);
}
export function classifierInfo() {
  return {
    ready: !!classifier,
    categories: CATEGORIES,
    model_version: classifier?.model.version || null,
    algorithm: 'TF-IDF + Logistic Regression',
    dataset_source: 'authored_synthetic_demo',
  };
}
export function classifyDocument(title, description) {
  if (!classifier)
    fail(503, 'AI tạm thời chưa sẵn sàng. Bạn vẫn có thể chọn nhóm tài liệu thủ công.');
  return classifier.predict(title, description);
}
export async function bindClassification(db, user, listing, body, category) {
  if (!body.classification_id) return;
  const suggestion = await one(db, 'SELECT * FROM ai_classifications WHERE id=$1 FOR UPDATE', [
    body.classification_id,
  ]);
  if (!suggestion || suggestion.user_id !== user) fail(403, 'Bạn không sở hữu gợi ý AI này.');
  if (suggestion.listing_id)
    fail(409, 'Gợi ý AI đã được lưu. Hãy phân loại lại hoặc chọn nhóm thủ công.');
  if (suggestion.input_hash !== inputHash(body.title, body.description))
    fail(409, 'Tên hoặc mô tả đã đổi. Hãy phân loại lại hoặc chọn nhóm thủ công.');
  await db.query('UPDATE ai_classifications SET listing_id=$1,confirmed_category=$2 WHERE id=$3', [
    listing,
    category || null,
    suggestion.id,
  ]);
}
