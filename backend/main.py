from fastapi import FastAPI 
from fastapi.middleware.cors import CORSMiddleware 
#1. 브라우저: "localhost:3000에서 왔는데, localhost:8001에 요청해도 돼?"
#2. 서버:     "응, localhost:3000은 허용 목록에 있어. 통과!"
#3. 브라우저: "서버가 OK 했으니 요청 보내도 되겠다"
# FastAPI에서 이 허용 설정을 해주는 게 CORSMiddleware야.

app=FastAPI( # "/docs" 에 나오는 UI
    title="Work with 자세교정",
    description="단일 웹캠 기반 실시간 자세 교정 웹 서비스",
    version="0.1.0",
)

# ──────────────────────────────────────────────
# 📋 [명세서 포인트 #1] CORS 허용 origin
# ──────────────────────────────────────────────
# 프론트엔드 담당과 상의할 것:
#   "프론트가 몇 번 포트에서 개발할 건지?"
#   React 기본값은 http://localhost:3000 이고,
#   Vite는 http://localhost:5173 이야.
#   개발 중에는 ["*"]로 전부 허용해도 되지만,
#   나중에 배포할 때는 실제 프론트 주소만 넣어야 해.
# ──────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발 중 전체 허용 → 배포 시 프론트 URL로 변경 / 어떤 출처를 허용할지
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health_check():
    #"""서버 상태 확인용 (브라우저에서 접속해서 테스트)"""
    return {"status": "ok", "message": "Work with 자세교정 서버 실행 중"}


# ──────────────────────────────────────────────
# 📋 [명세서 포인트 #2] API 경로 prefix 규칙
# ──────────────────────────────────────────────
# 4명이 합의할 것:
#   모든 REST API 앞에 붙는 prefix를 뭘로 할지.
#   보통 "/api/v1/" 을 쓰는데, 우리 프로젝트는
#   규모가 작으니 "/api/" 로 해도 충분해.
#
#   예시:
#     /api/session/start    (세션 생성)
#     /api/report/{id}      (리포트 조회)
#
#   → 프론트 담당이 fetch("/api/session/start") 이렇게 호출하게 됨
#   → 이 경로가 바뀌면 프론트 코드도 다 바꿔야 하니까 초반에 확정!
# ──────────────────────────────────────────────

# 라우터는 2단계에서 등록할 예정
# from routers import session, report
# app.include_router(session.router, prefix="/api/session", tags=["session"])
# app.include_router(report.router, prefix="/api/report", tags=["report"])