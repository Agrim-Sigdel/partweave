from abc import ABC, abstractmethod
from typing import BinaryIO


class UnsafeKeyError(ValueError):
    """Raised when a storage key would escape its namespace (path traversal)."""


def safe_key(key: str) -> str:
    """
    Normalize and validate an object key, rejecting anything that could escape
    the storage root: absolute paths, drive letters, empty keys, and any
    component that is `..`. Returns a forward-slash key safe to join under a
    root. Applies to every backend — an S3 key with `..` is just as unwanted.
    """
    if not key or not key.strip():
        raise UnsafeKeyError("storage key must be a non-empty string")
    # Reject Windows drive-absolute (`C:\...`) and UNC-ish keys too.
    if key[:1] in ("/", "\\") or (len(key) >= 2 and key[1] == ":"):
        raise UnsafeKeyError(f"storage key must be relative: {key!r}")
    parts = [p for p in key.replace("\\", "/").split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts):
        raise UnsafeKeyError(f"storage key must not contain '..': {key!r}")
    if not parts:
        raise UnsafeKeyError(f"storage key resolves to an empty path: {key!r}")
    return "/".join(parts)


class StorageProvider(ABC):
    """
    Swappable file-storage backend. Concrete implementations (LocalStorage,
    S3Storage, ...) are selected at runtime via settings.STORAGE_BACKEND.

    This is the reference pattern for adding a new capability to the platform:
    define an ABC here, ship one or more implementations, and select via config.
    """

    @abstractmethod
    def save(self, key: str, content: BinaryIO) -> str:
        """Persist `content` under `key`; return a retrievable URL."""

    @abstractmethod
    def url(self, key: str) -> str:
        """Return a URL for an already-stored object."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Remove the object at `key` (no error if absent)."""
