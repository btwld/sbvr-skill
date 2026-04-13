#!/usr/bin/env python3
"""
summarize_report.py — turn a jscpd-report.json into actionable signal.

Usage:
    python summarize_report.py <path-to-jscpd-report.json> [--top N]

Prints:
    - Headline duplication percentage and total clone count
    - Per-format breakdown
    - Top offender files (files appearing in the most clone pairs)
    - Largest individual clones sorted by line count

This is the first thing to run on any jscpd JSON report larger than a few
clones. It pulls out the refactor-worthy signal so you don't have to scroll
through the raw report.
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path


def summarize(report_path: Path, top: int = 5) -> None:
    with report_path.open() as f:
        report = json.load(f)

    stats = report.get("statistics", {})
    total = stats.get("total", {})
    duplicates = report.get("duplicates", [])

    print(f"\n=== jscpd report: {report_path} ===\n")

    # Headline numbers
    pct = total.get("percentage", 0)
    dup_lines = total.get("duplicatedLines", 0)
    all_lines = total.get("lines", 0)
    sources = total.get("sources", 0)
    print(f"Duplication:     {pct:.2f}%  ({dup_lines} of {all_lines} lines)")
    print(f"Files scanned:   {sources}")
    print(f"Clone pairs:     {len(duplicates)}")

    # Per-format breakdown
    formats = stats.get("formats", {})
    if formats:
        print("\nBy language:")
        rows = []
        for fmt, data in formats.items():
            t = data.get("total", {})
            rows.append((fmt, t.get("percentage", 0), t.get("clones", 0), t.get("sources", 0)))
        rows.sort(key=lambda r: r[1], reverse=True)
        for fmt, p, c, s in rows:
            print(f"  {fmt:<15} {p:>6.2f}%   {c:>4} clones   {s:>4} files")

    if not duplicates:
        print("\nNo clones found. Nothing to refactor.\n")
        return

    # Top offender files — files appearing in the most clone pairs
    file_counter: Counter = Counter()
    for clone in duplicates:
        file_counter[clone["firstFile"]["name"]] += 1
        file_counter[clone["secondFile"]["name"]] += 1

    print(f"\nTop {top} offender files (most clone pairs involved):")
    for path, count in file_counter.most_common(top):
        print(f"  {count:>3}  {path}")

    # Largest individual clones
    sorted_clones = sorted(duplicates, key=lambda c: c.get("lines", 0), reverse=True)
    print(f"\nTop {top} largest clones (by lines):")
    for i, clone in enumerate(sorted_clones[:top], 1):
        lines = clone.get("lines", 0)
        tokens = clone.get("tokens", 0)
        fmt = clone.get("format", "?")
        f1 = clone["firstFile"]
        f2 = clone["secondFile"]
        print(f"  {i}. {lines} lines / {tokens} tokens ({fmt})")
        print(f"     {f1['name']}:{f1.get('start', '?')}-{f1.get('end', '?')}")
        print(f"     {f2['name']}:{f2.get('start', '?')}-{f2.get('end', '?')}")

    print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize a jscpd JSON report.")
    parser.add_argument("report", type=Path, help="Path to jscpd-report.json")
    parser.add_argument("--top", type=int, default=5, help="How many top items to show (default: 5)")
    args = parser.parse_args()

    if not args.report.exists():
        print(f"Error: {args.report} not found", file=sys.stderr)
        return 1

    summarize(args.report, top=args.top)
    return 0


if __name__ == "__main__":
    sys.exit(main())
