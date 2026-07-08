from typing import BinaryIO

from django.conf import settings

from .base import StorageProvider


class S3Storage(StorageProvider):
    """Stores files in an S3 bucket. Requires boto3 and AWS credentials."""

    def __init__(self) -> None:
        import boto3  # imported lazily so boto3 is only needed for the S3 backend

        self.bucket = settings.AWS_STORAGE_BUCKET_NAME
        self.client = boto3.client(
            "s3",
            region_name=getattr(settings, "AWS_REGION", None),
            aws_access_key_id=getattr(settings, "AWS_ACCESS_KEY_ID", None) or None,
            aws_secret_access_key=getattr(settings, "AWS_SECRET_ACCESS_KEY", None) or None,
        )

    def save(self, key: str, content: BinaryIO) -> str:
        self.client.upload_fileobj(content, self.bucket, key)
        return self.url(key)

    def url(self, key: str) -> str:
        return f"https://{self.bucket}.s3.amazonaws.com/{key}"

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)
