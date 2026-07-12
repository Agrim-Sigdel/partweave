from rest_framework import viewsets, mixins
from rest_framework.permissions import AllowAny
from .models import Feedback
from .serializers import FeedbackSerializer

class FeedbackViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = Feedback.objects.all().order_by("-created_at")
    serializer_class = FeedbackSerializer
    permission_classes = [AllowAny]
