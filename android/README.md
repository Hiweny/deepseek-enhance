# DeepSleep（Android WebView 套壳）

把同源注入脚本 `dist/inject.js`（由仓库根目录 `node build.js` 从 `src/` 生成，与油猴脚本同一份代码）装进一个原生 WebView 壳，打开 https://chat.deepseek.com/ ，效果与浏览器装油猴脚本一致。

## 特性

- **全屏沉浸**：状态栏 / 导航栏全透明，内容延伸到刘海、挖孔与底部导航区域（`shortEdges` + `IMMERSIVE_STICKY`），无黑线、无开屏页。
- **早期注入**：每次页面加载在 `onPageStarted`（贴近 document-start）注入 viewport-fit=cover 与 `assets/inject.js`，幂等不重复执行。
- **对标手机版官网**：保留移动端 UA、DOM Storage、文件上传（识图）、摄像头/麦克风权限按需申请。
- **返回键**：网页可后退时后退，否则退到后台，不杀进程。
- 应用名 **DeepSleep**，图标来自 `app/src/main/assets/icon-source.png`（构建时生成各密度 mipmap）。

## 本地构建

需要 JDK 17 与 Android SDK（platform-34、build-tools 34.0.0）。

```bash
# 仓库根目录：先生成注入脚本
node build.js

cd android
echo "sdk.dir=/path/to/Android/Sdk" > local.properties
./gradlew assembleRelease
# 产物：app/build/outputs/apk/release/app-release.apk
```

当前 release 直接使用 debug 签名以便直接安装；正式上架请自建 keystore 并替换 `signingConfig`。

## 云端构建

推送到 main 后 GitHub Actions（`.github/workflows/android.yml`）自动构建，产物在 Actions 页 Artifacts `DeepSleep-apk` 下载。

## 结构

```
android/
├── app/src/main/
│   ├── assets/                     # inject.js 由构建任务自动同步（git 忽略）
│   ├── java/com/deepsleep/app/MainActivity.java
│   └── res/                        # 主题（透明系统栏/刘海）、图标、应用名
└── gradlew / gradle/wrapper        # 标准 Gradle Wrapper
```
