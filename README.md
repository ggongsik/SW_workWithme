# SW_workWithme
공개SW 1조



💻 프론트엔드 구동 방법
VScode에서 src 폴더를 열고 index.html을 우클릭해 Open with Live Server로 실행합니다.

ID: admin

PW: 1234

참고: VSCode Live Server 사용하기 가이드

⚙️ 백엔드 서버 설정
js/network.js 파일에서 아래 부분을 찾아 실제 구동되는 백엔드 주소로 변경해 주세요.

``` JavaScript
export function initWebSocket() {
  ws = new WebSocket('ws://localhost:8080'); // <-- 이 부분에 실제 백엔드 주소를 입력하세요
  ws.binaryType = 'arraybuffer'; 
}
```

