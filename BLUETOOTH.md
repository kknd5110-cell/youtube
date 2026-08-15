# 블루투스·이어폰 끊기면 일시정지

앱 쪽에 한 번만 넣어두면 됩니다. 웹 코드는 이미 준비돼 있어요.

안드로이드는 이어폰이 빠지거나 블루투스가 끊길 때
`ACTION_AUDIO_BECOMING_NOISY` 라는 신호를 보냅니다.
그걸 받아서 웹 화면의 일시정지 함수를 불러주는 코드입니다.

## MainActivity 수정

Android Studio에서 `app → java → com.wujin.app → MainActivity` 를 엽니다.

지금은 자동 재생 설정만 들어 있을 겁니다. 아래 내용으로 통째로 바꾸세요.
(`package` 줄은 원래 있던 것을 그대로 두세요.)

```java
package com.wujin.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // 이어폰이 빠지거나 블루투스가 끊기면 안드로이드가 이 신호를 보냅니다.
    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) return;
            // 웹 화면에 만들어 둔 일시정지 함수를 부릅니다.
            runOnUiThread(() -> {
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().evaluateJavascript(
                        "window.kinexAudioBecomingNoisy && window.kinexAudioBecomingNoisy();",
                        null
                    );
                }
            });
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // WebView는 기본적으로 사용자가 직접 누르기 전에는 미디어를 재생하지 않습니다.
        bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    }

    @Override
    public void onStart() {
        super.onStart();
        registerReceiver(noisyReceiver, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
    }

    @Override
    public void onStop() {
        super.onStop();
        try {
            unregisterReceiver(noisyReceiver);
        } catch (IllegalArgumentException ignored) {
            // 이미 해제된 경우
        }
    }
}
```

## 다시 빌드

```powershell
npm run build
npx cap sync
```

그다음 Android Studio에서 ▶.

## 확인 방법

1. 블루투스 이어폰을 연결하고 영상 재생
2. 이어폰 전원을 끄거나 연결 해제
3. 영상이 멈추면 성공입니다

유선 이어폰을 뽑아도 똑같이 동작합니다.

## 참고

이 코드를 넣지 않아도 앱은 그대로 돌아갑니다.
다만 블루투스가 끊겨도 영상이 계속 재생될 뿐입니다.
