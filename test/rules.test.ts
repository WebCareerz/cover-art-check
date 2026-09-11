import { describe, expect, it } from 'vitest';
import {
  borderFraction,
  checkBorder,
  checkColor,
  checkEdges,
  checkFileSize,
  checkFormat,
  checkShape,
  checkSimplicity,
  checkSize,
  checkSticker,
  checkText,
  colorEntropy,
  edgeDensity,
  findForbiddenText,
  frameInset,
  pixelStats,
  runPreflight,
  summarize,
  type PreflightInput,
  type TextLine,
} from '../src/index.js';

const MIB = 1024 * 1024;
const title = (o: Partial<TextLine> = {}): TextLine => ({ text: 'Midnight Vending Machine', left: 0.06, top: 0.7, right: 0.9, bottom: 0.82, ...o });
const artist = (o: Partial<TextLine> = {}): TextLine => ({ text: 'Neon Quiet', left: 0.06, top: 0.9, right: 0.4, bottom: 0.94, ...o });
const input = (o: Partial<PreflightInput> = {}): PreflightInput => ({ width: 4000, height: 4000, format: 'jpg', platforms: ['spotify', 'apple', 'distrokid'], ...o });
const square = (size: number, platforms: PreflightInput['platforms']) => input({ width: size, height: size, platforms });
const flat = { borderFraction: { top: 0, right: 0, bottom: 0, left: 0 }, colorEntropy: 0.8, edgeDensity: 0.2 };

describe('size', () => {
  it('3000 fails Apple Music and suggests its minimum', () => {
    const row = checkSize(square(3000, ['spotify', 'apple', 'distrokid']));
    expect(row.level).toBe('fail');
    expect(row.reason).toBe('Below the minimum for Apple Music (4000).');
    expect(row.fix).toEqual({ kind: 'change_size', size: 4000 });
  });
  it('3000 passes without Apple Music', () => {
    expect(checkSize(square(3000, ['spotify', 'distrokid'])).level).toBe('pass');
  });
  it('says when the selected platforms cannot share one file', () => {
    const small = checkSize(square(3000, ['apple', 'tunecore']));
    expect(small.reason).toBe('Below the minimum for Apple Music (4000). No single size meets Apple Music (at least 4000) and TuneCore (at most 3000): export one file for each.');
    const big = checkSize(square(4000, ['apple', 'tunecore']));
    expect(big.level).toBe('fail');
    expect(big.reason).toMatch(/^Above the maximum for TuneCore \(3000\)\. No single size/);
    expect(big.fix).toEqual({ kind: 'change_size', size: 3000 });
  });
  it('Spotify: 639 fails, 640 and 10000 pass, 10001 fails', () => {
    expect(checkSize(square(639, ['spotify'])).level).toBe('fail');
    expect(checkSize(square(640, ['spotify'])).level).toBe('pass');
    expect(checkSize(square(10000, ['spotify'])).level).toBe('pass');
    expect(checkSize(square(10001, ['spotify'])).level).toBe('fail');
  });
  it('TuneCore: 1599 fails, 1600 and 3000 pass, 3001 fails', () => {
    expect(checkSize(square(1599, ['tunecore'])).level).toBe('fail');
    expect(checkSize(square(1600, ['tunecore'])).level).toBe('pass');
    expect(checkSize(square(3000, ['tunecore'])).level).toBe('pass');
    expect(checkSize(square(3001, ['tunecore'])).level).toBe('fail');
  });
  it('DistroKid: 999 fails and suggests 3000, 1000 warns, 3000 passes', () => {
    const row = checkSize(square(999, ['distrokid']));
    expect(row.level).toBe('fail');
    expect(row.fix).toEqual({ kind: 'change_size', size: 3000 });
    const warn = checkSize(square(1000, ['distrokid']));
    expect(warn.level).toBe('warn');
    expect(warn.reason).toBe("Above every minimum, but below the recommended size (DistroKid's 3000).");
    expect(checkSize(square(3000, ['distrokid'])).level).toBe('pass');
  });
  it('uses the short side for minimums and the long side for maximums', () => {
    expect(checkSize(input({ width: 4000, height: 3999, platforms: ['apple'] })).level).toBe('fail');
    expect(checkSize(input({ width: 3001, height: 1600, platforms: ['tunecore'] })).level).toBe('fail');
    expect(checkSize(input({ width: 4000, height: 3000, platforms: ['spotify'] })).label).toBe('4000×3000');
  });
  it('throws on no platform or an unknown one', () => {
    expect(() => checkSize(square(3000, []))).toThrow('Select at least one platform.');
    expect(() => checkSize(square(3000, ['napster' as never]))).toThrow('Unknown platform "napster"');
  });
});

describe('shape', () => {
  it('square passes', () => {
    expect(checkShape(square(3000, ['tunecore'])).level).toBe('pass');
  });
  it('fails where a platform requires square', () => {
    const row = checkShape(input({ width: 3000, height: 2000, platforms: ['distrokid', 'tunecore'] }));
    expect(row.level).toBe('fail');
    expect(row.label).toBe('Not square (3000×2000)');
    expect(row.reason).toBe('TuneCore requires square artwork.');
    expect(row.fix).toEqual({ kind: 'crop_square' });
  });
  it('warns where the platform crops automatically', () => {
    const row = checkShape(input({ width: 3000, height: 2000, platforms: ['distrokid'] }));
    expect(row.level).toBe('warn');
    expect(row.reason).toContain('DistroKid crops non-square artwork automatically');
  });
  it('warns when no selected platform states a shape (CD Baby)', () => {
    const row = checkShape(input({ width: 3000, height: 2000, platforms: ['cdbaby'] }));
    expect(row.level).toBe('warn');
    expect(row.reason).toContain('shown as a square');
  });
});

describe('format', () => {
  it('DistroKid takes JPG only', () => {
    const row = checkFormat(input({ format: 'png', platforms: ['distrokid', 'cdbaby'] }));
    expect(row.level).toBe('fail');
    expect(row.reason).toBe('Not accepted by DistroKid (JPG).');
    expect(row.fix).toEqual({ kind: 'convert_format', format: 'jpg' });
  });
  it('lists every platform that refuses the format and suggests one they all take', () => {
    const row = checkFormat(input({ format: 'webp', platforms: ['spotify', 'apple'] }));
    expect(row.reason).toBe('Not accepted by Spotify (JPG, PNG, TIFF) and Apple Music (JPG, PNG, GIF).');
    expect(row.fix).toEqual({ kind: 'convert_format', format: 'jpg' });
  });
  it('passes when no selected platform states a format, and ignores case', () => {
    expect(checkFormat(input({ format: 'webp', platforms: ['bandcamp'] })).level).toBe('pass');
    expect(checkFormat(input({ format: 'JPG', platforms: ['distrokid'] })).level).toBe('pass');
  });
});

describe('color', () => {
  it('is skipped without color information', () => {
    expect(checkColor(input()).level).toBe('skip');
  });
  it('CMYK fails where RGB is required, warns elsewhere', () => {
    const row = checkColor(input({ platforms: ['distrokid'], color: { space: 'cmyk', embeddedProfile: false } }));
    expect(row.level).toBe('fail');
    expect(row.reason).toBe('DistroKid requires RGB.');
    expect(checkColor(input({ platforms: ['apple'], color: { space: 'cmyk', embeddedProfile: false } })).level).toBe('warn');
  });
  it('grayscale fails where RGB is required', () => {
    const row = checkColor(input({ platforms: ['tunecore', 'cdbaby'], color: { space: 'gray', embeddedProfile: false } }));
    expect(row.level).toBe('fail');
    expect(row.reason).toBe('TuneCore and CD Baby require RGB, even for a black-and-white image.');
    expect(checkColor(input({ platforms: ['apple'], color: { space: 'gray', embeddedProfile: false } })).level).toBe('warn');
  });
  it('an embedded profile or orientation tag warns only for Spotify', () => {
    const profile = checkColor(input({ platforms: ['spotify'], color: { space: 'rgb', embeddedProfile: true } }));
    expect(profile.level).toBe('warn');
    expect(profile.reason).toContain("Spotify doesn't support an embedded color profile");
    expect(profile.fix).toEqual({ kind: 'strip_metadata' });
    const orientation = checkColor(input({ platforms: ['spotify'], color: { space: 'rgb', embeddedProfile: false, orientationTag: true } }));
    expect(orientation.reason).toContain('orientation tag');
    const apple = checkColor(input({ platforms: ['apple'], color: { space: 'rgb', embeddedProfile: true, orientationTag: true } }));
    expect(apple.level).toBe('pass');
    expect(apple.label).toBe('RGB, embedded color profile, orientation tag');
  });
});

describe('file size', () => {
  it('is skipped without a size', () => {
    expect(checkFileSize(input()).level).toBe('skip');
  });
  it('TuneCore 10 MB: passes under a million-byte megabyte, warns between the two, fails over 10 MiB', () => {
    const row = (bytes: number) => checkFileSize(input({ platforms: ['tunecore'], bytes }));
    expect(row(5_000_000).reason).toBe('Under the limit for TuneCore (10 MB).');
    expect(row(10_000_000).level).toBe('pass');
    expect(row(10_000_001).level).toBe('warn');
    expect(row(10 * MIB).level).toBe('warn');
    expect(row(10 * MIB + 1).level).toBe('fail');
    expect(row(10 * MIB + 1).fix).toEqual({ kind: 'lower_quality' });
  });
  it('CD Baby 25 MB; no limit for Spotify', () => {
    expect(checkFileSize(input({ platforms: ['cdbaby'], bytes: 26 * MIB })).reason).toBe('Over the limit for CD Baby (25 MB).');
    expect(checkFileSize(input({ platforms: ['spotify'], bytes: 40 * MIB })).reason).toBe('No file size limit on the selected platforms.');
    expect(checkFileSize(input({ platforms: ['spotify'], bytes: 2_200_000 })).label).toBe('File size 2.2 MB');
  });
});

describe('text', () => {
  it.each([
    ['visit www.neonquiet.com', 'a web address'],
    ['neonquiet.com', 'a web address'],
    ['follow @neonquiet', 'a social handle'],
    ['Summer 2026', 'a year'],
    ['out 12/05/2026', 'a date'],
    ['$4.99 single', 'a price'],
    ['Exclusive mix', 'the word "Exclusive"'],
    ['Limited CD edition', 'a physical format such as "CD"'],
    ['UPC 012345678905', 'a barcode or code number'],
    ['Out on Spotify', 'a store or streaming service name'],
    ['Parental Advisory', 'a Parental Advisory phrase'],
    ['Out now', 'promotional wording'],
  ])('flags %s as %s', (text, what) => {
    expect(findForbiddenText(text)?.what).toBe(what);
  });
  it('allows ordinary titles and release details', () => {
    for (const text of ['Midnight Vending Machine', 'Room 302', 'Velvet, Still Wet', 'feat. Neon Quiet · EP']) expect(findForbiddenText(text)).toBeNull();
  });
  it('names the rule of each selected platform and points at the line', () => {
    const row = checkText(input({ platforms: ['apple', 'distrokid', 'spotify'], text: [title(), artist({ text: 'www.neonquiet.com' })] }));
    expect(row.level).toBe('fail');
    expect(row.reason).toBe('"www.neonquiet.com": Apple Music allows only the artist name and title on the cover; DistroKid doesn\'t allow a web address.');
    expect(row.fix).toEqual({ kind: 'remove_text', index: 1, match: 'www.neonquiet.com' });
  });
  it('warns when no selected platform rules it out, and says which do', () => {
    const row = checkText(input({ platforms: ['spotify', 'bandcamp'], text: [title({ text: 'Summer 2026' })] }));
    expect(row.level).toBe('warn');
    expect(row.reason).toBe('"2026": none of the selected platforms rules it out, but Apple Music and TuneCore do.');
  });
  it('a fail on a later line wins over a warning on an earlier one', () => {
    const row = checkText(input({ platforms: ['distrokid'], text: [title({ text: 'Summer 2026' }), artist({ text: 'Only $1' })] }));
    expect(row.level).toBe('fail');
    expect(row.fix).toMatchObject({ index: 1 });
  });
  it('is skipped without text; an empty list means no text', () => {
    expect(checkText(input()).level).toBe('skip');
    expect(checkText(input({ text: [] })).label).toBe('No text on the cover');
    expect(checkText(input({ text: [{ text: '  ' }] })).level).toBe('pass');
    expect(checkText(input({ text: [title(), artist()] })).label).toBe('No web addresses, prices or handles');
  });
});

describe('safe margin (4% warn, 2% fail)', () => {
  it('is skipped without text or without positions', () => {
    expect(checkEdges(input()).level).toBe('skip');
    const row = checkEdges(input({ text: [{ text: 'Neon Quiet' }] }));
    expect(row.level).toBe('skip');
    expect(row.reason).toContain('position');
    expect(checkEdges(input({ text: [] })).level).toBe('pass');
  });
  it('3% warns and names the line', () => {
    const row = checkEdges(input({ text: [title(), artist({ left: 0.03 })] }));
    expect(row.level).toBe('warn');
    expect(row.label).toBe('"Neon Quiet" 3% from the edge');
    expect(row.fix).toEqual({ kind: 'nudge_inside', index: 1 });
  });
  it('exactly 4% passes, 3.99% warns, exactly 2% warns, 1.99% fails', () => {
    expect(checkEdges(input({ text: [title({ left: 0.04 })] })).level).toBe('pass');
    expect(checkEdges(input({ text: [title({ left: 0.0399 })] })).level).toBe('warn');
    expect(checkEdges(input({ text: [title({ left: 0.02 })] })).level).toBe('warn');
    expect(checkEdges(input({ text: [title({ left: 0.0199 })] })).level).toBe('fail');
  });
  it('checks the bottom and right edges, and shortens long lines in the label', () => {
    expect(checkEdges(input({ text: [title({ bottom: 0.99 })] })).level).toBe('fail');
    expect(checkEdges(input({ text: [title({ right: 0.97 })] })).level).toBe('warn');
    expect(checkEdges(input({ text: [title({ text: 'A very long title that keeps going', left: 0.01 })] })).label).toBe('"A very long title that…" 1% from the edge');
  });
});

describe('Parental Advisory label', () => {
  it('is skipped unless stated; absent passes', () => {
    expect(checkSticker(input()).level).toBe('skip');
    expect(checkSticker(input({ parentalAdvisory: false })).level).toBe('pass');
  });
  it('present warns, and names Apple Music when selected', () => {
    const row = checkSticker(input({ parentalAdvisory: true }));
    expect(row.level).toBe('warn');
    expect(row.reason).toBe("Flag the release explicit when you upload it. Apple Music rejects the label on releases that aren't explicit.");
    expect(checkSticker(input({ parentalAdvisory: true, platforms: ['distrokid'] })).reason).toBe('Flag the release explicit when you upload it.');
  });
});

describe('border and detail', () => {
  it('are skipped without pixel stats', () => {
    expect(checkBorder(input()).level).toBe('skip');
    expect(checkSimplicity(input()).level).toBe('skip');
  });
  it('flags a uniform border wider than 2% on all sides, not a band on one side', () => {
    const row = checkBorder(input({ pixel: { ...flat, borderFraction: { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 } } }));
    expect(row.level).toBe('warn');
    expect(row.fix).toEqual({ kind: 'crop_border', percent: 5 });
    expect(checkBorder(input({ pixel: { ...flat, borderFraction: { top: 0.3, right: 0, bottom: 0, left: 0 } } })).level).toBe('pass');
  });
  it('flags low color variety together with few edges, not either alone', () => {
    expect(checkSimplicity(input({ pixel: { ...flat, colorEntropy: 0.2, edgeDensity: 0.01 } })).level).toBe('warn');
    expect(checkSimplicity(input({ pixel: { ...flat, colorEntropy: 0.2, edgeDensity: 0.2 } })).level).toBe('pass');
    expect(checkSimplicity(input({ pixel: { ...flat, colorEntropy: 0.9, edgeDensity: 0.01 } })).level).toBe('pass');
  });
});

function image(w: number, h: number, paint: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  return { data, width: w, height: h };
}

describe('print-frame detection (a shaded photo-paper border is not a uniform band)', () => {
  // frame: near-white with a soft shadow gradient; picture: mid-dark with texture
  const framed = (size: number, inset: number) =>
    image(size, size, (x, y) => {
      const inFrame = x < inset || y < inset || x >= size - inset || y >= size - inset;
      const v = inFrame ? 230 - Math.round(((x + y) / (2 * size)) * 25) : 70 + ((x * 7 + y * 13) % 40);
      return [v, v, v];
    });
  it('finds the frame edge at the same depth on all four sides', () => {
    const img = framed(256, 12);
    const f = frameInset(img);
    expect(f.strength).toBeGreaterThan(100);
    for (const v of [f.top, f.right, f.bottom, f.left]) expect(Math.abs(v - 12 / 256)).toBeLessThan(0.01);
    const row = checkBorder(input({ pixel: pixelStats(img) }));
    expect(row.level).toBe('warn'); // either detector may fire on this synthetic frame; both offer the crop
    expect(row.fix?.kind).toBe('crop_border');
    expect([5, 6]).toContain((row.fix as { percent: number }).percent);
  });
  it('does not fire on a textured picture without a frame', () => {
    const img = framed(256, 0);
    expect(frameInset(img).strength).toBeLessThan(40);
    expect(checkBorder(input({ pixel: pixelStats(img) })).level).toBe('pass');
  });
});

describe('pixel stats', () => {
  it('detects a 10% white frame around noise', () => {
    const img = image(100, 100, (x, y) => (x < 10 || y < 10 || x >= 90 || y >= 90 ? [255, 255, 255] : [(x * 37) % 256, (y * 91) % 256, ((x + y) * 13) % 256]));
    const b = borderFraction(img);
    for (const v of [b.top, b.right, b.bottom, b.left]) expect(v).toBeCloseTo(0.1, 2);
  });
  it('a flat single color has zero entropy and no edges; noise is high on both', () => {
    const flatImg = image(64, 64, () => [40, 40, 40]);
    expect(colorEntropy(flatImg)).toBe(0);
    expect(edgeDensity(flatImg)).toBe(0);
    const noisy = image(64, 64, (x, y) => [(x * 97) % 256, (y * 53) % 256, ((x ^ y) * 31) % 256]);
    expect(colorEntropy(noisy)).toBeGreaterThan(0.7);
    expect(edgeDensity(noisy)).toBeGreaterThan(0.5);
    expect(pixelStats(noisy).borderFraction.top).toBe(0);
  });
});

describe('runPreflight + summarize', () => {
  it('runs every check in order; the README example adds up', () => {
    const rows = runPreflight({
      width: 3000,
      height: 3000,
      format: 'jpg',
      bytes: 2_200_000,
      platforms: ['apple', 'distrokid', 'tunecore'],
      color: { space: 'rgb', embeddedProfile: false },
      text: [title(), artist()],
    });
    expect(rows.map((r) => r.id)).toEqual(['size', 'shape', 'format', 'color', 'filesize', 'text', 'edges', 'border', 'simplicity', 'sticker']);
    expect(summarize(rows)).toEqual({ pass: 6, warn: 0, fail: 1, skip: 3, text: '6 passed · 1 failed · 3 not checked' });
  });
  it('counts warnings', () => {
    const rows = runPreflight(input({ platforms: ['distrokid'], width: 1000, height: 1000, parentalAdvisory: true }));
    expect(summarize(rows).text).toBe('2 passed · 2 warnings · 6 not checked');
  });
});
