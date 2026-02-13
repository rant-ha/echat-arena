"""Fernet symmetric encryption for API keys stored in database."""

import os
from cryptography.fernet import Fernet, InvalidToken


_ENCRYPTION_KEY = os.environ.get("API_KEY_ENCRYPTION_KEY", "")


def get_fernet() -> Fernet:
    """Get Fernet instance. Raises RuntimeError if key not configured."""
    if not _ENCRYPTION_KEY:
        raise RuntimeError("API_KEY_ENCRYPTION_KEY not set")
    return Fernet(_ENCRYPTION_KEY.encode())


def encrypt_api_key(plaintext: str) -> str:
    """Encrypt an API key. Returns empty string for empty input."""
    if not plaintext:
        return ""
    return get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_api_key(ciphertext: str) -> str:
    """Decrypt an API key. Returns empty string for empty input."""
    if not ciphertext:
        return ""
    try:
        return get_fernet().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, Exception):
        # If decryption fails (e.g. plaintext data not yet migrated), return as-is
        return ciphertext


def is_encrypted(value: str) -> bool:
    """Check if value looks like Fernet ciphertext (starts with gAAAAA)."""
    return value.startswith("gAAAAA") if value else False
