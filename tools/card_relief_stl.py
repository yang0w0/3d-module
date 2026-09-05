from __future__ import annotations

import argparse
import math
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a printable card relief STL from an image.")
    parser.add_argument("image", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--width-mm", type=float, default=63.0)
    parser.add_argument("--base-mm", type=float, default=1.6)
    parser.add_argument("--relief-mm", type=float, default=1.2)
    parser.add_argument("--border-mm", type=float, default=2.0)
    parser.add_argument("--border-height-mm", type=float, default=0.8)
    parser.add_argument("--samples-x", type=int, default=160)
    parser.add_argument("--dark-raised", action="store_true", default=True)
    parser.add_argument("--preview", type=Path, default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.preview:
        args.preview.parent.mkdir(parents=True, exist_ok=True)

    image = Image.open(args.image).convert("RGBA")
    aspect = image.height / image.width
    samples_x = max(16, args.samples_x)
    samples_y = max(16, round(samples_x * aspect))
    width_mm = args.width_mm
    height_mm = width_mm * aspect

    heightmap = build_heightmap(
        image,
        (samples_x, samples_y),
        width_mm,
        height_mm,
        args.base_mm,
        args.relief_mm,
        args.border_mm,
        args.border_height_mm,
        args.dark_raised,
    )

    write_heightfield_stl(args.output, heightmap, width_mm, height_mm)
    if args.preview:
        write_preview(args.preview, heightmap, args.base_mm, args.relief_mm + args.border_height_mm)

    print(f"wrote {args.output}")
    print(f"size {width_mm:.1f} x {height_mm:.1f} mm, samples {samples_x} x {samples_y}")


def build_heightmap(
    image: Image.Image,
    size: tuple[int, int],
    width_mm: float,
    height_mm: float,
    base_mm: float,
    relief_mm: float,
    border_mm: float,
    border_height_mm: float,
    dark_raised: bool,
) -> np.ndarray:
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray)
    gray = gray.filter(ImageFilter.GaussianBlur(radius=0.65))
    gray = gray.resize(size, Image.Resampling.LANCZOS)
    values = np.asarray(gray, dtype=np.float32) / 255.0
    if dark_raised:
        values = 1.0 - values
    values = np.power(values, 1.25)

    alpha = image.getchannel("A").resize(size, Image.Resampling.LANCZOS)
    alpha_values = np.asarray(alpha, dtype=np.float32) / 255.0
    values *= alpha_values

    height = base_mm + values * relief_mm
    add_border(height, width_mm, height_mm, border_mm, border_height_mm)
    return height.astype(np.float32)


def add_border(
    height: np.ndarray,
    width_mm: float,
    height_mm: float,
    border_mm: float,
    border_height_mm: float,
) -> None:
    rows, cols = height.shape
    border_x = max(1, round(cols * border_mm / width_mm))
    border_y = max(1, round(rows * border_mm / height_mm))
    yy, xx = np.mgrid[0:rows, 0:cols]
    dist = np.minimum.reduce([xx, cols - 1 - xx, yy, rows - 1 - yy]).astype(np.float32)
    border_px = min(border_x, border_y)
    rim = np.clip((border_px - dist) / max(1, border_px), 0, 1)
    height += np.power(rim, 0.5) * border_height_mm


def write_heightfield_stl(path: Path, height: np.ndarray, width_mm: float, height_mm: float) -> None:
    rows, cols = height.shape
    xs = np.linspace(-width_mm / 2, width_mm / 2, cols, dtype=np.float32)
    ys = np.linspace(-height_mm / 2, height_mm / 2, rows, dtype=np.float32)
    top = np.dstack(np.meshgrid(xs, ys))

    triangles: list[tuple[np.ndarray, np.ndarray, np.ndarray]] = []
    for y in range(rows - 1):
        for x in range(cols - 1):
            p00 = point(top, height, y, x)
            p10 = point(top, height, y, x + 1)
            p01 = point(top, height, y + 1, x)
            p11 = point(top, height, y + 1, x + 1)
            triangles.append((p00, p10, p11))
            triangles.append((p00, p11, p01))

    z0 = np.float32(0.0)
    for x in range(cols - 1):
        add_side(triangles, point(top, height, 0, x), point(top, height, 0, x + 1), z0)
        add_side(triangles, point(top, height, rows - 1, x + 1), point(top, height, rows - 1, x), z0)
    for y in range(rows - 1):
        add_side(triangles, point(top, height, y + 1, 0), point(top, height, y, 0), z0)
        add_side(triangles, point(top, height, y, cols - 1), point(top, height, y + 1, cols - 1), z0)

    corners = [
        np.array([xs[0], ys[0], z0], dtype=np.float32),
        np.array([xs[-1], ys[0], z0], dtype=np.float32),
        np.array([xs[-1], ys[-1], z0], dtype=np.float32),
        np.array([xs[0], ys[-1], z0], dtype=np.float32),
    ]
    triangles.append((corners[0], corners[2], corners[1]))
    triangles.append((corners[0], corners[3], corners[2]))

    with path.open("wb") as file:
        file.write(b"TD Studio card relief".ljust(80, b"\0"))
        file.write(struct.pack("<I", len(triangles)))
        for tri in triangles:
            write_triangle(file, tri)


def point(grid: np.ndarray, height: np.ndarray, y: int, x: int) -> np.ndarray:
    return np.array([grid[y, x, 0], grid[y, x, 1], height[y, x]], dtype=np.float32)


def add_side(triangles: list[tuple[np.ndarray, np.ndarray, np.ndarray]], a: np.ndarray, b: np.ndarray, z0: np.float32) -> None:
    a0 = np.array([a[0], a[1], z0], dtype=np.float32)
    b0 = np.array([b[0], b[1], z0], dtype=np.float32)
    triangles.append((a, b, b0))
    triangles.append((a, b0, a0))


def write_triangle(file, tri: tuple[np.ndarray, np.ndarray, np.ndarray]) -> None:
    normal = triangle_normal(*tri)
    file.write(struct.pack("<3f", *normal))
    for vertex in tri:
        file.write(struct.pack("<3f", *vertex))
    file.write(struct.pack("<H", 0))


def triangle_normal(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    normal = np.cross(b - a, c - a)
    length = math.sqrt(float(np.dot(normal, normal)))
    if length == 0:
        return np.array([0, 0, 1], dtype=np.float32)
    return (normal / length).astype(np.float32)


def write_preview(path: Path, height: np.ndarray, base_mm: float, range_mm: float) -> None:
    normalized = np.clip((height - base_mm) / max(0.01, range_mm), 0, 1)
    preview = Image.fromarray((normalized * 255).astype(np.uint8), mode="L")
    preview.save(path)


if __name__ == "__main__":
    main()
