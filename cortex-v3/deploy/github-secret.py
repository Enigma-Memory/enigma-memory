import base64
import json
import os
import requests
from nacl import encoding, public

# Configuration
REPO = "Enigma-Memory/enigma-memory"
SECRET_NAME = "SOLANA_DEVNET_WALLET"
PAT = os.environ.get("GITHUB_PAT", "")
WALLET_FILE = os.path.join(os.path.dirname(__file__), "devnet-wallet.json")

def encrypt_secret(public_key: str, secret_value: str) -> str:
    """Encrypt a Unicode string using GitHub's public key."""
    public_key = public.PublicKey(public_key.encode("utf-8"), encoding.Base64Encoder())
    sealed_box = public.SealedBox(public_key)
    encrypted = sealed_box.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")

def main():
    if not PAT:
        print("Set GITHUB_PAT environment variable")
        return

    with open(WALLET_FILE, "r") as f:
        wallet_json = f.read()

    headers = {
        "Authorization": f"token {PAT}",
        "Accept": "application/vnd.github.v3+json",
    }

    # Get repo public key
    url = f"https://api.github.com/repos/{REPO}/actions/secrets/public-key"
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    data = resp.json()
    key_id = data["key_id"]
    public_key = data["key"]

    # Encrypt and upload secret
    encrypted = encrypt_secret(public_key, wallet_json)
    secret_url = f"https://api.github.com/repos/{REPO}/actions/secrets/{SECRET_NAME}"
    payload = {
        "encrypted_value": encrypted,
        "key_id": key_id,
    }
    put_resp = requests.put(secret_url, headers=headers, json=payload)
    put_resp.raise_for_status()
    print(f"Secret {SECRET_NAME} created/updated successfully")

if __name__ == "__main__":
    main()
