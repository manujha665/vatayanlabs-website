#!/usr/bin/env python3
"""Vatayan Labs — link-preview (Open Graph) checker.

Every shareable page needs a complete OG block at the top of <head>, or
WhatsApp shows a bare URL instead of a card. The rules below were settled
by testing the Powering AI dashboard against WhatsApp in Sept 2026:

  * og:image:width and og:image:height must be declared. WhatsApp will not
    download an image to measure it, and renders no thumbnail without them.
  * <meta charset> must land inside the first 1024 bytes, per the HTML
    spec, and the OG block should sit above the analytics scripts and any
    inline <style> so a byte-limited crawler reaches it.
  * Exactly one <title>. A second one wins in parsers that take the last
    match, which silently replaces the shared headline.

Note when testing: WhatsApp Web and WhatsApp on the phone build previews
separately and cache separately. A card can be live on the phone while Web
still shows a bare URL. Trust the phone.

    python3 scripts/check_og.py                 # audit every page
    python3 scripts/check_og.py --template PATH # print the block for a new page
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://vatayanlabs.com"

# Fragments and error pages are never shared on their own.
SKIP_DIRS = ("assets/charts", ".git", "node_modules")
SKIP_FILES = ("404.html",)

REQUIRED = [
    "og:title", "og:description", "og:type", "og:url", "og:image",
    "og:image:width", "og:image:height", "twitter:card",
]
CHARSET_LIMIT = 1024   # HTML spec
OG_LIMIT      = 8192   # keep the block well inside any crawler's budget


def page_url(rel):
    d = os.path.dirname(rel)
    return SITE + "/" + (d + "/" if d else "")


def meta(html, key):
    m = re.search(r'<meta\s+(?:property|name)="%s"\s+content="([^"]*)"' % re.escape(key), html)
    return m.group(1) if m else None


def template(rel, title="PAGE TITLE", desc="PAGE DESCRIPTION", img="og-default.png"):
    u = page_url(rel)
    i = "%s/assets/og/%s" % (SITE, img)
    return """<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{t} | Vatayan Labs</title>
<meta name="description" content="{d}">
<link rel="canonical" href="{u}">

<!-- Open Graph. Keep this block at the top of the head, above the
     analytics scripts and any inline style: link crawlers read only the
     first few KB, and WhatsApp needs the image dimensions declared. -->
<meta property="og:site_name" content="Vatayan Labs">
<meta property="og:locale" content="en_US">
<meta property="og:type" content="website">
<meta property="og:url" content="{u}">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:image" content="{i}">
<meta property="og:image:secure_url" content="{i}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{t}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{i}">
<meta name="twitter:image:alt" content="{t}">""".format(t=title, d=desc, u=u, i=i)


def check(rel):
    """Return a list of problems with one page."""
    path = os.path.join(ROOT, rel)
    raw = open(path, "rb").read()
    html = raw.decode("utf-8", errors="replace")
    bad = []

    for key in REQUIRED:
        if meta(html, key) is None:
            bad.append("missing %s" % key)

    m = re.search(r"<meta\s+charset", html, re.I)
    if not m:
        bad.append("no <meta charset>")
    elif len(html[:m.start()].encode("utf-8")) > CHARSET_LIMIT:
        bad.append("<meta charset> at byte %d, past the %d-byte limit"
                   % (len(html[:m.start()].encode("utf-8")), CHARSET_LIMIT))

    m = re.search(r'<meta\s+property="og:image"', html)
    if m:
        off = len(html[:m.start()].encode("utf-8"))
        if off > OG_LIMIT:
            bad.append("og:image at byte %d, past the %d-byte budget" % (off, OG_LIMIT))

    n = len(re.findall(r"<title>", html))
    if n != 1:
        bad.append("%d <title> tags, expected 1" % n)

    want = page_url(rel)
    got = meta(html, "og:url")
    if got and got != want:
        bad.append("og:url is %s, expected %s" % (got, want))

    img = meta(html, "og:image")
    if img:
        if not img.startswith("https://"):
            bad.append("og:image is not an absolute https URL")
        local = os.path.join(ROOT, img.replace(SITE + "/", ""))
        if not os.path.exists(local):
            bad.append("og:image file not found: %s" % os.path.relpath(local, ROOT))
        else:
            size = os.path.getsize(local)
            if size > 300 * 1024:
                bad.append("og:image is %dKB, over the 300KB preview limit" % (size // 1024))
            try:
                from PIL import Image
                w, h = Image.open(local).size
                dw, dh = meta(html, "og:image:width"), meta(html, "og:image:height")
                if dw and dh and (int(dw), int(dh)) != (w, h):
                    bad.append("declared %sx%s but the file is %dx%d" % (dw, dh, w, h))
            except ImportError:
                pass
    return bad


def pages():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel_dir = os.path.relpath(dirpath, ROOT)
        if any(rel_dir.startswith(s) for s in SKIP_DIRS):
            dirnames[:] = []
            continue
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for fn in sorted(filenames):
            if fn.endswith(".html") and fn not in SKIP_FILES:
                yield os.path.relpath(os.path.join(dirpath, fn), ROOT)


if __name__ == "__main__":
    if "--template" in sys.argv:
        i = sys.argv.index("--template")
        rel = sys.argv[i + 1] if len(sys.argv) > i + 1 else "new-page/index.html"
        print(template(rel))
        sys.exit(0)

    failed = 0
    for rel in pages():
        bad = check(rel)
        if bad:
            failed += 1
            print("FAIL  %s" % rel)
            for b in bad:
                print("        - %s" % b)
    total = len(list(pages()))
    print("\n%d of %d pages complete." % (total - failed, total))
    if failed:
        print("Run:  python3 scripts/check_og.py --template <path>   for the block to paste.")
    sys.exit(1 if failed else 0)
