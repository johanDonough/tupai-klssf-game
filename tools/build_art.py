"""Turns the full-size art in art-src/ into the small files the game loads.

Run:  python tools/build_art.py
Writes public/art/*.webp and public/art/manifest.json.

Character poses keep their whole frame, so every pose of a character lines up
on the same feet and the same centre. Everything else is trimmed to its
visible edge.
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "art-src"
OUT = ROOT / "public" / "art"

CHARACTER_PREFIXES = ("junior-", "muddle-melee-", "muddle-ranged-", "muddle-boss-")
CHARACTER_SIZE = 512

# Longest side, in pixels, for everything that is trimmed.
TRIMMED_SIZES = {
    "nut": 128, "nut-super": 128, "muddle-shot": 128,
    "cup": 320, "basket": 512,
    "gate": 512, "gate-super": 512,
    "nut-pile-small": 256, "nut-pile-medium": 384, "nut-pile-large": 512,
    "fx-hit": 256, "fx-sparkle": 128, "fx-dizzy": 256, "fx-trail": 256, "fx-poof": 256,
    "lane-far": 1024, "lane-mid": 1024, "lane-ground": 1024,
}


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.webp"):
        old.unlink()
    manifest = {}
    total = 0
    for path in sorted(SOURCE.glob("*.png")):
        name = path.stem
        image = Image.open(path).convert("RGBA")
        if name.startswith(CHARACTER_PREFIXES):
            image = image.resize((CHARACTER_SIZE, CHARACTER_SIZE), Image.LANCZOS)
        else:
            box = image.getchannel("A").getbbox()
            if name.startswith("lane-"):
                # Keep the full width so the strip still tiles.
                box = (0, box[1], image.width, box[3])
            image = image.crop(box)
            longest = TRIMMED_SIZES[name]
            scale = longest / max(image.size)
            if scale < 1:
                image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
        target = OUT / f"{name}.webp"
        image.save(target, "WEBP", quality=90, method=6)
        manifest[name] = {"file": target.name, "width": image.width, "height": image.height}
        total += target.stat().st_size
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"{len(manifest)} files, {total / 1024:.0f} KB")


if __name__ == "__main__":
    build()
