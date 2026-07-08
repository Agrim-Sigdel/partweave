from pathlib import Path
from typing import BinaryIO

from django.conf import settings

from .base import StorageProvider


class LocalStorage(StorageProvider):
    """Stores files on the local filesystem under MEDIA_ROOT."""

    def __init__(self) -> None:
        self.root = Path(getattr(settings, "MEDIA_ROOT", settings.BASE_DIR / "media"))
        self.root.mkdir(parents=True, exist_ok=True)
        self.base_url = getattr(settings, "MEDIA_URL", "/media/")

    def save(self, key: str, content: BinaryIO) -> str:
        dest = self.root / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as fh:
            fh.write(content.read())
        return self.url(key)

    def url(self, key: str) -> str:
        return f"{self.base_url.rstrip('/')}/{key}"

    def delete(self, key: str) -> None:
        (self.root / key).unlink(missing_ok=True)
