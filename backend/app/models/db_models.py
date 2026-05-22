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
from sqlalchemy import Float, String, Integer, Text, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

def make_uuid() -> str:
    return str(uuid.uuid4())

class Base(DeclarativeBase): # DeclarativeBase : 이 클래스는 DB 테이블이야.
    """모든 ORM 모델의 베이스 클래스"""
    pass


class UserRecord(Base):
    """
    사용자 정보.
    TODO: 인증(로그인) 시스템 결정 후 username/password_hash 등 추가 예정.
    """
    __tablename__ = "users"

    id : Mapped[str] = mapped_column(String, primary_key = True, default = make_uuid)
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


class SessionRecord(Base):
    """세션 메타데이터 (= 9-1의 sessions 테이블)"""
    __tablename__ = "sessions"

    id : Mapped[str] = mapped_column(String, primary_key = True, default = make_uuid)
    # TODO: 인증 시스템 도입 시 nullable=False로 변경
    user_id : Mapped[Optional[str]] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    started_at : Mapped[float] = mapped_column(Float, nullable = False)
    ended_at : Mapped[float] = mapped_column(Float, nullable = False)
    duration_sec : Mapped[float] = mapped_column(Float, nullable = False)

    # delta_depth (코-어깨 깊이 차)
    baseline : Mapped[Optional[float]] = mapped_column(Float, nullable = True)
    baseline_std : Mapped[Optional[float]] = mapped_column(Float, nullable = True)
    threshold : Mapped[Optional[float]] = mapped_column(Float, nullable = True)

    # CVA (Craniovertebral Angle)
    baseline_cva : Mapped[Optional[float]] = mapped_column(Float, nullable = True)
    baseline_cva_std : Mapped[Optional[float]] = mapped_column(Float, nullable = True)

    # 검출 방식: "threshold" (초기 통계 기반) / "isolation_forest" (개인화 모델)
    mode : Mapped[Optional[str]] = mapped_column(String, nullable = True)

    """
    SessionRecord 만 가지고 다른 테이블 접근 가능
    DB에는 실제로 존재하지 않는다.(mapped column이 아니니깐)
    """
    user: Mapped[Optional["UserRecord"]] = relationship(back_populates="sessions")

    events: Mapped[List["PostureEventRecord"]] = relationship(
        back_populates="session", # 양방향으로 가능하도록
        cascade="all, delete-orphan"  # 세션 지우면 이벤트도 자동 삭제
    )

    report: Mapped[Optional["ReportRecord"]] = relationship(
        back_populates="session", # 양방향으로 가능하도록
        cascade="all, delete-orphan",  # 세션 지우면 이벤트도 자동 삭제
        uselist = False # 기본적으로 relationship은 **여러 개(리스트)**를 가져옴
    )

    posture_samples: Mapped[List["PostureSampleRecord"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan"
    )

class PostureEventRecord(Base):
    """거북목 발생 이벤트"""
    __tablename__ = "posture_events"

    # autoincrement : 데이터베이스에 새로운 데이터를 넣을 때마다 자동 번호표 발행 (+1씩 )
    id : Mapped[int] = mapped_column(Integer, primary_key = True, autoincrement = True)
    session_id : Mapped[str] = mapped_column(
        String,
        ForeignKey("sessions.id", ondelete = "CASCADE"), # CASCADE(종속) : 세션이 삭제되면 이 이벤트도 삭제
        nullable = False,
        index = True # 조회 성능 향상
    )
    started_at : Mapped[float] = mapped_column(Float, nullable = False)
    ended_at : Mapped[Optional[float]] = mapped_column(Float, nullable = True)
    duration_sec : Mapped[float] = mapped_column(Float, nullable = False)

    session: Mapped["SessionRecord"] = relationship(back_populates = "events")


class ReportRecord(Base):
    """세션별 리포트 요약"""
    __tablename__ = "reports"

    id : Mapped[str] = mapped_column(String, primary_key = True, default = make_uuid)
    session_id : Mapped[str] = mapped_column(
        String,
        ForeignKey("sessions.id", ondelete = "CASCADE"), # CASCADE(종속) : 세션이 삭제되면 이 이벤트도 삭제
        nullable = False,
        unique = True, # 1:1 보장
        index = True
    )
    generated_at : Mapped[float] = mapped_column(Float, nullable = False)

    total_turtle_count: Mapped[int] = mapped_column(Integer, default=0)
    total_turtle_duration_sec: Mapped[float] = mapped_column(Float, default=0.0)
    turtle_ratio: Mapped[float] = mapped_column(Float, default=0.0)
    longest_streak_sec: Mapped[float] = mapped_column(Float, default=0.0)

    summary_json: Mapped[str] = mapped_column(Text, default="{}")

    session: Mapped["SessionRecord"] = relationship(back_populates="report")


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

    # raw 측정값
    delta_depth_raw : Mapped[float] = mapped_column(Float, nullable = False)
    cva_raw : Mapped[Optional[float]] = mapped_column(Float, nullable = True)

    # z-score (해당 세션의 baseline/std 기준으로 정규화)
    delta_depth_zscore : Mapped[float] = mapped_column(Float, nullable = False)
    cva_zscore : Mapped[Optional[float]] = mapped_column(Float, nullable = True)

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









