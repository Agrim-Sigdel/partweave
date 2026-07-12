import io

import pytest


def test_local_storage_roundtrip(tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path
    settings.MEDIA_URL = "/media/"
    settings.STORAGE_BACKEND = "local"

    from storage.factory import get_storage

    get_storage.cache_clear()
    store = get_storage()

    url = store.save("greeting.txt", io.BytesIO(b"hi"))
    assert url.endswith("/greeting.txt")
    assert (tmp_path / "greeting.txt").read_bytes() == b"hi"

    store.delete("greeting.txt")
    assert not (tmp_path / "greeting.txt").exists()
    get_storage.cache_clear()


def test_local_storage_nested_key(tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path
    settings.MEDIA_URL = "/media/"
    settings.STORAGE_BACKEND = "local"

    from storage.factory import get_storage

    get_storage.cache_clear()
    store = get_storage()

    # A legitimate nested key stays inside the root.
    store.save("uploads/2026/report.txt", io.BytesIO(b"ok"))
    assert (tmp_path / "uploads" / "2026" / "report.txt").read_bytes() == b"ok"
    get_storage.cache_clear()


@pytest.mark.parametrize(
    "bad_key",
    [
        "../escape.txt",
        "uploads/../../escape.txt",
        "/etc/passwd",
        "..",
        "",
        "   ",
    ],
)
def test_local_storage_rejects_traversal(bad_key, tmp_path, settings):
    """A key that would escape MEDIA_ROOT is refused — nothing is written outside."""
    settings.MEDIA_ROOT = tmp_path
    settings.MEDIA_URL = "/media/"
    settings.STORAGE_BACKEND = "local"

    from storage.base import UnsafeKeyError
    from storage.factory import get_storage

    get_storage.cache_clear()
    store = get_storage()

    with pytest.raises((UnsafeKeyError, ValueError)):
        store.save(bad_key, io.BytesIO(b"pwned"))

    # The sentinel file must not exist anywhere above the root.
    assert not (tmp_path.parent / "escape.txt").exists()
    get_storage.cache_clear()
