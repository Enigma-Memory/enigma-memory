from solders.keypair import Keypair
import json
import os

kp = Keypair()
secret = list(kp.secret())
public = str(kp.pubkey())

print(f"Public key: {public}")
print(f"Secret length: {len(secret)}")

os.makedirs(os.path.dirname(__file__), exist_ok=True)
with open(os.path.join(os.path.dirname(__file__), 'devnet-wallet.json'), 'w') as f:
    json.dump(secret, f)
print("Saved to devnet-wallet.json")
