"""Render the UI with dev/mock.js in headless Chromium and save phone-sized screenshots."""
import shutil
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1])
SITE = OUT / "site"
shutil.rmtree(SITE, ignore_errors=True)
shutil.copytree(ROOT / "assets", SITE)
shutil.copy(ROOT / "dev" / "mock.js", SITE / "mock.js")

errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 412, "height": 915}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto((SITE / "index.html").as_uri())
    pg.wait_for_timeout(5000)

    def shot(name):
        pg.wait_for_timeout(700)
        pg.screenshot(path=str(OUT / f"{name}.png"))

    def scroll(view, y):
        pg.evaluate(f"document.querySelector('.view[data-view={view}]').scrollTo(0, {y})")

    shot("01-home")
    scroll("home", 900)
    shot("02-home-bottom")
    scroll("home", 0)
    pg.click(".tab[data-go=tune]")
    pg.wait_for_timeout(800)
    shot("03-tune")
    scroll("tune", 1500)
    shot("04-tune-mid")
    scroll("tune", 9999)
    shot("05-tune-bottom")
    pg.click(".tab[data-go=apps]")
    pg.wait_for_timeout(1200)
    shot("06-apps")
    pg.click(".app-row >> nth=0")
    shot("07-app-sheet")
    pg.evaluate("RD_back()")
    pg.click("[data-f=system]")
    pg.wait_for_timeout(500)
    pg.evaluate("toggleSel('com.google.android.apps.tips'); toggleSel('com.google.android.videos')")
    shot("08-apps-batch")
    pg.evaluate("clearSel()")
    pg.click(".tab[data-go=tools]")
    shot("09-tools")
    pg.click("[data-t='0']")
    shot("10-wifi")
    pg.click("[data-eye='1']")
    shot("11-wifi-shown")
    pg.evaluate("RD_back()")
    pg.click("[data-t='1']")
    pg.wait_for_timeout(600)
    shot("12-ads")
    pg.evaluate("RD_back()")
    pg.click("[data-t='3']")
    pg.wait_for_timeout(600)
    shot("13-modules")
    pg.evaluate("RD_back()")
    pg.click("[data-t='4']")
    pg.wait_for_timeout(600)
    shot("14-logcat")
    pg.evaluate("RD_back()")
    pg.click("[data-t='5']")
    pg.fill("#tIn", "uname -a")
    pg.click("#tForm button[type=submit]")
    shot("15-terminal")
    pg.evaluate("RD_back()")
    pg.click("[data-t='8']")
    shot("16-power")
    pg.evaluate("RD_back()")
    pg.click(".tab[data-go=home]")
    pg.click("#btnMenu")
    shot("17-settings")
    b.close()

print("ERRORS:" if errors else "no console errors")
for e in errors:
    print(" ", e)
