import hashlib
import secrets


def hash_password(password: str) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256 with a random salt."""
    salt = secrets.token_hex(16)
    hash_value = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), 100_000
    ).hex()
    return f"{salt}:{hash_value}"


def verify_password(password: str, stored: str) -> bool:
    """Verify a password against its stored hash."""
    try:
        salt, hash_value = stored.split(":")
        check = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), salt.encode(), 100_000
        ).hex()
        return secrets.compare_digest(check, hash_value)
    except (ValueError, AttributeError):
        return False
