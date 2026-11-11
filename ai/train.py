"""Train, validate, evaluate and export a portable TF-IDF / logistic model.

Run: python ai/train.py --verify
The test split is evaluated only after choosing the model on validation data.
"""
import argparse
import csv
import hashlib
import json
import re
import unicodedata
from pathlib import Path

import numpy as np
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

ROOT = Path(__file__).resolve().parent


def normalize(text):
    text = unicodedata.normalize('NFD', text.lower()).replace('đ', 'd')
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9]+', ' ', text)).strip()


def document(row):
    return normalize(f"{row['title']} {row['title']} {row['description']}")


def rounded(value):
    return np.round(value, 12).tolist()


def write_json(path, value, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=None if compact else 2,
                               separators=(',', ':') if compact else None) + '\n', encoding='utf-8')


def run(verify=False):
    data_path = ROOT / 'data/documents.csv'
    with data_path.open(encoding='utf-8', newline='') as f:
        rows = list(csv.DictReader(f))
    categories = json.loads((ROOT / 'categories.json').read_text(encoding='utf-8'))
    labels = sorted(c['id'] for c in categories)
    splits = {s: [r for r in rows if r['split'] == s] for s in ['train', 'validation', 'test']}
    assert len(rows) == sum(map(len, splits.values())), 'Unknown split'
    assert len({r['id'] for r in rows}) == len(rows), 'Duplicate id'
    for a, b in [('train', 'validation'), ('train', 'test'), ('validation', 'test')]:
        assert not ({r['group'] for r in splits[a]} & {r['group'] for r in splits[b]}), 'Topic leakage'
        assert not ({document(r) for r in splits[a]} & {document(r) for r in splits[b]}), 'Text leakage'
    for split in splits.values():
        assert set(r['category'] for r in split) == set(labels), 'Missing/unknown category'
    x = {s: [document(r) for r in items] for s, items in splits.items()}
    y = {s: [r['category'] for r in items] for s, items in splits.items()}
    candidates = []
    best = None
    for analyzer, ngrams in [('word', (1, 2)), ('char', (3, 5))]:
        for c in [1, 4, 12]:
            options = dict(token_pattern=r'(?u)\b[a-z0-9]{2,}\b') if analyzer == 'word' else {}
            vectorizer = TfidfVectorizer(analyzer=analyzer, ngram_range=ngrams, lowercase=False,
                                         min_df=2, max_features=30000, sublinear_tf=True, **options)
            train_x = vectorizer.fit_transform(x['train'])  # Never fit IDF on held-out data.
            clf = LogisticRegression(C=c, max_iter=2000, random_state=2026)
            clf.fit(train_x, y['train'])
            pred = clf.predict(vectorizer.transform(x['validation']))
            score = f1_score(y['validation'], pred, average='macro', zero_division=0)
            candidates.append(dict(analyzer=analyzer, ngrams=list(ngrams), C=c,
                                   validation_macro_f1=float(score)))
            if best is None or score > best[0]:
                best = score, vectorizer, clf, candidates[-1]
    _, vectorizer, clf, config = best
    # Choose an abstention policy on validation only; raw softmax scores are not calibrated accuracy.
    val_prob = clf.predict_proba(vectorizer.transform(x['validation']))
    val_pred = clf.classes_[val_prob.argmax(axis=1)]
    confidence = val_prob.max(axis=1)
    ordered = np.sort(val_prob, axis=1)
    margins = ordered[:, -1] - ordered[:, -2]
    policies = []
    for threshold in [0.35, 0.45, 0.55, 0.65]:
        mask = (confidence >= threshold) & (margins >= 0.10)
        count = int(mask.sum())
        accuracy = float((val_pred[mask] == np.array(y['validation'])[mask]).mean()) if count else 0
        policies.append(dict(threshold=threshold, margin=0.10, coverage=float(mask.mean()),
                             accepted_accuracy=accuracy))
    eligible = [p for p in policies if p['accepted_accuracy'] >= 0.90]
    policy = max(eligible, key=lambda p: p['coverage']) if eligible else policies[-1]
    # Freeze model and policy before looking at test results.
    test_prob = clf.predict_proba(vectorizer.transform(x['test']))
    test_pred = clf.classes_[test_prob.argmax(axis=1)]
    test_ordered = np.sort(test_prob, axis=1)
    accepted = ((test_ordered[:, -1] >= policy['threshold']) &
                (test_ordered[:, -1] - test_ordered[:, -2] >= policy['margin']))
    fingerprint = hashlib.sha256(data_path.read_bytes()).hexdigest()
    model = dict(format_version=1, version='edushare-tfidf-v1-' + fingerprint[:12],
                 algorithm='TF-IDF + multinomial Logistic Regression',
                 provenance='authored_synthetic_demo', dataset_sha256=fingerprint,
                 sklearn_version=sklearn.__version__, categories=categories,
                 analyzer=config['analyzer'], ngram_range=config['ngrams'], sublinear_tf=True,
                 vocabulary=vectorizer.vocabulary_, idf=rounded(vectorizer.idf_),
                 classes=clf.classes_.tolist(), coefficients=rounded(clf.coef_),
                 intercepts=rounded(clf.intercept_), policy=policy)
    # numpy integer feature indices need a portable JSON representation.
    model['vocabulary'] = {word: int(i) for word, i in model['vocabulary'].items()}
    report = dict(model_version=model['version'], provenance=model['provenance'],
                  limitation='Synthetic topic-template dataset. Scores do not estimate real student listing accuracy.',
                  dataset_sha256=fingerprint, random_seed=2026,
                  splits={s: dict(rows=len(v), groups=len({r['group'] for r in v})) for s, v in splits.items()},
                  leakage_checks=dict(disjoint_topic_groups=True, disjoint_normalized_documents=True),
                  candidates=candidates, selected=config, validation_policies=policies, policy=policy,
                  test=dict(accuracy=float(accuracy_score(y['test'], test_pred)),
                            macro_f1=float(f1_score(y['test'], test_pred, average='macro', zero_division=0)),
                            coverage=float(accepted.mean()),
                            accepted_accuracy=float((test_pred[accepted] == np.array(y['test'])[accepted]).mean()) if accepted.any() else None,
                            classification_report=classification_report(y['test'], test_pred, labels=labels,
                                                                         output_dict=True, zero_division=0),
                            labels=labels, confusion_matrix=confusion_matrix(y['test'], test_pred, labels=labels).tolist(),
                            errors=[dict(id=r['id'], title=r['title'], expected=r['category'], predicted=str(p))
                                    for r, p in zip(splits['test'], test_pred) if r['category'] != p]))
    extras = [
        dict(title='Giáo trình Java và lập trình hướng đối tượng', description='Class, interface và bài tập chương trình.'),
        dict(title='Giai tich mot bien', description='Dao ham, gioi han va tich phan'),
        dict(title='IELTS Writing', description='Luyện viết bài luận tiếng Anh'),
        dict(title='Sách còn mới', description='Mình bán lại, nhận tại trường'),
        dict(title='zxqv zzzz qqqq', description='xyzxyz'),
        dict(title='ＳＱＬ e\u0301 ĐẠI SỐ', description='Unicode parity fixture'),
        dict(title='Nồi cơm điện', description='Đồ dùng nấu ăn trong ký túc xá'),
    ]
    golden_rows = splits['test'] + extras
    golden_prob = clf.predict_proba(vectorizer.transform([document(r) for r in golden_rows]))
    golden = [dict(title=r['title'], description=r['description'],
                   scores={str(label): float(p) for label, p in zip(clf.classes_, prob)})
              for r, prob in zip(golden_rows, golden_prob)]
    if verify:
        existing = json.loads((ROOT / 'artifacts/model.json').read_text(encoding='utf-8'))
        assert existing['dataset_sha256'] == fingerprint, 'Dataset changed; retrain/export first'
        assert existing['analyzer'] == model['analyzer'] and existing['classes'] == model['classes']
        np.testing.assert_allclose(existing['coefficients'], model['coefficients'], atol=1e-8, rtol=1e-7)
        np.testing.assert_allclose(existing['idf'], model['idf'], atol=1e-8, rtol=1e-7)
        np.testing.assert_allclose(existing['intercepts'], model['intercepts'], atol=1e-8, rtol=1e-7)
        assert existing['vocabulary'] == model['vocabulary']
        assert existing['ngram_range'] == model['ngram_range']
        assert existing['categories'] == model['categories']
        assert existing['policy'] == model['policy']
        stored_report = json.loads((ROOT / 'reports/metrics.json').read_text(encoding='utf-8'))
        np.testing.assert_allclose(stored_report['test']['accuracy'], report['test']['accuracy'])
        np.testing.assert_allclose(stored_report['test']['macro_f1'], report['test']['macro_f1'])
        print('PASS: reproducible model, no train/validation/test topic overlap')
    else:
        write_json(ROOT / 'artifacts/model.json', model, compact=True)
        write_json(ROOT / 'artifacts/parity.json', golden)
        write_json(ROOT / 'reports/metrics.json', report)
        write_json(ROOT / 'reports/test-predictions.json', [dict(id=r['id'], title=r['title'],
                   expected=r['category'], predicted=str(p), accepted=bool(a))
                   for r, p, a in zip(splits['test'], test_pred, accepted)])
    print(json.dumps(dict(selected=config, test=report['test'] | {'classification_report': 'see reports/metrics.json',
                                                               'confusion_matrix': 'see reports/metrics.json'}), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true', help='Retrain and compare without overwriting artifacts')
    run(parser.parse_args().verify)
