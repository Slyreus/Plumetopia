"""Prépare les détourage HD des oiseaux pour leur utilisation sur Plumetopia.

Le traitement reste volontairement conservateur : les dimensions et la
transparence sont conservées, le matte alpha est nettoyé et une netteté légère
est appliquée à l'intérieur opaque du sujet. Les WebP sources ne sont jamais
modifiés.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BIRD_DIR = ROOT / "assets" / "birds" / "oiseaux_hd"


def clean_alpha(alpha: Image.Image) -> Image.Image:
    """Lisse les artefacts WebP et resserre très légèrement le matte alpha."""

    smoothed = alpha.filter(ImageFilter.MedianFilter(size=3))
    return smoothed.point(
        lambda value: 0
        if value <= 10
        else 255
        if value >= 245
        else round((value - 10) * 255 / 235),
    )


def opaque_interior_mask(alpha: Image.Image) -> Image.Image:
    """Limite l'accentuation aux pixels opaques pour ne pas créer de halo."""

    return alpha.point(
        lambda value: 0
        if value <= 192
        else min(255, round((value - 192) * 255 / 63)),
    )


def prepare_image(source: Path, destination: Path) -> None:
    with Image.open(source) as opened:
        rgba = opened.convert("RGBA")
        original_alpha = rgba.getchannel("A")
        alpha = clean_alpha(original_alpha)
        rgb = rgba.convert("RGB")

        # Accentuation très légère, fondue selon l'opacité afin de conserver
        # exactement les franges et le détourage délicat des plumes.
        sharpened = rgb.filter(ImageFilter.UnsharpMask(radius=0.9, percent=45, threshold=5))
        rgb = Image.composite(sharpened, rgb, opaque_interior_mask(original_alpha))

        # Les couleurs cachées derrière les pixels 100 % transparents sont
        # neutralisées, sans modifier la moindre couleur visible.
        visible_mask = alpha.point(lambda value: 255 if value > 0 else 0)
        rgb = Image.composite(rgb, Image.new("RGB", rgba.size), visible_mask)
        red, green, blue = rgb.split()
        prepared = Image.merge("RGBA", (red, green, blue, alpha))

        destination.parent.mkdir(parents=True, exist_ok=True)
        prepared.save(
            destination,
            format="PNG",
            optimize=True,
            compress_level=9,
            icc_profile=opened.info.get("icc_profile"),
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_BIRD_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_BIRD_DIR)
    args = parser.parse_args()

    sources = sorted(args.source.glob("*.webp"))
    if not sources:
        raise SystemExit(f"Aucun WebP trouvé dans {args.source}")

    for source in sources:
        destination = args.output / f"{source.stem}.png"
        prepare_image(source, destination)
        print(f"{source.name} -> {destination.name}")

    print(f"{len(sources)} PNG préparés dans {args.output}")


if __name__ == "__main__":
    main()
