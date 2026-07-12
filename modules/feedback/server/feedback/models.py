from django.db import models

class Feedback(models.Model):
    name = models.CharField(max_length=255, blank=True)
    message = models.TextField()
    rating = models.IntegerField(default=5)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Feedback {self.id} - {self.name}"
