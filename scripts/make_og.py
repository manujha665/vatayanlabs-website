#!/usr/bin/env python3
"""Vatayan Labs — OG card generator.

Reproduces the 1200x630 branded cards in assets/og/. The palette and geometry
below were measured off the existing og-default.png so new cards drop straight
into the set without a visible seam.

    python3 scripts/make_og.py            # regenerate the cards defined below
    python3 scripts/make_og.py --check    # report drift vs og-default.png
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = os.path.join(ROOT, 'assets', 'og')
BADGE = os.path.join(ROOT, 'assets', 'logo-badge.png')

W, H = 1200, 630

# measured off og-default.png
NAVY      = (15, 23, 42)      # #0f172a
NAVY_MID  = (30, 58, 95)      # #1e3a5f  at 60% along the diagonal
BLUE      = (30, 64, 175)     # #1e40af
CYAN      = (103, 232, 249)   # #67e8f9  kicker
WHITE     = (255, 255, 255)
SLATE     = (203, 213, 225)   # #cbd5e1  subtitle
LIGHTBLUE = (147, 197, 253)   # #93c5fd  tagline + url

MARGIN     = 84
BADGE_XY   = (80, 72)
BADGE_SIZE = 96
BRAND_X    = 196

F = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
R = '/System/Library/Fonts/Supplemental/Arial.ttf'

def font(path, size):
    return ImageFont.truetype(path, size)

def gradient():
    """135deg linear gradient: #0f172a 0% -> #1e3a5f 60% -> #1e40af 100%,
    projected along the top-left to bottom-right diagonal."""
    img = Image.new('RGB', (W, H))
    px = img.load()
    for y in range(H):
        for x in range(W):
            t = (x / (W - 1) + y / (H - 1)) / 2
            if t <= 0.6:
                k = t / 0.6
                c = tuple(int(NAVY[i] + (NAVY_MID[i] - NAVY[i]) * k) for i in range(3))
            else:
                k = (t - 0.6) / 0.4
                c = tuple(int(NAVY_MID[i] + (BLUE[i] - NAVY_MID[i]) * k) for i in range(3))
            px[x, y] = c
    return img

def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ''
    for w in words:
        trial = (cur + ' ' + w).strip()
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines

def balance(draw, text, fnt, max_w):
    """Greedy wrapping leaves an orphan on the last line ("difference?" alone).
    For a two-line headline, pick the split that makes the lines most even."""
    lines = wrap(draw, text, fnt, max_w)
    if len(lines) != 2:
        return lines
    words = text.split()
    best, best_score = lines, None
    for i in range(1, len(words)):
        a, b = ' '.join(words[:i]), ' '.join(words[i:])
        wa, wb = draw.textlength(a, font=fnt), draw.textlength(b, font=fnt)
        if wa > max_w or wb > max_w:
            continue
        score = abs(wa - wb)
        if best_score is None or score < best_score:
            best, best_score = [a, b], score
    return best

def card(path, kicker, headline, subtitle, url='vatayanlabs.com'):
    img = gradient()
    d = ImageDraw.Draw(img)

    # logo badge, with the thin white frame the existing cards use
    if os.path.exists(BADGE):
        badge = Image.open(BADGE).convert('RGBA').resize((BADGE_SIZE, BADGE_SIZE), Image.LANCZOS)
        d.rectangle([BADGE_XY[0] - 2, BADGE_XY[1] - 2,
                     BADGE_XY[0] + BADGE_SIZE + 1, BADGE_XY[1] + BADGE_SIZE + 1], fill=WHITE)
        img.paste(badge, BADGE_XY, badge)

    d.text((BRAND_X, 86),  'Vatayan Labs', font=font(F, 42), fill=WHITE)
    d.text((BRAND_X, 133), 'A window into how India moves money', font=font(R, 20), fill=LIGHTBLUE)

    # headline: shrink until it fits two lines, then allow three
    maxw = W - MARGIN - 96
    for size in (60, 56, 52, 48, 44):
        hf = font(F, size)
        lines = balance(d, headline, hf, maxw)
        if len(lines) <= 2: break
    if len(lines) > 3: lines = lines[:3]
    lh = int(size * 1.30)

    sf = font(R, 24)
    subs = balance(d, subtitle, sf, 1000)[:2]

    # Centre the kicker + headline + subtitle block in the band between the
    # masthead and the URL, so a one-line headline does not leave a dead gap.
    KICK_H, KICK_GAP, SUB_GAP, SUB_LH = 24, 30, 26, 38
    block = KICK_H + KICK_GAP + lh * len(lines) + SUB_GAP + SUB_LH * len(subs)
    TOP, BOT = 232, 548
    y = TOP + max(0, (BOT - TOP - block)) // 2

    # kicker — Arial has no letter-spacing, so space it out by hand
    kf = font(F, 23)
    x = MARGIN
    for ch in kicker.upper():
        d.text((x, y), ch, font=kf, fill=CYAN)
        x += d.textlength(ch, font=kf) + 2.2
    y += KICK_H + KICK_GAP

    for ln in lines:
        d.text((MARGIN, y), ln, font=hf, fill=WHITE)
        y += lh
    y += SUB_GAP - 12

    for ln in subs:
        d.text((MARGIN, y), ln, font=sf, fill=SLATE)
        y += SUB_LH

    d.text((MARGIN, 568), url, font=font(F, 24), fill=LIGHTBLUE)

    img.save(path, 'PNG', optimize=True)
    return path

CARDS = [
    ('og-tools.png', 'Tools',
     'Calculators that show their working',
     'Every assumption visible and editable. Every cost counted on both sides of the comparison.'),
    ('og-buy-vs-invest.png', 'Free calculator',
     'Buy the flat, or rent and invest the difference?',
     'Both choices held to the identical rupee. Stamp duty, home-loan relief, rental tax and capital gains on both sides.'),
    ('og-retirement.png', 'Free calculator',
     'Retirement is not the first bill that arrives',
     'A house, a car, school fees and a wedding all land first. EPF, NPS and your SIPs, with every goal at its real future cost.'),
]

if __name__ == '__main__':
    if '--check' in sys.argv:
        ref = Image.open(os.path.join(OUT, 'og-default.png')).convert('RGB')
        g = gradient()
        worst = max(max(abs(a - b) for a, b in zip(ref.getpixel(p), g.getpixel(p)))
                    for p in [(2, 2), (600, 315), (1197, 627), (2, 627), (1197, 2)])
        print('max gradient channel drift vs og-default.png: %d/255' % worst)
        sys.exit(0)
    for name, kicker, head, sub in CARDS:
        p = card(os.path.join(OUT, name), kicker, head, sub)
        print('wrote', os.path.relpath(p, ROOT), '%d bytes' % os.path.getsize(p))
