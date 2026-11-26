from collections.abc import Iterable, Mapping
from collections.abc import Set as AbstractSet
from typing import Any

from .core import FilterExpr, eval_filter, validate_filter


class UnsafeFilterError(Exception):
    """Raised when a filter references non-allowlisted fields or exceeds depth."""


class SafeFilterRunner:
    """Pure Transform Wrapper: filters records safely with field allowlisting."""

    def __init__(self, allowed_fields: AbstractSet[str], *, max_depth: int = 8) -> None:
        self.allowed_fields = frozenset(allowed_fields)
        self.max_depth = max_depth

    def filter_records(
        self,
        records: Iterable[Mapping[str, Any]],
        expr: FilterExpr,
    ) -> list[Mapping[str, Any]]:
        try:
            validate_filter(expr, self.allowed_fields, max_depth=self.max_depth)
        except (TypeError, ValueError) as exc:
            raise UnsafeFilterError(str(exc)) from exc
        return [
            r
            for r in records
            if eval_filter(expr, r, self.allowed_fields, max_depth=self.max_depth)
        ]
