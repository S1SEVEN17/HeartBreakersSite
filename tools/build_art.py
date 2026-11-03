#!/usr/bin/env python3
"""
One-time art slicer.

Cuts the text-free template (art/src/template.jpg, 649x1024) into the reusable
pieces the renderer stacks and stretches, erasing the placeholder text/icons
with OpenCV inpainting. Re-run this only when the template art changes:

    pip install opencv-python-headless pillow numpy
    python tools/build_art.py

Everything is cut in the template's own 1x pixel coordinates (measured off a
gridded zoom of the template) and then upscaled by SCALE so the renderer works
on a 2x canvas -> sharp text on phones/high-DPI screens.

Output: art/pieces/*.png  (+ art/icons/art-*.png for the three template icons)

If a NEW template is generated later, only the BOX coordinates below need
re-measuring; the renderer reads piece sizes from the files themselves.
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "src" / "template.jpg"
OUT = ROOT / "art" / "pieces"
ICONS = ROOT / "art" / "icons"
SCALE = 2

# ---- 1x coordinates in template.jpg (x0, y0, x1, y1) ----------------------
HEADER = (0, 0, 649, 250)            # logo + title + respect line + header rail
RESPECT_TEXT = (298, 203, 553, 237)  # "Respect Level: (Value)" -> erased
SEC_TOP = (0, 250, 649, 300)         # section title bar (What We Offer's)
SEC_TITLE_TEXT = (62, 257, 310, 292) # "WHAT WE OFFER" -> erased
SEC_BODY = (0, 300, 649, 470)        # plain body band, tiled vertically
SEC_END = (0, 500, 649, 530)         # section bottom edge + gap to next bar
FINAL_END = (0, 790, 649, 850)       # banner bottom frame
REQ_BODY = (0, 575, 649, 690)        # Requirements row: 3 slots, pills, dividers
REQ_ICONS = [(94, 574, 167, 653), (288, 578, 360, 646), (474, 578, 534, 648)]
# Erase areas (icon boxes grown so the feathered edge clears them) and, per
# slot, a clean donor column-run in the same rows used to cover them.
REQ_ERASE = [(86, 568, 175, 652), (280, 572, 368, 652), (464, 572, 544, 652)]
REQ_DONOR = [(34, 84), (232, 278), (552, 608)]
BUTTON = (176, 469, 475, 521)        # red "JOIN TODAY!" plate
BUTTON_TEXT = (228, 477, 422, 513)
PERK_TILE = (481, 890, 611, 1006)    # empty octagonal tile with pill
PERK_TILE_Q = (524, 908, 568, 962)   # the "?" -> erased


def load():
    return cv2.imread(str(SRC), cv2.IMREAD_COLOR)


def inpaint_text(img, box, thresh=70, grow=3):
    """Erase light (or red) glyphs inside box: mask = pixels clearly brighter
    than the dark background, dilated, then Telea inpaint."""
    x0, y0, x1, y1 = box
    roi = img[y0:y1, x0:x1]
    mx = roi.max(axis=2)
    mask = (mx > thresh).astype(np.uint8) * 255
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=grow)
    full = np.zeros(img.shape[:2], np.uint8)
    full[y0:y1, x0:x1] = mask
    return cv2.inpaint(img, full, 5, cv2.INPAINT_TELEA)


def fill_columns(img, box, src_x0, src_x1):
    """Rebuild a horizontally-uniform strip (the title bar) by tiling a clean
    run of columns across box, mirroring every other copy so seams match."""
    x0, y0, x1, y1 = box
    src = img[y0:y1, src_x0:src_x1]
    out, x, flip = img.copy(), x0, False
    while x < x1:
        piece = src[:, ::-1] if flip else src
        w = min(piece.shape[1], x1 - x)
        out[y0:y1, x:x + w] = piece[:, :w]
        x, flip = x + w, not flip
    return out


def patch_from(img, box, src_y0, feather=6):
    """Cover box with the same columns taken from a clean texture band
    starting at src_y0, blended in with a feathered edge."""
    x0, y0, x1, y1 = box
    h, w = y1 - y0, x1 - x0
    src = img[src_y0:src_y0 + h, x0:x1].astype(np.float32)
    dst = img[y0:y1, x0:x1].astype(np.float32)
    # The donor band is a lighter/greyer texture than the target row, so
    # match its per-channel mean/std to a ring of pixels around the box.
    ring = np.concatenate([
        img[y0 - 8:y0, x0:x1].reshape(-1, 3), img[y1:y1 + 8, x0:x1].reshape(-1, 3),
        img[y0:y1, x0 - 8:x0].reshape(-1, 3), img[y0:y1, x1:x1 + 8].reshape(-1, 3),
    ]).astype(np.float32)
    s_mean, s_std = src.reshape(-1, 3).mean(0), src.reshape(-1, 3).std(0) + 1e-3
    src = (src - s_mean) / s_std * ring.std(0) + ring.mean(0)
    m = np.zeros((h, w), np.float32)
    m[feather:h - feather, feather:w - feather] = 1
    m = cv2.GaussianBlur(m, (0, 0), feather / 2)[..., None]
    out = img.copy()
    out[y0:y1, x0:x1] = np.clip(src * m + dst * (1 - m), 0, 255).astype(np.uint8)
    return out


def patch_same_row(img, box, donor_x0, donor_x1, feather=3):
    """Cover box by mirror-tiling a clean donor column-run taken from the SAME
    rows (same lighting/colour as the target), blended with a feathered edge."""
    x0, y0, x1, y1 = box
    tiled = fill_columns(img, (x0, y0, x1, y1), donor_x0, donor_x1)
    h, w = y1 - y0, x1 - x0
    m = np.zeros((h, w), np.float32)
    m[feather:h - feather, feather:w - feather] = 1
    m = cv2.GaussianBlur(m, (0, 0), feather / 2)[..., None]
    out = img.copy()
    src = tiled[y0:y1, x0:x1].astype(np.float32)
    dst = img[y0:y1, x0:x1].astype(np.float32)
    out[y0:y1, x0:x1] = np.clip(src * m + dst * (1 - m), 0, 255).astype(np.uint8)
    return out


def inpaint_gray_text(img, box, grow=2):
    """Erase light-gray text sitting on a red plate: mask = bright AND
    low-saturation pixels (the red plate has a low green channel)."""
    x0, y0, x1, y1 = box
    roi = img[y0:y1, x0:x1].astype(np.int16)
    # OpenCV is BGR: red plate has R >> G; text (grey) and its dark drop
    # shadow both have R ~= G, so "not clearly red" catches glyph + shadow.
    r, g = roi[..., 2], roi[..., 1]
    mask = ((r - g) < 45).astype(np.uint8) * 255
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=grow)
    full = np.zeros(img.shape[:2], np.uint8)
    full[y0:y1, x0:x1] = mask
    return cv2.inpaint(img, full, 4, cv2.INPAINT_TELEA)


def inpaint_box(img, box):
    """Erase an entire rectangle (used for icons on plain texture)."""
    x0, y0, x1, y1 = box
    full = np.zeros(img.shape[:2], np.uint8)
    full[y0:y1, x0:x1] = 255
    return cv2.inpaint(img, full, 7, cv2.INPAINT_TELEA)


def to_pil(img):
    return Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))


def save_piece(pil, name):
    w, h = pil.size
    pil.resize((w * SCALE, h * SCALE), Image.LANCZOS).save(OUT / f"{name}.png", optimize=True)
    print(f"  {name}: {w*SCALE}x{h*SCALE}")


def crop(img, box):
    x0, y0, x1, y1 = box
    return img[y0:y1, x0:x1].copy()


def chamfer_mask(size, c, feather=1.0):
    """Octagon (cut-corner) alpha mask, matching the tile/button plates."""
    w, h = size
    m = Image.new("L", (w * 4, h * 4), 0)
    C, W, H = c * 4, w * 4, h * 4
    ImageDraw.Draw(m).polygon([(C, 0), (W - C, 0), (W, C), (W, H - C), (W - C, H),
                               (C, H), (0, H - C), (0, C)], fill=255)
    m = m.resize((w, h), Image.LANCZOS)
    return m.filter(ImageFilter.GaussianBlur(feather)) if feather else m


def icon_from_art(img, box, name):
    """Lift a template icon off its dark background: alpha from how much
    brighter each pixel is than the local background level."""
    roi = cv2.cvtColor(crop(img, box), cv2.COLOR_BGR2RGB).astype(np.float32)
    bg = np.median(np.concatenate([roi[0], roi[-1], roi[:, 0], roi[:, -1]]), axis=0)
    diff = np.abs(roi - bg).max(axis=2)
    alpha = np.clip((diff - 10) / 35, 0, 1)
    rgba = np.dstack([roi, alpha * 255]).astype(np.uint8)
    im = Image.fromarray(rgba, "RGBA")
    w, h = im.size
    im = im.resize((w * SCALE, h * SCALE), Image.LANCZOS)
    im.save(ICONS / f"art-{name}.png", optimize=True)
    print(f"  icon art-{name}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    img = load()
    print("pieces:")

    # Header with the placeholder respect line removed (renderer redraws it).
    hdr = inpaint_text(img, RESPECT_TEXT, thresh=45, grow=4)
    save_piece(to_pil(crop(hdr, HEADER)), "header")

    # Section title bar with its title removed.
    # Title bar is horizontally uniform: tile the clean columns between the
    # end of the title and the bar's diagonal slash over the old title.
    top = fill_columns(img, (SEC_TITLE_TEXT[0], 255, 312, 293), 312, 338)
    save_piece(to_pil(crop(top, SEC_TOP)), "section_top")

    save_piece(to_pil(crop(img, SEC_BODY)), "section_body")
    # The template's section end runs through the bottom of the JOIN TODAY
    # plate; cover that with clean texture from the same rows to its right.
    end = patch_same_row(img, (166, 488, 486, 525), 490, 560)
    save_piece(to_pil(crop(end, SEC_END)), "section_end")
    save_piece(to_pil(crop(img, FINAL_END)), "final_end")

    # Requirements row with the three icons removed (pills/dividers kept).
    req = img.copy()
    # Icons are covered with plain texture from the same rows of the same
    # slot, so colour/lighting match and there are no inpaint smears.
    for b, (dx0, dx1) in zip(REQ_ERASE, REQ_DONOR):
        req = patch_same_row(req, b, dx0, dx1)
    save_piece(to_pil(crop(req, REQ_BODY)), "req_body")

    # Button plate: text removed, cut out with a chamfered mask.
    btn = inpaint_gray_text(img, BUTTON_TEXT)
    b = to_pil(crop(btn, BUTTON)).convert("RGBA")
    b.putalpha(chamfer_mask(b.size, 9))
    save_piece(b, "button")

    # Perk tile: "?" removed, octagon cut so the off-template background
    # around the tile in the source image is dropped.
    t = inpaint_box(img, PERK_TILE_Q)
    tile = to_pil(crop(t, PERK_TILE)).convert("RGBA")
    tile.putalpha(chamfer_mask(tile.size, 10))
    save_piece(tile, "perk_tile")

    # The three template icons, reusable on Requirements tiles.
    for box, name in zip(REQ_ICONS, ("shield", "swords", "cat")):
        icon_from_art(img, box, name)


if __name__ == "__main__":
    main()
