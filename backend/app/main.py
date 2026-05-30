import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, status
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from app.websocket.handlers import handle_posture_connection, _ai_pipeline
from app.websocket.manager import manager
from app.models.db import init_db
from app.api.report import router as report_router
from app.auth.dev_auth import resolve_local_dev_uid
from app.auth.firebase_auth import init_firebase, verify_token
from app.services.user_service import get_or_create_user
import asyncio
import numpy as np

_FRONTEND_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "SRC")
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[lifespan] DB 초기화 중...")
    await init_db()
    print("[lifespan] DB 준비 완료")

    print("[lifespan] Firebase Admin SDK 초기화 중...")
    init_firebase()
    print("[lifespan] Firebase 준비 완료")

    print("[lifespan] AI 파이프라인 워밍업 중... (MPS 첫 실행 10~20초 소요)")
    dummy = np.zeros((480, 640, 3), dtype=np.uint8)
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _ai_pipeline.process_frame, dummy)
    print("[lifespan] AI 파이프라인 준비 완료 ✅")

    yield

    print("[lifespan] 앱 종료")

app = FastAPI(
    title="Work with 자세교정 Backend",
    version="0.1.0",
    lifespan=lifespan
)

# localhost와 127.0.0.1은 브라우저상 다른 origin이라, 프론트가 절대 URL로
# 요청하면 접속 주소에 따라 cross-origin이 된다. 양쪽 모두 허용.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(report_router)

@app.get("/health")
async def health():
    return {"status": "healthy", "active_sessions": manager.active_count}


# 클라이언트가 아래의 URL 로 웹소켓 연결을 요청하면, 함수 실행
# token은 query string으로 전달됨: ws://.../ws/posture?token=xxx
@app.websocket("/ws/posture")
async def posture_ws(websocket: WebSocket, token: str | None = None):
    # 1. 토큰 검증
    origin = websocket.headers.get("origin")
    firebase_uid = resolve_local_dev_uid(token, origin) or (verify_token(token) if token else None)
    if firebase_uid is None:
        # 인증 실패 시 핸드셰이크 거부 (4401 = Unauthorized 커스텀 코드)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid or missing token")
        return

    # 2. DB에서 사용자 조회/생성 → 내부 user_id 획득
    user_id = await get_or_create_user(firebase_uid)

    # 3. 인증된 user_id를 들고 핸들러 진입
    await handle_posture_connection(websocket, user_id=user_id)


# 정적 프론트엔드 서빙 (반드시 모든 API/WS 라우트 등록 뒤에 마운트).
# html=True → "/" 요청 시 index.html 자동 서빙.
app.mount("/", StaticFiles(directory=_FRONTEND_DIR, html=True), name="frontend")
