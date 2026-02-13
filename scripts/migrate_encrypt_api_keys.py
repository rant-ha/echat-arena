#!/usr/bin/env python3
"""One-time migration script: encrypt plaintext API keys in model_configs table.

Usage:
    # Set required environment variables first:
    export SUPABASE_URL="https://your-project.supabase.co"
    export SUPABASE_SERVICE_KEY="your-service-key"
    export API_KEY_ENCRYPTION_KEY="your-fernet-key"  # generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

    python scripts/migrate_encrypt_api_keys.py
"""

import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from arena.crypto import encrypt_api_key, is_encrypted


def main():
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    encryption_key = os.environ.get("API_KEY_ENCRYPTION_KEY", "")

    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set", file=sys.stderr)
        sys.exit(1)
    if not encryption_key:
        print("ERROR: API_KEY_ENCRYPTION_KEY must be set", file=sys.stderr)
        print("Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"",
              file=sys.stderr)
        sys.exit(1)

    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }

    # 1. Fetch all model configs
    print("Fetching model configs...")
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(
            f"{supabase_url}/rest/v1/model_configs",
            headers=headers,
            params={"select": "id,model_key,api_key_encrypted"},
        )
        if resp.status_code != 200:
            print(f"ERROR: Failed to fetch model configs: {resp.status_code} {resp.text}", file=sys.stderr)
            sys.exit(1)

        models = resp.json()
        print(f"Found {len(models)} model configs")

        # 2. Encrypt plaintext keys
        migrated = 0
        skipped = 0
        errors = 0

        for model in models:
            model_id = model.get("id")
            model_key = model.get("model_key", "unknown")
            api_key = model.get("api_key_encrypted", "")

            if not api_key:
                print(f"  SKIP {model_key}: no API key stored")
                skipped += 1
                continue

            if is_encrypted(api_key):
                print(f"  SKIP {model_key}: already encrypted")
                skipped += 1
                continue

            # Encrypt and update
            try:
                encrypted = encrypt_api_key(api_key)
                resp = client.patch(
                    f"{supabase_url}/rest/v1/model_configs",
                    headers=headers,
                    params={"id": f"eq.{model_id}"},
                    json={"api_key_encrypted": encrypted},
                )
                if resp.status_code in (200, 204):
                    print(f"  OK   {model_key}: encrypted successfully")
                    migrated += 1
                else:
                    print(f"  FAIL {model_key}: update failed ({resp.status_code})", file=sys.stderr)
                    errors += 1
            except Exception as exc:
                print(f"  FAIL {model_key}: {exc}", file=sys.stderr)
                errors += 1

    # 3. Summary
    print(f"\nMigration complete: {migrated} migrated, {skipped} skipped, {errors} errors")
    if errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
