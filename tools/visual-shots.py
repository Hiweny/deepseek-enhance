"""在 Android 模拟器里通过 WebView CDP（裸 websocket）注入登录态、开启皮肤并截图。
需要 DS_STATE_B64（gzip+base64 的 storageState）；依赖 websocket-client。
"""
import base64
import gzip
import json
import os
import time
import urllib.request

import websocket

OUT = "/tmp/shots"
os.makedirs(OUT, exist_ok=True)

SCENES = [
    ("light_home", "light", ""),
    ("dark_home", "dark", ""),
    ("light_chat", "light", "/a/chat/s/e1eae463-e4b1-4ed5-bdf3-018c323afbf2"),
    ("dark_chat", "dark", "/a/chat/s/e1eae463-e4b1-4ed5-bdf3-018c323afbf2"),
]


def targets():
    with urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=10) as r:
        return json.loads(r.read().decode())


class CDP:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=30)
        self.n = 0

    def send(self, method, params=None):
        self.n += 1
        mid = self.n
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        deadline = time.time() + 60
        while time.time() < deadline:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                return msg
        raise TimeoutError(method)

    def eval(self, expr):
        r = self.send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        return r.get("result", {}).get("result", {}).get("value")

    def shot(self, path):
        r = self.send("Page.captureScreenshot", {"format": "png"})
        data = r.get("result", {}).get("data")
        if data:
            open(path, "wb").write(base64.b64decode(data))
            return True
        return False

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def main():
    state = json.loads(gzip.decompress(base64.b64decode(os.environ["DS_STATE_B64"])).decode())
    ls = {}
    for origin in state.get("origins", []):
        if "deepseek.com" in origin.get("origin", ""):
            for item in origin.get("localStorage", []):
                ls[item["name"]] = item["value"]
    cookies = [c for c in state.get("cookies", []) if "deepseek" in c.get("domain", "")]
    print("localStorage keys:", len(ls), "cookies:", len(cookies), flush=True)

    pages = [t for t in targets() if t.get("type") == "page"]
    if not pages:
        print("no page target", targets(), flush=True)
        return
    c = CDP(pages[0]["webSocketDebuggerUrl"])
    c.send("Page.enable")
    c.send("Runtime.enable")
    print("initial url:", c.eval("location.href"), flush=True)

    for ck in cookies:
        c.send("Network.setCookie", {
            "name": ck["name"], "value": ck["value"], "domain": ck["domain"],
            "path": ck.get("path", "/"), "secure": bool(ck.get("secure")),
            "httpOnly": bool(ck.get("httpOnly")),
        })
    # 先回首页注入 localStorage
    c.send("Page.navigate", {"url": "https://chat.deepseek.com/"})
    time.sleep(6)
    js = "".join("try{localStorage.setItem(%s,%s)}catch(e){}" % (json.dumps(k), json.dumps(v)) for k, v in ls.items())
    c.eval(js)

    for name, theme, path in SCENES:
        try:
            c.eval("try{localStorage.setItem('__appKit_@deepseek/chat_themePreference',%s)}catch(e){}"
                   % json.dumps(json.dumps({"value": theme, "__version": "0"})))
            c.send("Page.navigate", {"url": "https://chat.deepseek.com" + path})
            time.sleep(9)
            url = c.eval("location.href")
            if "sign_in" in (url or ""):
                print("NOT LOGGED IN:", name, url, flush=True)
            # 关 Cookie 弹窗
            c.eval("""(()=>{const btns=[...document.querySelectorAll('button,div[role=button]')];
              const b=btns.find(x=>/Accept all|Necessary|同意|接受|Accept/i.test(x.innerText||''));
              if(b)b.click();})()""")
            time.sleep(1.5)
            # 等 UI 真正渲染出来（模拟器慢）
            for _ in range(20):
                if c.eval("!!document.querySelector('.aaff8b8f')") in (True,):
                    break
                time.sleep(1.5)
            c.eval("try{if(window.DSENative&&DSENative.setMaidSkin)DSENative.setMaidSkin(true);}catch(e){}")
            c.eval("try{if(window.__dseMaidApply)window.__dseMaidApply(true);}catch(e){}")
            time.sleep(3)
            c.eval("try{if(window.__dseMaidApply)window.__dseMaidApply(true);}catch(e){}")
            time.sleep(2)
            ok = c.shot(os.path.join(OUT, name + ".png"))
            diag = c.eval("""(()=>{const l=document.getElementById('dse-maid-link');
              let rules=0; try{for(const s of document.styleSheets){if(s.href&&s.href.indexOf('dse-maid')>=0)rules=s.cssRules.length;}}catch(e){}
              return JSON.stringify({link:!!l, href:l?l.href:'', stage:!!document.getElementById('dse-maid-stage'),
                bodyCls:document.body.className, attr:document.documentElement.getAttribute('data-dse-maid'),
                rules:rules, apply:typeof window.__dseMaidApply, skin:typeof window.DSENative!=='undefined'?DSENative.maidSkin():null,
                bgLen:(getComputedStyle(document.body,'::before').backgroundImage||'').length,
                figLen:(document.querySelector('.maid-fig.right')?getComputedStyle(document.querySelector('.maid-fig.right')).backgroundImage.length:0)});})()""")
            print("shot", name, ok, url, "diag:", diag, flush=True)
            # 侧栏展开
            try:
                if c.eval("()=>{const e=document.querySelector('.dc04ec1d');return !e||e.getBoundingClientRect().width<100}") in (True,):
                    box = c.eval("""()=>{const b=document.querySelector('.ds-button');if(!b)return null;const r=b.getBoundingClientRect();return [r.x+r.width/2, r.y+r.height/2];}""")
                    if box:
                        c.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": box[0], "y": box[1], "button": "left", "clickCount": 1})
                        c.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": box[0], "y": box[1], "button": "left", "clickCount": 1})
                        time.sleep(2)
                        c.shot(os.path.join(OUT, name + "_sidebar.png"))
            except Exception as e:
                print("sidebar fail", name, repr(e)[:120], flush=True)
        except Exception as e:
            print("scene fail", name, repr(e)[:200], flush=True)
    c.close()


main()
