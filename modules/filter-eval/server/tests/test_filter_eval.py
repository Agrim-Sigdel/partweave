import pytest

from filter_eval import AndExpr, EqExpr, NotExpr, SafeFilterRunner, UnsafeFilterError


def test_safe_filter_evaluation_and_allowlist() -> None:
    runner = SafeFilterRunner({"status", "plan"})
    rows = [
        {"status": "active", "plan": "pro"},
        {"status": "active", "plan": "free"},
        {"status": "paused", "plan": "pro"},
    ]
    expr = AndExpr(EqExpr("status", "active"), NotExpr(EqExpr("plan", "free")))
    assert runner.filter_records(rows, expr) == [{"status": "active", "plan": "pro"}]

    with pytest.raises(UnsafeFilterError):
        runner.filter_records(rows, EqExpr("password_hash", "x"))
