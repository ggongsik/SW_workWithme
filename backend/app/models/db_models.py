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
from sqlalchemy import Float, String, Integer, ForeignKey, UniqueConstraint
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
    posture_samples: Mapped[List["PostureSampleRecord"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan"
    )
    model: Mapped[Optional["UserModelRecord"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False  # 1:1
    )
    daily_stats: Mapped[List["DailyStatsRecord"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan"
    )


class SessionRecord(Base):
    """세션 메타데이터. IF 학습 샘플(PostureSampleRecord)의 부모."""
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

    # delta_depth (코-어깨 깊이 차) 캘리브레이션 값 (IF z-score 기준)
    baseline : Mapped[Optional[float]] = mapped_column(Float, nullable = True)
    baseline_std : Mapped[Optional[float]] = mapped_column(Float, nullable = True)
    threshold : Mapped[Optional[float]] = mapped_column(Float, nullable = True)

    user: Mapped["UserRecord"] = relationship(back_populates="sessions")

    posture_samples: Mapped[List["PostureSampleRecord"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan"
    )

class PostureSampleRecord(Base):
    """
    Isolation Forest 학습용 정상 자세 샘플.

    monitoring 모드에서 거북목이 아닌 프레임만 누적된다.
    raw 값과 z-score 값을 함께 저장 (디버깅·재학습 정책 변경 대비).
    """
    __tablename__ = "posture_samples"

    id : Mapped[int] = mapped_column(Integer, primary_key = True, autoincrement = True)
    user_id : Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete = "CASCADE"),
        nullable = False,
        index = True
    )
    session_id : Mapped[str] = mapped_column(
        String,
        ForeignKey("sessions.id", ondelete = "CASCADE"),
        nullable = False,
        index = True
    )
    timestamp : Mapped[float] = mapped_column(Float, nullable = False)

    # raw 측정값 + z-score (해당 세션의 baseline/std 기준으로 정규화)
    delta_depth_raw : Mapped[float] = mapped_column(Float, nullable = False)
    delta_depth_zscore : Mapped[float] = mapped_column(Float, nullable = False)

    user: Mapped["UserRecord"] = relationship(back_populates="posture_samples")
    session: Mapped["SessionRecord"] = relationship(back_populates="posture_samples")


class UserModelRecord(Base):
    """
    사용자별 Isolation Forest 모델 (1:1, A안: 1행 덮어쓰기 정책).

    학습 트리거:
    - 누적 샘플 수가 MIN_SAMPLES_FOR_IF (TBD, AI 파트와 조율 중) 이상일 때 최초 학습
    - 이후 monitoring 세션 종료 시마다 재학습 (sklearn IsolationForest는 incremental
      learning을 지원하지 않으므로 매번 새 모델 객체 생성 후 덮어쓰기)

    TODO: 학습 트리거 로직은 AI 파트 결정 후 추가 예정.
    """
    __tablename__ = "user_models"

    id : Mapped[str] = mapped_column(String, primary_key = True, default = make_uuid)
    user_id : Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete = "CASCADE"),
        nullable = False,
        unique = True,  # 사용자당 1행 (1:1)
        index = True
    )
    model_path : Mapped[str] = mapped_column(String, nullable = False)  # 파일 시스템 경로 (.pkl)
    trained_at : Mapped[float] = mapped_column(Float, nullable = False)
    sample_count : Mapped[int] = mapped_column(Integer, nullable = False)  # 학습에 사용된 샘플 수

    user: Mapped["UserRecord"] = relationship(back_populates="model")


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









