# Vatayan Labs — vatayanlabs.com

Static site, no build step. Deployed by Vercel on push to `main`.
Design tokens live in `assets/site.css` (navy `#0f172a`, blue `#1d4ed8`,
teal `#0891b2`, bg `#f1f5f9`, Inter, light-only — there is no dark mode).

## Every new page needs a link-preview block

A page without one shows a bare URL when it is shared, which is how most
of this site's traffic arrives. This is not optional polish.

```bash
python3 scripts/check_og.py --template dashboards/my-page/index.html
```

That prints the block to paste. Fill in the title, description and image,
then verify the whole site:

```bash
python3 scripts/check_og.py
```

It exits non-zero if any page is incomplete. Run it before pushing a new page.

Three rules the checker enforces, each of which has broken a preview before:

- **`og:image:width` and `og:image:height` are mandatory.** WhatsApp will not
  download an image to measure it, and shows no thumbnail without them.
- **The block goes at the top of `<head>`**, above the gtag/Clarity scripts
  and any inline `<style>`. Crawlers read only the first few KB, and
  `<meta charset>` must land inside the first 1024 bytes.
- **Exactly one `<title>`.** A second one wins in parsers that take the last
  match, silently replacing the shared headline.

### Preview images

1200x630 PNG in `assets/og/`, generated so they match as a set:

```bash
python3 scripts/make_og.py og-my-page.png
```

Add the card to `CARDS` in `scripts/make_og.py` first. Passing a name builds
only that card — with no arguments it rebuilds all of them, which rewrites
cards that were fine.

### Testing a preview

WhatsApp Web and WhatsApp on the phone build and cache previews separately.
**A card can be live on the phone while Web still shows a bare URL** — this
cost an afternoon in Sept 2026. Trust the phone. WhatsApp also caches per
URL, so add `?v=2` to force a fresh fetch while testing.

## Deploying

Push to `main`; Vercel publishes in under a minute. Confirm the local tree
matches live before pushing — other snapshots of this site exist on disk
and some are stale.
