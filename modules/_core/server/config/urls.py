from django.contrib import admin
from django.http import HttpRequest, JsonResponse
from django.urls import include, path  # noqa: F401  (include used by modules)
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def health(_request: HttpRequest) -> JsonResponse:
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health", health, name="health"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    # <partweave:urls>
]
