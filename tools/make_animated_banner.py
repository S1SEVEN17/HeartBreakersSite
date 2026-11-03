#!/usr/bin/env python3
"""
Animated 400x100 faction banner ("Heartbeat" concept).

Built from the v2 template art (art/src/template_v2.png):
  * the chained heart (left), feathered into the background
  * the HEART / BREAKERS lettering lifted off its background and set on one line
  * tagline in the banner font (Rajdhani)
  * a red ECG trace sweeping under the title; each time the trace's spike
    passes, the heart "beats" (glow + slight scale-up)
  * faint red grid + occasional lightning flicker in the background

Everything is drawn at 2x (800x200) and downsampled per frame for smooth
edges, then written as a looping GIF with one shared palette (keeps the file
small - Torn's limit for faction images is 500 KB).

    python tools/make_animated_banner.py            -> out/heartbreakers_banner.gif
    python tools/make_animated_banner.py --frames   -> also writes PNG frames
"""
import argparse
import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "src" / "template_v2.png"
FONT = ROOT / "fonts" / "Rajdhani-Bold.ttf"
OUT = ROOT / "out"

W, H = 400, 100          # final size (matches the old banner)
S = 2                    # supersampling factor
CW, CH = W * S, H * S

TAGLINE = "WE BREAK MORE THAN HEARTS"
FRAMES = 30              # 30 frames x 60 ms = 1.8 s loop
FRAME_MS = 60

RED = (232, 46, 38)
DARK = (9, 6, 7)


# --------------------------------------------------------------------------
# Static layers
# --------------------------------------------------------------------------
def background() -> Image.Image:
    """Near-black panel with a faint red grid and a soft red vignette."""
    bg = Image.new("RGB", (CW, CH), DARK)
    d = ImageDraw.Draw(bg)
    for x in range(0, CW, 24):
        d.line([(x, 0), (x, CH)], fill=(34, 10, 10))
    for y in range(0, CH, 24):
        d.line([(0, y), (CW, y)], fill=(34, 10, 10))
    # red haze behind the title area
    haze = Image.new("L", (CW, CH), 0)
    ImageDraw.Draw(haze).ellipse([180, -40, 820, 240], fill=70)
    haze = haze.filter(ImageFilter.GaussianBlur(60))
    bg = Image.composite(Image.new("RGB", (CW, CH), (70, 12, 12)), bg, haze)
    # thin outer border
    ImageDraw.Draw(bg).rectangle([0, 0, CW - 1, CH - 1], outline=(110, 24, 22), width=2)
    return bg


def heart_layer(tpl: Image.Image) -> Image.Image:
    """Chained heart cropped from the header with its circuitry, feathered
    so it dissolves into the banner background."""
    crop = tpl.crop((40, 8, 252, 236)).convert("RGBA")
    h = CH - 8
    crop = crop.resize((int(crop.width * h / crop.height), h), Image.LANCZOS)
    m = Image.new("L", crop.size, 0)
    ImageDraw.Draw(m).ellipse([22, 14, crop.width - 26, crop.height - 14], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(22))
    crop.putalpha(m)
    return crop


def lettering(tpl: Image.Image, box) -> Image.Image:
    """Lift lettering off the dark template background: alpha from how far
    each pixel is above the background darkness."""
    # Background is ~15-22 with red circuit glows up to ~55 in the red
    # channel; the letters are 100+. Brightest channel, threshold ~60.
    c = tpl.crop(box).convert("RGB")
    r, g, b = c.split()
    mx = ImageChops.lighter(ImageChops.lighter(r, g), b)
    a = mx.point(lambda v: max(0, min(255, (v - 62) * 5)))
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    out = c.convert("RGBA")
    out.putalpha(a)
    return out


def title_layer(tpl: Image.Image) -> Image.Image:
    heart = lettering(tpl, (254, 17, 500, 101))
    breakers = lettering(tpl, (254, 101, 608, 182))
    gap = 18
    w = heart.width + gap + breakers.width
    h = max(heart.height, breakers.height)
    t = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    t.alpha_composite(heart, (0, (h - heart.height) // 2))
    t.alpha_composite(breakers, (heart.width + gap, (h - breakers.height) // 2))
    target_w = 560
    return t.resize((target_w, int(h * target_w / w)), Image.LANCZOS)


def tagline_layer() -> Image.Image:
    f = ImageFont.truetype(str(FONT), 30)
    track = 5
    widths = [f.getlength(ch) for ch in TAGLINE]
    tw = int(sum(widths) + track * (len(TAGLINE) - 1)) + 8
    img = Image.new("RGBA", (tw, 44), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x = 4
    for ch, wch in zip(TAGLINE, widths):
        d.text((x + 2, 34), ch, font=f, fill=(0, 0, 0, 255), anchor="ls")
        d.text((x, 32), ch, font=f, fill=RED + (255,), anchor="ls")
        x += wch + track
    return img


def lightning_layer(tpl: Image.Image) -> Image.Image:
    """The red lightning from a section title bar, as a faint overlay."""
    c = tpl.crop((345, 536, 625, 580)).convert("RGB")
    r, g, b = c.split()
    a = ImageChops.subtract(r, g).point(lambda v: max(0, min(255, (v - 40) * 3)))
    out = c.convert("RGBA")
    out.putalpha(a)
    return out.resize((560, 88), Image.LANCZOS)


# --------------------------------------------------------------------------
# Animation
# --------------------------------------------------------------------------
def ecg_y(u: float) -> float:
    """ECG shape over one period u in [0,1): flat, small P, sharp QRS, T."""
    def bump(c, w, a):
        return a * math.exp(-((u - c) / w) ** 2)
    y = bump(0.18, 0.03, -5)          # P wave
    y += bump(0.30, 0.010, 6)         # Q
    y += bump(0.33, 0.012, -26)       # R spike (up = negative y)
    y += bump(0.36, 0.012, 11)        # S
    y += bump(0.55, 0.05, -7)         # T wave
    return y


def beat_envelope(t: float) -> float:
    """0..1 heart-glow strength over the loop: a 'lub-dub' double beat."""
    def pulse(c, w):
        d = min(abs(t - c), 1 - abs(t - c))
        return math.exp(-(d / w) ** 2)
    return min(1.0, pulse(0.33, 0.05) + 0.6 * pulse(0.45, 0.05))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", action="store_true", help="also save PNG frames")
    args = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    random.seed(7)

    tpl = Image.open(SRC).convert("RGBA")
    bg = background()
    heart = heart_layer(tpl)
    title = title_layer(tpl)
    tag = tagline_layer()
    bolt = lightning_layer(tpl)

    title_xy = (214, 14)
    tag_xy = (214 + (title.width - tag.width) // 2, 98)
    ecg_x0, ecg_x1, ecg_base = 214, CW - 16, 176
    heart_c = (14 + heart.width // 2, CH // 2)

    # lightning flicker: on for a couple of frames at irregular times
    flicker = {4: 0.55, 5: 0.25, 17: 0.4, 23: 0.65, 24: 0.3}

    frames = []
    for i in range(FRAMES):
        t = i / FRAMES
        beat = beat_envelope(t)
        fr = bg.copy().convert("RGBA")

        if i in flicker:
            b = bolt.copy()
            b.putalpha(b.getchannel("A").point(lambda v: int(v * flicker[i])))
            fr.alpha_composite(b, (214, 0))

        # heart: red glow + slight scale-up on the beat
        glow = Image.new("L", (CW, CH), 0)
        r = 70 + 22 * beat
        ImageDraw.Draw(glow).ellipse([heart_c[0] - r, heart_c[1] - r * 0.9,
                                      heart_c[0] + r, heart_c[1] + r * 0.9],
                                     fill=int(60 + 150 * beat))
        glow = glow.filter(ImageFilter.GaussianBlur(26))
        fr.alpha_composite(Image.merge("RGBA", [Image.new("L", (CW, CH), c) for c in RED] + [glow]))
        sc = 1.0 + 0.05 * beat
        hh = heart.resize((int(heart.width * sc), int(heart.height * sc)), Image.LANCZOS)
        fr.alpha_composite(hh, (heart_c[0] - hh.width // 2, heart_c[1] - hh.height // 2))

        # title (+ a faint glow that brightens on the beat)
        tg = title.getchannel("A").filter(ImageFilter.GaussianBlur(8)).point(lambda v: int(v * (0.25 + 0.35 * beat)))
        glow_l = Image.merge("RGBA", [Image.new("L", title.size, c) for c in RED] + [tg])
        fr.alpha_composite(glow_l, title_xy)
        fr.alpha_composite(title, title_xy)
        fr.alpha_composite(tag, tag_xy)

        # ECG trace: one full period across the width, scrolling so the spike
        # reaches the middle on the beat; bright head + fading tail.
        d = ImageDraw.Draw(fr)
        head = ecg_x0 + (ecg_x1 - ecg_x0) * t
        pts = []
        for x in range(ecg_x0, ecg_x1 + 1, 2):
            u = ((x - ecg_x0) / (ecg_x1 - ecg_x0))
            pts.append((x, ecg_base + ecg_y(u)))
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            behind = head - x1
            if behind < 0:
                behind += (ecg_x1 - ecg_x0)      # wrap: older part of the trace
            fade = max(0.0, 1 - behind / (ecg_x1 - ecg_x0) * 1.15)
            if fade <= 0.02:
                continue
            col = (int(70 + 185 * fade), int(14 + 40 * fade * fade), int(12 + 30 * fade * fade))
            d.line([(x0, y0), (x1, y1)], fill=col, width=3)
        hy = ecg_base + ecg_y((head - ecg_x0) / (ecg_x1 - ecg_x0))
        dot = Image.new("L", (CW, CH), 0)
        ImageDraw.Draw(dot).ellipse([head - 9, hy - 9, head + 9, hy + 9], fill=255)
        dot = dot.filter(ImageFilter.GaussianBlur(5))
        fr.alpha_composite(Image.merge("RGBA", [Image.new("L", (CW, CH), 255),
                                                Image.new("L", (CW, CH), 120),
                                                Image.new("L", (CW, CH), 100), dot]))

        small = fr.convert("RGB").resize((W, H), Image.LANCZOS)
        frames.append(small)
        if args.frames:
            small.save(OUT / f"frame_{i:02d}.png")

    # One shared adaptive palette from a few representative frames keeps
    # colours stable between frames (no shimmer) and the file small.
    strip = Image.new("RGB", (W, H * 4))
    for k, idx in enumerate((0, 6, 10, 20)):
        strip.paste(frames[idx], (0, H * k))
    pal = strip.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
    path = OUT / "heartbreakers_banner.gif"
    q[0].save(path, save_all=True, append_images=q[1:], duration=FRAME_MS, loop=0,
              optimize=True, disposal=1)
    print(f"{path}  {path.stat().st_size / 1024:.0f} KB, {len(q)} frames, {W}x{H}")


if __name__ == "__main__":
    main()
