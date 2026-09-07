import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * 构建校验器：用【真实的 InlineJs 源码】拼出 APK 最终注入 WebView 的完整脚本串，
 * 输出深色/浅色两份，外部再用 node --check 验证语法（v8.3.0 拼接串语法错误静默失效的教训）。
 * 用法：java Gen <InlineJs.java 所在源码根=app/src/main/java> <dist/inject.js> <输出目录>
 */
public class Gen {
    public static void main(String[] args) throws Exception {
        Path srcRoot = Path.of(args[0]);
        Path injectPath = Path.of(args[1]);
        Path outDir = Path.of(args[2]);
        Files.createDirectories(outDir);
        // 直接编译 InlineJs.java 到独立输出目录并加载，保证校验的就是上线代码
        javax.tools.JavaCompiler c = javax.tools.ToolProvider.getSystemJavaCompiler();
        Path cls = Files.createTempDirectory("inlinejs");
        int rc = c.run(null, null, null, "-d", cls.toString(),
                srcRoot.resolve("com/deepsleep/app/InlineJs.java").toString());
        if (rc != 0) throw new RuntimeException("InlineJs compile failed");
        Class<?> clz = new java.net.URLClassLoader(new java.net.URL[]{cls.toUri().toURL()})
                .loadClass("com.deepsleep.app.InlineJs");
        var full = clz.getDeclaredMethod("fullBootstrap", boolean.class, String.class, String.class);
        full.setAccessible(true);
        String inject = Files.readString(injectPath, StandardCharsets.UTF_8);
        Files.writeString(outDir.resolve("full-true.js"),
                (String) full.invoke(null, true, "#151517", inject), StandardCharsets.UTF_8);
        Files.writeString(outDir.resolve("full-false.js"),
                (String) full.invoke(null, false, "#ffffff", inject), StandardCharsets.UTF_8);
        System.out.println("generated");
    }
}
