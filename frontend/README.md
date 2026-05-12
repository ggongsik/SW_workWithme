# SW_workWithme
공개SW 1조

<br>

## 📡 웹소켓 바이너리 패킷 구조

| 오프셋 | 크기 | 데이터 | 타입설명 |
| :--- | :--- | :--- | :--- |
| `[0 ~ 3]` | 4 Bytes | `Uint32` (Little-Endian) | 뒤따라오는 JSON 텍스트의 바이트 길이(Length)|
| `[4 ~ 4+Length]` | 가변 길이 | `UTF-8 String` | 랜드마크 좌표 및 타입 정보가 담긴 JSON 텍스트|
| `[4+Length ~ 끝]` | 가변 길이 | `Binary` | 웹캠 캡처 원본 JPEG 이미지 파일 |

<br>

(Offset 4 구간) 바이너리에서 추출한 JSON 텍스트를 파싱하면 아래와 같은 구조를 가집니다.

```json
{
  "type": "calibration",
  "points": {
    "0": { "x": 0.512, "y": 0.421 },
    "11": { "x": 0.615, "y": 0.552 },
    "12": { "x": 0.410, "y": 0.550 }
  },
  "timestamp": 1715694200000
}
```

💻 프론트엔드 구동 방법
VScode에서 src 폴더를 열고 index.html을 우클릭해 Open with Live Server로 실행합니다.

ID: admin

PW: 1234

⚙️ 백엔드 서버 설정
js/network.js 파일에서 아래 부분을 찾아 실제 구동되는 백엔드 주소로 변경해 주세요.

``` JavaScript
export function initWebSocket() {
  ws = new WebSocket('ws://localhost:8080');
  ws.binaryType = 'arraybuffer'; 
}
```
