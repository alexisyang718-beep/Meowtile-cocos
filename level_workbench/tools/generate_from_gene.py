#!/usr/bin/env python3
"""Level Gene v0.1 candidate generator.

This is an offline workbench tool. It does NOT overwrite official level-*.json.
It reads assets/resources/config/level_genes/*.json and writes candidates + preview HTML to:
  level_workbench/generated/level_gene_candidates/
"""
from __future__ import annotations

import argparse
import collections
import html
import json
import math
import random
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
GENE_DIR = ROOT / 'assets/resources/config/level_genes'
TILE_TYPES_PATH = ROOT / 'assets/resources/config/game/tile-types.json'
OUT_DIR = ROOT / 'level_workbench/generated/level_gene_candidates'
RATIO = 0.94
STEP_COEF = 0.25


@dataclass
class CandidateScore:
    opening_matches: int
    candidate_pairs: int
    region_count: int
    max_groups_in_depth: int
    avg_branching: float
    bottleneck_depth: int
    valid: bool
    reasons: list[str]


def load_tile_types() -> list[str]:
    raw = json.loads(TILE_TYPES_PATH.read_text())
    items = raw['types'] if isinstance(raw, dict) and 'types' in raw else raw
    return [item['id'] for item in items if item['id'] != 'golden']


def parse_grid_size(value: str) -> tuple[int, int]:
    cols, rows = value.lower().split('x')
    return int(rows), int(cols)


SYMMETRY_LABELS = {
    'none': '母版原形',
    'lr': '左右对称',
    'ud': '上下对称',
    'rot': '中心旋转对称',
    'quad': '四向对称',
    'diag': '对角对称',
}

SHAPE_LABELS = {
    'mountain': '山 / 三峰',
    'm_shape': 'M 型',
    'u_shape': 'U 型',
    'n_shape': 'N 型',
    'z_shape': 'Z 型',
    's_shape': 'S 型',
    'ring': '口字 / 回字',
    'double_arch': '双拱',
    'hourglass': '沙漏',
    'four_corners': '四角结构',
    'soft_arch': '柔和拱形',
    'a_shape': 'A 型',
    'h_shape': 'H 型 / 双柱桥',
    'i_beam': '工字型',
    'v_shape': 'V 字型',
    'zhong_shape': '中字型',
    'cross': '十字形',
    'infinity': '无限符号',
    'bowtie': '蝴蝶结 / 双三角',
    'one_bridge': '一条桥',
    'two_bridge': '双桥',
    'fishbone': '鱼骨 / 多层 V',
    'top_bottom_cluster': '上小下三组合',
    'tree_shape': '树 / 上中下三峰',
    'up_down_keys': '上下键',
    'horizontal_keys': '左右键',
    'notch_tab': '凹凸口',
    'corners_center': '四角配中图',
}

CORE_SHAPES = ['mountain', 'm_shape', 'u_shape', 'n_shape', 'z_shape', 's_shape', 'ring', 'double_arch', 'hourglass', 'four_corners']
COMPACT_REFERENCE_SHAPES = [
    'a_shape',
    'h_shape',
    'up_down_keys',
    'top_bottom_cluster',
    'notch_tab',
    'two_bridge',
    'corners_center',
    'tree_shape',
    'fishbone',
    'horizontal_keys',
    'mountain',
    'm_shape',
    'n_shape',
    'z_shape',
    's_shape',
    'v_shape',
    'infinity',
    'bowtie',
    'i_beam',
    'ring',
    'zhong_shape',
    'cross',
    'u_shape',
    'hourglass',
    'double_arch',
    'one_bridge',
]


def normalize_symmetry_mode(value: str) -> str:
    aliases = {
        'none': 'none',
        'raw': 'none',
        '母版原形': 'none',
        'left_right': 'lr',
        'horizontal': 'lr',
        '左右对称': 'lr',
        'up_down': 'ud',
        'vertical': 'ud',
        '上下对称': 'ud',
        'center_rotation': 'rot',
        'rotation': 'rot',
        '中心旋转对称': 'rot',
        'four_way': 'quad',
        '四向对称': 'quad',
        'diagonal': 'diag',
        '对角对称': 'diag',
    }
    return aliases.get(value, value)


def symmetry_mode_for_variant(variant: str, rows: int, cols: int) -> str:
    if variant in ('ring', 'hourglass', 'four_corners', 'h_shape', 'i_beam', 'zhong_shape', 'cross', 'infinity', 'corners_center'):
        return 'quad'
    if variant in ('a_shape', 'mountain', 'm_shape', 'v_shape', 'u_shape', 'tree_shape', 'fishbone'):
        return 'lr'
    if variant in ('n_shape', 'z_shape', 's_shape', 'notch_tab', 'up_down_keys', 'top_bottom_cluster', 'horizontal_keys', 'infinity'):
        return 'none'
    return 'none'


def allowed_symmetry_modes(raw_modes: list[str] | None, variant: str, rows: int, cols: int) -> list[str]:
    if raw_modes:
        modes = [normalize_symmetry_mode(mode) for mode in raw_modes]
    else:
        modes = [symmetry_mode_for_variant(variant, rows, cols)]
    modes = [mode for mode in modes if mode in SYMMETRY_LABELS and (mode != 'diag' or rows == cols)]
    return modes or [symmetry_mode_for_variant(variant, rows, cols)]


def symmetry_orbit(r: int, c: int, rows: int, cols: int, mode: str) -> set[tuple[int, int]]:
    if mode == 'none':
        return {(r, c)}
    if mode == 'ud':
        return {(r, c), (rows - 1 - r, c)}
    if mode == 'rot':
        return {(r, c), (rows - 1 - r, cols - 1 - c)}
    if mode == 'quad':
        return {(r, c), (r, cols - 1 - c), (rows - 1 - r, c), (rows - 1 - r, cols - 1 - c)}
    if mode == 'diag' and rows == cols:
        return {(r, c), (c, r)}
    return {(r, c), (r, cols - 1 - c)}


def apply_symmetry(cells: set[tuple[int, int]], rows: int, cols: int, mode: str) -> set[tuple[int, int]]:
    out: set[tuple[int, int]] = set()
    for r, c in cells:
        out |= {pt for pt in symmetry_orbit(r, c, rows, cols, mode) if 0 <= pt[0] < rows and 0 <= pt[1] < cols}
    return out


def variant_pool(pattern: str, rows: int, cols: int) -> list[str]:
    if pattern in ('soft_arch', 'gentle_gate'):
        return ['soft_arch', 'mountain', 'm_shape', 'u_shape', 'n_shape']
    if pattern in ('open_ring', 'double_arch'):
        return ['ring', 'double_arch', 'hourglass', 's_shape', 'four_corners']
    if pattern == 'large_balanced':
        return CORE_SHAPES
    if pattern == 'shape_showcase':
        return CORE_SHAPES
    if pattern == 'compact_reference':
        return COMPACT_REFERENCE_SHAPES
    return CORE_SHAPES + COMPACT_REFERENCE_SHAPES


def shape_variants_for_gene(gene: dict[str, Any], rows: int, cols: int) -> list[str]:
    pattern = gene.get('interferencePattern', 'soft_arch')
    raw = gene.get('shapeVariants')
    if raw:
        variants = [str(item) for item in raw if str(item) in SHAPE_LABELS]
        if variants:
            return variants
    return variant_pool(pattern, rows, cols)


SHAPE_SEGMENTS: dict[str, list[list[tuple[float, float]]]] = {
    'a_shape': [[(42, 205), (90, 36), (138, 205)], [(62, 142), (118, 142)], [(72, 110), (90, 58), (108, 110)]],
    'h_shape': [[(42, 38), (42, 205)], [(138, 38), (138, 205)], [(42, 122), (138, 122)]],
    'up_down_keys': [[(90, 38), (48, 88), (72, 88), (72, 114), (108, 114), (108, 88), (132, 88), (90, 38)], [(90, 202), (48, 152), (72, 152), (72, 126), (108, 126), (108, 152), (132, 152), (90, 202)]],
    'top_bottom_cluster': [[(70, 42), (110, 42), (110, 82), (70, 82), (70, 42)], [(28, 156), (62, 156), (62, 205), (28, 205), (28, 156)], [(73, 150), (107, 150), (107, 205), (73, 205), (73, 150)], [(118, 156), (152, 156), (152, 205), (118, 205), (118, 156)]],
    'notch_tab': [[(38, 46), (98, 46), (98, 92), (72, 92), (72, 148), (98, 148), (98, 194), (38, 194), (38, 46)], [(132, 54), (132, 102), (154, 102), (154, 138), (132, 138), (132, 186), (92, 186), (92, 54), (132, 54)]],
    'two_bridge': [[(42, 36), (42, 206)], [(138, 36), (138, 206)], [(42, 95), (138, 95)], [(42, 148), (138, 148)]],
    'corners_center': [[(36, 45), (62, 45), (62, 75), (36, 75), (36, 45)], [(118, 45), (144, 45), (144, 75), (118, 75), (118, 45)], [(36, 165), (62, 165), (62, 195), (36, 195), (36, 165)], [(118, 165), (144, 165), (144, 195), (118, 195), (118, 165)], [(76, 104), (104, 104), (104, 136), (76, 136), (76, 104)]],
    'tree_shape': [[(90, 42), (44, 92), (136, 92)], [(90, 86), (34, 145), (146, 145)], [(90, 136), (48, 190), (132, 190)], [(90, 190), (90, 215)]],
    'fishbone': [[(90, 36), (40, 92), (140, 92)], [(90, 92), (48, 148), (132, 148)], [(90, 148), (58, 202), (122, 202)]],
    'horizontal_keys': [[(34, 120), (78, 74), (78, 102), (100, 102), (100, 138), (78, 138), (78, 166), (34, 120)], [(146, 120), (102, 74), (102, 102), (80, 102), (80, 138), (102, 138), (102, 166), (146, 120)]],
    'mountain': [[(45, 200), (45, 78)], [(90, 200), (90, 42)], [(135, 200), (135, 78)], [(35, 200), (145, 200)], [(55, 132), (125, 132)]],
    'm_shape': [[(38, 204), (38, 52)], [(38, 52), (90, 132)], [(90, 132), (142, 52)], [(142, 52), (142, 204)]],
    'n_shape': [[(42, 204), (42, 52)], [(42, 52), (138, 204)], [(138, 204), (138, 52)]],
    'z_shape': [[(40, 58), (140, 58)], [(140, 58), (40, 198)], [(40, 198), (140, 198)]],
    's_shape': [[(132, 48), (52, 48), (52, 100), (128, 100), (128, 154), (48, 154), (48, 204)]],
    'v_shape': [[(38, 54), (90, 204), (142, 54)], [(58, 54), (122, 54)]],
    'infinity': [[(24, 120), (42, 78), (70, 72), (92, 120), (70, 168), (42, 162), (24, 120)], [(156, 120), (138, 78), (110, 72), (88, 120), (110, 168), (138, 162), (156, 120)], [(68, 78), (112, 162)], [(68, 162), (112, 78)]],
    'bowtie': [[(32, 70), (82, 120), (32, 170), (32, 70)], [(148, 70), (98, 120), (148, 170), (148, 70)], [(78, 106), (102, 106), (102, 134), (78, 134), (78, 106)]],
    'i_beam': [[(38, 52), (142, 52)], [(90, 52), (90, 198)], [(38, 198), (142, 198)]],
    'ring': [[(42, 48), (138, 48), (138, 198), (42, 198), (42, 48)]],
    'zhong_shape': [[(42, 48), (138, 48), (138, 198), (42, 198), (42, 48)], [(90, 48), (90, 198)], [(42, 123), (138, 123)]],
    'cross': [[(90, 42), (90, 204)], [(42, 123), (138, 123)]],
    'u_shape': [[(45, 52), (45, 198), (135, 198), (135, 52)]],
    'hourglass': [[(42, 52), (138, 52), (90, 123), (42, 198), (138, 198)], [(90, 123), (138, 52)], [(90, 123), (138, 198)]],
    'double_arch': [[(38, 198), (38, 86), (64, 58), (84, 86), (84, 198)], [(96, 198), (96, 86), (122, 58), (142, 86), (142, 198)], [(38, 198), (84, 198)], [(96, 198), (142, 198)]],
    'one_bridge': [[(42, 58), (42, 190)], [(138, 58), (138, 190)], [(42, 122), (138, 122)]],
}


def point_segment_distance(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    denom = vx * vx + vy * vy
    if denom <= 1e-9:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, (wx * vx + wy * vy) / denom))
    cx, cy = ax + t * vx, ay + t * vy
    return math.hypot(px - cx, py - cy)


SHAPE_RIBBON_WIDTH = {
    'a_shape': 21.0,
    'h_shape': 16.0,
    'horizontal_keys': 16.0,
    'up_down_keys': 16.0,
    'notch_tab': 15.0,
    'one_bridge': 17.0,
    'infinity': 12.0,
    'n_shape': 18.0,
    'z_shape': 20.0,
    's_shape': 19.0,
    'v_shape': 20.0,
    'bowtie': 19.0,
    'i_beam': 21.0,
    'ring': 19.0,
    'cross': 24.0,
    'u_shape': 20.0,
    'top_bottom_cluster': 10.5,
}


def cells_from_shape_segments(rows: int, cols: int, variant: str) -> set[tuple[int, int]]:
    segments = SHAPE_SEGMENTS.get(variant)
    if not segments:
        return set()
    cells: set[tuple[int, int]] = set()
    threshold = SHAPE_RIBBON_WIDTH.get(variant, 13.0)
    for r in range(rows):
        for c in range(cols):
            x = 16 + (c + 0.5) / cols * 148
            y = 20 + (r + 0.5) / rows * 204
            hit = False
            for polyline in segments:
                for a, b in zip(polyline, polyline[1:]):
                    if point_segment_distance(x, y, a[0], a[1], b[0], b[1]) <= threshold:
                        hit = True
                        break
                if hit:
                    break
            if hit:
                cells.add((r, c))
    return cells


def base_shape(rows: int, cols: int, gene: dict[str, Any], seed: int, rng: random.Random) -> tuple[set[tuple[int, int]], str, str]:
    pattern = gene.get('interferencePattern', 'soft_arch')
    variants = shape_variants_for_gene(gene, rows, cols)
    seed_offset = seed - int(gene.get('seedStart', seed))
    variant = variants[seed_offset % len(variants)] if gene.get('shapeVariants') else rng.choice(variants)
    modes = allowed_symmetry_modes(gene.get('symmetryModes'), variant, rows, cols)
    mode = modes[seed_offset % len(modes)] if gene.get('symmetryModes') else modes[0]

    cells: set[tuple[int, int]] = cells_from_shape_segments(rows, cols, variant)
    cr = (rows - 1) / 2
    cc = (cols - 1) / 2
    for r in ([] if cells else range(rows)):
        for c in range(cols):
            nr = abs(r - cr) / max(1, cr)
            nc = abs(c - cc) / max(1, cc)
            keep = False
            if variant == 'soft_arch':
                keep = nr * 0.72 + nc * 0.58 < 0.95 and r < rows - 1
            elif variant == 'mountain':
                width = 0.12 + 0.66 * (r / max(1, rows - 1))
                ridge = abs(c - cc) <= 0.55 and r <= rows * 0.38
                keep = (nc <= width or ridge) and 0 < r < rows - 0.5
            elif variant == 'm_shape':
                left_peak = abs(c - cols * 0.27) / max(1, cols) + abs(r - rows * 0.34) / max(1, rows)
                right_peak = abs(c - cols * 0.73) / max(1, cols) + abs(r - rows * 0.34) / max(1, rows)
                valley = abs(c - cc) <= 0.75 and rows * 0.48 <= r <= rows * 0.72
                base = r >= rows * 0.62 and nc < 0.72
                keep = left_peak < 0.28 or right_peak < 0.28 or valley or base
            elif variant == 'u_shape':
                side = (c <= 1 or c >= cols - 2) and 1 <= r <= rows - 2
                bottom = r >= rows - 3 and 1 <= c <= cols - 2
                inner_clear = 2 <= c <= cols - 3 and 1 <= r <= rows - 4
                keep = (side or bottom) and not inner_clear
            elif variant == 'n_shape':
                left = c <= 1 and 1 <= r <= rows - 2
                right = c >= cols - 2 and 1 <= r <= rows - 2
                diag = abs((c / max(1, cols - 1)) - (r / max(1, rows - 1))) < 0.16 and 1 <= r <= rows - 2
                cap = r <= 1 and 1 <= c <= cols - 2
                keep = left or right or diag or cap
            elif variant == 'ring':
                outer = nr <= 0.92 and nc <= 0.92
                inner = nr < 0.34 and nc < 0.38
                keep = outer and not inner
            elif variant == 'double_arch':
                left_arch = ((r - rows * 0.56) / max(1, rows * 0.38)) ** 2 + ((c - cols * 0.28) / max(1, cols * 0.22)) ** 2 < 1.0
                right_arch = ((r - rows * 0.56) / max(1, rows * 0.38)) ** 2 + ((c - cols * 0.72) / max(1, cols * 0.22)) ** 2 < 1.0
                crown = r <= rows * 0.36 and nc < 0.72
                foot_gap = r > rows * 0.72 and abs(c - cc) < 1.0
                keep = (left_arch or right_arch or crown) and not foot_gap
            elif variant == 'hourglass':
                width = 0.18 + 0.56 * abs(r - cr) / max(1, cr)
                keep = nc <= width
            elif variant == 's_shape':
                top = r < rows * 0.34 and 1 <= c <= cols - 2 and c < cols * 0.78
                mid = abs(r - cr) <= 1 and 1 <= c <= cols - 2
                bottom = r > rows * 0.66 and 1 <= c <= cols - 2 and c > cols * 0.22
                keep = top or mid or bottom
            elif variant == 'four_corners':
                corner = (r <= 2 or r >= rows - 3) and (c <= 1 or c >= cols - 2)
                center_anchor = abs(r - cr) <= 0.5 and abs(c - cc) <= 1.0
                keep = corner or center_anchor
            elif variant == 'i_beam':
                top_bar = r <= 1 and nc <= 0.72
                bottom_bar = r >= rows - 2 and nc <= 0.72
                stem = abs(c - cc) <= 0.55 and 1 <= r <= rows - 2
                keep = top_bar or bottom_bar or stem
            elif variant == 'v_shape':
                spread = (r / max(1, rows - 1)) * max(1.6, cc * 0.92)
                arm = abs(abs(c - cc) - spread) <= 0.95 and 0 <= r <= rows - 2
                inner_fill = abs(c - cc) <= 0.75 and r >= rows - 3
                point = abs(c - cc) <= 1.05 and r >= rows - 2
                keep = arm or inner_fill or point
            elif variant == 'zhong_shape':
                border = (r <= 1 or r >= rows - 2 or c <= 1 or c >= cols - 2) and 1 <= r <= rows - 2 and 1 <= c <= cols - 2
                vertical = abs(c - cc) <= 0.55 and 1 <= r <= rows - 2
                horizontal = abs(r - cr) <= 0.55 and 1 <= c <= cols - 2
                keep = border or vertical or horizontal
            elif variant == 'cross':
                keep = (abs(c - cc) <= 0.65 and 1 <= r <= rows - 2) or (abs(r - cr) <= 0.65 and 1 <= c <= cols - 2)
            elif variant == 'diagonal_bowtie':
                slope = max(1, cc / max(1, cr))
                diag1 = abs((c - cc) - (r - cr) * slope) <= 0.95
                diag2 = abs((c - cc) + (r - cr) * slope) <= 0.95
                waist = abs(r - cr) <= 1.25 and abs(c - cc) <= 1.55
                lobe = (nr <= 0.90 and nc <= 0.90 and abs(abs(r - cr) - abs(c - cc)) <= 1.45)
                center_pad = abs(r - cr) <= 1.6 and abs(c - cc) <= 1.6
                keep = ((diag1 or diag2 or lobe or center_pad) and nr <= 0.95 and nc <= 0.95) or waist
            elif variant == 'infinity':
                left = ((r - cr) / max(1, rows * 0.28)) ** 2 + ((c - cols * 0.30) / max(1, cols * 0.20)) ** 2
                right = ((r - cr) / max(1, rows * 0.28)) ** 2 + ((c - cols * 0.70) / max(1, cols * 0.20)) ** 2
                inner_left = ((r - cr) / max(1, rows * 0.14)) ** 2 + ((c - cols * 0.30) / max(1, cols * 0.10)) ** 2
                inner_right = ((r - cr) / max(1, rows * 0.14)) ** 2 + ((c - cols * 0.70) / max(1, cols * 0.10)) ** 2
                bridge = abs(r - cr) <= 0.55 and abs(c - cc) <= 1.1
                keep = ((left < 1.05 and inner_left > 0.55) or (right < 1.05 and inner_right > 0.55) or bridge)
            elif variant == 'one_bridge':
                left_block = abs(c - cols * 0.22) <= 1.1 and abs(r - cr) <= 1.9
                right_block = abs(c - cols * 0.78) <= 1.1 and abs(r - cr) <= 1.9
                bridge = abs(r - cr) <= 0.85 and 1 <= c <= cols - 2
                keep = left_block or right_block or bridge
            elif variant == 'two_bridge':
                left_block = abs(c - cols * 0.22) <= 0.8 and abs(r - cr) <= 1.6
                right_block = abs(c - cols * 0.78) <= 0.8 and abs(r - cr) <= 1.6
                bridge1 = abs(r - (cr - 1.0)) <= 0.45 and 1 <= c <= cols - 2
                bridge2 = abs(r - (cr + 1.0)) <= 0.45 and 1 <= c <= cols - 2
                keep = left_block or right_block or bridge1 or bridge2
            elif variant == 'fish_combo':
                tail = c <= cols * 0.42 and abs(abs(r - cr) - abs(c - cols * 0.34)) <= 0.9
                body = ((r - cr) / max(1, rows * 0.28)) ** 2 + ((c - cols * 0.62) / max(1, cols * 0.22)) ** 2 < 1.0
                nose = c >= cols - 2 and abs(r - cr) <= 1.0
                keep = tail or body or nose
            elif variant == 'top_bottom_cluster':
                top = r <= 1 and abs(c - cc) <= 1.0
                bottom_left = r >= rows - 3 and abs(c - cols * 0.22) <= 0.75
                bottom_mid = r >= rows - 3 and abs(c - cc) <= 0.75
                bottom_right = r >= rows - 3 and abs(c - cols * 0.78) <= 0.75
                keep = top or bottom_left or bottom_mid or bottom_right
            elif variant == 'vertical_arrows':
                up_head = r <= rows * 0.42 and abs(c - cc) <= max(0.7, 2.9 - r * 0.55)
                up_stem = abs(c - cc) <= 0.65 and r <= rows * 0.48
                down_head = r >= rows * 0.58 and abs(c - cc) <= max(0.7, 2.9 - (rows - 1 - r) * 0.55)
                down_stem = abs(c - cc) <= 0.65 and r >= rows * 0.52
                center_gap = abs(r - cr) <= 0.35 and abs(c - cc) <= 0.65
                keep = (up_head or up_stem or down_head or down_stem) and not center_gap
            elif variant == 'horizontal_arrows':
                left_head = c <= cols * 0.42 and abs(r - cr) <= max(0.7, 2.4 - c * 0.45)
                left_stem = abs(r - cr) <= 0.65 and c <= cols * 0.48
                right_head = c >= cols * 0.58 and abs(r - cr) <= max(0.7, 2.4 - (cols - 1 - c) * 0.45)
                right_stem = abs(r - cr) <= 0.65 and c >= cols * 0.52
                center_gap = abs(c - cc) <= 0.35 and abs(r - cr) <= 0.65
                keep = (left_head or left_stem or right_head or right_stem) and not center_gap
            elif variant == 'notch_tab':
                left_frame = c <= 2 and 1 <= r <= rows - 2 and not (abs(r - cr) <= 0.75 and c <= 1)
                right_tab = c >= cols - 3 and abs(r - cr) <= 1.35
                connector = abs(r - cr) <= 0.45 and 2 <= c <= cols - 3
                keep = left_frame or right_tab or connector
            elif variant == 'corners_center':
                corner = (r <= 2 or r >= rows - 3) and (c <= 1 or c >= cols - 2)
                center = abs(r - cr) <= 1.0 and abs(c - cc) <= 1.0
                short_spoke = (abs(r - cr) <= 0.5 and abs(c - cc) <= 1.6) or (abs(c - cc) <= 0.5 and abs(r - cr) <= 1.6)
                keep = corner or center or short_spoke
            else:
                keep = nr + nc < 1.25
            if keep:
                cells.add((r, c))
    cells = apply_symmetry(cells, rows, cols, mode)
    if len(cells) < 12:
        fallback = {(r, c) for r in range(1, rows - 1) for c in range(1, cols - 1) if abs(c - cc) <= 1 or abs(r - cr) <= 1}
        cells |= apply_symmetry(fallback, rows, cols, mode)
    # Seed 级扰动必须按当前 symmetry orbit 成组增删，不能破坏轴对称/镜像对称。
    for _ in range(2):
        removable = []
        for r, c in sorted(cells):
            orbit = symmetry_orbit(r, c, rows, cols, mode)
            if orbit <= cells and len(cells - orbit) >= 12:
                edge_score = abs(r - cr) + abs(c - cc)
                if edge_score > 1.5:
                    removable.append((edge_score * rng.random(), orbit))
        if removable and rng.random() < 0.35:
            _, orbit = max(removable, key=lambda x: x[0])
            cells -= orbit
    for _ in range(2):
        addable = []
        for r in range(rows):
            for c in range(cols):
                if (r, c) in cells:
                    continue
                orbit = symmetry_orbit(r, c, rows, cols, mode)
                if orbit & cells or any(not (0 <= rr < rows and 0 <= cc2 < cols) for rr, cc2 in orbit):
                    continue
                near = any((rr, cc2) in cells for rr, cc2 in [(r-1,c),(r+1,c),(r,c-1),(r,c+1)])
                if near:
                    center_score = 1 / (1 + abs(r - cr) + abs(c - cc))
                    addable.append((center_score * rng.random(), orbit))
        if addable and rng.random() < 0.45:
            _, orbit = max(addable, key=lambda x: x[0])
            cells |= orbit
    return cells, variant, mode


def weight_for_cell(r: int, c: int, rows: int, cols: int, pattern: str) -> float:
    cr = (rows - 1) / 2
    cc = (cols - 1) / 2
    nr = abs(r - cr) / max(1, cr)
    nc = abs(c - cc) / max(1, cc)
    center = 1 - min(1, (nr + nc) / 1.55)
    if pattern in ('soft_arch', 'gentle_gate'):
        return 0.2 + center * 1.2
    if pattern == 'open_ring':
        return 0.2 + (1 - abs((nr + nc) - 0.75))
    if pattern == 'double_arch':
        side = 1 if c < cols * 0.35 or c > cols * 0.65 else 0.45
        return 0.2 + side * (1 - nr * 0.5)
    if pattern == 'large_balanced':
        return 0.2 + center * 0.7 + (0.4 if (r + c) % 2 == 0 else 0)
    return 1.0


def choose_symmetric_pairs(cells: set[tuple[int, int]], rows: int, cols: int, count: int, rng: random.Random, pattern: str, mode: str) -> set[tuple[int, int]]:
    selected: set[tuple[int, int]] = set()
    orbits: list[list[tuple[int, int]]] = []
    seen = set()
    for r, c in sorted(cells):
        orbit = tuple(sorted(symmetry_orbit(r, c, rows, cols, mode) & cells))
        if orbit and orbit not in seen:
            seen.add(orbit)
            orbits.append(list(orbit))
    weighted = []
    for orbit in orbits:
        w = sum(weight_for_cell(r, c, rows, cols, pattern) for r, c in orbit) / len(orbit)
        weighted.append((w * rng.uniform(0.75, 1.25), orbit))
    weighted.sort(reverse=True, key=lambda x: x[0])
    for _, orbit in weighted:
        if len(selected) + len(orbit) > count:
            continue
        selected.update(orbit)
        if len(selected) >= count:
            break
    return selected


def build_height_map(gene: dict[str, Any], seed: int) -> tuple[list[list[int]], str, str]:
    rng = random.Random(seed)
    rows, cols = parse_grid_size(gene['gridSize'])
    pattern = gene.get('interferencePattern', 'soft_arch')
    base, variant, symmetry_mode = base_shape(rows, cols, gene, seed, rng)
    weights = gene.get('heightWeights', {'h1': 0.6, 'h2': 0.3, 'h3': 0.1})
    total_cells = len(base)
    h3_count = int(round(total_cells * float(weights.get('h3', 0.1))))
    h2_count = int(round(total_cells * float(weights.get('h2', 0.3))))
    h3_count = max(0, min(total_cells, h3_count))
    h2_count = max(0, min(total_cells - h3_count, h2_count))
    h3 = choose_symmetric_pairs(base, rows, cols, h3_count, rng, pattern, symmetry_mode)
    remaining = base - h3
    h2 = choose_symmetric_pairs(remaining, rows, cols, h2_count, rng, pattern, symmetry_mode)
    grid = [[0 for _ in range(cols)] for _ in range(rows)]
    for r, c in base:
        grid[r][c] = 1
    for r, c in h2:
        grid[r][c] = 2
    for r, c in h3:
        grid[r][c] = 3
    # 调整总数到 3 的倍数，但必须按左右镜像 pair 调整，不能单格破坏对称。
    def total_tiles() -> int:
        return sum(map(sum, grid))
    pair_orbits = []
    seen = set()
    for r, c in sorted(base):
        orbit = tuple(sorted(symmetry_orbit(r, c, rows, cols, symmetry_mode) & base))
        if len(orbit) >= 1 and orbit not in seen:
            seen.add(orbit)
            pair_orbits.append(list(orbit))
    guard = 0
    while total_tiles() % 3 and guard < 50:
        guard += 1
        # 加一个 pair 会 +2；mod=1 时加 1 个 pair，mod=2 时加 2 个 pair。
        pair_orbits.sort(key=lambda orbit: (sum(grid[r][c] for r, c in orbit), min(abs(c - (cols - 1) / 2) for _, c in orbit)))
        changed = False
        for orbit in pair_orbits:
            if all(0 < grid[r][c] < 3 for r, c in orbit):
                for r, c in orbit:
                    grid[r][c] += 1
                changed = True
                break
        if not changed:
            break
    if total_tiles() % 3:
        # 如果 orbit 增量无法满足，则丢弃这个 seed，由 main 生成下一个候选。
        return [], variant, symmetry_mode
    return grid, variant, symmetry_mode


def dir_for(r: int, c: int, rows: int, cols: int) -> tuple[int, int]:
    """Return a visually aligned and mirrored layer-step direction.

    偏移必须先服从棋盘的行列秩序：同一 row 的同层砖块使用相同 Y 方向，
    同一 col 的同层砖块使用相同 X 方向；左右/上下两侧按中心镜像反向。
    """
    center_r = (rows - 1) / 2
    center_c = (cols - 1) / 2
    center_band = 1.0

    if c < center_c - center_band:
        x = 1
    elif c > center_c + center_band:
        x = -1
    else:
        x = 0

    if r < center_r - center_band:
        y = -1
    elif r > center_r + center_band:
        y = 1
    else:
        y = 0

    return x, y


def detect_grid_symmetry(grid: list[list[int]]) -> str:
    rows, cols = len(grid), len(grid[0])
    lr = all(grid[r][c] == grid[r][cols - 1 - c] for r in range(rows) for c in range(cols))
    ud = all(grid[r][c] == grid[rows - 1 - r][c] for r in range(rows) for c in range(cols))
    rot = all(grid[r][c] == grid[rows - 1 - r][cols - 1 - c] for r in range(rows) for c in range(cols))
    diag = rows == cols and all(grid[r][c] == grid[c][r] for r in range(rows) for c in range(cols))
    if lr and ud:
        return 'quad'
    if rot:
        return 'rot'
    if ud:
        return 'ud'
    if diag:
        return 'diag'
    return 'lr'


def positions_from_height(grid: list[list[int]], seed: int) -> list[dict[str, Any]]:
    rows, cols = len(grid), len(grid[0])
    symmetry_mode = detect_grid_symmetry(grid)
    positions = []
    for layer in range(max(max(row) for row in grid)):
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] > layer:
                    t: dict[str, Any] = {'row': r, 'col': c, 'layer': layer}
                    if layer > 0:
                        dx, dy = dir_for(r, c, rows, cols)
                        # PCG 候选必须显式写入较小偏移系数，避免运行时回落到 BoardManager 的 0.5 默认值。
                        t['layerStepDirX'] = dx
                        t['layerStepDirY'] = dy
                        t['layerStepCoef'] = STEP_COEF
                    positions.append(t)
    # 根据高度图的主对称模式，约束偏移方向也保持对应对称。
    by = {(t['row'], t['col'], t['layer']): t for t in positions}

    def copy_dir(src: dict[str, Any], dst: dict[str, Any], sx: int, sy: int) -> None:
        dx = src.get('layerStepDirX', 1)
        dy = src.get('layerStepDirY', 1)
        coef = src.get('layerStepCoef', STEP_COEF)
        dst['layerStepDirX'] = dx * sx
        dst['layerStepDirY'] = dy * sy
        dst['layerStepCoef'] = coef

    for t in positions:
        if t['layer'] <= 0:
            continue
        r, c, layer = t['row'], t['col'], t['layer']
        if symmetry_mode in ('lr', 'quad'):
            mate = by.get((r, cols - 1 - c, layer))
            if mate and c <= cols - 1 - c:
                copy_dir(t, mate, -1, 1)
        if symmetry_mode in ('ud', 'quad'):
            mate = by.get((rows - 1 - r, c, layer))
            if mate and r <= rows - 1 - r:
                copy_dir(t, mate, 1, -1)
        if symmetry_mode == 'rot':
            mate = by.get((rows - 1 - r, cols - 1 - c, layer))
            if mate and (r, c) <= (rows - 1 - r, cols - 1 - c):
                copy_dir(t, mate, -1, -1)
    return positions


def bbox(positions: list[dict[str, Any]]) -> tuple[float, float]:
    min_x = min_y = 1e9
    max_x = max_y = -1e9
    for t in positions:
        coef = t.get('layerStepCoef', STEP_COEF)
        dx = t.get('layerStepDirX', 1)
        dy = t.get('layerStepDirY', 1)
        cx = t['col'] * RATIO + t['layer'] * RATIO * coef * dx
        cy = -t['row'] * RATIO + t['layer'] * RATIO * coef * dy
        min_x = min(min_x, cx - 0.5)
        max_x = max(max_x, cx + 0.5)
        min_y = min(min_y, cy - 0.5)
        max_y = max(max_y, cy + 0.5)
    return max_x - min_x, max_y - min_y


def assign_types(positions: list[dict[str, Any]], tile_types: list[str], gene: dict[str, Any], seed: int) -> dict[int, str]:
    rng = random.Random(seed + 31)
    groups = len(positions) // 3

    top: dict[tuple[int, int], int] = {}
    for idx, t in enumerate(positions):
        key = (t['row'], t['col'])
        if key not in top or t['layer'] > positions[top[key]]['layer']:
            top[key] = idx
    top_ids = sorted(top.values(), key=lambda idx: (positions[idx]['col'], positions[idx]['row']))

    icon_pool_size = int(gene.get('iconPoolSize', 7))
    k = float(gene.get('redundancyK', 1.2))
    desired_types = max(3, round(groups / max(1.01, k)))
    opening_range_for_pool = gene.get('openingFlow', {}).get('immediateMatches', [2, 3])
    target_for_pool = int(opening_range_for_pool[1]) if len(opening_range_for_pool) > 1 else int(opening_range_for_pool[0])
    min_types_for_top = max(3, target_for_pool + max(0, math.ceil((len(top_ids) - target_for_pool * 3) / 2)))
    type_count = min(len(tile_types), groups, max(icon_pool_size, desired_types, min_types_for_top))
    chosen = tile_types[:]
    rng.shuffle(chosen)
    chosen = chosen[:type_count]

    # 每个 type 的总数保持 3 的倍数；这是 Triple Tile 的硬约束。
    group_counts = {tp: 1 for tp in chosen}
    extra = groups - type_count
    order = chosen[:]
    rng.shuffle(order)
    i = 0
    while extra > 0:
        tp = order[i % len(order)]
        if group_counts[tp] < 4:
            group_counts[tp] += 1
            extra -= 1
        i += 1
    remaining = {tp: count * 3 for tp, count in group_counts.items()}

    assigned: dict[int, str] = {}
    top_counts: collections.Counter[str] = collections.Counter()
    opening_range = gene.get('openingFlow', {}).get('immediateMatches', [2, 3])
    opening_min = int(opening_range[0]) if opening_range else 2
    opening_max = int(opening_range[1]) if len(opening_range) > 1 else opening_min
    target_openings = min(max(opening_min, 2), opening_max, len(chosen), len(top_ids) // 3)
    opening_types = chosen[:target_openings]

    # 选择分布在左 / 中 / 右的 top tile 作为开局三消，避免全部集中一块。
    available_top = top_ids[:]
    for oi, tp in enumerate(opening_types):
        if remaining.get(tp, 0) < 3:
            continue
        thirds = [available_top[:max(1, len(available_top)//3)],
                  available_top[max(0, len(available_top)//2-2):min(len(available_top), len(available_top)//2+3)],
                  available_top[-max(1, len(available_top)//3):]]
        preferred = thirds[oi % len(thirds)]
        ids: list[int] = []
        for idx in preferred + available_top:
            if idx not in ids and idx in available_top:
                ids.append(idx)
            if len(ids) == 3:
                break
        if len(ids) < 3:
            continue
        for idx in ids:
            assigned[idx] = tp
            top_counts[tp] += 1
            remaining[tp] -= 1
            available_top.remove(idx)

    # 填充剩余 top tile：优先不让任何非开局 type 在顶层达到 3 个，控制 opening_matches 在目标区间。
    rng.shuffle(available_top)
    for idx in available_top:
        safe = [tp for tp in chosen if remaining.get(tp, 0) > 0 and top_counts[tp] < 2]
        if not safe:
            safe = [tp for tp in chosen if remaining.get(tp, 0) > 0 and (top_counts[tp] < 3 or tp in opening_types)]
        if not safe:
            safe = [tp for tp in chosen if remaining.get(tp, 0) > 0]
        tp = rng.choice(safe)
        assigned[idx] = tp
        top_counts[tp] += 1
        remaining[tp] -= 1

    pool: list[str] = []
    for tp, count in remaining.items():
        if count < 0:
            raise ValueError(f'negative remaining for {tp}')
        pool.extend([tp] * count)
    rng.shuffle(pool)
    if len(pool) != len(positions) - len(assigned):
        raise ValueError('type assignment pool mismatch')
    pi = 0
    for idx in range(len(positions)):
        if idx in assigned:
            continue
        assigned[idx] = pool[pi]
        pi += 1
    return assigned


def top_tiles(alive: frozenset[int], positions: list[dict[str, Any]]) -> list[int]:
    best: dict[tuple[int, int], int] = {}
    for idx in alive:
        t = positions[idx]
        key = (t['row'], t['col'])
        if key not in best or t['layer'] > positions[best[key]]['layer']:
            best[key] = idx
    return list(best.values())


def slot_after_pick(slot: tuple[str, ...], tp: str, cap=7) -> tuple[tuple[str, ...] | None, bool]:
    arr = list(slot) + [tp]
    if arr.count(tp) >= 3:
        removed = 0
        nxt = []
        for x in arr:
            if x == tp and removed < 3:
                removed += 1
            else:
                nxt.append(x)
        return tuple(nxt), True
    if len(arr) >= cap:
        return None, False
    return tuple(arr), False


def validate_candidate(positions: list[dict[str, Any]], types: dict[int, str], gene: dict[str, Any]) -> CandidateScore:
    alive0 = frozenset(range(len(positions)))
    top0 = top_tiles(alive0, positions)
    counts = collections.Counter(types[i] for i in top0)
    opening_matches = sum(1 for n in counts.values() if n >= 3)
    candidate_pairs = sum(1 for n in counts.values() if n == 2)
    regions = set()
    rows = max(t['row'] for t in positions) + 1
    cols = max(t['col'] for t in positions) + 1
    for i in top0:
        if counts[types[i]] >= 2:
            r, c = positions[i]['row'], positions[i]['col']
            if r < rows / 3:
                regions.add('top')
            elif r > rows * 2 / 3:
                regions.add('bottom')
            if c < cols / 3:
                regions.add('left')
            elif c > cols * 2 / 3:
                regions.add('right')
            if rows / 3 <= r <= rows * 2 / 3 and cols / 3 <= c <= cols * 2 / 3:
                regions.add('center')
    # v0.1 用“带预算的浅 DFS / beam DFS”。完整 DFS 在 70-100 张牌时分支爆炸，
    # 会导致候选批量生成卡住；这里先限制深度、节点数和每层分支，保留相对评分能力。
    depth_limit = min(int(gene.get('validatorThresholds', {}).get('dfsDepthLimit', 18)), 12)
    node_limit = int(gene.get('validatorThresholds', {}).get('maxSearchNodes', 2500))
    branch_limit = int(gene.get('validatorThresholds', {}).get('branchLimit', 6))
    memo = set()
    branching = []
    bottleneck = 0
    max_groups = 0
    nodes = 0

    def dfs(alive: frozenset[int], slot: tuple[str, ...], depth: int, groups: int, low_streak: int) -> None:
        nonlocal max_groups, bottleneck, nodes
        if nodes >= node_limit:
            return
        nodes += 1
        max_groups = max(max_groups, groups)
        bottleneck = max(bottleneck, low_streak)
        if depth >= depth_limit or not alive:
            return
        key = (alive, slot, depth)
        if key in memo:
            return
        memo.add(key)
        choices = top_tiles(alive, positions)
        branching.append(len(choices))
        next_low = low_streak + 1 if len(choices) <= 2 else 0
        # 优先尝试：能补槽内对子、当前顶层可见数量多、行列靠中的 tile。
        choices.sort(key=lambda i: (slot.count(types[i]), counts.get(types[i], 0), -abs(positions[i]['col'])), reverse=True)
        for idx in choices[:branch_limit]:
            next_slot, matched = slot_after_pick(slot, types[idx])
            if next_slot is None:
                continue
            dfs(frozenset(x for x in alive if x != idx), next_slot, depth + 1, groups + (1 if matched else 0), next_low)

    dfs(alive0, tuple(), 0, 0, 0)
    avg_branch = sum(branching) / len(branching) if branching else 0.0
    reasons = []
    thresholds = gene.get('validatorThresholds', {})
    if opening_matches < int(thresholds.get('minOpeningMatches', 2)):
        reasons.append('opening_matches_low')
    if opening_matches > int(thresholds.get('maxOpeningMatches', 3)):
        reasons.append('opening_matches_high')
    if avg_branch < float(thresholds.get('minBranchingFactor', 2.0)):
        reasons.append('branching_low')
    if bottleneck > int(thresholds.get('maxBottleneckDepth', 3)):
        reasons.append('bottleneck_high')
    return CandidateScore(opening_matches, candidate_pairs, len(regions), max_groups, avg_branch, bottleneck, len(reasons) == 0, reasons)


def make_level_json(gene: dict[str, Any], seed: int, candidate_index: int, positions: list[dict[str, Any]], types: dict[int, str], shape_variant: str, symmetry_mode: str) -> dict[str, Any]:
    rows, cols = parse_grid_size(gene['gridSize'])
    tiles = []
    for idx, pos in enumerate(positions):
        tiles.append({
            'id': f"G{candidate_index:03d}_T{idx + 1:03d}",
            'type': types[idx],
            **pos,
        })
    occupied = {(t['row'], t['col']) for t in positions}
    return {
        'id': candidate_index,
        'name': f"{gene['id']} seed {seed}",
        'difficulty': 1,
        'chapterId': 'generated_candidate',
        'subchapterId': gene['id'],
        'rows': rows,
        'cols': cols,
        'layers': max(t['layer'] for t in positions) + 1,
        'background': 'newtheme/bg/chapter1/1',
        'slotCapacity': 7,
        'masked': [[r, c] for r in range(rows) for c in range(cols) if (r, c) not in occupied],
        'goal': {'type': 'clearAll'},
        'tiles': tiles,
        'geneId': gene['id'],
        'geneSeed': seed,
        'shapeVariant': shape_variant,
        'shapeLabel': SHAPE_LABELS.get(shape_variant, shape_variant),
        'symmetryMode': symmetry_mode,
        'symmetryLabel': SYMMETRY_LABELS.get(symmetry_mode, symmetry_mode),
    }


def render_grid(level: dict[str, Any]) -> str:
    rows, cols = level['rows'], level['cols']
    heights = [[0] * cols for _ in range(rows)]
    for t in level['tiles']:
        heights[t['row']][t['col']] = max(heights[t['row']][t['col']], t['layer'] + 1)
    cells = []
    for row in heights:
        for h in row:
            cls = 'empty' if h == 0 else f'h{min(5, h)}'
            cells.append(f'<div class="cell {cls}">{h if h else ""}</div>')
    return f'<div class="grid" style="grid-template-columns:repeat({cols},18px)">{"".join(cells)}</div>'


def render_actual_grid(level: dict[str, Any]) -> str:
    if not level['tiles']:
        return '<div></div>'
    scale = 22
    size = 18
    min_x = min_y = 1e9
    max_x = max_y = -1e9
    pts = []
    for t in level['tiles']:
        coef = t.get('layerStepCoef', STEP_COEF)
        dx = t.get('layerStepDirX', 1)
        dy = t.get('layerStepDirY', 1)
        x = t['col'] * RATIO + t['layer'] * RATIO * coef * dx
        y = -t['row'] * RATIO + t['layer'] * RATIO * coef * dy
        min_x = min(min_x, x - 0.5)
        max_x = max(max_x, x + 0.5)
        min_y = min(min_y, y - 0.5)
        max_y = max(max_y, y + 0.5)
        pts.append((t, x, y))
    w = max(80, int((max_x - min_x) * scale + size + 8))
    h = max(80, int((max_y - min_y) * scale + size + 8))
    nodes = []
    for t, x, y in sorted(pts, key=lambda item: item[0]['layer']):
        left = int((x - min_x) * scale + 4)
        top = int((max_y - y) * scale + 4)
        cls = f"actual-tile l{min(5, t['layer'] + 1)}"
        label = html.escape(str(t.get('type', ''))[:2].upper())
        nodes.append(f'<div class="{cls}" style="left:{left}px;top:{top}px;z-index:{t["layer"] * 100 + t["row"] * 10 + t["col"]}">{label}</div>')
    return f'<div class="actual" style="width:{w}px;height:{h}px">{"".join(nodes)}</div>'


def write_preview(candidates: list[dict[str, Any]]) -> None:
    grouped: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for c in candidates:
        grouped[c['level'].get('shapeVariant', 'unknown')].append(c)

    shape_order = {shape: index for index, shape in enumerate(SHAPE_LABELS.keys())}
    sections = []
    for shape in sorted(grouped.keys(), key=lambda item: (shape_order.get(item, 999), item)):
        items = sorted(
            grouped[shape],
            key=lambda c: (
                -len(c['level']['tiles']),
                c['level'].get('geneId', ''),
                c['level'].get('geneSeed', 0),
            ),
        )
        tile_counts = [len(c['level']['tiles']) for c in items]
        label = items[0]['level'].get('shapeLabel', SHAPE_LABELS.get(shape, shape))
        cards = []
        for c in items:
            level = c['level']
            score = c['score']
            valid = 'ok' if score.valid else 'bad'
            cards.append(f'''
        <div class="card {valid}">
          <div class="title">{html.escape(level['name'])}</div>
          <div class="meta">{html.escape(level.get('shapeLabel', level.get('shapeVariant', 'shape')))} · {html.escape(level.get('symmetryLabel', level.get('symmetryMode', 'symmetry')))} · tiles {len(level['tiles'])} · {level['rows']}×{level['cols']} · layers {level['layers']}</div>
          <div class="views"><div><div class="label">高度图</div>{render_grid(level)}</div><div><div class="label">真实偏移</div>{render_actual_grid(level)}</div></div>
          <div class="meta">open {score.opening_matches} · pairs {score.candidate_pairs} · regions {score.region_count}</div>
          <div class="meta">dfsGroups {score.max_groups_in_depth} · branch {score.avg_branching:.1f} · bottleneck {score.bottleneck_depth}</div>
          <div class="reason">{', '.join(score.reasons) if score.reasons else 'valid'}</div>
        </div>
        ''')
        sections.append(f'''
      <section class="shape-section" id="shape-{html.escape(shape)}">
        <div class="section-title">
          <h2>{html.escape(label)}</h2>
          <span>{len(items)} 个候选 · tiles {max(tile_counts)} → {min(tile_counts)}</span>
        </div>
        <div class="wrap">{''.join(cards)}</div>
      </section>
      ''')

    html_text = f'''<!doctype html><html><head><meta charset="utf-8"><title>Level Gene Candidates</title><style>
    body{{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:#f5f5f7;margin:0;padding:18px;color:#1d1d1f}}
    h1{{font-size:22px;margin:0 0 8px}}h2{{font-size:18px;margin:0}}.shape-section{{margin-top:22px}}.section-title{{position:sticky;top:0;z-index:5;display:flex;align-items:baseline;gap:10px;background:#f5f5f7cc;backdrop-filter:blur(10px);padding:10px 0 8px;border-bottom:1px solid #d2d2d7}}.section-title span{{font-size:12px;color:#666}}
    .wrap{{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px}}
    .card{{background:#fff;border:1px solid #ddd;border-radius:16px;padding:12px;box-shadow:0 8px 24px #0001}}.card.bad{{opacity:.55}}
    .title{{font-weight:800;font-size:13px;margin-bottom:5px}}.meta,.reason,.label{{font-size:11px;color:#666;margin-top:6px}}.views{{display:flex;gap:10px;align-items:flex-start;overflow:auto}}
    .grid{{display:grid;gap:2px;width:max-content;background:#e5e5ea;padding:6px;border-radius:10px;margin-top:4px}}
    .cell{{width:18px;height:18px;border-radius:4px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800}}
    .empty{{background:#d1d1d6}}.h1{{background:#eef7ff}}.h2{{background:#bfe0ff}}.h3{{background:#7cc4ff}}.h4{{background:#34aadc;color:#fff}}.h5{{background:#0071e3;color:#fff}}
    .actual{{position:relative;background:#e5e5ea;border-radius:10px;margin-top:4px;overflow:visible}}.actual-tile{{position:absolute;width:18px;height:18px;border-radius:5px;background:#fff;border:1.5px solid #8b6f5a;box-shadow:0 1px 0 #0003;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:900;color:#5b4330}}.actual-tile.l1{{background:#fffaf2}}.actual-tile.l2{{background:#f9ead7}}.actual-tile.l3{{background:#f3dcc0}}.actual-tile.l4,.actual-tile.l5{{background:#e8c491}}
    </style></head><body><h1>Level Gene Candidates v0.1</h1><p>按形状分类；每个分类内按 tiles 数从高到低排列。只生成候选，不覆盖正式关卡。灰色为未过 v0.1 validator。</p>{''.join(sections)}</body></html>'''
    (OUT_DIR / 'index.html').write_text(html_text)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--seeds-per-gene', type=int, default=20)
    parser.add_argument('--clean', action='store_true')
    args = parser.parse_args()
    if args.clean and OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tile_types = load_tile_types()
    genes = [json.loads(path.read_text()) for path in sorted(GENE_DIR.glob('gene_*.json'))]
    all_candidates = []
    candidate_index = 1
    seen_signatures: dict[str, set[str]] = {}
    for gene in genes:
        gene_out = OUT_DIR / gene['id']
        gene_out.mkdir(parents=True, exist_ok=True)
        seed_start = int(gene.get('seedStart', 1000))
        seen_signatures.setdefault(gene['id'], set())
        shape_coverage_target = set(str(item) for item in gene.get('shapeVariants', [])) if gene.get('ensureShapeCoverage') else set()
        covered_shapes: set[str] = set()
        target_count = int(gene.get('candidatesPerGene', args.seeds_per_gene))
        excluded_seeds = set(int(item) for item in gene.get('excludeSeeds', []))
        offset = 0
        attempts = 0
        max_attempts = target_count * int(gene.get('maxAttemptsMultiplier', 8))
        # 为了去重和满足牌数范围，最多多尝试若干倍 seed；最终仍只收集 target_count 个候选。
        while offset < target_count and attempts < max_attempts:
            seed = seed_start + attempts
            attempts += 1
            if seed in excluded_seeds:
                continue
            grid, shape_variant, symmetry_mode = build_height_map(gene, seed)
            if not grid:
                continue
            signature = '|'.join(''.join(map(str, row)) for row in grid)
            if signature in seen_signatures[gene['id']]:
                continue
            seen_signatures[gene['id']].add(signature)
            positions = positions_from_height(grid, seed)
            if len(positions) % 3 != 0:
                continue
            tile_range = gene.get('tileCountRange')
            if tile_range and len(tile_range) >= 2:
                min_tiles, max_tiles = int(tile_range[0]), int(tile_range[1])
                if not (min_tiles <= len(positions) <= max_tiles):
                    continue
            if shape_coverage_target and shape_variant in covered_shapes and not shape_coverage_target <= covered_shapes:
                continue
            bw, bh = bbox(positions)
            rows, cols = parse_grid_size(gene['gridSize'])
            max_w = 1 + (cols - 1) * RATIO
            max_h = 1 + (rows - 1) * RATIO
            if bw > max_w + 1e-6 or bh > max_h + 1e-6:
                continue
            types = assign_types(positions, tile_types, gene, seed)
            score = validate_candidate(positions, types, gene)
            level = make_level_json(gene, seed, candidate_index, positions, types, shape_variant, symmetry_mode)
            candidate_dir = gene_out / f'seed_{seed}'
            candidate_dir.mkdir(parents=True, exist_ok=True)
            (candidate_dir / 'level.json').write_text(json.dumps(level, ensure_ascii=False, indent=2) + '\n')
            (candidate_dir / 'score.json').write_text(json.dumps(score.__dict__, ensure_ascii=False, indent=2) + '\n')
            candidate_path = f"/level_workbench/generated/level_gene_candidates/{gene['id']}/seed_{seed}/level.json"
            all_candidates.append({'level': level, 'score': score, 'path': candidate_path})
            covered_shapes.add(shape_variant)
            candidate_index += 1
            offset += 1
    summary = {
        'total': len(all_candidates),
        'valid': sum(1 for c in all_candidates if c['score'].valid),
        'genes': [g['id'] for g in genes],
    }
    manifest = [
        {
            'path': c['path'],
            'id': c['level']['id'],
            'name': c['level']['name'],
            'geneId': c['level'].get('geneId'),
            'geneSeed': c['level'].get('geneSeed'),
            'shapeVariant': c['level'].get('shapeVariant'),
            'shapeLabel': c['level'].get('shapeLabel'),
            'symmetryMode': c['level'].get('symmetryMode'),
            'symmetryLabel': c['level'].get('symmetryLabel'),
            'tiles': len(c['level']['tiles']),
            'rows': c['level']['rows'],
            'cols': c['level']['cols'],
            'layers': c['level']['layers'],
            'valid': c['score'].valid,
            'reasons': c['score'].reasons,
        }
        for c in sorted(all_candidates, key=lambda item: (item['level'].get('shapeLabel', ''), -len(item['level']['tiles']), item['level'].get('geneSeed', 0)))
    ]
    (OUT_DIR / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    (OUT_DIR / 'candidates.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    write_preview(all_candidates)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(OUT_DIR / 'index.html')


if __name__ == '__main__':
    main()
