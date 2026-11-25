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

Eleven cards in `assets/og/` predate `CARDS` and have no recipe there
(`og-ai`, `og-capital-markets`, `og-dashboards`, `og-default`, `og-defence`,
`og-gold`, `og-microfinance`, `og-mutual-funds`, `og-newsletter`,
`og-powering-ai`, `og-sectors`). `make_og.py` cannot rebuild them, so a change
to the shared logo has to be composited onto them separately — the badge sits
at (80, 72) at 96px, inside a 2px white frame. Worth adding their wording to
`CARDS` next time one of them needs editing.

### Testing a preview

WhatsApp Web and WhatsApp on the phone build and cache previews separately.
**A card can be live on the phone while Web still shows a bare URL** — this
cost an afternoon in Sept 2026. Trust the phone. WhatsApp also caches per
URL, so add `?v=2` to force a fresh fetch while testing.

## Deploying

Push to `main`; Vercel publishes in under a minute. Confirm the local tree
matches live before pushing — other snapshots of this site exist on disk
and some are stale.

**Check that the push actually deployed.** On 25 Nov 2026 one push
(`8e2ea63`) produced no deployment at all — no Vercel check on the commit, no
GitHub Deployment, nothing in `vercel ls` — while the pushes before and after
it deployed normally in about ten seconds. A single webhook event was dropped;
the integration was not broken and needed no repair. The next push carried the
missing work with it, since it was a descendant.

**Do not use `last-modified` to check this.** On these static files it tracks
when the edge cache filled, not when the build ran, so it moves on its own and
looks like a fresh deploy when nothing has shipped. Ask GitHub what Vercel
reported for the commit:

```bash
curl -s "https://api.github.com/repos/manujha665/vatayanlabs-website/commits/$(git rev-parse HEAD)/status" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['state'],[x['context'] for x in d['statuses']])"
```

`success ['Vercel – vatayan-labs', 'Vercel – vatayanlabs']` means it shipped.
`pending []` means Vercel never saw the push. Re-trigger it with an empty
commit rather than reaching for the CLI:

```bash
git commit --allow-empty -m "redeploy" && git push
```

The CLI fallback is a deploy from this directory, linked to the `vatayan-labs`
project via `.vercel/repo.json`:

```bash
vercel deploy --prod --yes
```

It ships the working tree rather than the commit, so commit first and check
`git status` is clean. Note that the next Git deployment takes the production
alias straight back, so a CLI deploy is a stopgap, not a way to pin anything.

## Two Vercel projects watch this repo

Every push deploys twice: `vatayan-labs`, which serves vatayanlabs.com, and
`vatayanlabs`, which serves vatayanlabs.vercel.app. That is why each commit
carries two Vercel checks. `vercel ls` from this directory shows only
`vatayan-labs`, the one that matters.
