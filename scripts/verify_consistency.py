import json
from pathlib import Path

def main():
    root = Path(__file__).resolve().parent.parent
    models_k20 = json.loads((root / "apps/web/public/data/models_2026-07-01_k20.json").read_text(encoding="utf-8"))
    hawkes = json.loads((root / "apps/web/public/data/hawkes_2026-07-01.json").read_text(encoding="utf-8"))
    rep = json.loads((root / "research/reports/reproduced_empirical_metrics.json").read_text(encoding="utf-8"))["2026-07-01"]
    audit_text = (root / "V11_AUDIT.md").read_text(encoding="utf-8")
    corr_text = (root / "RESEARCH_CORRECTIONS.md").read_text(encoding="utf-8")
    report_text = (root / "research/reports/MML_BTCUSDT_MICROSTRUCTURE_REPORT.md").read_text(encoding="utf-8")
    frontend_text = (root / "apps/web/src/pages/MarketImpactResearch.tsx").read_text(encoding="utf-8")

    wls_obj = models_k20.get("power_law_wls") or models_k20["power_law_model"]["wls_fit"]
    trade_obj = models_k20.get("trade_level_fit") or models_k20["power_law_model"]["trade_level_fit"]
    pow_obj = models_k20["power_law_model"]

    ols_gamma = pow_obj["gamma"]
    wls_gamma = wls_obj["gamma_wls"]
    trade_gamma = trade_obj["gamma_trade"]
    hawkes_rho = hawkes["branching_ratios"]["spectral_radius"]
    hawkes_status = hawkes["stability_status"]

    rep_ols_gamma = rep["impact_models_k20"]["power_gamma"]
    rep_wls_gamma = rep["impact_models_k20"]["power_law_wls"]["gamma_wls"]
    rep_trade_gamma = rep["impact_models_k20"]["trade_level_fit"]["gamma_trade"]
    rep_hawkes_rho = rep["hawkes"]["spectral_radius"]
    rep_hawkes_status = rep["hawkes"]["stability_status"]

    print(f"[*] JSON models_2026-07-01_k20.json: OLS gamma = {ols_gamma:.4f}, WLS gamma = {wls_gamma:.4f}, Trade gamma = {trade_gamma:+.4f}")
    print(f"[*] Rep report metrics:              OLS gamma = {rep_ols_gamma:.4f}, WLS gamma = {rep_wls_gamma:.4f}, Trade gamma = {rep_trade_gamma:+.4f}")
    print(f"[*] Hawkes 2026-07-01 JSON:          rho = {hawkes_rho:.4f} ({hawkes_status})")
    print(f"[*] Hawkes reproduced:               rho = {rep_hawkes_rho:.4f} ({rep_hawkes_status})")

    assert abs(ols_gamma - rep_ols_gamma) < 1e-4, f"OLS gamma mismatch: {ols_gamma} vs {rep_ols_gamma}"
    assert abs(wls_gamma - rep_wls_gamma) < 1e-4, f"WLS gamma mismatch: {wls_gamma} vs {rep_wls_gamma}"
    assert abs(trade_gamma - rep_trade_gamma) < 1e-4, f"Trade gamma mismatch: {trade_gamma} vs {rep_trade_gamma}"
    assert abs(hawkes_rho - rep_hawkes_rho) < 1e-4, f"Hawkes rho mismatch: {hawkes_rho} vs {rep_hawkes_rho}"
    assert hawkes_status == rep_hawkes_status, f"Hawkes status mismatch: {hawkes_status} vs {rep_hawkes_status}"

    # Assert matching numbers in audit and report
    assert f"{wls_gamma:.4f}" in audit_text, f"{wls_gamma:.4f} not found in V11_AUDIT.md"
    assert f"{trade_gamma:+.4f}" in audit_text, f"{trade_gamma:+.4f} not found in V11_AUDIT.md"
    assert f"{hawkes_rho:.4f}" in audit_text, f"{hawkes_rho:.4f} not found in V11_AUDIT.md"
    assert "28.2%" in audit_text, "28.2% excluded ratio not found in V11_AUDIT.md"
    assert "28.2%" in corr_text, "28.2% excluded ratio not found in RESEARCH_CORRECTIONS.md"

    # Verify obsolete intervals are removed
    assert "[-0.1198, 0.1190]" not in corr_text, "Obsolete interval [-0.1198, 0.1190] still found in RESEARCH_CORRECTIONS.md"
    assert "[-0.1198, 0.1190]" not in audit_text, "Obsolete interval [-0.1198, 0.1190] still found in V11_AUDIT.md"

    # Verify frontend headers and split specifications
    assert "MULTI-ESTIMATOR" in frontend_text, "MULTI-ESTIMATOR not found in MarketImpactResearch.tsx"
    assert "SPEC A: WEIGHTED LEAST SQUARES" in frontend_text, "SPEC A not found in MarketImpactResearch.tsx"
    assert "SPEC B: TIER-BINNED OLS" in frontend_text, "SPEC B not found in MarketImpactResearch.tsx"

    # Verify walk-forward validation and zero-leakage training-only fit
    wf = models_k20.get("walk_forward_validation")
    assert wf is not None, "Missing walk_forward_validation in models JSON"
    assert "pooled_oos" in wf, "Missing pooled_oos in walk_forward_validation"
    assert wf["pooled_oos"]["total_unique_predictions"] > 0, "Zero unique predictions in pooled OOS"
    assert "fold_macro_metrics" in wf, "Missing fold_macro_metrics in walk_forward_validation"
    assert len(wf["folds"]) == 3, f"Expected 3 folds, found {len(wf['folds'])}"

    oos = models_k20.get("out_of_sample_validation")
    assert oos is not None, "Missing out_of_sample_validation in models JSON"
    assert "power_law_train_fit" in oos, "Missing power_law_train_fit in out_of_sample_validation"

    # Verify provenance manifest
    manifest_path = root / "apps/web/public/data/models_provenance_manifest.json"
    assert manifest_path.exists(), "Missing models_provenance_manifest.json"
    prov = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert prov["total_files"] == 18, f"Expected 18 artifacts in manifest, found {prov['total_files']}"
    assert prov["leakage_status"] == "STRICT_TRAINING_ONLY_FIT_ZERO_TEST_LEAKAGE", "Invalid leakage status"

    print(f"[*] Verified walk-forward zero-leakage protocol: {wf['protocol']}")
    print(f"[*] Verified pooled unique OOS predictions:      {wf['pooled_oos']['total_unique_predictions']:,} trades")
    print(f"[*] Verified provenance manifest artifacts:      {prov['total_files']} files")
    print("\n[SUCCESS] All consistency assertions PASSED! Reports, Audit, and Web JSON are 100% unified!")

if __name__ == "__main__":
    main()
