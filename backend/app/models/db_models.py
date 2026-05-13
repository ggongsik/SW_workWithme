"""
SQLAlchemy 테이블 모델 정의.

비동기 SQLAlchemy 2.0 스타일을 사용.
- DeclarativeBase: 모든 모델의 베이스
- Mapped[T]: 컬럼 타입 힌트 (자동완성·타입 체크 지원) (Python에게 알려주는 것)
- mapped_column: 컬럼 정의 (DB에게 알려주는 것)
"""

### Optional 기준 : 이 데이터를 DB에 저장하는 시점에, 이 값이 반드시 존재하는가?

import uuid
from typing import Optional, List
from sqlalchemy import Float, String, Integer, Text, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

def make_uuid() -> str:
    return str(uuid.uuid4())

class Base(DeclarativeBase): # DeclarativeBase : 이 클래스는 DB 테이블이야.
    """모든 ORM 모델의 베이스 클래스"""
    pass

class SessionRecord(Base):
    """세션 메타데이터 (= 9-1의 sessions 테이블)"""
    __tablename__ = "sessions"

    id : Mapped[str] = mapped_column(String, primary_key = True, default = make_uuid)
    started_at : Mapped[float] = mapped_column(Float, nullable = False)
    ended_at : Mapped[float] = mapped_column(Float, nullable = False)
    duration_sec : Mapped[float] = mapped_column(Float, nullable = False)

    baseline : Mapped[Optional[float]] = mapped_column(Float, nullable = True)
    baseline_std : Mapped[Optional[float]] = mapped_column(Float, nullable = True)
    threshold : Mapped[Optional[float]] = mapped_column(Float, nullable = True)

    """
    SessionRecord 만 가지고 다른 테이블 접근 가능
    DB에는 실제로 존재하지 않는다.(mapped column이 아니니깐)
    """
    events: Mapped[List["PostureEventRecord"]] = relationship(
        back_populates="session", # 양방향으로 가능하도록
        cascade="all, delete-orphan"  # 세션 지우면 이벤트도 자동 삭제
    )

    report: Mapped[Optional["ReportRecord"]] = relationship(
        back_populates="session", # 양방향으로 가능하도록
        cascade="all, delete-orphan",  # 세션 지우면 이벤트도 자동 삭제
        uselist = False # 기본적으로 relationship은 **여러 개(리스트)**를 가져옴
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









