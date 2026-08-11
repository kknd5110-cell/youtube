# 루프 (Loop) — 유튜브 영상 앱

필름/시네마 테마의 영상 스트리밍 앱 UI. 실제 YouTube Data API v3로 검색하고,
유튜브 iframe으로 영상을 재생합니다.

## 로컬에서 실행하기

사전 준비: [Node.js](https://nodejs.org) 18 이상 설치되어 있어야 해요.

```bash
npm install
npm run dev
```

터미널에 뜨는 주소(보통 http://localhost:5173)를 브라우저로 열면 바로 확인할 수 있어요.

`.env` 파일에 API 키가 이미 들어있어요. 다른 키를 쓰고 싶으면 `.env` 파일의
`VITE_YOUTUBE_API_KEY` 값을 바꾸면 됩니다.

## 실제 서비스로 배포하기 (Vercel, 무료)

1. 이 폴더를 GitHub 저장소로 올리기 (단, `.env`는 `.gitignore`에 있어서 자동으로 제외돼요 — 키가 깃허브에 올라가지 않아요)
2. [vercel.com](https://vercel.com)에서 GitHub 계정으로 로그인 → New Project → 방금 만든 저장소 선택
3. Environment Variables 항목에 `VITE_YOUTUBE_API_KEY` = 발급받은 키 값 추가
4. Deploy 클릭 → 몇 분 후 `프로젝트명.vercel.app` 같은 실제 주소가 생겨요

## 배포 전 꼭 할 일: API 키 리퍼러 제한 걸기

지금 `.env`에 든 키는 제한이 풀려있어서 누구나 갖다 쓸 수 있는 상태예요.
배포하고 나면 [Google Cloud Console](https://console.cloud.google.com/apis/credentials)에서:

1. 이 키 클릭 → 애플리케이션 제한사항 → HTTP 리퍼러(웹사이트) 선택
2. 배포된 실제 도메인 (예: `https://프로젝트명.vercel.app/*`) 등록
3. 저장

이렇게 하면 그 도메인에서 오는 요청만 키가 작동해서, 다른 사람이 키를 복사해가도 못 씁니다.

## 폴더 구조

```
src/App.jsx     ← 전체 앱 로직/UI (검색, 재생, 카테고리 필터)
src/main.jsx    ← React 진입점
index.html      ← HTML 셸
.env            ← API 키 (git에 올라가지 않음)
```
