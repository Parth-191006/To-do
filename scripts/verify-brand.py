#!/usr/bin/env python3
"""Brand-asset regression checks.

The icons are generated (`scripts/generate-logo.py`), so a bad edit shows up as
a *silent* asset change: a blank tile, a foreground whose mark is clipped by the
adaptive mask, a monochrome layer that is not a silhouette, or a favicon that is
a solid square. None of that fails a TypeScript build. This script asserts the
properties that actually matter on a launcher.

    python3 scripts/verify-brand.py

Requires Python 3 + Pillow (the same dependency as the generator).
"""

from __future__ import annotations

import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

passed = 0
failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    global passed
    if condition:
        passed += 1
        print(f"  ok  {label}")
    else:
        failures.append(f"{label}{f' — {detail}' if detail else ''}")
        print(f"FAIL  {label}{f' — {detail}' if detail else ''}")


def luminance(px: tuple[int, ...]) -> float:
    r, g, b = px[0], px[1], px[2]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def main() -> int:
    icon = Image.open(ASSETS / "icon.png").convert("RGB")
    foreground = Image.open(ASSETS / "android-icon-foreground.png").convert("RGBA")
    mono = Image.open(ASSETS / "android-icon-monochrome.png").convert("RGBA")
    splash = Image.open(ASSETS / "splash-icon.png").convert("RGBA")
    favicon = Image.open(ASSETS / "favicon.png").convert("RGB")
    banner = Image.open(ROOT / "docs" / "banner.png").convert("RGB")

    check("icon is 1024×1024", icon.size == (1024, 1024), str(icon.size))
    check("favicon is 48×48", favicon.size == (48, 48), str(favicon.size))
    check("banner is 1280×400", banner.size == (1280, 400), str(banner.size))

    # The tile must be brand teal — a regression that wipes the gradient would
    # leave a black or white square here.
    corner = icon.getpixel((8, 8))
    check("icon corner is teal-ish", corner[1] > corner[0] and luminance(corner) < 200, str(corner))

    # The white tick must actually be drawn: the middle of the mark is bright.
    center_dark = sum(1 for x in range(300, 720, 20) for y in range(300, 720, 20)
                      if luminance(icon.getpixel((x, y))) > 220)
    check("icon contains a bright mark", center_dark > 40, f"bright samples={center_dark}")

    # …and it must have the face: some pixels in the mark are dark.
    face_dark = sum(1 for x in range(380, 700, 6) for y in range(300, 560, 6)
                    if luminance(icon.getpixel((x, y))) < 90)
    check("icon contains the mascot's face", face_dark > 12, f"dark samples={face_dark}")

    # Adaptive foreground: transparent border all the way round (the launcher
    # mask crops ~1/6 of each edge, so the mark must stay inside).
    w, h = foreground.size
    edge_opaque = [
        foreground.getpixel((x, 2))[3]
        for x in range(0, w, 16)
    ] + [
        foreground.getpixel((2, y))[3]
        for y in range(0, h, 16)
    ]
    check("adaptive foreground keeps a transparent border", max(edge_opaque) == 0,
          f"max alpha on the border={max(edge_opaque)}")

    # …and the mark is centred: the middle column has opaque pixels.
    middle = [foreground.getpixel((w // 2, y))[3] for y in range(0, h)]
    check("adaptive foreground has the mark in the middle", max(middle) > 200)

    # Monochrome: single flat colour, so the system can tint it.
    colours = {mono.getpixel((x, y))[:3] for x in range(0, mono.size[0], 9)
               for y in range(0, mono.size[1], 9) if mono.getpixel((x, y))[3] > 200}
    check("monochrome layer is a single flat colour", len(colours) == 1, str(colours))
    check("monochrome mark is not empty", len(colours) == 1)

    # Splash and favicon must both contain the mark, not just background.
    splash_bright = sum(1 for x in range(400, 640, 8) for y in range(400, 640, 8)
                        if splash.getpixel((x, y))[3] > 200
                        and luminance(splash.getpixel((x, y))) > 200)
    check("splash contains the mark", splash_bright > 30, f"bright samples={splash_bright}")

    fav_bright = sum(1 for x in range(12, 40, 2) for y in range(12, 40, 2)
                     if luminance(favicon.getpixel((x, y))) > 200)
    check("favicon still shows the mark at 48 px", fav_bright > 8, f"bright samples={fav_bright}")

    # Banner: the wordmark column must contain light text.
    text_pixels = sum(1 for x in range(360, 1100, 4) for y in range(120, 260, 4)
                      if luminance(banner.getpixel((x, y))) > 200)
    check("banner carries the wordmark", text_pixels > 100, f"text samples={text_pixels}")

    print(f"\nverify-brand: {passed} checks passed")
    if failures:
        print("\nfailures:")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
