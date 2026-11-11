"""Author-generated demo examples; no real student data or scraped book content.

All variants of a topic stay in the same split. The generator is a transparent
bootstrap dataset, not evidence of real-world classification quality.
"""
import csv
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def build():
    topics = json.loads((ROOT / 'data/topics.json').read_text(encoding='utf-8'))
    rows = []
    for category, entries in topics.items():
        indices = list(range(len(entries)))
        random.Random(2026).shuffle(indices)
        for index, (title, detail) in enumerate(entries):
            rank = indices.index(index)
            split = 'train' if rank < 14 else 'validation' if rank < 17 else 'test'
            variants = [
                (title, f'{detail} Sách giấy đã dùng, còn đọc tốt, hẹn nhận tại thư viện.'),
                (f'Bài tập {title}', f'Tài liệu ôn học phần: {detail} Có ghi chú bằng bút, giao tại cổng trường.'),
                (f'Đề cương ôn thi {title}', f'{detail} Bản in dùng để ôn cuối kỳ, muốn bán hoặc trao đổi với bạn cùng trường.'),
            ]
            for variant, (name, description) in enumerate(variants):
                rows.append(dict(id=f'{category}-{index:02}-{variant}', group=f'{category}-{index:02}',
                                 split=split, title=name, description=description, category=category,
                                 source='authored_synthetic_demo'))
    path = ROOT / 'data/documents.csv'
    with path.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
    print(f'{len(rows)} synthetic examples, 160 topic groups -> {path}')


if __name__ == '__main__':
    build()
