#!/usr/bin/env python3
"""Generate TaskFlow's brand assets.

Source of truth for the app mark: a bold white check on a teal gradient
("capture -> done"), drawn once here and rasterised into every icon size the
platforms need.

    python3 scripts/generate-logo.py

Requires Python 3 + Pillow. Re-run whenever the brand colours change so all
assets stay in lockstep (the palette mirrors src/theme/tokens.ts).
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
INK = (11, 19, 20)              # #0B1314 dark surface, used for the banner
SHEEN = 46                      # max alpha of the diagonal highlight

SS = 2  # supersample factor for the gradient (resized smoothly below)


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))  # type: ignore[return-value]


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


def badge(size: int) -> Image.Image:
    """Full-bleed gradient tile with the highlight applied (no mark yet)."""
    base = _gradient(size * SS).resize((size, size), Image.LANCZOS).convert("RGBA")
    glow = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    glow.putalpha(_sheen(size))
    return Image.alpha_composite(base, glow)


def check_mask(px: int = 2048, stroke_frac: float = 0.22) -> Image.Image:
    """Anti-aliased L-mode mask of the checkmark, autocropped to its bounds."""
    w = int(px * stroke_frac)
    img = Image.new("L", (px, px), 0)
    d = ImageDraw.Draw(img)
    pts = [(0.14 * px, 0.50 * px), (0.39 * px, 0.73 * px), (0.88 * px, 0.24 * px)]
    d.line(pts, fill=255, width=w, joint="curve")
    r = w // 2
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return img.crop(img.getbbox())


def with_check(base: Image.Image, mark: Image.Image, frac: float, shadow: bool = True) -> Image.Image:
    """Centre `mark` on `base` at `frac` of the width, with an optional shadow."""
    W, H = base.size
    tw = max(1, int(W * frac))
    th = max(1, int(round(mark.size[1] * tw / mark.size[0])))
    scaled = mark.resize((tw, th), Image.LANCZOS)
    pos = ((W - tw) // 2, (H - th) // 2)
    out = base.convert("RGBA")

    if shadow:
        full = Image.new("L", (W, H), 0)
        full.paste(scaled, (pos[0], pos[1] + max(2, int(H * 0.015))))
        full = full.filter(ImageFilter.GaussianBlur(max(2, W * 0.02)))
        full = full.point(lambda v: int(v * 0.42))
        layer = Image.new("RGBA", (W, H), (3, 22, 20, 255))
        layer.putalpha(full)
        out = Image.alpha_composite(out, layer)

    glyph = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    glyph.paste(Image.new("RGBA", (tw, th), (255, 255, 255, 255)), pos, scaled)
    return Image.alpha_composite(out, glyph)


def rounded_mask(size: int, radius_frac: float) -> Image.Image:
    m = Image.new("L", (size * SS, size * SS), 0)
    d = ImageDraw.Draw(m)
    r = int(size * SS * radius_frac)
    d.rounded_rectangle([0, 0, size * SS - 1, size * SS - 1], radius=r, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def main() -> None:
    ASSETS.mkdir(exist_ok=True)
    DOCS.mkdir(exist_ok=True)
    mark = check_mask()

    # 1. Legacy launcher icon — full bleed, square (the OS applies its mask).
    icon = with_check(badge(1024), mark, 0.46)
    icon.convert("RGB").save(ASSETS / "icon.png")

    # 2. Android adaptive icon: gradient background + transparent foreground
    #    confined to the central safe zone (so no launcher mask can clip it).
    badge(512).convert("RGB").save(ASSETS / "android-icon-background.png")
    fg = with_check(Image.new("RGBA", (512, 512), (0, 0, 0, 0)), mark, 0.56, shadow=False)
    fg.save(ASSETS / "android-icon-foreground.png")

    # 3. Monochrome layer for Android 13 themed icons — shape only, system tints.
    mono = Image.new("RGBA", (432, 432), (255, 255, 255, 0))
    tw = int(432 * 0.56)
    th = int(round(mark.size[1] * tw / mark.size[0]))
    mono.paste(Image.new("RGBA", (tw, th), (255, 255, 255, 255)),
               ((432 - tw) // 2, (432 - th) // 2), mark.resize((tw, th), Image.LANCZOS))
    mono.save(ASSETS / "android-icon-monochrome.png")

    # 4. Splash mark — the rounded badge centred on transparency for a dark bg.
    splash_size = 1024
    inner = 560
    tile = with_check(badge(inner), mark, 0.50).convert("RGBA")
    tile.putalpha(rounded_mask(inner, 0.225))
    splash = Image.new("RGBA", (splash_size, splash_size), (0, 0, 0, 0))
    splash.paste(tile, ((splash_size - inner) // 2, (splash_size - inner) // 2), tile)
    splash.save(ASSETS / "splash-icon.png")

    # 5. Web favicon.
    with_check(badge(48), mark, 0.52, shadow=False).convert("RGB").save(ASSETS / "favicon.png")

    # 6. README banner — dark panel, badge on the left, wordmark on the right.
    banner = render_banner(mark)
    banner.save(DOCS / "banner.png")

    print("brand assets written to", ASSETS.relative_to(ROOT), "and", DOCS.relative_to(ROOT))


def render_banner(mark: Image.Image) -> Image.Image:
    W, H = 1280, 400
    img = Image.new("RGB", (W, H), INK)
    # Teal glow bleeding in from the right, plus a faint one top-left.
    glow = Image.new("L", (256, 256), 0)
    d = ImageDraw.Draw(glow)
    d.ellipse([110, -60, 330, 210], fill=90)
    glow = glow.resize((W, H), Image.BILINEAR)
    teal = Image.new("RGB", (W, H), BRAND_MID)
    img = Image.composite(teal, img, glow.point(lambda v: int(v * 0.5)))

    tile = with_check(badge(200), mark, 0.50).convert("RGBA")
    tile.putalpha(rounded_mask(200, 0.225))
    img = img.convert("RGBA")
    img.alpha_composite(tile, (96, (H - 200) // 2))

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
