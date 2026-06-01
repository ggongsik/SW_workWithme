"""
SQLAlchemy 테이블 모델 정의.

비동기 SQLAlchemy 2.0 스타일을 사용.
- DeclarativeBase: 모든 모델의 베이스
- Mapped[T]: 컬럼 타입 힌트 (자동완성·타입 체크 지원) (Python에게 알려주는 것)
- mapped_column: 컬럼 정의 (DB에게 알려주는 것)
"""

### Optional 기준 : 이 데이터를 DB에 저장하는 시점에, 이 값이 반드시 존재하는가?

import time
import uuid
from typing import Optional, List
from sqlalchemy import Float, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

def make_uuid() -> str:
    return str(uuid.uuid4())

class Base(DeclarativeBase): # DeclarativeBase : 이 클래스는 DB 테이블이야.
    """모든 ORM 모델의 베이스 클래스"""
    pass


class UserRecord(Base):
    """
    사용자 정보.

    id는 DB 내부 식별자(UUID), firebase_uid는 외부 인증 식별자(Firebase 발급).
    인증 방식이 늘어나면 google_uid, github_uid 등의 컬럼을 추가하는 식으로 확장 가능.
    """
    __tablename__ = "users"

    id : Mapped[str] = mapped_column(String, primary_key = True, default = make_uuid)
    firebase_uid : Mapped[str] = mapped_column(String, nullable = False, unique = True, index = True)
    created_at : Mapped[float] = mapped_column(Float, nullable = False, default = time.time)

    sessions: Mapped[List["SessionRecord"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan"
    )
    daily_stats: Mapped[List["DailyStatsRecord"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan"
    )


class SessionRecord(Base):
    """세션 메타데이터 (연결 시작/종료, 캘리브레이션 기준값)."""
    __tablename__ = "sessions"

    id : Mapped[str] = mapped_column(String, primary_key = True, default = make_uuid)
    user_id : Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    started_at : Mapped[float] = mapped_column(Float, nullable = False)  # 세션(연결) 시작
    ended_at : Mapped[float] = mapped_column(Float, nullable = False)    # 세션(연결) 종료
    duration_sec : Mapped[float] = mapped_column(Float, nullable = False, default = 0.0)

    # delta_depth (코-어깨 깊이 차) 캘리브레이션 기준값 (참고·표시용)
    # 실제 거북목 판정은 메모리상의 개인화 IF 모델이 담당 (모델은 DB 저장 안 함)
    baseline : Mapped[Optional[float]] = mapped_column(Float, nullable = True)
    baseline_std : Mapped[Optional[float]] = mapped_column(Float, nullable = True)
    threshold : Mapped[Optional[float]] = mapped_column(Float, nullable = True)

    user: Mapped["UserRecord"] = relationship(back_populates="sessions")


class DailyStatsRecord(Base):
    """
    사용자별 일별 자세 통계 (user_id + date 단위로 1행, 세션 종료 시 누적).

    리포트 화면의 '오늘 데이터'와 '7일 추이 그래프'의 데이터 소스.
    turtle_ratio 같은 파생값은 저장하지 않고 조회 시 계산한다.
    """
    __tablename__ = "daily_stats"

    id : Mapped[str] = mapped_column(String, primary_key = True, default = make_uuid)
    user_id : Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete = "CASCADE"),
        nullable = False,
        index = True
    )
    date : Mapped[str] = mapped_column(String, nullable = False, index = True)  # "YYYY-MM-DD" (로컬 날짜)

    total_turtle_duration_sec : Mapped[float] = mapped_column(Float, nullable = False, default = 0.0)
    total_monitoring_duration_sec : Mapped[float] = mapped_column(Float, nullable = False, default = 0.0)
    longest_streak_sec : Mapped[float] = mapped_column(Float, nullable = False, default = 0.0)
    updated_at : Mapped[float] = mapped_column(Float, nullable = False, default = time.time)

    user: Mapped["UserRecord"] = relationship(back_populates="daily_stats")

    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_user_date"),
    )









