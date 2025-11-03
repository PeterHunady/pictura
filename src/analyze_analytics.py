#!/usr/bin/env python3

import json
import argparse
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt

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
        return pd.DataFrame(columns=["session_id", "actions", "received_at", "user_agent", "referer"])
    df = pd.DataFrame(rows)
    if "received_at" in df.columns:
        df["received_at"] = pd.to_datetime(df["received_at"], errors="coerce", utc=True)
        df["date"] = df["received_at"].dt.date
        df["hour"] = df["received_at"].dt.hour
    else:
        df["date"] = pd.NaT
        df["hour"] = pd.NA
    return df

def explode_actions(df: pd.DataFrame) -> pd.DataFrame:
    if "actions" not in df.columns:
        return pd.DataFrame(columns=["session_id", "t", "received_at"])    
    ex = df.explode("actions", ignore_index=True)
    ex = ex[ex["actions"].notna()].copy()
    ex["t"] = ex["actions"].map(lambda x: x.get("t") if isinstance(x, dict) else None)
    return ex

def make_plots(df: pd.DataFrame, outdir: Path):
    outdir.mkdir(parents=True, exist_ok=True)
    if "date" in df.columns and df["date"].notna().any():
        daily = df.groupby("date").size()
        plt.figure()
        daily.plot(kind="bar")
        plt.title("Sessions per day")
        plt.xlabel("Date")
        plt.ylabel("# Sessions")
        plt.tight_layout()
        plt.savefig(outdir / "sessions_per_day.png", dpi=150)
        plt.close()

    actions_df = explode_actions(df)
    if not actions_df.empty:
        counts = actions_df.groupby("t").size().sort_values(ascending=False)
        plt.figure()
        counts.plot(kind="bar")
        plt.title("Actions distribution")
        plt.xlabel("Action type (t)")
        plt.ylabel("Count")
        plt.tight_layout()
        plt.savefig(outdir / "actions_distribution.png", dpi=150)
        plt.close()

        aps = actions_df.groupby("session_id").size()
        plt.figure()
        aps.plot(kind="hist", bins=20)
        plt.title("Actions per session (histogram)")
        plt.xlabel("# Actions in session")
        plt.ylabel("# Sessions")
        plt.tight_layout()
        plt.savefig(outdir / "actions_per_session_hist.png", dpi=150)
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
    print(f"Charts written to {args.out}/\n - sessions_per_day.png\n - actions_distribution.png\n - actions_per_session_hist.png")


if __name__ == "__main__":
    main()
