#!/usr/bin/env python3
"""Import a Substack post as a sector article on vatayanlabs.com.

Pulls the post body from the Substack RSS feed, strips the Substack chrome the
site's articles don't carry, and writes a page built off an existing article so
the shell (nav, footer, read-toggle, footnote) stays byte-identical.

    tools/import-substack.py --list
    tools/import-substack.py --slug the-first-reit-index-fund-in-india \
        --sector mutual-funds --date 2026-07-26 --dry-run

The site metadata that lives outside the article still has to be updated by
hand afterwards — see CHECKLIST at the bottom of this file.

Feed note: only the ~20 most recent posts appear in the Substack RSS feed, so
older pieces have to be imported from a saved copy of content:encoded.
"""
import argparse
import html
import pathlib
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET

FEED = "https://curiousinvestinginsights.substack.com/feed"
SITE = pathlib.Path(__file__).resolve().parent.parent
NS = {"content": "http://purl.org/rss/1.0/modules/content/"}

# An existing imported article, used as the page template.
TEMPLATE = SITE / "sectors/mutual-funds/the-sip-illusion/index.html"
TPL = {
    "slug": "the-sip-illusion",
    "title": "The SIP Illusion",
    "deck": "Why India’s Most Popular Investment Habit Is Quietly Failing Millions of Investors",
    "date_iso": "2026-04-11",
    "date_human": "April 11, 2026",
    "sector": "mutual-funds",
    "sector_name": "Mutual Funds",
}

# Substack wrappers that must not survive into the site's article body. Each
# entry is an opening-tag pattern; the whole element is removed, tags balanced.
CHROME = [
    r'<div class="captioned-button-wrap"[^>]*>',        # subscribe button block
    r'<p class="button-wrapper"[^>]*>',                 # subscribe button
    r'<div class="preamble"[^>]*>',                     # "this post is for..." preamble
    r'<p class="cta-caption"[^>]*>',                    # caption under a CTA button
    r'<div class="pencraft[^"]*"[^>]*>',                # image hover toolbar
    r'<button class="pencraft[^"]*"[^>]*>',
    r'<div class="image-link-expand"[^>]*>',
    r'<div class="subscription-widget-wrap[^"]*"[^>]*>',  # inline subscribe form
]
# If any of these survive the strip, the import is wrong — fail rather than ship.
FORBIDDEN = ["button-wrapper", "pencraft", "subscription-widget",
             "<form", "<input", "button primary", "captioned-button-wrap"]


def fetch_feed(url=FEED):
    # Substack 403s the default urllib User-Agent.
    req = urllib.request.Request(url, headers={"User-Agent": "vatayanlabs-import/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return ET.fromstring(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"error: fetching {url} failed with HTTP {e.code}")
    except urllib.error.URLError as e:
        sys.exit(f"error: fetching {url} failed: {e.reason}")


def posts(root):
    for item in root.iter("item"):
        node = item.find("content:encoded", NS)
        yield {
            "title": (item.findtext("title") or "").strip(),
            "link": (item.findtext("link") or "").strip(),
            "slug": (item.findtext("link") or "").rstrip("/").split("/")[-1],
            "date": (item.findtext("pubDate") or "").strip(),
            "body": (node.text or "") if node is not None else "",
        }


def drop_block(src, pattern):
    """Remove whole elements whose opening tag matches, balancing nested tags."""
    out, i = [], 0
    for m in re.finditer(pattern, src):
        if m.start() < i:
            continue
        tag = re.match(r"<(\w+)", m.group(0)).group(1)
        depth, end = 1, m.end()
        for t in re.finditer(rf"</?{tag}\b[^>]*>", src[m.end():]):
            depth += -1 if t.group(0).startswith("</") else 1
            if depth == 0:
                end = m.end() + t.end()
                break
        out.append(src[i:m.start()])
        i = end
    out.append(src[i:])
    return "".join(out)


def clean(body):
    for pattern in CHROME:
        body = drop_block(body, pattern)
    body = re.sub(r"<p>\s*</p>", "", body)
    body = body.strip()
    left = [m for m in FORBIDDEN if m in body]
    if left:
        sys.exit(f"error: Substack chrome survived the strip: {left}\n"
                 f"       add a pattern to CHROME for it, then re-run.")
    return body


def build(post, sector, sector_name, date_iso, date_human, deck):
    page = TEMPLATE.read_text()
    body = clean(post["body"])
    slug, title = post["slug"], post["title"]
    url = f"https://vatayanlabs.com/sectors/{sector}/{slug}/"

    old_body = re.search(r'<article class="article-body">\n(.*?)\n  </article>', page, re.S)
    if not old_body:
        sys.exit("error: could not locate the article body in the template")

    # Longest-first so the <title> (title + suffix) is replaced before the bare title.
    for old, new in [
        (f'{TPL["title"]} — Vatayan Labs', html.escape(title) + " — Vatayan Labs"),
        (TPL["deck"], html.escape(deck)),
        (TPL["title"], html.escape(title)),
        (f'https://vatayanlabs.com/sectors/{TPL["sector"]}/{TPL["slug"]}/', url),
        (f'https://curiousinvestinginsights.substack.com/p/{TPL["slug"]}', post["link"]),
        (f'"datePublished": "{TPL["date_iso"]}"', f'"datePublished": "{date_iso}"'),
        (f'Published {TPL["date_human"]} · Vatayan Labs', f"Published {date_human} · Vatayan Labs"),
    ]:
        if old not in page:
            sys.exit(f"error: template string missing (did the template change?): {old[:60]}")
        page = page.replace(old, new)

    if sector != TPL["sector"]:
        page = page.replace(f'/sectors/{TPL["sector"]}/', f"/sectors/{sector}/")
        page = page.replace(f'>{TPL["sector_name"]}<', f">{sector_name}<")

    page = page.replace(old_body.group(1), f'<div class="body markup" dir="auto">{body}</div>')

    for stale in [TPL["slug"], TPL["title"], TPL["date_human"]]:
        if stale in page:
            sys.exit(f"error: stale template value left in output: {stale!r}")

    words = len(re.sub(r"<[^>]+>", " ", body).split())
    return page, {"words": words, "images": body.count("<img"),
                  "headings": body.count("<h2") + body.count("<h3")}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", action="store_true", help="list posts in the feed and exit")
    ap.add_argument("--slug", help="Substack post slug (last path segment of its URL)")
    ap.add_argument("--sector", default="mutual-funds", help="sector directory under /sectors/")
    ap.add_argument("--sector-name", help="display name (defaults to the sector, title-cased)")
    ap.add_argument("--date", help="publication date, YYYY-MM-DD (defaults to the feed's)")
    ap.add_argument("--deck", help="subtitle (defaults to the post's first bold line)")
    ap.add_argument("--dry-run", action="store_true", help="report what would be written")
    args = ap.parse_args()

    found = list(posts(fetch_feed()))
    if args.list:
        for p in found:
            print(f"{p['date'][:16]}  {p['slug']}\n{'':18}{p['title']}")
        return
    if not args.slug:
        ap.error("--slug is required (use --list to see what's in the feed)")

    post = next((p for p in found if p["slug"] == args.slug), None)
    if post is None:
        sys.exit(f"error: {args.slug!r} is not in the feed. Available:\n  " +
                 "\n  ".join(p["slug"] for p in found))

    import email.utils, datetime
    feed_dt = datetime.datetime(*email.utils.parsedate(post["date"])[:6])
    date_iso = args.date or feed_dt.strftime("%Y-%m-%d")
    date_human = datetime.datetime.strptime(date_iso, "%Y-%m-%d").strftime("%B %-d, %Y")
    deck = args.deck or post["title"]
    sector_name = args.sector_name or args.sector.replace("-", " ").title()

    page, stats = build(post, args.sector, sector_name, date_iso, date_human, deck)
    out = SITE / "sectors" / args.sector / post["slug"] / "index.html"

    print(f"{post['title']}\n  -> {out.relative_to(SITE)}")
    print(f"  {stats['words']} words, {stats['headings']} headings, {stats['images']} images, "
          f"published {date_human}")
    if args.dry_run:
        print("  (dry run — nothing written)")
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page)
    print("  written\n")
    print(CHECKLIST)


CHECKLIST = """Still to do by hand:
  1. sectors/<sector>/index.html   — add the article card
  2. sectors/index.html            — bump the sector's count and 'Updated' date
  3. index.html                    — bump the count on the homepage card
  4. every page footer             — bump 'N publications and counting'
  5. feed.xml                      — prepend an <item> (newest first)
  6. sitemap.xml                   — add a <url> with <lastmod>
  7. llms.txt                      — refresh the sector's one-line summary
  8. new sector only               — add assets/og/og-<sector>.png, else the
                                     page falls back to og-default.png
Then check the page renders: headings intact, images load, no Substack chrome."""


if __name__ == "__main__":
    main()
