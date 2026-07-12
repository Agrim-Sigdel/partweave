from pathlib import Path
from typing import BinaryIO

from django.conf import settings

from .base import StorageProvider, safe_key


class LocalStorage(StorageProvider):
    """Stores files on the local filesystem under MEDIA_ROOT."""

    def __init__(self) -> None:
        self.root = Path(getattr(settings, "MEDIA_ROOT", settings.BASE_DIR / "media")).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.base_url = getattr(settings, "MEDIA_URL", "/media/")

    def _resolve(self, key: str) -> Path:
        """Map a validated key to an absolute path, asserting it stays under root."""
        dest = (self.root / safe_key(key)).resolve()
        # Defense in depth: even after safe_key, confirm the final path is inside
        # root (guards against symlinks / edge cases in path normalization).
        if dest != self.root and self.root not in dest.parents:
            raise ValueError(f"resolved path escapes storage root: {key!r}")
        return dest

    def save(self, key: str, content: BinaryIO) -> str:
        dest = self._resolve(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as fh:
            fh.write(content.read())
        return self.url(safe_key(key))

    def url(self, key: str) -> str:
        return f"{self.base_url.rstrip('/')}/{safe_key(key)}"

    def delete(self, key: str) -> None:
        self._resolve(key).unlink(missing_ok=True)
