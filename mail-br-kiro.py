"""
Gmail agent: polls inbox via Playwright, sends new emails to kiro-cli, replies with result.
SMS texts arrive as attachments (text000001.txt) — handled automatically.
"""
import json
import re
import subprocess
import time
import os
from playwright.sync_api import sync_playwright

GMAIL_URL = "https://mail.google.com/mail/u/0/#inbox"
FROM_FILTER = "+18085611560@newtextmail.com"
POLL_INTERVAL = 15
SEEN_FILE = "seen_ids.txt"
COOKIE_FILE = "Cookie_Gmail.json"


def load_seen():
    if not os.path.exists(SEEN_FILE):
        return set()
    return set(open(SEEN_FILE).read().splitlines())


def save_seen(seen):
    open(SEEN_FILE, "w").write("\n".join(seen))


def ask_kiro(text: str) -> str:
    result = subprocess.run(
        ["kiro-cli", "chat", text],
        capture_output=True, text=True, timeout=120
    )
    return (result.stdout or result.stderr).strip()


def inject_cookies(context):
    with open(COOKIE_FILE) as f:
        cookies = json.load(f)
    for c in cookies:
        c.pop("storeId", None)
        c.pop("hostOnly", None)
        c.pop("session", None)
        if c.get("expirationDate"):
            c["expires"] = int(c.pop("expirationDate"))
        else:
            c.pop("expirationDate", None)
        if c.get("sameSite") not in ("Strict", "Lax", "None"):
            c["sameSite"] = "Lax"
    context.add_cookies(cookies)


def get_email_text(page, email_id: str) -> str:
    """Open email, read text from attachment if body is trimmed."""
    row = page.query_selector(f'tr[id="{email_id}"]')
    if not row:
        return ""
    page.evaluate('(el) => el.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}))', row)
    try:
        page.wait_for_selector('div.adn', timeout=8000)
    except Exception:
        pass
    time.sleep(2)

    # SMS gateway sends text as attachment — read via view=lg
    lg = page.query_selector('div.a3s a[href*="view=lg"]')
    if lg:
        href = lg.get_attribute('href')
        full_url = ('https://mail.google.com/mail/u/0' + href) if href.startswith('?') else href
        page.goto(full_url, wait_until='domcontentloaded')
        time.sleep(1)
        # inline text attachment
        att = page.query_selector('a[href*="attid=0.1"][href*="disp=inline"]')
        text = ""
        if att:
            att_href = att.get_attribute('href')
            att_url = ('https://mail.google.com/mail/u/0' + att_href) if att_href.startswith('?') else att_href
            page.goto(att_url, wait_until='domcontentloaded')
            pre = page.query_selector('pre')
            text = pre.inner_text().strip() if pre else page.inner_text('body').strip()
        # Return to inbox and re-open thread for reply
        page.goto(GMAIL_URL, wait_until='domcontentloaded')
        page.wait_for_selector('tr.zA', timeout=15000)
        row2 = page.query_selector(f'tr[id="{email_id}"]')
        if row2:
            page.evaluate('(el) => el.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}))', row2)
            try:
                page.wait_for_selector('div.adn', timeout=8000)
            except Exception:
                pass
            time.sleep(2)
        return text

    # Plain body
    body_el = page.query_selector('div.a3s')
    return body_el.inner_text().strip() if body_el else ""


def reply_email(page, reply_text: str):
    btns = page.query_selector_all('[aria-label="Ответить"], [aria-label="Reply"]')
    btn = btns[-1] if btns else None
    if not btn:
        print(f"Reply button not found (URL: {page.url[-60:]})", flush=True)
        return
    btn.scroll_into_view_if_needed()
    btn.click(force=True)
    page.wait_for_selector('div[role="textbox"]', timeout=8000)
    time.sleep(0.5)
    page.keyboard.type(reply_text)
    time.sleep(0.3)
    page.keyboard.press("Control+Enter")
    time.sleep(2)
    print("Reply sent.", flush=True)
    page.goto(GMAIL_URL, wait_until='domcontentloaded')


def run():
    seen = load_seen()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = browser.new_context()
        inject_cookies(context)
        page = context.new_page()

        print("Opening Gmail...", flush=True)
        page.goto(GMAIL_URL, wait_until='domcontentloaded')
        page.wait_for_selector('div[role="main"]', timeout=30000)

        if "accounts.google.com" in page.url:
            print("ERROR: Cookies expired.", flush=True)
            browser.close()
            return

        print(f"Logged in! Polling every {POLL_INTERVAL}s for emails from {FROM_FILTER}", flush=True)
        while True:
            try:
                page.goto(GMAIL_URL, wait_until='domcontentloaded')
                page.wait_for_selector('tr.zA', timeout=15000)
                rows = page.query_selector_all('tr.zA')
                for row in rows:
                    s = row.query_selector('span.yP, span.zF')
                    if not s or FROM_FILTER not in (s.get_attribute('email') or ''):
                        continue
                    email_id = row.get_attribute('id')
                    if not email_id or email_id in seen:
                        continue
                    subject_el = row.query_selector('span.bog')
                    subject = subject_el.inner_text() if subject_el else ""
                    print(f"New email [{email_id}]: {subject}", flush=True)
                    text = get_email_text(page, email_id)
                    query = f"Subject: {subject}\n\n{text}".strip()
                    print(f"→ kiro: {query[:150]}", flush=True)
                    response = ask_kiro(query)
                    print(f"← kiro: {response[:150]}", flush=True)
                    reply_email(page, response)
                    seen.add(email_id)
                    save_seen(seen)
            except Exception as e:
                print(f"Error: {e}", flush=True)

            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    run()
