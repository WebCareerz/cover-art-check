/**
 * Pixel statistics for the border and plain-image checks. Works on plain RGBA arrays, so it needs no canvas or
 * image library; a copy downscaled to about 512 px is enough and keeps it fast.
 */

export interface Rgba {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface PixelStats {
  /** depth of a uniform-color band on each edge as a fraction of the image (0 when none) */
  borderFraction: { top: number; right: number; bottom: number; left: number };
  /** normalized color entropy 0..1 */
  colorEntropy: number;
  /** fraction of pixels that are edges 0..1 */
  edgeDensity: number;
  /**
   * a photo-paper / print frame: where the strongest luminance step sits on each side (fraction from that edge), how
   * strong it is (0..255) and whether all four sides step the same way (a paper frame does; a subject that merely sits
   * in the middle of the picture does not)
   */
  frame?: { top: number; right: number; bottom: number; left: number; strength: number; sameDirection?: boolean };
}

function colorAt(img: Rgba, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4;
  return [img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0];
}

function close(a: [number, number, number], b: [number, number, number], tol: number): boolean {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
}

/** Depth (fraction) of a uniform band starting at one edge. Samples every other pixel along the edge line. */
function bandDepth(img: Rgba, side: 'top' | 'right' | 'bottom' | 'left', tol = 14): number {
  const n = side === 'top' || side === 'bottom' ? img.height : img.width;
  const len = side === 'top' || side === 'bottom' ? img.width : img.height;
  const reference = side === 'top' ? colorAt(img, 0, 0) : side === 'bottom' ? colorAt(img, 0, img.height - 1) : side === 'left' ? colorAt(img, 0, 0) : colorAt(img, img.width - 1, 0);
  let depth = 0;
  for (let d = 0; d < Math.floor(n / 2); d += 1) {
    let uniform = true;
    for (let k = 0; k < len; k += 2) {
      const c = side === 'top' ? colorAt(img, k, d) : side === 'bottom' ? colorAt(img, k, img.height - 1 - d) : side === 'left' ? colorAt(img, d, k) : colorAt(img, img.width - 1 - d, k);
      if (!close(c, reference, tol)) {
        uniform = false;
        break;
      }
    }
    if (!uniform) break;
    depth = d + 1;
  }
  return depth / n;
}

export function borderFraction(img: Rgba): PixelStats['borderFraction'] {
  return { top: bandDepth(img, 'top'), right: bandDepth(img, 'right'), bottom: bandDepth(img, 'bottom'), left: bandDepth(img, 'left') };
}

/** Shannon entropy of a 4×4×4 color histogram, normalized to 0..1. */
export function colorEntropy(img: Rgba): number {
  const bins = new Float64Array(64);
  const total = img.width * img.height;
  for (let i = 0; i < total; i += 1) {
    const r = (img.data[i * 4] ?? 0) >> 6;
    const g = (img.data[i * 4 + 1] ?? 0) >> 6;
    const b = (img.data[i * 4 + 2] ?? 0) >> 6;
    const idx = (r << 4) | (g << 2) | b;
    bins[idx] = (bins[idx] ?? 0) + 1;
  }
  let h = 0;
  for (const c of bins) {
    if (!c) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h / 6; // log2(64) = 6
}

/** Fraction of pixels whose luminance gradient exceeds a threshold (simple Sobel-ish). */
export function edgeDensity(img: Rgba, threshold = 40): number {
  const w = img.width;
  const h = img.height;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    lum[i] = 0.299 * (img.data[i * 4] ?? 0) + 0.587 * (img.data[i * 4 + 1] ?? 0) + 0.114 * (img.data[i * 4 + 2] ?? 0);
  }
  let edges = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const gx = (lum[y * w + x + 1] ?? 0) - (lum[y * w + x - 1] ?? 0);
      const gy = (lum[(y + 1) * w + x] ?? 0) - (lum[(y - 1) * w + x] ?? 0);
      if (Math.abs(gx) + Math.abs(gy) > threshold) edges += 1;
    }
  }
  return edges / Math.max(1, (w - 2) * (h - 2));
}

/**
 * A photo-paper frame is not a uniform band (it has shading, a shadow, a slight tilt), so bandDepth misses it. Instead:
 * average each row / column into one luminance value, walk inwards from every edge over the outer 20 %, and take the
 * strongest luminance step between 2 % and 18 % in. A print border shows a strong step at about the same depth on all
 * four sides; a normal photo has its strongest step anywhere and only on some sides.
 *
 * `sameDirection` says whether all four steps go the same way (the picture gets brighter — or darker — going inwards).
 * A sheet of photo paper is one colour all the way round, so it does; a bright panel inside the picture does not.
 * Measured on a false positive (2026-09-21): a blank billboard against an open sky stepped +89 / +64 / +68 on three
 * sides, and the fourth "side" was a barbed wire crossing the sky at a similar depth, stepping -79.
 */
export function frameInset(img: Rgba): NonNullable<PixelStats['frame']> {
  const luma = (x: number, y: number) => {
    const [r, g, b] = colorAt(img, x, y);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };
  const profile = (side: 'top' | 'right' | 'bottom' | 'left') => {
    const n = side === 'top' || side === 'bottom' ? img.height : img.width;
    const len = side === 'top' || side === 'bottom' ? img.width : img.height;
    const depth = Math.floor(n * 0.2);
    const out: number[] = [];
    for (let d = 0; d < depth; d += 1) {
      let sum = 0;
      let count = 0;
      for (let k = Math.floor(len * 0.1); k < Math.floor(len * 0.9); k += 2) {
        sum += side === 'top' ? luma(k, d) : side === 'bottom' ? luma(k, img.height - 1 - d) : side === 'left' ? luma(d, k) : luma(img.width - 1 - d, k);
        count += 1;
      }
      out.push(sum / Math.max(1, count));
    }
    return { out, n };
  };
  const strongest = (side: 'top' | 'right' | 'bottom' | 'left') => {
    const { out, n } = profile(side);
    let best = 0;
    let at = 0;
    let signed = 0;
    const lo = Math.max(2, Math.floor(n * 0.02));
    const hi = Math.min(out.length - 3, Math.floor(n * 0.18));
    for (let d = lo; d < hi; d += 1) {
      // step across a 3-line window so a slightly tilted edge still registers
      const delta = (out[d + 2]! + out[d + 1]!) / 2 - (out[d - 1]! + out[d - 2]!) / 2;
      const step = Math.abs(delta);
      if (step > best) {
        best = step;
        at = d;
        signed = delta;
      }
    }
    return { inset: at / n, strength: best, inward: Math.sign(signed) };
  };
  const t = strongest('top');
  const r = strongest('right');
  const b = strongest('bottom');
  const l = strongest('left');
  const inward = [t, r, b, l].map((x) => x.inward);
  return {
    top: t.inset,
    right: r.inset,
    bottom: b.inset,
    left: l.inset,
    strength: Math.min(t.strength, r.strength, b.strength, l.strength),
    sameDirection: inward.every((d) => d !== 0 && d === inward[0]),
  };
}

export function pixelStats(img: Rgba): PixelStats {
  return { borderFraction: borderFraction(img), colorEntropy: colorEntropy(img), edgeDensity: edgeDensity(img), frame: frameInset(img) };
}
