"""在 Android 模拟器里通过 WebView CDP 注入登录态 + 开启皮肤，抓取多场景截图。
需要环境变量 DS_STATE_B64（gzip+base64 的 Playwright storageState）。
"""
import base64, gzip, json, os, sys, time
from playwright.sync_api import sync_playwright

OUT = "/tmp/shots"
os.makedirs(OUT, exist_ok=True)
STATE = json.loads(gzip.decompress(base64.b64decode(os.environ["DS_STATE_B64"])).decode())
LS = {}
for origin in STATE.get("origins", []):
    if "deepseek.com" in origin.get("origin", ""):
        for item in origin.get("localStorage", []):
            LS[item["name"]] = item["value"]
COOKIES = [c for c in STATE.get("cookies", []) if "deepseek" in c.get("domain", "")]

SCENES = [
    ("light_home", "light", ""),
    ("dark_home", "dark", ""),
    ("light_chat", "light", "/a/chat/s/e1eae463-e4b1-4ed5-bdf3-018c323afbf2"),
    ("dark_chat", "dark", "/a/chat/s/e1eae463-e4b1-4ed5-bdf3-018c323afbf2"),
]

def main():
    with sync_playwright() as p:
        b = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
        ctx = b.contexts[0]
        pg = ctx.pages[0] if ctx.pages else ctx.new_page()
        print("initial url:", pg.url, flush=True)
        # 注入 cookies
        cdp = ctx.new_cdp_session(pg)
        for c in COOKIES:
            try:
                cdp.send("Network.setCookie", {
                    "name": c["name"], "value": c["value"], "domain": c["domain"],
                    "path": c.get("path", "/"), "secure": bool(c.get("secure")),
                    "httpOnly": bool(c.get("httpOnly")),
                })
            except Exception as e:
                print("cookie fail", c.get("name"), e, flush=True)
        # 注入 localStorage
        pg.evaluate("""(ls)=>{for(const k in ls){try{localStorage.setItem(k, ls[k])}catch(e){}}}""", LS)
        pg.wait_for_timeout(500)
        for name, theme, path in SCENES:
            try:
                pg.evaluate("(t)=>localStorage.setItem('__appKit_@deepseek/chat_themePreference', JSON.stringify({value:t,__version:'0'}))", theme)
                url = "https://chat.deepseek.com" + path
                pg.goto(url, wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_timeout(7000)
                if "sign_in" in pg.url:
                    print("NOT LOGGED IN for", name, pg.url, flush=True)
                # 开启皮肤
                pg.evaluate("""()=>{try{if(window.DSENative&&DSENative.setMaidSkin)DSENative.setMaidSkin(true);}catch(e){}
                  if(window.__dseMaidApply)window.__dseMaidApply(true);}""")
                pg.wait_for_timeout(3000)
                pg.evaluate("""()=>{if(window.__dseMaidApply)window.__dseMaidApply(true);}""")
                pg.wait_for_timeout(2500)
                pg.screenshot(path=os.path.join(OUT, name + ".png"))
                print("shot", name, pg.url, flush=True)
                # 侧栏（展开）
                try:
                    if pg.evaluate("()=>{const e=document.querySelector('.dc04ec1d');return !e||e.getBoundingClientRect().width<100}"):
                        c = pg.evaluate("()=>{const b=document.querySelector('.ds-button');if(!b)return null;const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}}")
                        if c:
                            pg.mouse.click(c["x"], c["y"]); pg.wait_for_timeout(1500)
                            pg.screenshot(path=os.path.join(OUT, name + "_sidebar.png"))
                except Exception as e:
                    print("sidebar fail", e, flush=True)
            except Exception as e:
                print("scene fail", name, repr(e)[:200], flush=True)
        b.close()

main()
