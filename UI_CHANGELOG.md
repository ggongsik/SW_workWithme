# UI/UX 및 디버깅 기능 변경 기록

> `feat/UI` 브랜치는 테스트 후 문제가 없으면 `develop`에 머지할 예정입니다. 캘리브레이션, 자세 측정 지속 실행, WebSocket 재연결, 리포트 생성, YouTube/MV, PiP, 디버그 패널을 실제 브라우저에서 확인 부탁드립니다.

이 문서는 `feat/UI` 브랜치에 올린 UI/UX, 자세 측정, YouTube 플레이어, 로컬 개발 인증, DB 호환성 관련 변경 사항을 정리한다.

## 2026-05-30 추가 수정

- WebSocket이 중간에 닫히는 원인을 추적할 수 있도록 백엔드 WebSocket 종료 사유와 traceback 로그를 추가했다.
- WebSocket이 예기치 않게 닫혀도 진행 중인 모니터링 세션을 DB에 저장하도록 보강했다.
- 사용자별 캘리브레이션 기준값을 임시 스냅샷으로 보존하고, 재접속 시 기준값을 복원해 다시 캘리브레이션을 요구하지 않도록 했다.
- 프론트엔드에서 WebSocket close 이벤트를 감지해 재연결하고, 자세 측정 중이면 `start_monitoring`을 다시 보내도록 했다.
- AI 프레임 처리 실패, 비정상 depth, NaN 값이 WebSocket 핸들러 전체를 종료시키지 않도록 예외 처리를 추가했다.
- WebSocket 송신 버퍼가 과도하게 쌓이면 프레임을 건너뛰어 브라우저/서버 과부하성 연결 종료를 줄였다.
- 자세 측정 중 로그인 화면으로 돌아가는 문제를 줄이기 위해 SQLite DB 기본 위치를 소스 폴더 밖인 `~/.workwithme/posture.db`로 변경했다. 기존 `posture.db`가 있으면 새 위치로 1회 복사한다.
- 페이지가 새로고침되더라도 `localStorage.lofi_user_id`가 남아 있으면 로그인 오버레이를 자동으로 닫고 WebSocket을 다시 연결하도록 복구 로직을 추가했다.

관련 파일:

- `backend/app/models/db.py`
- `backend/app/websocket/handlers.py`
- `backend/app/websocket/manager.py`
- `frontend/SRC/js/network.js`
- `frontend/SRC/js/pose.js`
- `frontend/SRC/js/ui.js`

## 1. 전체 UI/UX 리디자인

- 기존 사이버/네온 계열 UI를 lofi girl 콘셉트에 맞춘 cozy pastel 톤으로 재구성했다.
- 기본 갈색/와인 계열 배경은 유지하면서, 주요 하이라이트를 하츠네 미쿠 컬러에 가까운 민트 `#39c5bb`로 통일했다.
- 상단 시계, Study room 칩, 우측 사이드바, 포모도로, 하단 플레이어, 패널, 버튼, 입력창, 토글, 디버그 패널의 색상과 테두리, 블러, 그림자 스타일을 일관되게 조정했다.
- 반응형 레이아웃을 보강해 모바일 화면에서도 하단 플레이어, 사이드바, 리포트 모달이 겹치지 않도록 조정했다.
- 기존 기능 설명성 문구를 과하게 늘리지 않고, 실제 작업 화면이 첫 화면의 중심이 되도록 유지했다.

관련 파일:

- `frontend/SRC/css/style.css`
- `frontend/SRC/index.html`
- `frontend/SRC/js/ui.js`
- `frontend/SRC/js/pomodoro.js`

## 2. 리포트 화면 개편

- 리포트 모달을 카드형 그리드 구조로 재배치했다.
- 다음 기존 리포트 내용은 모두 유지했다.
  - 오늘 자세가 무너진 시간
  - 최장 지속 시간
  - 거북목 비율
  - 거북목 교정 스트레칭 영상
  - 최근 7일 거북목 추이
  - 리포트 닫기 및 최종 로그아웃 버튼
- 리포트 차트 바와 값 표시를 새 민트/파스텔 톤으로 변경했다.
- YouTube 임베드가 막히는 경우를 대비해 스트레칭 영상에 `YouTube에서 열기` 링크를 추가했다.

관련 파일:

- `frontend/SRC/index.html`
- `frontend/SRC/css/style.css`
- `frontend/SRC/js/ui.js`

## 3. 디버그/측정 상태 UI 보강

- 설정 패널 안에 Debug 탭을 유지하고, WebSocket 상태, 자세 측정 상태, 프레임/성능 정보, 강제 상태 변경 버튼, 로그 영역이 새 UI 톤과 맞도록 정리했다.
- 자세 상태가 정상, 경고, 위험으로 바뀔 때 디버그 표시와 3D 포즈/화면 효과가 함께 갱신되도록 유지했다.
- WebSocket 메시지 수신 중 서버 오류 메시지를 별도 이벤트로 전파하도록 보강했다.
- 디버그 패널에 `Turtle pose` 항목을 추가했다. 이 값은 `NORMAL/WARNING/ALERT` 누적 상태가 아니라, 서버가 현재 프레임을 거북목 자세로 직접 감지했는지 여부를 표시한다.
- 디버그 패널에 `Calib samples` 항목을 추가해 캘리브레이션 샘플 수집 상태를 볼 수 있게 했다.

관련 파일:

- `frontend/SRC/css/style.css`
- `frontend/SRC/js/network.js`
- `frontend/SRC/js/ui.js`

## 4. 캘리브레이션 및 자세 측정 흐름 수정

- 캘리브레이션 시작 전 WebSocket이 실제 `OPEN` 상태인지 확인하도록 변경했다.
- 기존에는 `stop_calibration` 명령을 보낸 직후 서버 응답을 기다리지 않고 화면에 `측정 완료`를 표시했다. 이 때문에 서버가 아직 기준값을 확정하지 않았거나 샘플 부족 오류를 낸 경우에도 프론트는 완료처럼 보였고, `자세 교정 시작` 버튼에서는 기준 자세가 없다고 실패했다.
- 현재는 서버가 `calibration_complete`를 보내야만 캘리브레이션 완료로 인정한다.
- 서버가 `INSUFFICIENT_SAMPLES`, `NOT_CALIBRATING`, `INVALID_FRAME` 등 캘리브레이션 관련 오류를 보내면 즉시 실패로 처리한다.
- 서버 완료 응답을 기다리는 동안 버튼 문구를 `서버 기준값 확인 중...`으로 바꾼다.
- AI 처리 지연을 고려해 캘리브레이션 완료 응답을 최대 30초까지 기다린다.
- 캘리브레이션 시작 시 기존 기준값 상태를 초기화해 이전 성공 상태가 새 측정에 섞이지 않도록 했다.
- 30프레임은 안정적인 캘리브레이션 목표치로 유지하되, 실제 진행 가능한 임시 최소 기준을 10프레임으로 낮췄다.
- 서버는 캘리브레이션 중 `calibration_progress` 메시지로 현재 샘플 수, 최소 샘플 수, 목표 샘플 수를 프론트에 보낸다.
- 프론트는 10초가 지났더라도 최소 샘플 수가 모자라면 최대 30초까지 샘플 수집을 연장한다.
- 프론트 전송 프레임 크기와 JPEG 품질을 낮춰 웹 세션의 전송/디코딩 부담을 줄였다.

관련 파일:

- `frontend/SRC/js/pose.js`
- `frontend/SRC/js/network.js`

알려진 이슈:

- `INSUFFICIENT_SAMPLES`가 계속 발생한다면 AI 처리 시간이 30초 안에도 10개 미만의 유효 샘플만 만들고 있다는 뜻이다.
- 이 경우 `Debug > Calib samples` 값과 백엔드 `[AI] detected=...` 로그를 함께 확인해야 한다.

## 5. WebSocket 및 로컬 개발 인증 개선

- Firebase 로그인 사용자는 기존처럼 Firebase ID 토큰을 사용한다.
- `localhost`, `127.0.0.1`, `::1`에서 `admin/1234` 테스트 계정을 쓰는 경우 로컬 개발용 토큰을 사용해 백엔드 WebSocket에 연결할 수 있도록 했다.
- WebSocket 생성 직후 반환하지 않고, 실제 연결 성공 또는 실패를 Promise로 관리하도록 변경했다.
- WebSocket 연결 타임아웃, 연결 실패, 인증 누락 상태를 디버그 로그에 남기도록 했다.
- Live Server 등 다양한 로컬 포트에서 백엔드 API와 통신할 수 있도록 CORS 정규식을 추가했다.

관련 파일:

- `frontend/SRC/js/network.js`
- `frontend/SRC/js/ui.js`
- `backend/app/main.py`
- `backend/app/auth/dev_auth.py`
- `backend/app/api/report.py`

## 6. 백엔드 SQLite 호환성 보정

- 기존 `posture.db`가 오래된 스키마를 가지고 있을 때 `users.firebase_uid` 컬럼이 없어 WebSocket 연결 중 서버가 예외로 터지는 문제를 보정했다.
- 앱 시작 시 `users.firebase_uid` 컬럼이 없으면 자동으로 추가하고, 기존 사용자 행은 `id` 값을 임시 UID로 채운다.
- `firebase_uid` 인덱스를 생성해 기존 사용자 조회가 가능하도록 했다.
- 기존 DB에 남아 있던 `sessions.duration_sec` NOT NULL 컬럼 때문에 세션 저장 시 실패할 수 있어, 세션 저장 시 `duration_sec` 값을 함께 채우도록 했다.

관련 파일:

- `backend/app/models/db.py`
- `backend/app/models/db_models.py`
- `backend/app/services/persistence.py`

## 7. YouTube 플레이어 개선

- 기존 숨겨진 YouTube 플레이어 방식 대신 실제로 보이는 16:9 미니 플레이어 패널을 추가했다.
- YouTube API 로딩 실패, 브라우저 차단, 임베드 금지, 삭제/비공개 영상 등을 오류 코드별로 구분해 안내한다.
- `다시 시도`와 `YouTube에서 열기` 버튼을 제공한다.
- 하단 플레이어에 `MV` 버튼을 추가했다.
- 사용자가 MV 창을 끄면 재생/일시정지를 반복해도 창이 자동으로 다시 뜨지 않는다.
- MV 버튼을 다시 누르면 현재 YouTube 트랙의 뮤직비디오 창을 다시 열 수 있다.

관련 파일:

- `frontend/SRC/index.html`
- `frontend/SRC/css/style.css`
- `frontend/SRC/js/player.js`
- `frontend/SRC/js/main.js`

## 8. PiP UI 갱신

- Document PiP 미니 창의 플레이어 박스, 버튼, 진행 바를 메인 UI와 같은 cozy pastel + Miku mint 톤으로 변경했다.
- PiP 안의 재생 버튼, 이전/다음 버튼, 진행 바가 메인 플레이어 상태와 계속 동기화되도록 기존 로직을 유지했다.

관련 파일:

- `frontend/SRC/css/style.css`
- `frontend/SRC/js/ui.js`
- `frontend/SRC/js/player.js`

## 9. 이번 브랜치에 포함하지 않은 항목

- `ai/requirements.txt` 변경은 이번 UI 작업 커밋에 포함하지 않는다.
- `ai/Depth-Anything-V2/`, `SW_workWithme/`, `backend/requirement-fix.txt` 같은 로컬 의존성/복사본/임시 파일은 이번 커밋에 포함하지 않는다.
- 캘리브레이션 최소 샘플 수는 임시로 10개까지 낮췄다. 추후 실제 측정 품질을 확인한 뒤 30개 목표를 다시 강화할 수 있다.

## 10. 검증 내역

- 프론트 JS 문법 검사:
  - `frontend/SRC/js/network.js`
  - `frontend/SRC/js/pose.js`
  - `frontend/SRC/js/player.js`
  - `frontend/SRC/js/main.js`
  - `frontend/SRC/js/ui.js`
  - `frontend/SRC/js/pomodoro.js`
- 백엔드 Python 문법 검사:
  - `backend/app/main.py`
  - `backend/app/api/report.py`
  - `backend/app/auth/dev_auth.py`
  - `backend/app/models/db.py`
  - `backend/app/models/db_models.py`
  - `backend/app/services/persistence.py`
- `git diff --check` 통과
- 충돌 마커 없음
- 로컬 dev auth로 `/api/users/me/report` 호출 성공 확인
