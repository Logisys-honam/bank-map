[bank-map 기존 설정 재사용형 공용 업무보드 v2]

이 버전은 새 config.js / branches.js를 만들지 않습니다.
현재 GitHub bank-map 루트에 이미 있는 아래 파일을 그대로 사용합니다.

../config.js
../data.js

즉 GitHub 구조는 아래처럼 만들면 됩니다.

bank-map/
  index.html
  app.js
  config.js       ← 기존 파일 그대로
  data.js         ← 기존 파일 그대로
  style.css       ← 기존 지도
  board/
    index.html
    app.js
    style.css

[GitHub 업로드]

1. 이 ZIP을 PC에서 압축 해제합니다.
2. bank-map 저장소에서 Add file → Upload files 로 갑니다.
3. board 폴더째 업로드합니다.
4. Commit changes를 누릅니다.
5. GitHub Pages 반영을 1~3분 기다립니다.

접속 주소:
https://logisys-honam.github.io/bank-map/board/

[중요]

board 안에는 config.js를 넣지 않습니다.
board/index.html이 자동으로 ../config.js 와 ../data.js를 읽습니다.

만약 처음 접속했을 때
"config.js Firebase 설정을 읽지 못했습니다"
또는
"data.js 지점정보를 읽지 못했습니다"
라고 나오면 기존 config.js 또는 data.js의 변수명이 예상과 다른 것입니다.

그 경우 GitHub에서 config.js와 data.js를 각각 열어
첫 부분 10~20줄 정도만 캡처해서 ChatGPT에 보내면 바로 맞출 수 있습니다.


[v2.1 수정사항]
- 기존 data.js의 실제 변수명 window.BANK_BRANCHES 를 직접 인식합니다.
- quarter / bank / center / name / address / phone 형식을 그대로 읽습니다.
- 기존 Excel/VBA와 같은 방식으로 memoId를 계산해 Firebase 메모와 연결합니다.
- GitHub에서는 board/app.js만 교체해도 됩니다.
