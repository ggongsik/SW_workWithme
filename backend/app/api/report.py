"""
리포트 조회 HTTP API.
"""

import json
from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.db import get_db_session
from app.models.db_models import SessionRecord, ReportRecord


router = APIRouter(prefix="/api", tags=["report"]) # tags : docs에 나옴


@router.get("/sessions/{session_id}/report")
async def get_report(session_id: str) -> dict:
    """세션 ID로 리포트 조회""" # docs 에 나옴 
    async with get_db_session() as db:
        # 세션 + 리포트 + 이벤트들을 한 번에 로드 (N+1 쿼리 방지)
        stmt = (
            select(SessionRecord)
            .where(SessionRecord.id == session_id)
            .options(
                selectinload(SessionRecord.report),
                selectinload(SessionRecord.events),
            )
        )
        result = await db.execute(stmt)
        session = result.scalar_one_or_none()
        
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        if session.report is None:
            raise HTTPException(status_code=404, detail="Report not yet generated")
        
        report = session.report
        
        return {
            "session_id": session.id,
            "started_at": session.started_at,
            "ended_at": session.ended_at,
            "duration_sec": session.duration_sec,
            "calibration": {
                "baseline": session.baseline,
                "std": session.baseline_std,
                "threshold": session.threshold,
            },
            "report": {
                "id": report.id,
                "generated_at": report.generated_at,
                "total_turtle_count": report.total_turtle_count,
                "total_turtle_duration_sec": report.total_turtle_duration_sec,
                "turtle_ratio": report.turtle_ratio,
                "longest_streak_sec": report.longest_streak_sec,
                "summary": json.loads(report.summary_json),
            },
            "events": [
                {
                    "started_at": ev.started_at,
                    "ended_at": ev.ended_at,
                    "duration_sec": ev.duration_sec,
                }
                for ev in session.events
            ],
        }


@router.get("/sessions")
async def list_sessions(limit: int = 20) -> dict:
    """최근 세션 목록 (개발/디버깅용)"""
    async with get_db_session() as db:
        stmt = (
            select(SessionRecord)
            .order_by(SessionRecord.started_at.desc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        sessions = result.scalars().all()
        
        return {
            "count": len(sessions),
            "sessions": [
                {
                    "id": s.id,
                    "started_at": s.started_at,
                    "duration_sec": s.duration_sec,
                }
                for s in sessions
            ],
        }