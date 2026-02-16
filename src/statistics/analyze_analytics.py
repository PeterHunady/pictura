# python3 src/statistics/analyze_analytics.py --input src/statistics/data.ndjson --out src/statistics
#python3 -m venv .venv
#source .venv/bin/activate

import json
import argparse
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from datetime import datetime


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


def extract_timestamp(row):
    if "timestamp" in row and row["timestamp"]:
        return row["timestamp"]

    if "actions" in row and isinstance(row["actions"], list) and len(row["actions"]) > 0:
        first_action = row["actions"][0]
        if isinstance(first_action, dict) and "ts" in first_action:
            return first_action["ts"] / 1000

    return None


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
            plt.title("Actions per session")
            plt.xlabel("Actions")
            plt.ylabel("Sessions")
            plt.xticks(np.arange(min_k, max_k + 1, 1))
            plt.tight_layout()
            plt.savefig(outdir / "actions_per_session.png", dpi=150)
            plt.close()

    df_with_ts = df.copy()
    df_with_ts["ts"] = df_with_ts.apply(extract_timestamp, axis=1)
    df_with_ts = df_with_ts[df_with_ts["ts"].notna()].copy()

    if not df_with_ts.empty:
        df_with_ts["date"] = pd.to_datetime(df_with_ts["ts"], unit="s")
        df_with_ts["month"] = df_with_ts["date"].dt.to_period("M")
        df_with_ts["action_count"] = df_with_ts["actions"].map(lambda a: len(a) if isinstance(a, list) else 0)

        monthly_actions = df_with_ts.groupby("month")["action_count"].sum().sort_index()
        monthly_users = df_with_ts.groupby("month")["session_id"].nunique().sort_index()

        if len(monthly_actions) > 0:
            plt.figure(figsize=(10, 6))
            monthly_actions.plot(kind="bar")
            plt.title("Actions per month")
            plt.xlabel("Month")
            plt.ylabel("Total Actions")
            plt.xticks(rotation=45)
            plt.tight_layout()
            plt.savefig(outdir / "actions_per_month.png", dpi=150)
            plt.close()

            plt.figure(figsize=(10, 6))
            monthly_users.plot(kind="bar")
            plt.title("Users per Month")
            plt.xlabel("Month")
            plt.ylabel("Users")
            plt.xticks(rotation=45)
            plt.tight_layout()
            plt.savefig(outdir / "users_per_month.png", dpi=150)
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

    total_sessions = len(df)
    unique_users = df["session_id"].nunique() if "session_id" in df.columns else 0

    print(f"\n=== Analytics Summary ===")
    print(f"Total sessions: {total_sessions}")
    print(f"Unique users (unique session_id): {unique_users}")

    if "actions" in df.columns and not df.empty:
        total_actions = df["actions"].map(lambda a: len(a) if isinstance(a, list) else 0).sum()
        avg_actions = total_actions / total_sessions if total_sessions > 0 else 0
        print(f"Total actions: {int(total_actions)}")
        print(f"Average actions per session: {avg_actions:.2f}")

    df_with_ts = df.copy()
    df_with_ts["ts"] = df_with_ts.apply(extract_timestamp, axis=1)
    df_with_ts = df_with_ts[df_with_ts["ts"].notna()].copy()

    if not df_with_ts.empty:
        df_with_ts["date"] = pd.to_datetime(df_with_ts["ts"], unit="s")
        df_with_ts["month"] = df_with_ts["date"].dt.to_period("M")
        df_with_ts["action_count"] = df_with_ts["actions"].map(lambda a: len(a) if isinstance(a, list) else 0)

        monthly_actions = df_with_ts.groupby("month")["action_count"].sum().sort_index()
        monthly_users = df_with_ts.groupby("month")["session_id"].nunique().sort_index()

        if len(monthly_actions) > 0:
            print(f"\n=== Monthly Activity ===")
            for month in monthly_actions.index:
                actions = int(monthly_actions[month])
                users = int(monthly_users[month])
                print(f"{month}: {actions} actions, {users} unique users")

            most_active = monthly_actions.idxmax()
            most_users = monthly_users.idxmax()
            print(f"\nMost active month (actions): {most_active} ({int(monthly_actions[most_active])} actions)")
            print(f"Most active month (users): {most_users} ({int(monthly_users[most_users])} unique users)")

    print(f"\nGenerating charts...")
    make_plots(df, Path(args.out))
    print(f"Charts written to {args.out}/\n - actions_types.png\n - actions_per_session.png\n - actions_per_month.png\n - users_per_month.png")


if __name__ == "__main__":
    main()
