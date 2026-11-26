"""Root URL configuration for partweave API."""

from django.urls import include, path
from classifier.views import mock_ui

urlpatterns = [
    path("", mock_ui, name="mock-ui"),
    path("api/", include("classifier.urls")),
]
