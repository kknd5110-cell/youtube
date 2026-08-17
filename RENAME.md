# 키넥스 — 이름·아이콘 적용

## 1. 파일 배치

받은 파일을 이렇게 놓으세요.

| 파일 | 놓을 위치 |
|---|---|
| `App.jsx` | `src\App.jsx` (덮어쓰기) |
| `index.html` | 프로젝트 루트 (덮어쓰기) |
| `logo.png` | `public\logo.png` — **public 폴더를 새로 만들어야 합니다** |
| `icon-1024.png` | 아무 데나 (아이콘 만들 때만 씁니다) |

`public` 폴더는 `src`, `api`와 같은 높이에 만듭니다.

```powershell
cd C:\Users\mykmj\Downloads\loop-app_1\loop-app
mkdir public
```

## 2. Capacitor 앱 이름

`capacitor.config.json`을 열어 `appName`을 바꿉니다.

```json
{
  "appId": "com.wujin.app",
  "appName": "키넥스",
  "webDir": "dist"
}
```

`appId`는 바꾸지 마세요. 바꾸면 기존에 설치된 앱과 별개의 앱이 되어
새로 설치해야 하고, 기존 구독·보관함 기록이 사라집니다.

## 3. 안드로이드 앱 이름

Android Studio에서 `app → res → values → strings.xml`을 엽니다.

```xml
<string name="app_name">키넥스</string>
<string name="title_activity_main">키넥스</string>
```

두 줄을 이렇게 바꾸세요. (`package_name`, `custom_url_scheme`은 그대로 두세요.)

## 4. 앱 아이콘

Android Studio에서 만듭니다. 직접 파일을 넣는 것보다 정확합니다.

1. 왼쪽 프로젝트 트리에서 `app` 폴더 **우클릭**
2. **New → Image Asset**
3. Icon Type: **Launcher Icons (Adaptive and Legacy)**
4. Foreground Layer 탭
   - Asset Type: **Image**
   - Path: 받은 `icon-1024.png` 선택
   - Resize: 로고가 원 안에 들어오게 조절 (보통 65~75%)
5. Background Layer 탭
   - Asset Type: **Color**
   - Color: `E8A33D`
6. **Next → Finish**

기존 아이콘 파일을 덮어쓸지 물어보면 승인하세요.

## 5. 다시 빌드

```powershell
npm run build
npx cap sync
```

그다음 Android Studio에서 ▶.

앱 서랍과 홈 화면의 아이콘·이름이 바뀝니다.
아이콘이 그대로면 앱을 지웠다가 다시 설치해보세요. 안드로이드가
아이콘을 캐싱하는 경우가 있습니다.
