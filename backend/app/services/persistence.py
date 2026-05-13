"""
세션 + 이벤트 + 리포트를 DB에 저장하는 로직.

handlers.py에서 호출. DB 트랜잭션 단위로 묶음.
"""

import uuid
import time
from app.models.db import get_db_session
from app.services.report import compute_stats

from app.websocket.manager import SessionState
from app.models.db_models import (
    SessionRecord,
    PostureEventRecord,
    ReportRecord
)

async def save_session_with_report(
    state: SessionState,
    session_ended_at: float,
) -> str:
    """
    세션 데이터를 DB에 저장하고 report_id 반환.
    
    트랜잭션 단위: 한 세션의 모든 데이터(session+events+report)를 한 번에 commit.
    하나라도 실패하면 전부 롤백 → 일관성 보장.(atomicity)
    """
    stats = compute_stats(state, session_ended_at)
    report_id = str(uuid.uuid4()) # uuid 객체 -> str

    async with get_db_session() as db:
        # 1. SessionRecord
        session_record = SessionRecord(
            id = state.session_id,
            started_at = state.started_at,
            ended_at = session_ended_at,
            duration_sec = session_ended_at - state.started_at,
            baseline = state.baseline_delta_depth,
            baseline_std = state.baseline_std,
            threshold = state.threshold,
        )
        db.add(session_record) # 메모리에 추가

        # 2. PostureEventRecords
        for iv in stats.intervals:
            event_record = PostureEventRecord(
                session_id = state.session_id,
                started_at = iv.started_at,
                ended_at = iv.ended_at,
                duration_sec = iv.duration_sec
            )
            db.add(event_record)

        # 3. ReportRecord
        """
        ###### 이미 defalut로 만들어주는데 굳이? uuid 해야하나
        ###### -> return 할때, ReportRecord 에서 읽어오는 것보다
                  미리 만들어서 하는게 더 단순함
               -> 인자를 넘기면 default는 무시됨
        """
        report_record = ReportRecord(
            id = report_id,
            session_id = state.session_id,
            generated_at = time.time(),
            total_turtle_count = stats.total_turtle_count,
            total_turtle_duration_sec = stats.total_turtle_duration_sec,
            turtle_ratio = stats.turtle_ratio,
            longest_streak_sec = stats.longest_streak_sec,
            summary_json = stats.summary_json
        )
        db.add(report_record)
        
        # 지금까지 add 로 추가한 데이터를 실제로 DB에 저장 
        await db.commit()
    
    return report_id
    


