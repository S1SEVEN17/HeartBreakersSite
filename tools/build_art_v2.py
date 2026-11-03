#!/usr/bin/env python3
"""
Art slicer for the v2 (red circuit) theme.

Cuts art/src/template_v2.png (649x1024, the Gemini mock-up) into the pieces
the renderer stacks, erasing placeholder text with column-tiling / inpaint,
and lifting reusable icons (hexes, requirement icons, perk-row plates).
Re-run only when the template changes:

    pip install opencv-python-headless pillow numpy
    python tools/build_art_v2.py

All boxes are in the template's 1x pixel coordinates (measured on gridded
zooms) and the output is upscaled by SCALE=2 to match the 2x canvas.

Pieces written to art/pieces_v2/:
    header.png       rows 0-300: logo, title, respect plate, heart emblem AND
                     the first section's title bar (they overlap in the art)
    section_top.png  a later section's title bar (Requirements bar)
    side_l/side_r    tileable left/right frame columns (any body height)
    req_body.png     Requirements row: 3 plates + label plates (icons erased)
    button.png       red JOIN TODAY plate (text erased)
    top_band.png     top frame edge + corner plates (flipped -> bottom frame)
    hex_empty.png    empty hex tile (icon erased)
    hex_<name>.png   hex tiles with their template icons (flask, gears, map,
                     lock, atom)
    icon_plate.png   small red icon plate (perk row), icon erased
    chevron.png      grey chevron name plate (perk row), text erased
    bar.png          long dark details bar (perk row), text erased
Icons written to art/icons/:
    art2-shield / art2-swords / art2-cat   (requirement icons, lifted)
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "src" / "template_v2.png"
OUT = ROOT / "art" / "pieces_v2"
ICONS = ROOT / "art" / "icons"
SCALE = 2

# ---- 1x boxes -------------------------------------------------------------
HEADER = (0, 0, 649, 300)
HDR_TITLE_TEXT = (60, 258, 302, 293)     # "WHAT WE OFFER" on the header's bar
HDR_TITLE_DONOR = (303, 330)              # clean bar columns right of it
RESPECT_TEXT = (300, 226, 440, 249)      # "3,583 / 13,000" inside the bar
RESPECT_DONOR = (440, 490)
SEC_TOP = (0, 530, 649, 581)
SEC_TITLE_TEXT = (60, 538, 272, 578)     # "REQUIREMENTS"
SEC_TITLE_DONOR = (272, 300)
SIDE_ROWS = (590, 660)                    # rows where the side frame is plain
SIDE_L = (0, 26)
SIDE_R = (623, 649)
REQ_BODY = (0, 585, 649, 695)
REQ_ICONS = [(93, 588, 165, 650), (283, 588, 357, 650), (470, 588, 532, 650)]
REQ_LABELS = [(62, 660, 196, 690), (250, 660, 394, 690), (434, 660, 576, 690)]
BUTTON = (176, 466, 476, 523)
BUTTON_TEXT = (232, 481, 418, 514)
TOP_BAND = (0, 0, 649, 12)
CORNER_L = (0, 0, 44, 52)
ICON_PLATE = (44, 744, 120, 781)
CHEVRON = (110, 744, 281, 781)
BAR = (268, 743, 607, 783)
HEX_Y = (913, 1021)
HEX_X = [(14, 101), (120, 207), (226, 313), (332, 419), (438, 525), (544, 631)]
HEX_NAMES = ["flask", "gears", "map", "lock", "atom", None]


def load():
    im = cv2.imread(str(SRC), cv2.IMREAD_UNCHANGED)
    if im.shape[2] == 4:
        im = cv2.cvtColor(im, cv2.COLOR_BGRA2BGR)
    return im


def crop(img, b):
    x0, y0, x1, y1 = b
    return img[y0:y1, x0:x1].copy()


def to_pil(img):
    return Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))


def up(pil):
    return pil.resize((pil.width * SCALE, pil.height * SCALE), Image.LANCZOS)


def save(pil, name):
    up(pil).save(OUT / f"{name}.png", optimize=True)
    print(f"  {name}: {pil.width * SCALE}x{pil.height * SCALE}")


def fill_columns(img, box, sx0, sx1):
    """Tile clean columns [sx0,sx1) of the same rows across box (mirrored)."""
    x0, y0, x1, y1 = box
    src = img[y0:y1, sx0:sx1]
    out, x, flip = img.copy(), x0, False
    while x < x1:
        p = src[:, ::-1] if flip else src
        w = min(p.shape[1], x1 - x)
        out[y0:y1, x:x + w] = p[:, :w]
        x, flip = x + w, not flip
    return out


def inpaint_mask(img, box, mask_fn, grow=2, radius=4):
    x0, y0, x1, y1 = box
    roi = img[y0:y1, x0:x1].astype(np.int16)
    m = mask_fn(roi).astype(np.uint8) * 255
    m = cv2.dilate(m, np.ones((3, 3), np.uint8), iterations=grow)
    full = np.zeros(img.shape[:2], np.uint8)
    full[y0:y1, x0:x1] = m
    return cv2.inpaint(img, full, radius, cv2.INPAINT_TELEA)


def light_grey(roi):
    """Grey/white glyphs: bright and low saturation."""
    mx, mn = roi.max(axis=2), roi.min(axis=2)
    return (mx > 95) & (mx - mn < 60)


def not_red(roi):
    """On a red plate: anything not clearly red (glyph + its dark shadow)."""
    r, g = roi[..., 2], roi[..., 1]
    return (r - g) < 45


def lift_icon(orig, clean, box, name):
    """Icon = difference between the original and the icon-erased plate.
    Alpha from that difference, colour from the original pixels."""
    o = crop(orig, box).astype(np.float32)
    c = crop(clean, box).astype(np.float32)
    diff = np.abs(o - c).max(axis=2)
    a = np.clip((diff - 8) / 40, 0, 1)
    rgb = cv2.cvtColor(o.astype(np.uint8), cv2.COLOR_BGR2RGB)
    im = Image.fromarray(np.dstack([rgb, (a * 255).astype(np.uint8)]), "RGBA")
    up(im).save(ICONS / f"{name}.png", optimize=True)
    print(f"  icon {name}")


def poly_mask(size, pts, feather=0.8):
    w, h = size
    S = 4
    m = Image.new("L", (w * S, h * S), 0)
    ImageDraw.Draw(m).polygon([(x * S, y * S) for x, y in pts], fill=255)
    m = m.resize((w, h), Image.LANCZOS)
    return m.filter(ImageFilter.GaussianBlur(feather)) if feather else m


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    img = load()
    print("pieces:")

    # Header: erase first section title + respect value (renderer redraws).
    h = fill_columns(img, HDR_TITLE_TEXT, *HDR_TITLE_DONOR)
    h = fill_columns(h, RESPECT_TEXT, *RESPECT_DONOR)
    save(to_pil(crop(h, HEADER)), "header")

    # Later section title bar.
    t = fill_columns(img, SEC_TITLE_TEXT, *SEC_TITLE_DONOR)
    save(to_pil(crop(t, SEC_TOP)), "section_top")

    # Side frame columns for bodies of any height.
    save(to_pil(crop(img, (SIDE_L[0], SIDE_ROWS[0], SIDE_L[1], SIDE_ROWS[1]))), "side_l")
    save(to_pil(crop(img, (SIDE_R[0], SIDE_ROWS[0], SIDE_R[1], SIDE_ROWS[1]))), "side_r")

    # Requirements row: labels erased; icons lifted then erased.
    r = img.copy()
    for b in REQ_LABELS:
        r = inpaint_mask(r, b, light_grey, grow=2, radius=5)
    clean = r.copy()
    for b in REQ_ICONS:
        clean = inpaint_mask(clean, b, lambda roi: np.ones(roi.shape[:2], bool), grow=0, radius=9)
    for b, n in zip(REQ_ICONS, ("art2-shield", "art2-swords", "art2-cat")):
        lift_icon(r, clean, b, n)
    save(to_pil(crop(clean, REQ_BODY)), "req_body")

    # Button plate.
    bt = inpaint_mask(img, BUTTON_TEXT, not_red, grow=2, radius=4)
    b = to_pil(crop(bt, BUTTON)).convert("RGBA")
    w_, h_ = b.size
    c = 11
    b.putalpha(poly_mask(b.size, [(c, 0), (w_ - c, 0), (w_, c), (w_, h_ - c), (w_ - c, h_),
                                  (c, h_), (0, h_ - c), (0, c)]))
    save(b, "button")

    # Top frame band + left corner plate (renderer flips them for the bottom).
    save(to_pil(crop(img, TOP_BAND)), "top_band")
    cl = to_pil(crop(img, CORNER_L)).convert("RGBA")
    # keep only the metal plate: drop the dark/red interior pixels
    a = np.asarray(cl.convert("L")).astype(np.float32)
    cl.putalpha(Image.fromarray(np.clip((a - 25) * 6, 0, 255).astype(np.uint8)))
    save(cl, "corner_l")

    # Perk-row parts.
    ip = inpaint_mask(img, (58, 748, 106, 779), lambda roi: (roi.max(axis=2) > 150) |
                      (roi[..., 2] - roi[..., 1] > 70), grow=2, radius=6)
    # Cut the plate out along its silver border (measured on a 10x zoom):
    # chamfered left corners, flat top/bottom, arrow tip on the right. This
    # drops the black surround and the start of the next chevron.
    pl = to_pil(crop(ip, ICON_PLATE)).convert("RGBA")
    ox, oy = ICON_PLATE[0], ICON_PLATE[1]
    outline = [(52.5, 744.8), (108.2, 744.8), (118.6, 762.0), (108.2, 779.7), (52.5, 779.7),
               (44.3, 772.0), (44.3, 752.0)]
    pl.putalpha(poly_mask(pl.size, [(x - ox, y - oy) for x, y in outline], feather=0.35))
    save(pl, "icon_plate")
    ch = fill_columns(img, (130, 750, 248, 778), 248, 262)
    # Cut the chevron plate along its silver border: notched (concave) left
    # end where the icon plate's arrow sits, arrow tip on the right. Drops the
    # black surround and the start of the details bar.
    cp = to_pil(crop(ch, CHEVRON)).convert("RGBA")
    ox, oy = CHEVRON[0], CHEVRON[1]
    # Edges measured from pixel rows/columns of the template: silver top edge
    # starts at y=745 (744 is black), bottom edge ends at y=779; the plate's
    # own silver arrow runs from the top corner x~268.6 to its tip at x~279.6
    # (row 762), with black at 280-282 before the next bar's notch at ~283.
    outline = [(111.6, 745.3), (268.6, 745.3), (279.6, 762.0), (268.6, 779.7), (111.6, 779.7),
               (120.8, 762.0)]
    cp.putalpha(poly_mask(cp.size, [(x - ox, y - oy) for x, y in outline], feather=0.35))
    save(cp, "chevron")
    br = fill_columns(img, (288, 750, 450, 778), 450, 520)
    save(to_pil(crop(br, BAR)), "bar")

    # Hex tiles (pointy-top hexagon mask drops the off-template background).
    y0, y1 = HEX_Y
    for (x0, x1), name in zip(HEX_X, HEX_NAMES):
        tile = to_pil(crop(img, (x0, y0, x1, y1))).convert("RGBA")
        w_, h_ = tile.size
        pts = [(w_ / 2, 0), (w_, h_ * 0.25), (w_, h_ * 0.75), (w_ / 2, h_), (0, h_ * 0.75), (0, h_ * 0.25)]
        tile.putalpha(poly_mask(tile.size, pts))
        if name:
            save(tile, f"hex_{name}")
    # Empty hex: flask hex with the icon area inpainted.
    x0, x1 = HEX_X[0]
    e = inpaint_mask(img, (x0 + 22, y0 + 24, x1 - 22, y1 - 22),
                     lambda roi: np.ones(roi.shape[:2], bool), grow=0, radius=9)
    tile = to_pil(crop(e, (x0, y0, x1, y1))).convert("RGBA")
    w_, h_ = tile.size
    pts = [(w_ / 2, 0), (w_, h_ * 0.25), (w_, h_ * 0.75), (w_ / 2, h_), (0, h_ * 0.75), (0, h_ * 0.25)]
    tile.putalpha(poly_mask(tile.size, pts))
    save(tile, "hex_empty")


if __name__ == "__main__":
    main()
