"""Prepare the Figure Eight "Multilingual Disaster Response Messages" dataset.

Source: Figure Eight / Appen, released for public research use; 26,248 real
messages from the 2010 Haiti and Chile earthquakes, 2010 Pakistan floods,
2012 Super-storm Sandy and disaster news, labelled with 36 categories.
(Mirrored in many public repositories, e.g. github.com/prateeksawhney97/Disaster-Response-Pipeline.)

Usage:  python scripts/prepare_figure_eight.py disaster_messages.csv disaster_categories.csv
Writes: data/real/figure_eight_messages.csv  (message, category, genre)

The 36 multi-label categories are mapped to the platform's 7 response needs
using a priority order (life-safety first): fire > rescue > medical >
food_water > shelter > infrastructure > info.
"""
import sys
from pathlib import Path

import pandas as pd

RULES = [
    ("fire", ["fire"]),
    ("rescue", ["search_and_rescue", "missing_people", "child_alone"]),
    ("medical", ["medical_help", "medical_products", "hospitals", "death"]),
    ("food_water", ["food", "water"]),
    ("shelter", ["shelter", "refugees", "clothing", "cold"]),
    ("infrastructure", ["infrastructure_related", "buildings", "electricity", "transport", "other_infrastructure", "tools"]),
]


def map_row(row) -> str:
    if row["related"] == 0:
        return "info"
    for label, cols in RULES:
        if any(row.get(c, 0) == 1 for c in cols):
            return label
    return "info"


def main(messages_csv: str, categories_csv: str) -> None:
    m = pd.read_csv(messages_csv)
    c = pd.read_csv(categories_csv)
    cats = c["categories"].str.split(";", expand=True)
    cats.columns = [x.split("-")[0] for x in cats.iloc[0]]
    cats = cats.apply(lambda s: s.str[-1].astype(int).clip(0, 1))
    cats["id"] = c["id"]
    df = m.merge(cats.drop_duplicates("id"), on="id").drop_duplicates("message")
    df["category"] = df.apply(map_row, axis=1)
    df["message"] = df["message"].astype(str).str.replace(r"http\S+|bit\.ly\S+", "", regex=True).str.strip()
    df = df[df["message"].str.len() >= 12]
    out = Path(__file__).resolve().parent.parent / "data" / "real" / "figure_eight_messages.csv"
    df[["message", "category", "genre"]].to_csv(out, index=False)
    print(f"wrote {len(df)} rows → {out}")
    print(df["category"].value_counts().to_string())


if __name__ == "__main__":
    main(*sys.argv[1:3])
