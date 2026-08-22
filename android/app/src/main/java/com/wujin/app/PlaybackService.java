package com.wujin.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/**
 * 앱이 뒤로 갔을 때도 재생이 끊기지 않게 붙잡아 두는 역할입니다.
 *
 * 안드로이드는 화면에 안 보이는 앱의 일을 점점 줄이다가 결국 멈춰 세웁니다.
 * 알림을 하나 띄운 "포그라운드 서비스"로 등록하면 그 대상에서 빠집니다.
 * 알림을 누르면 앱으로 돌아옵니다.
 */
public class PlaybackService extends Service {

    private static final String CHANNEL_ID = "kinex_playback";
    private static final int NOTIFICATION_ID = 1001;
    private static final String EXTRA_TITLE = "title";

    private PowerManager.WakeLock wakeLock;

    /** 재생을 유지한 채 뒤로 갈 때 부릅니다. */
    public static void start(Context context, String title) {
        Intent intent = new Intent(context, PlaybackService.class);
        intent.putExtra(EXTRA_TITLE, title);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            // 시작하지 못해도 앱 자체는 그대로 돌아갑니다.
        }
    }

    /** 앱으로 돌아왔거나 재생이 끝났을 때 부릅니다. */
    public static void stop(Context context) {
        try {
            context.stopService(new Intent(context, PlaybackService.class));
        } catch (Exception ignored) {
            // 이미 멈춰 있는 경우입니다.
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : null;
        if (title == null || title.length() == 0) title = "재생 중";

        createChannel();
        startForegroundCompat(buildNotification(title));
        acquireWakeLock();

        // 시스템이 잠시 정리하더라도 다시 살아나게 합니다.
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        try {
            stopForeground(true);
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }

    /** 알림 채널은 안드로이드 8부터 필요합니다. */
    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "재생", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("앱을 벗어나도 재생이 이어지게 합니다.");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(String title) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, flags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("키넥스")
                .setContentText(title)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(tap)
                .setOngoing(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build();
    }

    /** 안드로이드 10부터는 서비스 종류를 함께 알려줘야 합니다. */
    private void startForegroundCompat(Notification notification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            // 권한이 없으면 서비스를 접습니다. 앱은 그대로 동작합니다.
            stopSelf();
        }
    }

    /** 화면이 꺼져도 소리가 이어지도록 CPU를 붙잡아 둡니다. */
    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kinex:playback");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(3 * 60 * 60 * 1000L); // 최대 3시간. 잊고 잡아두는 일을 막습니다.
        } catch (Exception ignored) {
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        wakeLock = null;
    }
}
