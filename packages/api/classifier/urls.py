"""URL routing for the classifier API."""

from django.urls import path

from . import views

urlpatterns = [
    path("classify", views.classify, name="classify"),
    path("catalog", views.catalog, name="catalog"),
    path("history", views.history, name="history-all"),
    path("history/<str:module_id>", views.history, name="history-module"),
]
