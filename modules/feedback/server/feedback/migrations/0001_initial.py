from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Feedback",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(blank=True, max_length=255)),
                ("message", models.TextField()),
                ("rating", models.IntegerField(default=5)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
    ]
