import io


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
