#!/usr/bin/env python3
"""Generate TaskFlow's brand assets from one drawn source.

The mark is a **smiling checkmark mascot**: a chunky, rounded tick on the teal
gradient, with a thick soft outline, two happy eyes, a little smile and a
sparkle. It is drawn once here (supersampled) and rasterised into every icon
size the platforms need, so the app icon, the Android adaptive layers, the
splash, the favicon and the README banner can never drift apart.

    python3 scripts/generate-logo.py

Requires Python 3 + Pillow. Re-run whenever the brand colours change — the
palette below mirrors `src/theme/tokens.ts`, and `src/components/BrandMark.tsx`
draws the same character as vectors for in-app use.
"""

from __future__ import annotations

import pathlib

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
DOCS = ROOT / "docs"

# --- Brand palette (mirrors src/theme/tokens.ts) ----------------------------
BRAND_BRIGHT = (20, 184, 166)   # #14B8A6 teal500 — top-left of the gradient
BRAND_MID = (13, 148, 136)      # #0D9488 teal600
BRAND_DEEP = (9, 55, 51)        # #093733 deep teal — bottom-right
TILE_DEEP = (6, 42, 39)        # #062A27 outline / face colour
FACE = (7, 51, 47)             # slightly darker than the outline, for eyes
BLUSH = (251, 113, 133)        # #FB7185 rose400, used at low alpha
BLUSH_ALPHA = 70
WHITE = (255, 255, 255)
INK = (11, 19, 20)             # #0B1314 dark surface, used for the banner
SHEEN = 46                     # max alpha of the diagonal highlight

MASTER = 2048  # the whole character is composed at this size, then resized
SS = 2         # supersample factor for the gradient (resized smoothly below)


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))  # type: ignore[return-value]


# ---------------------------------------------------------------- background


def _gradient(size: int) -> Image.Image:
    """135-degree bright -> deep teal gradient, drawn small then upscaled."""
    small = max(96, size // 16)
    img = Image.new("RGB", (small, small))
    px = img.load()
    for y in range(small):
        for x in range(small):
            t = (x + y) / (2 * (small - 1))
            # Ease so the bright corner holds a little longer than a linear ramp.
            px[x, y] = mix(BRAND_BRIGHT, BRAND_DEEP, t ** 1.15)
    return img.resize((size, size), Image.BILINEAR)


def _sheen(size: int) -> Image.Image:
    """Soft diagonal highlight in the top-left so the tile is not a flat fill."""
    s = 256
    img = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(img)
    d.ellipse([-s * 0.35, -s * 0.85, s * 0.95, s * 0.55], fill=SHEEN)
    return img.resize((size, size), Image.BILINEAR)


def badge(size: int, rounded: bool = False) -> Image.Image:
    """Full-bleed gradient tile with the highlight applied (no mark yet)."""
    base = _gradient(size * SS).resize((size, size), Image.LANCZOS).convert("RGBA")
    glow = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    glow.putalpha(_sheen(size))
    out = Image.alpha_composite(base, glow)
    if rounded:
        out.putalpha(rounded_mask(size, 0.225))
    return out


# ------------------------------------------------------------------- mascot


def check_mask(px: int = MASTER, stroke_frac: float = 0.30) -> Image.Image:
    """Anti-aliased L-mode mask of the tick, autocropped to its bounds.

    `job="curve"` plus round caps at every end is what gives the character its
    chunky, hand-drawn feel — no sharp corners anywhere on the mark.
    """
    w = int(px * stroke_frac)
    img = Image.new("L", (px, px), 0)
    d = ImageDraw.Draw(img)
    pts = [(0.16 * px, 0.52 * px), (0.40 * px, 0.74 * px), (0.86 * px, 0.26 * px)]
    d.line(pts, fill=255, width=w, joint="curve")
    r = w // 2
    for x, y in (pts[0], pts[-1], pts[1]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return img.crop(img.getbbox())


def _face(size: int, box: tuple[int, int, int, int]) -> Image.Image:
    """Eyes, smile and blush, positioned relative to the mark's bounding box.

    Drawn on its own transparent layer so it can be composited over the white
    tick — and punched *out* of the monochrome silhouette, which keeps the
    themed icon as recognisable as the full-colour one.
    """
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    left, top, right, bottom = box
    w = right - left
    h = bottom - top

    # The eyes sit on the long stroke just above the elbow, where the white is
    # widest — at 48 px that is the only place a face reads as a face.
    eye_r = max(2, int(w * 0.045))
    eye_y = top + h * 0.27
    for cx in (left + w * 0.47, left + w * 0.65):
        d.ellipse([cx - eye_r, eye_y - eye_r, cx + eye_r, eye_y + eye_r], fill=FACE + (255,))

    # Blush, drawn before the smile so the smile stays crisp on top of it.
    blush_r = max(2, int(w * 0.048))
    blush_y = eye_y + h * 0.085
    blush = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blush)
    for cx in (left + w * 0.40, left + w * 0.72):
        bd.ellipse([cx - blush_r, blush_y - blush_r, cx + blush_r, blush_y + blush_r], fill=BLUSH + (255,))
    blush = blush.filter(ImageFilter.GaussianBlur(max(1, w * 0.012)))
    blush.putalpha(blush.getchannel("A").point(lambda v: int(v * BLUSH_ALPHA / 255)))
    layer = Image.alpha_composite(layer, blush)

    # Smile: a shallow upward arc between the eyes and the mark's vertex.
    d = ImageDraw.Draw(layer)
    mouth_w = w * 0.17
    mouth_x = left + w * 0.565
    mouth_y = eye_y + h * 0.115
    mouth_box = [mouth_x - mouth_w / 2, mouth_y - mouth_w * 0.42,
                 mouth_x + mouth_w / 2, mouth_y + mouth_w * 0.58]
    d.arc(mouth_box, start=20, end=160,
          fill=FACE + (255,), width=max(2, int(w * 0.026)))

    return layer


def _sparkle(size: int) -> Image.Image:
    """Tiny four-point sparkle in the top-right — the 'just done it' glint."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Drawn big then blurred for the glow, then the crisp star on top.
    glow = Image.new("L", (size, size), 0)
    gd = ImageDraw.Draw(glow)
    r = size * 0.085
    cx, cy = size * 0.795, size * 0.20
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.02))
    halo = Image.new("RGBA", (size, size), WHITE + (0,))
    halo.putalpha(glow)
    layer = Image.alpha_composite(layer, halo)

    d = ImageDraw.Draw(layer)
    arm = r * 0.95
    thick = max(2, int(size * 0.014))
    d.line([(cx - arm, cy), (cx + arm, cy)], fill=WHITE + (235,), width=thick)
    d.line([(cx, cy - arm), (cx, cy + arm)], fill=WHITE + (235,), width=thick)
    d.ellipse([cx - thick * 0.9, cy - thick * 0.9, cx + thick * 0.9, cy + thick * 0.9],
              fill=WHITE + (250,))
    return layer


def mascot_transparent(size: int, scale: float = 0.60, sparkle: bool = True) -> Image.Image:
    """The character alone on transparency — used for adaptive foregrounds."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = check_mask()
    tw = max(1, int(size * scale))
    th = max(1, int(round(mask.size[1] * tw / mask.size[0])))
    mark = mask.resize((tw, th), Image.LANCZOS)
    pos = ((size - tw) // 2, (size - th) // 2)
    box = (pos[0], pos[1], pos[0] + tw, pos[1] + th)

    # Full-canvas copy of the silhouette: filters and alpha compositing both
    # need the same dimensions as the tile. `limit` keeps the dilation from
    # eating into the canvas edge.
    full = Image.new("L", (size, size), 0)
    full.paste(mark, pos)

    # 1. Thick, soft outline: the silhouette dilated and blurred underneath.
    outline_alpha = full.filter(ImageFilter.MaxFilter(13)).filter(
        ImageFilter.GaussianBlur(max(1.0, size * 0.009))
    )
    outline = Image.new("RGBA", (size, size), TILE_DEEP + (0,))
    outline.putalpha(outline_alpha)
    canvas = Image.alpha_composite(canvas, outline)

    # 2. Soft drop shadow so the character sits on the tile instead of floating.
    shadow_alpha = full.filter(ImageFilter.GaussianBlur(max(2, size * 0.028)))
    shadow_alpha = shadow_alpha.point(lambda v: int(v * 0.30))
    shadow = Image.new("RGBA", (size, size), (2, 18, 16, 0))
    shadow.putalpha(shadow_alpha)
    shifted = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shifted.paste(shadow, (0, max(1, int(size * 0.022))), shadow)
    canvas = Image.alpha_composite(canvas, shifted)

    # 3. The white tick itself.
    body = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    body.paste(Image.new("RGBA", (tw, th), WHITE + (255,)), pos, mark)
    canvas = Image.alpha_composite(canvas, body)

    # 4. Face, then the sparkle.
    canvas = Image.alpha_composite(canvas, _face(size, box))
    if sparkle:
        canvas = Image.alpha_composite(canvas, _sparkle(size))
    return canvas


def mascot_monochrome(size: int, scale: float = 0.60) -> Image.Image:
    """Android 13 themed icon: one flat silhouette the system tints.

    The face is punched out of the silhouette (not drawn on it) so the character
    still reads once the launcher has replaced every colour with its own.
    """
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = check_mask()
    tw = max(1, int(size * scale))
    th = max(1, int(round(mask.size[1] * tw / mask.size[0])))
    mark = mask.resize((tw, th), Image.LANCZOS)
    pos = ((size - tw) // 2, (size - th) // 2)
    body = Image.new("L", (size, size), 0)
    body.paste(mark, pos)

    face = _face(size, (pos[0], pos[1], pos[0] + tw, pos[1] + th))
    face_alpha = face.getchannel("A")
    # `ImageChops.subtract` keeps the punch-out inside the silhouette.
    from PIL import ImageChops

    body = ImageChops.subtract(body, face_alpha)

    layer = Image.new("RGBA", (size, size), WHITE + (0,))
    layer.putalpha(body)
    return layer


def rounded_mask(size: int, radius_frac: float) -> Image.Image:
    m = Image.new("L", (size * SS, size * SS), 0)
    d = ImageDraw.Draw(m)
    r = int(size * SS * radius_frac)
    d.rounded_rectangle([0, 0, size * SS - 1, size * SS - 1], radius=r, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def mascot_tile(size: int, rounded: bool = False, scale: float = 0.56) -> Image.Image:
    """The full app icon: gradient tile + the smiling check."""
    base = badge(size, rounded=rounded)
    return Image.alpha_composite(base, mascot_transparent(size, scale=scale))


# ---------------------------------------------------------------- main entry


def main() -> None:
    ASSETS.mkdir(exist_ok=True)
    DOCS.mkdir(exist_ok=True)

    # 1. Legacy launcher icon — full bleed, square (the OS applies its mask).
    mascot_tile(1024).convert("RGB").save(ASSETS / "icon.png")

    # 2. Android adaptive icon: gradient background + transparent foreground
    #    confined to the central safe zone (so no launcher mask can clip it).
    badge(512).convert("RGB").save(ASSETS / "android-icon-background.png")
    mascot_transparent(512, scale=0.52).save(ASSETS / "android-icon-foreground.png")

    # 3. Monochrome layer for Android 13 themed icons — shape only, system tints.
    mascot_monochrome(432, scale=0.56).save(ASSETS / "android-icon-monochrome.png")

    # 4. Splash mark — the rounded badge centred on transparency for a dark bg.
    splash_size = 1024
    inner = 560
    tile = mascot_tile(inner, rounded=True, scale=0.52)
    splash = Image.new("RGBA", (splash_size, splash_size), (0, 0, 0, 0))
    splash.paste(tile, ((splash_size - inner) // 2, (splash_size - inner) // 2), tile)
    splash.save(ASSETS / "splash-icon.png")

    # 5. Web favicon — the mark, still legible at 48 px.
    mascot_tile(64, scale=0.62).resize((48, 48), Image.LANCZOS).convert("RGB").save(
        ASSETS / "favicon.png"
    )

    # 6. README banner — dark panel, mascot on the left, wordmark on the right.
    render_banner().save(DOCS / "banner.png")

    print("brand assets written to", ASSETS.relative_to(ROOT), "and", DOCS.relative_to(ROOT))


def render_banner() -> Image.Image:
    W, H = 1280, 400
    img = Image.new("RGB", (W, H), INK)
    # Teal glow bleeding in from the right, plus a faint one top-left.
    glow = Image.new("L", (256, 256), 0)
    d = ImageDraw.Draw(glow)
    d.ellipse([110, -60, 330, 210], fill=90)
    glow = glow.resize((W, H), Image.BILINEAR)
    teal = Image.new("RGB", (W, H), BRAND_MID)
    img = Image.composite(teal, img, glow.point(lambda v: int(v * 0.5)))

    tile = mascot_tile(210, rounded=True, scale=0.54)
    img = img.convert("RGBA")
    img.alpha_composite(tile, (92, (H - 210) // 2))

    font_dir = pathlib.Path("C:/Windows/Fonts")
    bold = next((font_dir / f for f in ("segoeuib.ttf", "arialbd.ttf") if (font_dir / f).exists()), None)
    reg = next((font_dir / f for f in ("segoeui.ttf", "arial.ttf") if (font_dir / f).exists()), bold)
    f_title = ImageFont.truetype(str(bold), 96) if bold else ImageFont.load_default()
    f_tag = ImageFont.truetype(str(reg), 34) if reg else ImageFont.load_default()

    draw = ImageDraw.Draw(img)
    draw.text((360, 118), "TaskFlow", font=f_title, fill=(242, 247, 246))
    draw.text((366, 236), "Capture, focus, finish.", font=f_tag, fill=(45, 212, 191))
    return img.convert("RGB")


if __name__ == "__main__":
    main()
