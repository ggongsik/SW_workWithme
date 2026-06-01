"""
DB 연결 및 세션 관리.

비동기 SQLAlchemy + aiosqlite 사용.
"""

import os
import shutil
from contextlib import asynccontextmanager
from pathlib import Path
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy import text

from app.models.db_models import Base

# SQLite 파일 경로. backend 디렉터리 기준 상대경로.
# echo=True로 두면 SQL 쿼리가 콘솔에 다 찍힘 (학습용으로 좋음, 프로덕션엔 False)
def _resolve_database_path() -> Path:
    configured_path = os.getenv("WORKWITHME_DB_PATH")
    db_path = Path(configured_path).expanduser() if configured_path else Path.home() / ".workwithme" / "posture.db"
    if not db_path.is_absolute():
        db_path = (Path.cwd() / db_path).resolve()

    db_path.parent.mkdir(parents=True, exist_ok=True)

    if configured_path is None and not db_path.exists():
        legacy_path = Path.cwd() / "posture.db"
        if legacy_path.exists():
            shutil.copy2(legacy_path, db_path)

    return db_path


# Keep runtime DB writes outside the source tree. Live Server/file watchers can
# reload the frontend when posture.db changes, which looks like a forced logout.
DATABASE_PATH = _resolve_database_path()
DATABASE_URL = f"sqlite+aiosqlite:///{DATABASE_PATH.as_posix()}"


# 1. Engine: DB와의 물리적 연결 풀
_engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    echo=False,  # 학습 중엔 True로 켜서 쿼리 보면 좋음
    future=True
)


# 2. SessionMaker: DB 세션을 발급하는 팩토리
_async_session_maker = async_sessionmaker(
    _engine,
    expire_on_commit=False,  # commit 후에도 객체 사용 가능
    class_=AsyncSession,
)


# 3. 초기화: 테이블 생성
async def _ensure_legacy_schema_compatibility(conn) -> None:
    """
    create_all()은 이미 존재하는 SQLite 테이블에 새 컬럼을 추가하지 않는다.
    예전 DB 파일을 그대로 쓰는 개발 환경을 위해 필요한 최소 마이그레이션만 수행한다.
    """
    users_info = await conn.execute(text("PRAGMA table_info(users)"))
    users_columns = {row[1] for row in users_info.fetchall()}

    if "firebase_uid" not in users_columns:
        await conn.execute(text("ALTER TABLE users ADD COLUMN firebase_uid VARCHAR"))
        await conn.execute(
            text("UPDATE users SET firebase_uid = id WHERE firebase_uid IS NULL OR firebase_uid = ''")
        )

    await conn.execute(
        text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_firebase_uid ON users (firebase_uid)")
    )

    sessions_info = await conn.execute(text("PRAGMA table_info(sessions)"))
    sessions_columns = {row[1] for row in sessions_info.fetchall()}

    if "user_id" not in sessions_columns:
        await conn.execute(text("ALTER TABLE sessions ADD COLUMN user_id VARCHAR REFERENCES users(id)"))
        # user_id를 알 수 없는 기존 세션은 고아 레코드이므로 삭제
        await conn.execute(text("DELETE FROM sessions WHERE user_id IS NULL"))
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_sessions_user_id ON sessions (user_id)")
        )


async def init_db() -> None:
    """
    DB 파일이 없으면 만들고, 정의된 모든 테이블을 생성.
    이미 존재하는 테이블은 건드리지 않음.
    """
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_legacy_schema_compatibility(conn)


# 4. 세션 컨텍스트 매니저
@asynccontextmanager
async def get_db_session():
    """
    DB 세션을 발급하고, 사용 후 자동으로 닫음.
    
    사용 예:
        async with get_db_session() as db:
            db.add(record)
            await db.commit()
    """
    async with _async_session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        # commit/close는 호출자 책임 (with 블록 종료 시 close됨)
