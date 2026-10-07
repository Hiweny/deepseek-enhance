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

release 使用**固定签名**：工作流把仓库 Secrets 里的 `KEYSTORE_BASE64` 解码成 keystore 并注入
`DSE_KEYSTORE` / `DSE_KEYSTORE_PASSWORD` / `DSE_KEY_ALIAS` / `DSE_KEY_PASSWORD`，`build.gradle`
据此生成 `stable` signingConfig，签名恒定，可直接覆盖安装（本地无该配置时回退 debug 签名）。

```bash
# 生成并写入仓库 Secrets（只需一次）
keytool -genkeypair -v -keystore deepsleep.jks -storetype JKS -alias deepsleep \
  -keyalg RSA -keysize 2048 -validity 10950 \
  -storepass '<口令>' -keypass '<口令>' -dname "CN=Hiweny,OU=DeepSleep,O=DeepSleep,C=CN"
base64 -w0 deepsleep.jks   # → 填入 GitHub Secret KEYSTORE_BASE64
```

## 云端构建

推送到 main 后 GitHub Actions（`.github/workflows/android.yml`）自动构建：

- `build`：`node build.js` 生成 `inject.js` → 校验 `InlineJs` 拼接出的引导串语法 → `assembleRelease` → 上传 Artifact `DeepSleep-apk`。
- `emulator-test`：在 KVM 加速的 Android 模拟器上安装启动 APK、截图、读取 WebView devtools 目标（失败不阻断发布）。
- `release`：把产物以**固定 tag `apk`** 发布并覆盖更新，下载链接恒定：

  https://github.com/Hiweny/deepseek-enhance/releases/download/apk/DeepSleep.apk

> 说明：APK 与油猴脚本共用同一份 `dist/inject.js`（单一数据源），所以脚本侧的消息滚动/定位修复会自动同步到 APK。


## 结构

```
android/
├── app/src/main/
│   ├── assets/                     # inject.js 由构建任务自动同步（git 忽略）
│   ├── java/com/deepsleep/app/MainActivity.java
│   └── res/                        # 主题（透明系统栏/刘海）、图标、应用名
└── gradlew / gradle/wrapper        # 标准 Gradle Wrapper
```
