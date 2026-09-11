import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkFile, readImage } from '../src/node.js';
import { run } from '../src/run.js';

let dir: string;
let jpg: string;

/** a textured image, so the plain-image check passes */
function textured(width: number, height: number) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      data[i] = (x * 97) % 256;
      data[i + 1] = (y * 53) % 256;
      data[i + 2] = ((x ^ y) * 31) % 256;
    }
  return sharp(data, { raw: { width, height, channels: 3 } });
}

async function cli(...argv: string[]) {
  let out = '';
  let err = '';
  const code = await run(argv, { out: (s) => (out += s), err: (s) => (err += s) });
  return { code, out, err };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cover-art-check-'));
  jpg = join(dir, 'cover.jpg');
  await textured(1200, 1200).jpeg().toFile(jpg);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('reading a file', () => {
  it('reads size, format, bytes, color and pixel stats', async () => {
    const img = await readImage(jpg);
    expect(img).toMatchObject({ width: 1200, height: 1200, format: 'jpg', color: { space: 'rgb', embeddedProfile: false, orientationTag: false } });
    expect(img.bytes).toBeGreaterThan(0);
    expect(img.pixel.colorEntropy).toBeGreaterThan(0.5);
  });
  it('checks a DistroKid upload end to end', async () => {
    const { rows } = await checkFile(jpg, { platforms: ['distrokid'] });
    expect(Object.fromEntries(rows.map((r) => [r.id, r.level]))).toEqual({
      size: 'warn',
      shape: 'pass',
      format: 'pass',
      color: 'pass',
      filesize: 'pass',
      text: 'skip',
      edges: 'skip',
      border: 'pass',
      simplicity: 'pass',
      sticker: 'skip',
    });
  });
  it('flags a PNG for DistroKid, and reads CMYK and grayscale', async () => {
    const png = join(dir, 'cover.png');
    await textured(1200, 1200).png().toFile(png);
    expect((await checkFile(png, { platforms: ['distrokid'] })).rows.find((r) => r.id === 'format')?.level).toBe('fail');
    const cmyk = join(dir, 'cmyk.jpg');
    await textured(600, 600).toColourspace('cmyk').jpeg().toFile(cmyk);
    expect((await readImage(cmyk)).color.space).toBe('cmyk');
    const gray = join(dir, 'gray.jpg');
    await textured(600, 600).toColourspace('b-w').jpeg().toFile(gray);
    expect((await readImage(gray)).color.space).toBe('gray');
  });
  it('applies the EXIF orientation to width and height', async () => {
    const turned = join(dir, 'turned.jpg');
    await textured(1200, 800).jpeg().withMetadata({ orientation: 6 }).toFile(turned);
    const img = await readImage(turned);
    expect(img).toMatchObject({ width: 800, height: 1200 });
    expect(img.color.orientationTag).toBe(true);
  });
});

describe('command line', () => {
  it('prints a report and exits 1 on a failure', async () => {
    const { code, out } = await cli(jpg, '--platforms', 'apple');
    expect(code).toBe(1);
    expect(out).toContain('1200×1200  JPG');
    expect(out).toContain('✗  1200×1200');
    expect(out).toContain('Below the minimum for Apple Music (4000).');
    expect(out).toContain('Not checked. Pass --text with each line on the cover, or --no-text.');
    expect(out).toMatch(/\d passed · 1 failed · 3 not checked/);
  });
  it('exits 0 when nothing fails, and --json prints every row', async () => {
    const { code, out } = await cli(jpg, '-p', 'distrokid', '--json');
    expect(code).toBe(0);
    const [report] = JSON.parse(out) as Array<{ rows: unknown[]; summary: { warn: number } }>;
    expect(report?.rows).toHaveLength(10);
    expect(report?.summary.warn).toBe(1);
  });
  it('passes --text, --no-text and --parental-advisory through', async () => {
    const withText = await cli(jpg, '-p', 'cdbaby', '--text', 'Neon Quiet', '--text', 'Out now', '--parental-advisory', 'yes', '--json');
    const rows = (JSON.parse(withText.out) as Array<{ rows: Array<{ id: string; level: string }> }>)[0]!.rows;
    expect(rows.find((r) => r.id === 'text')?.level).toBe('fail');
    expect(rows.find((r) => r.id === 'sticker')?.level).toBe('warn');
    const noText = await cli(jpg, '-p', 'cdbaby', '--no-text', '--json');
    const plain = (JSON.parse(noText.out) as Array<{ rows: Array<{ id: string; level: string }> }>)[0]!.rows;
    expect(plain.filter((r) => r.id === 'text' || r.id === 'edges').map((r) => r.level)).toEqual(['pass', 'pass']);
  });
  it('exits 2 on a wrong option or an unreadable file', async () => {
    expect(await cli(jpg, '--platforms', 'napster')).toMatchObject({ code: 2, err: expect.stringContaining('Unknown platform: napster') });
    expect(await cli(jpg, '--parental-advisory', 'maybe')).toMatchObject({ code: 2 });
    expect(await cli(jpg, '--text', 'x', '--no-text')).toMatchObject({ code: 2 });
    expect(await cli(join(dir, 'missing.jpg'))).toMatchObject({ code: 2, err: expect.stringContaining('missing.jpg') });
    expect(await cli()).toMatchObject({ code: 2 });
  });
  it('prints help and version', async () => {
    expect((await cli('--help')).out).toContain('Usage: cover-art-check');
    expect((await cli('--version')).out).toMatch(/^\d+\.\d+\.\d+\n$/);
  });
});
