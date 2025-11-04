# python3 src/statistics/analyze_analytics.py --input src/statistics/data.ndjson --out src/statistics
#python3 -m venv .venv
#source .venv/bin/activate

import json
import argparse
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np


def load_ndjson(path: Path) -> pd.DataFrame:
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                rows.append(obj)
            except json.JSONDecodeError:
                continue

    if not rows:
        return pd.DataFrame(columns=["session_id", "actions"])

    for r in rows:
        if not isinstance(r.get("actions"), list):
            r["actions"] = []

    return pd.DataFrame(rows)


def explode_actions(df: pd.DataFrame) -> pd.DataFrame:
    if "actions" not in df.columns or df.empty:
        return pd.DataFrame(columns=["session_id", "t"])

    ex = df.explode("actions", ignore_index=True)
    ex = ex[ex["actions"].notna()].copy()
    ex["t"] = ex["actions"].map(lambda x: x.get("t") if isinstance(x, dict) else None)
    ex = ex[ex["t"].notna()]
    return ex[["session_id", "t"]]


def make_plots(df: pd.DataFrame, outdir: Path):
    outdir.mkdir(parents=True, exist_ok=True)

    actions_df = explode_actions(df)
    if not actions_df.empty:
        filtered = actions_df[actions_df["t"] != "export"]
        if not filtered.empty:
            counts = filtered.groupby("t").size().sort_values(ascending=False)
            plt.figure()
            counts.plot(kind="bar")
            plt.title("Actions")
            plt.xlabel("Action type")
            plt.ylabel("Count")
            plt.tight_layout()
            plt.savefig(outdir / "actions_types.png", dpi=150)
            plt.close()

    if "actions" in df.columns and not df.empty:
        aps = df["actions"].map(lambda a: len(a) if isinstance(a, list) else 0)

        if len(aps) > 0:
            min_k = int(aps.min())
            max_k = int(aps.max())

            bins = np.arange(min_k - 0.5, max_k + 1.5, 1.0)

            plt.figure()
            plt.hist(aps, bins=bins, edgecolor=None)
            plt.title("Actions per session (integer bins)")
            plt.xlabel("Actions")
            plt.ylabel("Sessions")
            plt.xticks(np.arange(min_k, max_k + 1, 1))
            plt.tight_layout()
            plt.savefig(outdir / "actions_per_session.png", dpi=150)
            plt.close()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", default="logs/data.ndjson", help="Path to NDJSON log file")
    p.add_argument("--out", default="out", help="Directory to write charts")
    args = p.parse_args()

    path = Path(args.input)
    if not path.exists():
        print(f"No log file at {path}. Nothing to analyze.")
        return

    df = load_ndjson(path)
    print(f"Loaded {len(df)} session records")
    make_plots(df, Path(args.out))
    print(f"Charts written to {args.out}/\n - actions_distribution.png\n - actions_per_session_hist.png")


if __name__ == "__main__":
    main()
