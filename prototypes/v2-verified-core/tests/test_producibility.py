import sys
import tempfile
import unittest
from pathlib import Path

PROTO_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = PROTO_ROOT.parent.parent
if str(PROTO_ROOT) not in sys.path:
    sys.path.insert(0, str(PROTO_ROOT))

from independent_scanner import (  # noqa: E402
    Criteria,
    Verdict,
    classify,
    scan_directory,
    scan_repository,
    scan_text_spec,
)
from producibility_probe import format_report, run_probes, scan_beyond_catalog  # noqa: E402


class IndependentScannerTests(unittest.TestCase):
    def test_unseen_pure_python_directory_is_classified_without_hardcoding(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mod_dir = Path(tmp) / "brand-new-pricing-math"
            mod_dir.mkdir()
            (mod_dir / "pricing.py").write_text(
                "def calculate_discount(cents: int, pct: int) -> int:\n"
                "    if cents < 0 or not (0 <= pct <= 100):\n"
                "        raise ValueError('invalid')\n"
                "    return (cents * (100 - pct)) // 100\n",
                encoding="utf-8",
            )
            res = scan_directory(mod_dir.name, "custom-scan", mod_dir)
            self.assertEqual(res.verdict, Verdict.PRODUCIBLE_CORE)
            self.assertEqual(res.evidence.pure_functions, ["pricing.py:calculate_discount"])

    def test_unseen_mixed_directory_detects_hybrid_and_exact_pure_function(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            mod_dir = Path(tmp) / "unseen-exporter"
            mod_dir.mkdir()
            (mod_dir / "sanitize.py").write_text(
                "def clean_csv_cell(val: str) -> str:\n"
                "    return \"'\" + val if val.startswith(('=', '+', '-', '@')) else val\n",
                encoding="utf-8",
            )
            (mod_dir / "views.py").write_text(
                "import requests\n"
                "def export_view(request):\n"
                "    return requests.post('https://example.com', json={'ok': True})\n",
                encoding="utf-8",
            )
            res = scan_directory(mod_dir.name, "custom-scan", mod_dir)
            self.assertEqual(res.verdict, Verdict.HYBRID_WRAPPER)
            self.assertIn("sanitize.py:clean_csv_cell", res.evidence.pure_functions)
            self.assertEqual(len(res.evidence.impure_functions), 1)

    def test_unseen_infra_or_ml_directory_is_not_possible(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            infra_dir = Path(tmp) / "unseen-infra"
            infra_dir.mkdir()
            (infra_dir / "Dockerfile").write_text("FROM python:3.12-slim\n", encoding="utf-8")
            self.assertEqual(
                scan_directory("unseen-infra", "custom-scan", infra_dir).verdict,
                Verdict.NOT_POSSIBLE,
            )

            ml_dir = Path(tmp) / "unseen-ml"
            ml_dir.mkdir()
            (ml_dir / "predict.py").write_text(
                "import torch\n"
                "def classify_intent(x):\n"
                "    return x\n",
                encoding="utf-8",
            )
            self.assertEqual(
                scan_directory("unseen-ml", "custom-scan", ml_dir).verdict,
                Verdict.NOT_POSSIBLE,
            )

    def test_classification_rules(self) -> None:
        self.assertEqual(classify(Criteria(True, True, True, True, True)), Verdict.PRODUCIBLE_CORE)
        self.assertEqual(classify(Criteria(False, True, True, True, True)), Verdict.HYBRID_WRAPPER)
        self.assertEqual(classify(Criteria(False, False, True, False, False)), Verdict.NOT_POSSIBLE)
        self.assertEqual(classify(Criteria(True, True, False, False, False)), Verdict.NOT_POSSIBLE)

    def test_live_repository_scan_and_probes_pass(self) -> None:
        repo_results = scan_repository(REPO_ROOT)
        beyond_results = scan_beyond_catalog(REPO_ROOT)
        all_results = [*repo_results, *beyond_results]

        by_id = {r.id: r for r in all_results}
        self.assertEqual(by_id["storage"].verdict, Verdict.HYBRID_WRAPPER)
        self.assertIn("server/storage/base.py:safe_key", by_id["storage"].evidence.pure_functions)
        self.assertEqual(by_id["ui-kit"].verdict, Verdict.NOT_POSSIBLE)
        self.assertEqual(by_id["docker"].verdict, Verdict.NOT_POSSIBLE)
        self.assertEqual(by_id["workflow-engine"].verdict, Verdict.PRODUCIBLE_CORE)
        self.assertEqual(by_id["rbac"].verdict, Verdict.PRODUCIBLE_CORE)

        probe_results = run_probes(all_results)
        self.assertEqual(len(probe_results), 10)
        self.assertEqual([r for r in probe_results if not r[1]], [])

    def test_text_spec_scanner_handles_unseen_descriptions(self) -> None:
        self.assertEqual(
            scan_text_spec("x", "custom", "Pure state machine lifecycle transitions").verdict,
            Verdict.PRODUCIBLE_CORE,
        )
        self.assertEqual(
            scan_text_spec("y", "custom", "Tailwind dark palette button card UI").verdict,
            Verdict.NOT_POSSIBLE,
        )

    def test_custom_scan_cli_report_works(self) -> None:
        cli_scan = scan_directory("src", "custom-scan", REPO_ROOT / "packages" / "cli" / "src")
        self.assertEqual(cli_scan.verdict, Verdict.HYBRID_WRAPPER)
        self.assertIn("resolve.ts:resolveModules", cli_scan.evidence.pure_functions)
        report, ok = format_report([REPO_ROOT / "packages" / "cli" / "src"])
        self.assertTrue(ok)
        self.assertIn("Pure functions discovered", report)


if __name__ == "__main__":
    unittest.main()
