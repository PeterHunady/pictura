# Author: Peter Huňady (xhunadp00)
# File: analyze_analytics.py
# Bachelor's Thesis, VUT Brno, 2026

#python3 src/statistics/analyze_analytics.py --input src/statistics/data.ndjson --out src/statistics
#python3 -m venv .venv
#source .venv/bin/activate

import json
import argparse
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np


def load_ndjson(path):
    records = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
                records.append(record)
            except json.JSONDecodeError:
                continue

    if not records:
        return pd.DataFrame(columns=["session_id", "actions"])

    for record in records:
        if not isinstance(record.get("actions"), list):
            record["actions"] = []

    return pd.DataFrame(records)


def explode_actions(sessions):
    if "actions" not in sessions.columns or sessions.empty:
        return pd.DataFrame(columns=["session_id", "t"])

    exploded = sessions.explode("actions", ignore_index=True)
    exploded = exploded[exploded["actions"].notna()].copy()
    exploded["t"] = exploded["actions"].map(get_action_type)
    exploded = exploded[exploded["t"].notna()]
    return exploded[["session_id", "t"]]


def get_action_type(action):
    if isinstance(action, dict):
        return action.get("t")
    return None


def count_actions(actions):
    if isinstance(actions, list):
        return len(actions)
    return 0


def extract_timestamp(row):
    return row.get("timestamp")


def make_plots(sessions, outdir):
    outdir.mkdir(parents=True, exist_ok=True)

    BAR_COLOR = "#1f77b4"
    FIGSIZE = (10, 6)
    TITLE_FONTSIZE = 14
    LABEL_FONTSIZE = 12
    TICK_FONTSIZE = 10
    ROTATION = 45

    flat_actions = explode_actions(sessions)
    if not flat_actions.empty:
        # exclude export events, because every session ends with an export so it would appear in every record
        non_export_actions = flat_actions[flat_actions["t"] != "export"]
        if not non_export_actions.empty:
            action_counts = non_export_actions.groupby("t").size().sort_values(ascending=False)
            plt.figure(figsize=FIGSIZE)
            action_counts.plot(kind="bar", color=BAR_COLOR)
            plt.title("Actions", fontsize=TITLE_FONTSIZE)
            plt.xlabel("Action type", fontsize=LABEL_FONTSIZE)
            plt.ylabel("Count", fontsize=LABEL_FONTSIZE)
            plt.xticks(rotation=60, fontsize=TICK_FONTSIZE)
            plt.yticks(fontsize=TICK_FONTSIZE)
            plt.tight_layout()
            plt.savefig(outdir / "actions_types.png", dpi=150)
            plt.close()

    if "actions" in sessions.columns and not sessions.empty:
        actions_per_session = sessions["actions"].map(count_actions)

        if len(actions_per_session) > 0:
            min_count = int(actions_per_session.min())
            max_count = int(actions_per_session.max())

            # shift bins by 0.5, so each number is in the middle of its bar
            bins = np.arange(min_count - 0.5, max_count + 1.5, 1.0)

            plt.figure(figsize=FIGSIZE)
            plt.hist(actions_per_session, bins=bins, edgecolor=None, color=BAR_COLOR)
            plt.title("Actions per session", fontsize=TITLE_FONTSIZE)
            plt.xlabel("Actions", fontsize=LABEL_FONTSIZE)
            plt.ylabel("Sessions", fontsize=LABEL_FONTSIZE)
            plt.xticks(np.arange(min_count, max_count + 1, 1), rotation=0, fontsize=TICK_FONTSIZE)
            plt.yticks(fontsize=TICK_FONTSIZE)
            plt.tight_layout()
            plt.savefig(outdir / "actions_per_session.png", dpi=150)
            plt.close()

    sessions_with_timestamp = sessions.copy()
    sessions_with_timestamp["ts"] = sessions_with_timestamp.apply(extract_timestamp, axis=1)
    sessions_with_timestamp = sessions_with_timestamp[sessions_with_timestamp["ts"].notna()].copy()

    if not sessions_with_timestamp.empty:
        sessions_with_timestamp["date"] = pd.to_datetime(sessions_with_timestamp["ts"], unit="s")
        sessions_with_timestamp["month"] = sessions_with_timestamp["date"].dt.to_period("M")

        monthly_users = sessions_with_timestamp.groupby("month")["session_id"].nunique().sort_index()

        if len(monthly_users) > 0:
            plt.figure(figsize=FIGSIZE)
            monthly_users.plot(kind="bar", color=BAR_COLOR)
            plt.title("Users per Month", fontsize=TITLE_FONTSIZE)
            plt.xlabel("Month", fontsize=LABEL_FONTSIZE)
            plt.ylabel("Users", fontsize=LABEL_FONTSIZE)
            plt.xticks(rotation=ROTATION, fontsize=TICK_FONTSIZE)
            plt.yticks(fontsize=TICK_FONTSIZE)
            plt.tight_layout()
            plt.savefig(outdir / "users_per_month.png", dpi=150)
            plt.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="logs/data.ndjson", help="Path to NDJSON log file")
    parser.add_argument("--out", default="out", help="Directory to write charts")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"No log file at {input_path}. Nothing to analyze.")
        return

    sessions = load_ndjson(input_path)

    total_sessions = len(sessions)
    if "session_id" in sessions.columns:
        unique_users = sessions["session_id"].nunique()
    else:
        unique_users = 0

    print(f"\nAnalytics Summary:")
    print(f"Total sessions: {total_sessions}")
    print(f"Unique users: {unique_users}")

    if "actions" in sessions.columns and not sessions.empty:
        total_actions = sessions["actions"].map(count_actions).sum()
        if total_sessions > 0:
            avg_actions = total_actions / total_sessions
        else:
            avg_actions = 0
        print(f"Total actions: {int(total_actions)}")
        print(f"Average actions per session: {avg_actions:.2f}")

    sessions_with_timestamp = sessions.copy()
    sessions_with_timestamp["ts"] = sessions_with_timestamp.apply(extract_timestamp, axis=1)
    sessions_with_timestamp = sessions_with_timestamp[sessions_with_timestamp["ts"].notna()].copy()

    if not sessions_with_timestamp.empty:
        sessions_with_timestamp["date"] = pd.to_datetime(sessions_with_timestamp["ts"], unit="s")
        sessions_with_timestamp["month"] = sessions_with_timestamp["date"].dt.to_period("M")
        sessions_with_timestamp["action_count"] = sessions_with_timestamp["actions"].map(count_actions)

        monthly_actions = sessions_with_timestamp.groupby("month")["action_count"].sum().sort_index()
        monthly_users = sessions_with_timestamp.groupby("month")["session_id"].nunique().sort_index()

        if len(monthly_actions) > 0:
            print(f"\nMonthly Activity:")
            for month in monthly_actions.index:
                actions = int(monthly_actions[month])
                users = int(monthly_users[month])
                print(f"{month}: {actions} actions, {users} unique users")

    make_plots(sessions, Path(args.out))

if __name__ == "__main__":
    main()
