from django.contrib.auth import get_user_model
from rest_framework import generics, permissions
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import RegisterSerializer, UserSerializer

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    # Registration is public: don't attempt JWT authentication at all. Otherwise a
    # stale/expired token sent by a client would make authentication fail with 401
    # before AllowAny is ever checked, blocking registration.
    authentication_classes: list = []


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        return Response(UserSerializer(request.user).data)
