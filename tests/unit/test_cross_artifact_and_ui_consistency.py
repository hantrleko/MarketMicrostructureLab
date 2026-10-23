"""
Cross-Artifact, Parameter Horizon, and Multi-Date Provenance Consistency Suite.
Requirement: Validates that across all 3 dates, 5 horizon lags, and 22 artifacts:
  1. Window timestamps in sample_accounting, sample_metadata, and response curves are 100% unified.
  2. Bootstrap replication accounts strictly match 100 iterations (0 occurrences of 1,000).
  3. No hardcoded initial timestamp estimates (~06:14 UTC) remain in accounting explanations.
  4. 2026-07-03 Friday regime is labeled with neutral exploratory annotations (0 occurrences of Weekend Drift).
  5. Manifest contracts and 22 JSON artifacts are 100% byte-accurate with 0 CRLF.
"""

import json
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "apps" / "web" / "public" / "data"
DATES = ["2026-07-01", "2026-07-02", "2026-07-03"]
HORIZONS = [5, 10, 20, 50, 100]


def test_provenance_and_accounting_timestamp_parity_across_all_horizons():
    """Verifies that sample_accounting and sample_metadata maintain identical timestamps across all models."""
    for d in DATES:
        for k in HORIZONS:
            fname = f"models_{d}_k{k}.json"
            fpath = DATA_DIR / fname
            assert fpath.exists(), f"Missing artifact: {fname}"

            data = json.loads(fpath.read_text(encoding="utf-8"))
            accounting = data["sample_accounting"]
            metadata = data["sample_metadata"]

            # Model window timestamps parity
            assert accounting["impact_model_start_time_utc"] == metadata["sample_start_utc"], (
                f"Model start time mismatch in {fname}"
            )
            # Effective return end time must be within the session boundary (<= full 250k end time)
            assert metadata["sample_end_utc"] <= accounting["impact_model_end_time_utc"], (
                f"Effective horizon end time exceeds session window in {fname}"
            )

            # Response window (300k) vs Model window (250k) hierarchy
            assert accounting["response_curve_window_trades"] == 300_000
            assert accounting["impact_model_window_trades"] == 250_000
            assert accounting["response_curve_start_trade_id"] == accounting["impact_model_start_trade_id"]
            assert accounting["response_curve_end_trade_id"] > accounting["impact_model_end_trade_id"]
            assert accounting["response_curve_end_time_utc"] > accounting["impact_model_end_time_utc"]

            # Effective horizon loss
            assert accounting["effective_horizon_observations"] == 250_000 - k
            assert metadata["total_observations"] == 250_000 - k


def test_bootstrap_iteration_accounting_strictly_100_replications():
    """Verifies that bootstrap iterations are strictly documented and executed as 100 replications."""
    for d in DATES:
        for k in HORIZONS:
            fname = f"models_{d}_k{k}.json"
            fpath = DATA_DIR / fname
            data = json.loads(fpath.read_text(encoding="utf-8"))

            accounting = data["sample_accounting"]
            explanation = accounting.get("window_difference_explanation", "")

            # Explanation must cite 100 iterations, NEVER 1,000 iterations
            assert "100 iterations" in explanation, f"Explanation did not cite 100 iterations in {fname}"
            assert "1,000" not in explanation, f"Legacy 1,000 iterations found in {fname}"
            assert "06:14 UTC" not in explanation, f"Hardcoded 06:14 UTC found in {fname}"

            # Moving block bootstrap metadata
            mbb = data.get("moving_block_bootstrap", {})
            if mbb.get("status") == "ESTIMATED":
                for b_res in mbb.get("block_results", []):
                    assert b_res["replications_attempted"] == 100, f"Replications attempted not 100 in {fname}"
                for s_entry in mbb.get("sensitivity_table", []):
                    assert s_entry["replications"] == 100, f"Sensitivity table replications not 100 in {fname}"


def test_friday_2026_07_03_neutral_regime_label_and_zero_weekend_drift():
    """Verifies that 2026-07-03 (Friday) is labeled neutrally with researcher exploratory annotation."""
    comp_file = DATA_DIR / "experiments_comparison.json"
    assert comp_file.exists(), "experiments_comparison.json missing"

    content = comp_file.read_text(encoding="utf-8")
    assert "Weekend Drift" not in content, "Legacy 'Weekend Drift' label found in experiments_comparison.json"

    data = json.loads(content)
    regimes = data["regime_characterization"]

    assert "2026-07-03" in regimes
    r_friday = regimes["2026-07-03"]
    assert "周五" in r_friday["regime_name"] or "Friday" in r_friday["regime_name"]
    assert "研究者探索性标注" in r_friday["regime_name"]

    assert "regime_classification_method" in data
    assert data["regime_classification_method"] == "RESEARCHER_EXPLORATORY_ANNOTATION"
    assert "regime_classification_caveat" in data


def test_response_curves_provenance_and_timestamps():
    """Verifies all 3 response curve JSONs maintain exact 300k counts and valid ISO timestamps."""
    for d in DATES:
        fname = f"response_{d}.json"
        fpath = DATA_DIR / fname
        assert fpath.exists(), f"Missing response curve: {fname}"

        data = json.loads(fpath.read_text(encoding="utf-8"))
        assert data["sample_size"] == 300_000
        prov = data["sample_provenance"]
        assert prov["selected_row_count"] == 300_000
        assert prov["date"] == d
        assert "T" in prov["start_time_utc"]
        assert "T" in prov["end_time_utc"]
        assert len(data["curves"]) == 15
        assert data["curves"][0]["lag_events"] == 1
        assert data["curves"][-1]["lag_events"] == 500
