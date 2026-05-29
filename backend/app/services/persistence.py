"""
세션 종료 시 SessionRecord 저장 + DailyStatsRecord 누적.

handlers.py에서 호출. DB 트랜잭션 단위로 묶음.
"""

import time
from datetime import datetime
from sqlalchemy import select

from app.models.db import get_db_session
from app.services.report import compute_stats

from app.websocket.manager import SessionState
from app.models.db_models import SessionRecord, DailyStatsRecord

async def save_session_and_accumulate(
    state: SessionState,
    session_ended_at: float,
    monitoring_duration_sec: float,
) -> None:
    """
    세션 메타(SessionRecord)를 저장하고, 그날 DailyStatsRecord에 통계를 누적.

    트랜잭션 단위: SessionRecord + DailyStats 갱신을 한 번에 commit.
    하나라도 실패하면 전부 롤백 → 일관성 보장.(atomicity)
    """
    stats = compute_stats(state, session_ended_at)
    today = datetime.now().strftime("%Y-%m-%d")  # 로컬 날짜 기준 일별 집계

    async with get_db_session() as db:
        # 1. SessionRecord (IF 학습 샘플의 부모 + 캘리브레이션 메타)
        session_record = SessionRecord(
            id = state.session_id,
            user_id = state.user_id,
            started_at = state.started_at,
            ended_at = session_ended_at,
            baseline = state.baseline_delta_depth,
            baseline_std = state.baseline_std,
            threshold = state.threshold,
        )
        db.add(session_record)

        # 2. DailyStatsRecord 누적 (user_id + date 단위로 1행)
        stmt = select(DailyStatsRecord).where(
            DailyStatsRecord.user_id == state.user_id,
            DailyStatsRecord.date == today,
        )
        result = await db.execute(stmt)
        daily = result.scalar_one_or_none()

        if daily is None:
            daily = DailyStatsRecord(
                user_id = state.user_id,
                date = today,
                total_turtle_duration_sec = stats.total_turtle_duration_sec,
                total_monitoring_duration_sec = monitoring_duration_sec,
                longest_streak_sec = stats.longest_streak_sec,
                updated_at = time.time(),
            )
            db.add(daily)
        else:
            daily.total_turtle_duration_sec += stats.total_turtle_duration_sec
            daily.total_monitoring_duration_sec += monitoring_duration_sec
            daily.longest_streak_sec = max(daily.longest_streak_sec, stats.longest_streak_sec)
            daily.updated_at = time.time()

        await db.commit()



