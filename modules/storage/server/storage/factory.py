from functools import lru_cache

from django.conf import settings
from django.utils.module_loading import import_string

from .base import StorageProvider

# Short aliases; a fully-qualified dotted path is also accepted.
_BACKENDS = {
    "local": "storage.local.LocalStorage",
    "s3": "storage.s3.S3Storage",
}


@lru_cache
def get_storage() -> StorageProvider:
    """Return the configured StorageProvider (see settings.STORAGE_BACKEND)."""
    backend = getattr(settings, "STORAGE_BACKEND", "local")
    dotted = _BACKENDS.get(backend, backend)
    return import_string(dotted)()
