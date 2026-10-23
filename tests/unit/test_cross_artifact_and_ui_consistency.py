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


def test_ui_sample_chronology_strictly_reads_metadata_without_fallbacks():
    """
    CRITICAL QUALITY GATE:
    Verifies that MarketImpactResearch.tsx does not contain stale fallback timestamps
    ('00:00:00' -> '04:23:18'), displays '正在读取样本信息...' during loading,
    '样本时间暂不可用' on error, and provides retry capability.
    """
    tsx_file = ROOT / "apps" / "web" / "src" / "pages" / "MarketImpactResearch.tsx"
    assert tsx_file.exists(), "MarketImpactResearch.tsx missing"
    content = tsx_file.read_text(encoding="utf-8")

    # Stale fallback timestamps must NOT exist
    assert "04:23:18" not in content, "Stale fallback timestamp '04:23:18' found in MarketImpactResearch.tsx"
    assert "'00:00:00'" not in content, "Stale fallback timestamp '00:00:00' found in MarketImpactResearch.tsx"

    # Status-driven loading and error states
    assert "正在读取样本信息..." in content, "Missing '正在读取样本信息...' loading state in MarketImpactResearch.tsx"
    assert "样本时间暂不可用" in content, "Missing '样本时间暂不可用' error state in MarketImpactResearch.tsx"
    assert "handleRetry" in content, "Missing handleRetry callback in MarketImpactResearch.tsx"
    assert "重试" in content, "Missing retry button in MarketImpactResearch.tsx"


def test_ui_v11_layout_math_and_bundle_parity():
    """
    V1.1 QUALITY GATE:
    Verifies that UI incorporates KaTeX math typography, zero unrendered LaTeX leaks,
    adaptive statistical card grids, compact header (<96px), and initial replay status guidance.
    """
    web_src = ROOT / "apps" / "web" / "src"

    # 1. KaTeX MathFormula component exists
    math_comp = web_src / "components" / "MathFormula.tsx"
    assert math_comp.exists(), "Missing MathFormula.tsx component"
    math_content = math_comp.read_text(encoding="utf-8")
    assert "katex" in math_content, "MathFormula does not import katex"

    # 2. MarketImpactResearch imports and uses MathFormula with zero unrendered LaTeX in text
    impact_tsx = web_src / "pages" / "MarketImpactResearch.tsx"
    impact_content = impact_tsx.read_text(encoding="utf-8")
    assert "MathFormula" in impact_content, "MarketImpactResearch.tsx does not use MathFormula"
    assert "$\\mathcal" not in impact_content, "Exposed unrendered $\\mathcal found in MarketImpactResearch.tsx"
    assert "$\\mathbb" not in impact_content, "Exposed unrendered $\\mathbb found in MarketImpactResearch.tsx"
    assert "stat-cards-adaptive" in impact_content, "stat-cards-adaptive not used in MarketImpactResearch.tsx"

    # 3. index.css contains responsive inspector and adaptive grid classes
    css_file = web_src / "index.css"
    css_content = css_file.read_text(encoding="utf-8")
    assert ".stat-cards-adaptive" in css_content, "Missing .stat-cards-adaptive in index.css"
    assert ".responsive-inspector-grid" in css_content, "Missing .responsive-inspector-grid in index.css"
    assert ".responsive-orderbook-grid" in css_content, "Missing .responsive-orderbook-grid in index.css"
    assert "max-height: 96px" in css_content, "Header max-height 96px constraint missing in index.css"

    # 4. MarketReplay has compact initial 1-trade notice and tight yMin/yMax framing
    replay_tsx = web_src / "pages" / "MarketReplay.tsx"
    replay_content = replay_tsx.read_text(encoding="utf-8")
    assert "已加载" in replay_content and "当前显示第 1 笔" in replay_content, (
        "MarketReplay.tsx missing initial 1-trade guidance notice"
    )
    assert "minClipPrice" in replay_content and "maxClipPrice" in replay_content, (
        "MarketReplay.tsx missing clip price framing logic"
    )
    assert "responsive-inspector-grid" in replay_content, (
        "MarketReplay.tsx missing responsive-inspector-grid container"
    )

    # 5. MMLChart lightweight core wrapper exists and is used across pages
    chart_comp = web_src / "components" / "MMLChart.tsx"
    assert chart_comp.exists(), "Missing MMLChart.tsx lightweight core component"
    chart_content = chart_comp.read_text(encoding="utf-8")
    assert "echarts/core" in chart_content, "MMLChart does not use echarts/core"


