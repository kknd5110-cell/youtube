# 앱에서 영상 자동 재생되게 하기

`autoplay=1`은 이미 코드에 들어 있습니다.
그런데 안드로이드 WebView가 **사용자 조작 없는 미디어 재생을 기본으로 차단**해서
앱에서만 자동 재생이 안 됩니다. 한 줄 추가하면 풀립니다.

## 파일 위치

Android Studio 프로젝트 트리에서:

```
app → java → com.wujin.app → MainActivity
```

## 지금 내용

```java
package com.wujin.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
```

## 이렇게 바꾸기

```java
package com.wujin.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // WebView는 기본적으로 사용자가 직접 누르기 전에는 미디어를 재생하지 않습니다.
        // 이 설정을 꺼야 영상을 열자마자 자동 재생됩니다.
        bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    }
}
```

`package` 줄은 원래 있던 것을 그대로 두세요. `com.wujin.app`이 아닐 수도 있습니다.

## 다시 빌드

```powershell
npm run build
npx cap sync
```

그다음 Android Studio에서 ▶.

## 소리에 대해

자동 재생은 되지만 **첫 재생은 음소거로 시작될 수 있습니다.**
이건 유튜브 플레이어 쪽 동작이라 화면을 한 번 탭하면 소리가 켜집니다.
유튜브 공식 앱도 웹에서는 같은 방식으로 동작합니다.
