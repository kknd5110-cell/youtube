package com.wujin.app;

import android.app.PictureInPictureParams;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Rational;

import com.getcapacitor.BridgeActivity;

/**
 * 키넥스 안드로이드 화면.
 *
 * 하는 일:
 *  1. 자동 재생 허용 — WebView는 기본적으로 사용자가 누르기 전에는 재생하지 않습니다.
 *  2. 이어폰·블루투스가 끊기면 일시정지
 *  3. 홈 버튼을 누르면 PiP(화면 위 작은 창)로 전환
 *  4. 재생 중에는 알림을 띄워 앱을 벗어나도 소리가 이어지게 유지
 *
 * 재생 상태를 알아내는 방법에 대해:
 * 예전에는 addJavascriptInterface로 창구를 만들어 웹이 알려주게 했는데,
 * 그렇게 주입한 객체는 "그 다음 페이지 로드"부터 생깁니다. 이 앱은 한 번 뜨면
 * 페이지를 다시 부르지 않는 구조라 웹에서 그 창구가 영영 안 보였고,
 * 그래서 재생 신호가 앱까지 오지 못했습니다.
 * 지금은 앱이 2초마다 웹의 window.kinexPlaying 값을 직접 읽어봅니다.
 * 평범한 전역 변수라 주입 시점 문제가 없습니다.
 */
public class MainActivity extends BridgeActivity {

    /** 웹에서 읽어온 "지금 재생 중인가". */
    private volatile boolean playing = false;

    /** 알림이 떠 있는 상태인지. 같은 명령을 반복해서 보내지 않으려고 기억해 둡니다. */
    private boolean serviceRunning = false;

    private final Handler poller = new Handler(Looper.getMainLooper());

    private final Runnable pollTask = new Runnable() {
        @Override
        public void run() {
            readPlayingState();
            poller.postDelayed(this, 2000);
        }
    };

    /** 이어폰이 빠지거나 블루투스가 끊기면 안드로이드가 이 신호를 보냅니다. */
    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) return;
            runOnUiThread(() -> evalJs("window.kinexAudioBecomingNoisy && window.kinexAudioBecomingNoisy();"));
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (bridge != null && bridge.getWebView() != null) {
            // 사용자가 직접 누르지 않아도 영상이 시작되게 합니다.
            bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        }

        poller.postDelayed(pollTask, 2000);
    }

    /** 웹에 심어둔 전역 변수를 읽어 재생 상태를 따라갑니다. */
    private void readPlayingState() {
        if (bridge == null || bridge.getWebView() == null) return;
        try {
            bridge.getWebView().evaluateJavascript("window.kinexPlaying === true", value -> {
                boolean isPlaying = value != null && value.contains("true");
                applyPlayingState(isPlaying);
            });
        } catch (Exception ignored) {
            // WebView가 아직 준비되지 않은 경우입니다.
        }
    }

    /** 재생 상태가 바뀌면 알림을 켜고 끕니다. */
    private void applyPlayingState(boolean isPlaying) {
        playing = isPlaying;

        // PiP 창에 떠 있으면 화면에 계속 보이므로 알림까지 띄울 필요가 없습니다.
        boolean inPip = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode();
        boolean shouldRun = isPlaying && !inPip;

        if (shouldRun == serviceRunning) return;
        serviceRunning = shouldRun;

        // 알림은 앱이 화면에 보이는 동안 미리 켜둡니다.
        // 뒤로 간 다음에 켜려고 하면 안드로이드가 거부하는 경우가 있어요.
        if (shouldRun) PlaybackService.start(this, "재생 중");
        else PlaybackService.stop(this);
    }

    /** 화면 위에 떠 있는 작은 창으로 전환합니다. */
    private void goPip() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (isInPictureInPictureMode()) return;
        try {
            PictureInPictureParams params = new PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(16, 9))
                    .build();
            enterPictureInPictureMode(params);
        } catch (IllegalStateException | IllegalArgumentException e) {
            // 기기가 PiP를 막아둔 경우입니다. 알림으로 재생만 이어갑니다.
        }
    }

    /** 홈 버튼을 누르거나 다른 앱으로 넘어갈 때 불립니다. */
    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (playing) goPip();
    }

    /** PiP로 들어가고 나올 때 웹 화면에 알려줍니다. */
    @Override
    public void onPictureInPictureModeChanged(boolean inPip, Configuration newConfig) {
        super.onPictureInPictureModeChanged(inPip, newConfig);
        evalJs("window.kinexPipChanged && window.kinexPipChanged(" + inPip + ");");
        if (inPip) {
            // 화면에 보이므로 알림은 접습니다.
            serviceRunning = false;
            PlaybackService.stop(this);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // WebView의 타이머를 계속 돌립니다. 이걸 놓치면 뒤로 간 순간 재생이 멈춥니다.
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().resumeTimers();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().resumeTimers();
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(noisyReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(noisyReceiver, filter);
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        try {
            unregisterReceiver(noisyReceiver);
        } catch (IllegalArgumentException ignored) {
            // 이미 해제된 경우입니다.
        }
    }

    @Override
    public void onDestroy() {
        poller.removeCallbacks(pollTask);
        PlaybackService.stop(this);
        super.onDestroy();
    }

    /** 웹 화면에서 자바스크립트 한 줄을 실행합니다. */
    private void evalJs(String js) {
        if (bridge == null || bridge.getWebView() == null) return;
        try {
            bridge.getWebView().evaluateJavascript(js, null);
        } catch (Exception ignored) {
        }
    }
}
