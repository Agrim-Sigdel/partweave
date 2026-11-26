from collections.abc import Sequence
from dataclasses import dataclass
from typing import TypeVar

from .core import build_page_window, clamp_limit, decode_cursor, encode_cursor

T = TypeVar("T")


@dataclass(frozen=True)
class PageResult[T]:
    items: list[T]
    next_cursor: str | None
    has_more: bool


class Paginator:
    """Pure Transform Wrapper: slices sequences using verified cursor bounds."""

    def __init__(self, *, max_limit: int = 100) -> None:
        self.max_limit = max_limit

    def paginate(
        self,
        items: Sequence[T],
        *,
        cursor: str | None = None,
        limit: int = 20,
    ) -> PageResult[T]:
        offset = decode_cursor(cursor)
        safe_limit = clamp_limit(limit, self.max_limit)
        win = build_page_window(offset, safe_limit, len(items))
        sliced = list(items[win.start : win.end_exclusive])
        next_cur = encode_cursor(win.end_exclusive) if win.has_more else None
        return PageResult(items=sliced, next_cursor=next_cur, has_more=win.has_more)
