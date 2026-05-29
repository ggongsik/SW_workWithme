"""
사용자 조회/생성 로직.

Firebase에서 검증된 UID를 받아 DB의 UserRecord를 찾고,
없으면 새로 생성한다. (get-or-create 패턴)
"""

from sqlalchemy import select

from app.models.db import get_db_session
from app.models.db_models import UserRecord


async def get_or_create_user(firebase_uid: str) -> str:
    """
    Firebase UID로 사용자를 조회하고, 없으면 새로 만들어서 DB의 user id를 반환.

    Args:
        firebase_uid: Firebase 인증에서 받은 UID

    Returns:
        DB 내부 user id (UUID 문자열)
    """
    async with get_db_session() as db:
        # 1. firebase_uid로 기존 사용자 조회
        stmt = select(UserRecord).where(UserRecord.firebase_uid == firebase_uid)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        if user is not None:
            return user.id

        # 2. 없으면 새로 생성
        new_user = UserRecord(firebase_uid=firebase_uid)
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)  # DB가 생성한 id를 객체에 반영

        print(f"[user_service] 신규 사용자 생성: firebase_uid={firebase_uid[:8]}..., id={new_user.id[:8]}...")
        return new_user.id
