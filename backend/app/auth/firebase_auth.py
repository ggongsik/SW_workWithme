"""
Firebase Admin SDK를 이용한 ID Token 검증.

흐름:
1. 앱 시작 시 service account 키로 Firebase Admin SDK 초기화 (init_firebase)
2. 클라이언트가 WebSocket 연결 시 query string으로 token 전달
3. verify_token() 으로 토큰 검증 → 검증되면 Firebase UID 반환
"""

import os
from typing import Optional

import firebase_admin
from firebase_admin import credentials, auth as firebase_auth_sdk


# service account 키 파일 경로 (backend/ 디렉터리 기준)
_SERVICE_ACCOUNT_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "firebase-service-account.json")
)


def init_firebase() -> None:
    """
    Firebase Admin SDK 초기화. 앱 시작 시 한 번만 호출.

    이미 초기화된 경우 다시 호출해도 안전하게 무시됨.
    """
    # 이미 초기화됐는지 확인 (개발 중 reload 등으로 중복 호출 방지)
    if firebase_admin._apps:
        return

    if not os.path.exists(_SERVICE_ACCOUNT_PATH):
        raise FileNotFoundError(
            f"Firebase service account 키 파일을 찾을 수 없습니다: {_SERVICE_ACCOUNT_PATH}"
        )

    cred = credentials.Certificate(_SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred) # Firebase 프로젝트 권한 획득 -> 토큰 검증 가능
    print("[firebase_auth] Firebase Admin SDK 초기화 완료")


def verify_token(id_token: str) -> Optional[str]:
    """
    클라이언트에서 받은 Firebase ID Token을 검증.

    Returns:
        검증 성공 시 Firebase UID 문자열
        검증 실패 시 None
    """
    try:
        decoded = firebase_auth_sdk.verify_id_token(id_token)
        return decoded["uid"]
    except Exception as e:
        print(f"[firebase_auth] 토큰 검증 실패: {e}")
        return None
