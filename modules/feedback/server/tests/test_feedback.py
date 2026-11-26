import pytest

from feedback.models import Feedback


@pytest.mark.django_db
def test_anonymous_submission_is_persisted_and_listed(client):
    payload = {"name": "Ada", "message": "Please add dark mode", "rating": 5}
    response = client.post("/api/feedback/", payload, content_type="application/json")
    assert response.status_code == 201, response.content
    saved = Feedback.objects.get(pk=response.json()["id"])
    assert saved.message == payload["message"]
    assert saved.name == payload["name"]
    assert saved.rating == 5

    response = client.get("/api/feedback/")
    assert response.status_code == 200
    assert response.json()[0]["id"] == saved.pk


@pytest.mark.django_db
def test_name_is_optional(client):
    response = client.post(
        "/api/feedback/", {"message": "Thanks!"}, content_type="application/json"
    )
    assert response.status_code == 201, response.content
    assert Feedback.objects.get().name == ""


@pytest.mark.django_db
@pytest.mark.parametrize("message", ["", "   "])
def test_blank_feedback_is_rejected(client, message):
    response = client.post(
        "/api/feedback/", {"message": message}, content_type="application/json"
    )
    assert response.status_code == 400
    assert not Feedback.objects.exists()
