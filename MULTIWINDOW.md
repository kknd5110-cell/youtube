# 분할 화면 / 팝업 화면 켜기

PiP는 유튜브 API 정책상 못 만듭니다. 대신 안드로이드가 제공하는
**분할 화면**과 삼성의 **팝업 화면**을 쓰면 거의 같은 경험이 나옵니다.

이건 OS 기능이라 정책 문제가 없습니다. 우리 앱 창이 화면에 계속 보이는
상태로 남기 때문입니다.

## 파일 수정

`android\app\src\main\AndroidManifest.xml` 을 엽니다.
(메모장 말고 Android Studio에서 여는 게 편합니다 — 프로젝트 트리에서
`app → manifests → AndroidManifest.xml`)

`<activity` 로 시작하는 줄을 찾으세요. 이런 모양입니다.

```xml
<activity
    android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
    android:name=".MainActivity"
    android:label="@string/title_activity_main"
    android:theme="@style/AppTheme.NoActionBarLaunch"
    android:launchMode="singleTask"
    android:exported="true">
```

여기에 두 줄을 추가합니다.

```xml
    android:resizeableActivity="true"
    android:supportsPictureInPicture="false"
```

즉 이렇게 됩니다.

```xml
<activity
    android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
    android:name=".MainActivity"
    android:label="@string/title_activity_main"
    android:theme="@style/AppTheme.NoActionBarLaunch"
    android:launchMode="singleTask"
    android:resizeableActivity="true"
    android:supportsPictureInPicture="false"
    android:exported="true">
```

`resizeableActivity`가 핵심입니다. 이게 있어야 분할 화면과 팝업 화면에서
앱이 제대로 크기를 조절합니다. 없으면 안드로이드가 창 모드를 거부하거나
레이아웃이 깨집니다.

`supportsPictureInPicture="false"`는 명시적으로 PiP를 쓰지 않겠다는 표시입니다.
기본값도 false지만, 나중에 이 파일을 볼 때 의도가 분명해집니다.

## 다시 빌드

```powershell
npm run build
npx cap sync
```

그다음 Android Studio에서 ▶.

## 쓰는 법 (갤럭시탭 기준)

**팝업 화면** — PiP와 가장 비슷합니다.
1. 화면 아래에서 위로 쓸어올려 최근 앱 목록 열기
2. 우진 앱 카드 위의 아이콘을 탭
3. **팝업 화면으로 열기** 선택
4. 작은 창으로 떠서 위치·크기를 자유롭게 조절할 수 있습니다

**분할 화면**
1. 최근 앱 목록에서 앱 아이콘 탭
2. **분할 화면으로 열기** 선택
3. 다른 앱을 아래(또는 옆)에 배치

영상을 재생한 채로 이 상태를 만들면 재생이 유지됩니다.
앱 안의 미니 플레이어와 조합하면, 작은 창 안에서 다시 목록을 볼 수도 있습니다.

## 한계

화면을 끄거나 앱을 완전히 종료하면 재생이 멈춥니다.
그건 정책상 우회할 수 없는 부분입니다.
