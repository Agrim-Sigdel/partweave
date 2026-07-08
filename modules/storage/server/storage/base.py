from abc import ABC, abstractmethod
from typing import BinaryIO


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
