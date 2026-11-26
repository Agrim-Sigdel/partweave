import base64
from dataclasses import dataclass


@dataclass(frozen=True)
class PageWindow:
    start: int
    end_exclusive: int
    has_more: bool


def clamp_limit(requested: int, max_limit: int = 100) -> int:
    if max_limit < 1:
        raise ValueError("max_limit must be >= 1")
    if requested < 1:
        return 1
    if requested > max_limit:
        return max_limit
    return requested


def build_page_window(offset: int, limit: int, total: int) -> PageWindow:
    if offset < 0 or limit < 1 or total < 0:
        raise ValueError("Invalid pagination bounds")
    start = min(offset, total)
    end_ex = min(start + limit, total)
    return PageWindow(start=start, end_exclusive=end_ex, has_more=end_ex < total)


def encode_cursor(offset: int) -> str:
    if offset < 0:
        raise ValueError("offset must be >= 0")
    return base64.urlsafe_b64encode(str(offset).encode("ascii")).decode("ascii")


def decode_cursor(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("ascii")
        val = int(raw)
    except Exception as exc:
        raise ValueError("Invalid pagination cursor") from exc
    if val < 0:
        raise ValueError("Invalid negative cursor")
    return val
