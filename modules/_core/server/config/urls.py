from django.contrib import admin
from django.http import HttpRequest, JsonResponse
from django.urls import include, path  # noqa: F401  (include used by modules)
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import AllowAny


def health(_request: HttpRequest) -> JsonResponse:
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health", health, name="health"),
    # Schema + docs stay public despite the global IsAuthenticated default, so you
    # can browse the API without a token.
    path("api/schema/", SpectacularAPIView.as_view(permission_classes=[AllowAny]), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema", permission_classes=[AllowAny]),
        name="docs",
    ),
    # <partweave:urls>
]
