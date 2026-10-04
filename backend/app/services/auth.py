# backend/app/services/auth.py
import jwt
from jwt import PyJWKClient
from app.core.config import settings

# Initialize JWKS client to fetch Keycloak public keys
jwks_client = PyJWKClient(f"{settings.KEYCLOAK_ISSUER_URL}/protocol/openid-connect/certs")

def decode_token(token: str) -> dict:
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    
    # MVP Note: We disable audience verification for simplicity in local dev
    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        issuer=settings.KEYCLOAK_ISSUER_URL,
        options={"verify_aud": False}
    )
    return payload
