import os
from urllib.parse import urlparse


LOCAL_DEV_AUTH_TOKEN = "workwithme-local-admin"
LOCAL_DEV_FIREBASE_UID = "local-dev-admin"


def is_dev_auth_enabled() -> bool:
    return os.getenv("WORKWITHME_ENABLE_DEV_AUTH", "1").lower() not in {"0", "false", "no"}


def is_local_origin(origin: str | None) -> bool:
    if not origin:
        return False

    host = urlparse(origin).hostname
    return host in {"localhost", "127.0.0.1", "::1"}


def resolve_local_dev_uid(token: str | None, origin: str | None) -> str | None:
    if not is_dev_auth_enabled():
        return None
    if token != LOCAL_DEV_AUTH_TOKEN:
        return None
    if not is_local_origin(origin):
        return None
    return LOCAL_DEV_FIREBASE_UID
