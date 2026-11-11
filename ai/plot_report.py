"""Render a standalone confusion matrix and model comparison from saved metrics."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parent
report = json.loads((ROOT / 'reports/metrics.json').read_text(encoding='utf-8'))
test = report['test']
matrix = np.array(test['confusion_matrix'])
fig, axes = plt.subplots(1, 2, figsize=(14, 6), layout='constrained')
axes[0].imshow(matrix, cmap='Greens', vmin=0)
axes[0].set(xticks=range(len(test['labels'])), yticks=range(len(test['labels'])),
            xticklabels=test['labels'], yticklabels=test['labels'],
            xlabel='Predicted class', ylabel='True class', title='Held-out synthetic test set (72 examples)')
plt.setp(axes[0].get_xticklabels(), rotation=45, ha='right')
for i in range(len(matrix)):
    for j in range(len(matrix)):
        axes[0].text(j, i, str(matrix[i,j]), ha='center', va='center', color='white' if matrix[i,j] > 5 else '#172F26')
candidates = report['candidates']
axes[1].barh([f"{c['analyzer']} / C={c['C']}" for c in candidates],
             [c['validation_macro_f1'] for c in candidates], color='#174D3C')
axes[1].set(xlim=(0, 1.05), xlabel='Validation macro-F1', title='Model selection uses validation only')
fig.suptitle(f"EduShare TF-IDF + Logistic Regression | Test accuracy {test['accuracy']:.1%}, macro-F1 {test['macro_f1']:.3f}\nAuthored synthetic data; not a real-user accuracy estimate", fontsize=13)
fig.savefig(ROOT / 'reports/evaluation.png', dpi=160)
print(ROOT / 'reports/evaluation.png')
