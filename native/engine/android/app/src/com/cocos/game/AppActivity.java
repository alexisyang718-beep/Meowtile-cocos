/****************************************************************************
Copyright (c) 2015-2016 Chukong Technologies Inc.
Copyright (c) 2017-2018 Xiamen Yaji Software Co., Ltd.

http://www.cocos2d-x.org

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
****************************************************************************/
package com.cocos.game;

import android.os.Bundle;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;

import com.cocos.service.SDKWrapper;
import com.cocos.lib.CocosActivity;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.analytics.FirebaseAnalytics;

import org.json.JSONObject;

import java.util.Iterator;

public class AppActivity extends CocosActivity {
    private static AppActivity activity;

    public static void vibrate(int ms) {
        if (activity == null) return;
        Vibrator vibrator = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        if (ms <= 0) {
            vibrator.cancel();
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            vibrator.vibrate(ms);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        activity = this;
        // DO OTHER INITIALIZATION BELOW
        SDKWrapper.shared().init(this);

        // Firebase Analytics 手动初始化(占位符未替换时自动跳过,不影响其他功能)
        initFirebaseAnalytics();
    }

    @Override
    protected void onResume() {
        super.onResume();
        SDKWrapper.shared().onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        SDKWrapper.shared().onPause();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        // Workaround in https://stackoverflow.com/questions/16283079/re-launch-of-activity-on-home-button-but-only-the-first-time/16447508
        if (activity == this) activity = null;
        if (!isTaskRoot()) {
            return;
        }
        SDKWrapper.shared().onDestroy();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        SDKWrapper.shared().onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        SDKWrapper.shared().onNewIntent(intent);
    }

    @Override
    protected void onRestart() {
        super.onRestart();
        SDKWrapper.shared().onRestart();
    }

    @Override
    protected void onStop() {
        super.onStop();
        SDKWrapper.shared().onStop();
    }

    @Override
    public void onBackPressed() {
        SDKWrapper.shared().onBackPressed();
        super.onBackPressed();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        SDKWrapper.shared().onConfigurationChanged(newConfig);
        super.onConfigurationChanged(newConfig);
    }

    @Override
    protected void onRestoreInstanceState(Bundle savedInstanceState) {
        SDKWrapper.shared().onRestoreInstanceState(savedInstanceState);
        super.onRestoreInstanceState(savedInstanceState);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        SDKWrapper.shared().onSaveInstanceState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onStart() {
        SDKWrapper.shared().onStart();
        super.onStart();
    }

    @Override
    public void onLowMemory() {
        SDKWrapper.shared().onLowMemory();
        super.onLowMemory();
    }

    // ===== Firebase Analytics(手动初始化模式) =====
    // 三个值来自 /Users/ivan/Downloads/com.meowtile.game.json (Firebase 控制台 -> 项目设置 -> 你的 Android 应用):
    //   client[1].api_key[0].current_key      -> FIREBASE_API_KEY
    //   client[1].client_info.mobilesdk_app_id -> FIREBASE_APP_ID
    //   project_info.project_id                -> FIREBASE_PROJECT_ID
    private static final String FIREBASE_API_KEY = "AIzaSyCF5jtQQjNBKdYULXJiVv3hG4HJD_9VXIs";
    private static final String FIREBASE_APP_ID = "1:124736202705:android:65cd65d1d862b8e41ca2f0"; // com.meowtile.game
    private static final String FIREBASE_PROJECT_ID = "meowtile-7ebeb";

    /** Firebase Analytics 实例;未成功初始化(占位符未替换)时保持 null,事件桥自动静默降级。 */
    private static FirebaseAnalytics sFirebaseAnalytics;

    private void initFirebaseAnalytics() {
        if (FIREBASE_API_KEY.startsWith("REPLACE_WITH_")) {
            // 占位符未替换,说明 Firebase 项目还未创建/配置,直接跳过,不影响其余功能。
            android.util.Log.w("Firebase", "Firebase Analytics skipped: placeholder keys not replaced yet");
            return;
        }
        try {
            // res/values/strings.xml 已注入 google_app_id 等资源,FirebaseInitProvider 可能已自动初始化 DEFAULT;
            // 已存在则直接复用,避免 "FirebaseApp name [DEFAULT] already exists" 冲突。
            FirebaseApp app = null;
            for (FirebaseApp existing : FirebaseApp.getApps(this)) {
                if (FirebaseApp.DEFAULT_APP_NAME.equals(existing.getName())) {
                    app = existing;
                    break;
                }
            }
            if (app == null) {
                FirebaseOptions options = new FirebaseOptions.Builder()
                        .setApiKey(FIREBASE_API_KEY)
                        .setApplicationId(FIREBASE_APP_ID)
                        .setProjectId(FIREBASE_PROJECT_ID)
                        .build();
                app = FirebaseApp.initializeApp(this, options);
            }
            if (app != null) {
                sFirebaseAnalytics = FirebaseAnalytics.getInstance(this);
            }
        } catch (Throwable t) {
            android.util.Log.w("Firebase", "initFirebaseAnalytics failed: " + t.getMessage());
        }
    }

    /**
     * Firebase Analytics 事件桥。
     * Cocos JS 侧签名: ('com/cocos/game/AppActivity', 'firebaseOnEvent',
     *                  '(Ljava/lang/String;Ljava/lang/String;)V', eventId, paramsJson)
     */
    public static void firebaseOnEvent(String eventId, String paramsJson) {
        android.util.Log.i("TrackAudit", "sdk=firebase event=" + eventId + " params=" + paramsJson);
        if (sFirebaseAnalytics == null || eventId == null || eventId.isEmpty()) return;
        try {
            final Bundle params = new Bundle();
            JSONObject json = paramsJson == null ? new JSONObject() : new JSONObject(paramsJson);
            Iterator<String> keys = json.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                Object value = json.get(key);
                if (value instanceof Integer) {
                    params.putInt(key, (Integer) value);
                } else if (value instanceof Long) {
                    params.putLong(key, (Long) value);
                } else if (value instanceof Double) {
                    params.putDouble(key, (Double) value);
                } else {
                    params.putString(key, String.valueOf(value));
                }
            }
            sFirebaseAnalytics.logEvent(eventId, params);
        } catch (Throwable t) {
            // 埋点失败绝不影响游戏主流程
            android.util.Log.w("Firebase", "firebaseOnEvent failed: " + t.getMessage());
        }
    }
}
