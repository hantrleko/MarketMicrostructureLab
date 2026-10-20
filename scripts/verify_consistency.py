import json
from pathlib import Path

def main():
    root = Path(__file__).resolve().parent.parent
    models_k20 = json.loads((root / "apps/web/public/data/models_2026-07-01_k20.json").read_text(encoding="utf-8"))
    hawkes = json.loads((root / "apps/web/public/data/hawkes_2026-07-01.json").read_text(encoding="utf-8"))
    rep = json.loads((root / "research/reports/reproduced_empirical_metrics.json").read_text(encoding="utf-8"))["2026-07-01"]
    audit_text = (root / "V11_AUDIT.md").read_text(encoding="utf-8")
    report_text = (root / "research/reports/MML_BTCUSDT_MICROSTRUCTURE_REPORT.md").read_text(encoding="utf-8")

    wls_obj = models_k20.get("power_law_wls") or models_k20["power_law_model"]["wls_fit"]
    trade_obj = models_k20.get("trade_level_fit") or models_k20["power_law_model"]["trade_level_fit"]

    wls_gamma = wls_obj["gamma_wls"]
    trade_gamma = trade_obj["gamma_trade"]
    hawkes_rho = hawkes["branching_ratios"]["spectral_radius"]
    hawkes_status = hawkes["stability_status"]

    rep_wls_gamma = rep["impact_models_k20"]["power_law_wls"]["gamma_wls"]
    rep_trade_gamma = rep["impact_models_k20"]["trade_level_fit"]["gamma_trade"]
    rep_hawkes_rho = rep["hawkes"]["spectral_radius"]
    rep_hawkes_status = rep["hawkes"]["stability_status"]

    print(f"[*] JSON models_2026-07-01_k20.json: WLS gamma = {wls_gamma:.4f}, Trade gamma = {trade_gamma:+.4f}")
    print(f"[*] Rep report metrics:              WLS gamma = {rep_wls_gamma:.4f}, Trade gamma = {rep_trade_gamma:+.4f}")
    print(f"[*] Hawkes 2026-07-01 JSON:          rho = {hawkes_rho:.4f} ({hawkes_status})")
    print(f"[*] Hawkes reproduced:               rho = {rep_hawkes_rho:.4f} ({rep_hawkes_status})")

    assert abs(wls_gamma - rep_wls_gamma) < 1e-4, f"WLS gamma mismatch: {wls_gamma} vs {rep_wls_gamma}"
    assert abs(trade_gamma - rep_trade_gamma) < 1e-4, f"Trade gamma mismatch: {trade_gamma} vs {rep_trade_gamma}"
    assert abs(hawkes_rho - rep_hawkes_rho) < 1e-4, f"Hawkes rho mismatch: {hawkes_rho} vs {rep_hawkes_rho}"
    assert hawkes_status == rep_hawkes_status, f"Hawkes status mismatch: {hawkes_status} vs {rep_hawkes_status}"

    assert f"{wls_gamma:.4f}" in audit_text, f"{wls_gamma:.4f} not found in V11_AUDIT.md"
    assert f"{trade_gamma:+.4f}" in audit_text, f"{trade_gamma:+.4f} not found in V11_AUDIT.md"
    assert f"{hawkes_rho:.4f}" in audit_text, f"{hawkes_rho:.4f} not found in V11_AUDIT.md"

    assert f"{wls_gamma:.4f}" in report_text, f"{wls_gamma:.4f} not found in MML_BTCUSDT_MICROSTRUCTURE_REPORT.md"
    assert f"{hawkes_rho:.4f}" in report_text, f"{hawkes_rho:.4f} not found in MML_BTCUSDT_MICROSTRUCTURE_REPORT.md"

    print("\n[SUCCESS] All consistency assertions PASSED! Reports, Audit, and Web JSON are 100% unified!")

if __name__ == "__main__":
    main()
