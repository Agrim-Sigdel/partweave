from rest_framework import serializers
from .models import Feedback

class FeedbackSerializer(serializers.ModelSerializer):
    message = serializers.CharField(max_length=4000)
    rating = serializers.IntegerField(min_value=1, max_value=5, default=5)

    class Meta:
        model = Feedback
        fields = ["id", "name", "message", "rating", "created_at"]
        read_only_fields = ["id", "created_at"]
