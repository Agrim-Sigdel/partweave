from collections.abc import Mapping
from collections.abc import Set as AbstractSet
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class EqExpr:
    field: str
    value: Any


@dataclass(frozen=True)
class AndExpr:
    left: "FilterExpr"
    right: "FilterExpr"


@dataclass(frozen=True)
class NotExpr:
    inner: "FilterExpr"


FilterExpr = EqExpr | AndExpr | NotExpr


def validate_filter(
    expr: FilterExpr,
    allowlist: AbstractSet[str],
    *,
    max_depth: int = 8,
    _depth: int = 0,
) -> None:
    if _depth > max_depth:
        raise ValueError("Filter depth exceeded")
    if isinstance(expr, EqExpr):
        if expr.field not in allowlist:
            raise ValueError(f"Field '{expr.field}' is not allowlisted")
    elif isinstance(expr, AndExpr):
        validate_filter(expr.left, allowlist, max_depth=max_depth, _depth=_depth + 1)
        validate_filter(expr.right, allowlist, max_depth=max_depth, _depth=_depth + 1)
    elif isinstance(expr, NotExpr):
        validate_filter(expr.inner, allowlist, max_depth=max_depth, _depth=_depth + 1)
    else:
        raise TypeError("Unsupported filter node")


def eval_filter(
    expr: FilterExpr,
    record: Mapping[str, Any],
    allowlist: AbstractSet[str],
) -> bool:
    validate_filter(expr, allowlist)
    if isinstance(expr, EqExpr):
        return expr.field in record and record[expr.field] == expr.value
    if isinstance(expr, AndExpr):
        return eval_filter(expr.left, record, allowlist) and eval_filter(
            expr.right, record, allowlist
        )
    return not eval_filter(expr.inner, record, allowlist)
