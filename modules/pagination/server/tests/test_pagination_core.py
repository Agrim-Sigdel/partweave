import pytest

from pagination_core import Paginator, decode_cursor, encode_cursor


def test_cursor_roundtrip_and_page_slicing() -> None:
    p = Paginator(max_limit=3)
    data = ["a", "b", "c", "d", "e"]

    page1 = p.paginate(data, limit=10)
    assert page1.items == ["a", "b", "c"]
    assert page1.has_more is True
    assert decode_cursor(page1.next_cursor) == 3

    page2 = p.paginate(data, cursor=page1.next_cursor, limit=3)
    assert page2.items == ["d", "e"]
    assert page2.has_more is False
    assert page2.next_cursor is None

    with pytest.raises(ValueError):
        encode_cursor(-1)
