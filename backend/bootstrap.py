"""Provision a first administrator without storing any passwords in source code.

Usage: from repository root, set JWT_SECRET (>=32 chars), ADMIN_PASSWORD and
optionally ADMIN_USER, ADMIN_NAME, then run python -m backend.bootstrap.
"""
import os
import sys
from pwdlib import PasswordHash
from backend.app import User, database, secret


def main():
    secret()
    password = os.getenv('ADMIN_PASSWORD', '')
    username = os.getenv('ADMIN_USER', 'admin').strip()
    if len(password) < 12 or not username:
        sys.exit('Set ADMIN_PASSWORD to at least 12 characters and ADMIN_USER to a nonempty ID.')
    with database() as db:
        if db.get(User, username):
            sys.exit('User already exists; bootstrap will not overwrite the password.')
        db.add(User(id=username, name=os.getenv('ADMIN_NAME', 'Administrator'), role='admin', password_hash=PasswordHash.recommended().hash(password)))
        db.commit()
    print('Administrator created; remove ADMIN_PASSWORD from your shell environment.')


if __name__ == '__main__':
    main()
