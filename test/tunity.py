import cv2
from cvzone.HandTrackingModule import HandDetector
import socket

# Parameters
width, height = 1280, 720  # 웹캠 해상도 설정

# 일반 웹캠 설정 (노트북 내장 카메라)
cap = cv2.VideoCapture(0)  # 0은 노트북 내장 카메라를 의미합니다.

# 웹캠 해상도 설정
cap.set(3, width)  # 가로 해상도
cap.set(4, height)  # 세로 해상도

# 손 감지 객체 생성
detector = HandDetector(maxHands=1, detectionCon=0.8)  # 최대 1개의 손, 신뢰도 임계값 0.8

# 네트워크 설정 (UDP 소켓)
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)  # IPv4, UDP 소켓
serverAddressPort = ("127.0.0.1", 5052)  # Unity의 IP 주소와 포트 번호

while True:
    # 웹캠에서 프레임 가져오기
    success, img = cap.read()
    if not success:
        print("웹캠에서 프레임을 읽어오지 못했습니다.")
        break

    # 손 감지
    hands, img = detector.findHands(img)  # img: 손이 그려진 이미지, hands: 감지된 손 정보

    data = []  # Unity로 전송할 데이터 (랜드마크 좌표)

    # 손이 감지된 경우
    if hands:
        # 첫 번째로 감지된 손 선택
        hand = hands[0]
        # 손의 랜드마크 리스트 가져오기
        lmList = hand['lmList']  # 21개의 랜드마크 (x, y, z)
        print("랜드마크 리스트:", lmList)

        # 랜드마크 좌표를 data 리스트에 추가
        for lm in lmList:
            # x, y, z 좌표를 추가 (y 좌표는 화면 상에서 뒤집힘)
            data.extend([lm[0], height - lm[1], lm[2]])

        # Unity로 데이터 전송
        print("전송할 데이터:", data)
        sock.sendto(str.encode(str(data)), serverAddressPort)  # 데이터를 문자열로 변환 후 전송

    # 영상 출력 (크기 조정)
    img = cv2.resize(img, (0, 0), None, 0.5, 0.5)  # 영상 크기를 50%로 조정
    cv2.imshow("Image", img)  # 영상 창에 출력

    # 종료 조건 (q 키를 누르면 종료)
    if cv2.waitKey(1) == ord("q"):
        print("프로그램을 종료합니다.")
        break

# 종료
cap.release()  # 웹캠 해제
cv2.destroyAllWindows()  # 모든 OpenCV 창 닫기