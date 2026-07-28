# -*- coding: utf-8 -*-
"""
encrypt_asset.py — 把任意檔案用密碼加密成 .bin（與 js/song-crypto.js 對齊，沿用 GAME DIY 方案）。
結構：salt(16) || iv(12) || ciphertext(含 GCM tag)；PBKDF2-HMAC-SHA256 200000 次 → AES-256-GCM。
用法：SONG_PW=xxx python tools/encrypt_asset.py <來源檔> <輸出.bin>
"""
import sys, os, getpass
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITER = 200000

def main():
    if len(sys.argv) < 3:
        print("用法：python tools/encrypt_asset.py <來源檔> <輸出.bin>"); return
    src, out = sys.argv[1], sys.argv[2]
    pw = os.environ.get("SONG_PW") or getpass.getpass("密碼：")
    data = open(src, "rb").read()
    salt, iv = os.urandom(16), os.urandom(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER)
    key = kdf.derive(pw.encode("utf-8"))
    ct = AESGCM(key).encrypt(iv, data, None)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    open(out, "wb").write(salt + iv + ct)
    print(f"OK {src} -> {out} ({len(salt+iv+ct)} bytes)")

if __name__ == "__main__":
    main()
