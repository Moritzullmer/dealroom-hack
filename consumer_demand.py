"""Load curated, source-linked consumer stress and demand observations."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any


SIGNALS_FILE = Path(__file__).with_name("consumer_demand_signals.csv")


def load_consumer_demand_signals(path: Path = SIGNALS_FILE) -> list[dict[str, Any]]:
    """Load curated observations; retain period, population and frequency."""
    rows: list[dict[str, Any]] = []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            value = float(row["value"]) if row.get("value") else None
            comparison = row.get("comparison_value") or ""
            try:
                comparison_value = float(comparison) if comparison else None
                comparison_note = None
            except ValueError:
                comparison_value = None
                comparison_note = comparison or None
            change = value - comparison_value if value is not None and comparison_value is not None else None
            rows.append({
                "country": row["country"],
                "year": int(row["year"]),
                "period": row["period"],
                "metric": row["metric"],
                "value": value,
                "source": row["source"],
                "unit": row["unit"],
                "frequency": row["frequency"],
                "population": row["population"],
                "signal_role": row["signal_role"],
                "comparison_period": row["comparison_period"] or None,
                "comparison_value": comparison_value,
                "comparison_note": comparison_note,
                "change": change,
                "change_unit": (
                    "percentage points" if "percent" in row["unit"] else row["unit"]
                ) if change is not None else None,
                "source_url": row["source_url"],
            })
    return rows


if __name__ == "__main__":
    for row in load_consumer_demand_signals():
        change = f"; change {row['change']:+g} {row['change_unit']}" if row["change"] is not None else ""
        note = f"; comparison: {row['comparison_note']}" if row["comparison_note"] else ""
        print(
            f"{row['period']} | {row['metric']} | {row['value']} {row['unit']} "
            f"| {row['source']}{change}{note}"
        )
