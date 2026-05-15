"""
DB 연결 및 세션 관리.

비동기 SQLAlchemy + aiosqlite 사용.
"""

from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.models.db_models import Base

# SQLite 파일 경로. backend 디렉터리 기준 상대경로.
# echo=True로 두면 SQL 쿼리가 콘솔에 다 찍힘 (학습용으로 좋음, 프로덕션엔 False)
DATABASE_URL = "sqlite+aiosqlite:///./posture.db"


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
async def init_db() -> None:
    """
    DB 파일이 없으면 만들고, 정의된 모든 테이블을 생성.
    이미 존재하는 테이블은 건드리지 않음.
    """
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


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