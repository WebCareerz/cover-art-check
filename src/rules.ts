/**
 * The checks. Pure functions over a description of the image, so they run anywhere (browser, Node, Workers) and in
 * tests without decoding a file. A check that wasn't given what it needs reports `skip`, never `pass`.
 */
import type { PixelStats } from './pixels.js';
import { getPlatform, PLATFORMS, type ForbiddenKind, type PlatformId, type PlatformSpec } from './specs.js';

export type Level = 'pass' | 'warn' | 'fail' | 'skip';
export type CheckId = 'size' | 'shape' | 'format' | 'color' | 'filesize' | 'text' | 'edges' | 'border' | 'simplicity' | 'sticker';

/** A machine-readable suggestion an editor can apply. */
export type FixAction =
  | { kind: 'change_size'; size: number }
  | { kind: 'crop_square' }
  | { kind: 'convert_format'; format: string }
  | { kind: 'convert_rgb' }
  | { kind: 'strip_metadata' }
  | { kind: 'lower_quality' }
  | { kind: 'remove_text'; index: number; match: string }
  | { kind: 'nudge_inside'; index: number }
  | { kind: 'crop_border'; percent: number }
  | { kind: 'remove_sticker' };

export interface CheckRow {
  id: CheckId;
  level: Level;
  label: string;
  reason: string;
  fix?: FixAction;
}

export interface TextLine {
  text: string;
  /** bounding box as fractions of the image (0..1); all four are needed for the safe-margin check */
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}

export interface ColorInfo {
  space: 'rgb' | 'cmyk' | 'gray';
  embeddedProfile: boolean;
  /** the file carries an EXIF orientation tag */
  orientationTag?: boolean;
}

export interface PreflightInput {
  width: number;
  height: number;
  /** lower-case file extension: 'jpg', 'png', 'gif', 'tiff', 'webp', … */
  format: string;
  platforms: PlatformId[];
  /** file size in bytes */
  bytes?: number;
  color?: ColorInfo;
  /** the words on the cover, one entry per line; [] means the cover has no text */
  text?: TextLine[];
  /** whether the cover carries a Parental Advisory label */
  parentalAdvisory?: boolean;
  /** from pixelStats() */
  pixel?: PixelStats;
}

/** Text closer to the edge than this warns. This library's guideline, not a platform rule. */
export const EDGE_WARN = 0.04;
export const EDGE_FAIL = 0.02;
export const BORDER_WARN = 0.02;
/** minimum luminance step (0..255) on the weakest side for a print frame to count; a real print frame scores ~158, ordinary covers 2–25 */
export const FRAME_STEP_MIN = 40;
export const ENTROPY_LOW = 0.35;
export const EDGE_DENSITY_LOW = 0.03;

const MB = 1_000_000;
const MIB = 1024 * 1024;

const FORBIDDEN_TEXT: Array<{ kind: ForbiddenKind; pattern: RegExp; what: string }> = [
  { kind: 'url', pattern: /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|me|fm|app|tv|xyz|link|info|biz)\b/i, what: 'a web address' },
  { kind: 'handle', pattern: /(?:^|\s)@[a-z0-9_.]{2,}/i, what: 'a social handle' },
  { kind: 'date', pattern: /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/, what: 'a date' },
  { kind: 'year', pattern: /\b(?:19|20)\d{2}\b/, what: 'a year' },
  { kind: 'price', pattern: /[$€£]\s?\d|\b\d+(?:\.\d{2})?\s?(?:usd|eur|gbp|dollars?)\b/i, what: 'a price' },
  { kind: 'exclusive', pattern: /\bexclusive\b/i, what: 'the word "Exclusive"' },
  { kind: 'format', pattern: /\b(?:cd|dvd|vinyl|cassette|lp|mp3|digital download)\b/i, what: 'a physical format such as "CD"' },
  { kind: 'barcode', pattern: /\b(?:barcode|upc|isrc|isbn|ean)\b|\b\d{12,13}\b/i, what: 'a barcode or code number' },
  { kind: 'store', pattern: /\b(?:itunes|apple music|spotify|amazon music|youtube music|tidal|deezer|soundcloud)\b/i, what: 'a store or streaming service name' },
  { kind: 'advisory', pattern: /\b(?:parental advisory|explicit content)\b/i, what: 'a Parental Advisory phrase' },
  { kind: 'promo', pattern: /\b(?:new|out now|available now|coming soon|pre-?order|stream now|download now)\b/i, what: 'promotional wording' },
];

export interface ForbiddenHit {
  kind: ForbiddenKind;
  what: string;
  match: string;
}

/** The first thing in `text` that some platform rules out, or null. */
export function findForbiddenText(text: string): ForbiddenHit | null {
  for (const rule of FORBIDDEN_TEXT) {
    const m = rule.pattern.exec(text);
    if (m) return { kind: rule.kind, what: rule.what, match: m[0].trim() };
  }
  return null;
}

/** Platforms (among `specs`) whose rules rule out this kind of text. */
export function forbiddenBy(kind: ForbiddenKind, specs: readonly PlatformSpec[] = PLATFORMS): PlatformSpec[] {
  return specs.filter((s) => s.artistTitleOnly || s.forbids?.includes(kind));
}

function joinNames(specs: readonly PlatformSpec[]): string {
  const names = specs.map((s) => s.name);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "requires" for one platform, "require" for several */
function verb(specs: readonly unknown[], one: string, many: string): string {
  return specs.length === 1 ? one : many;
}

function specsOf(input: PreflightInput): PlatformSpec[] {
  if (!input.platforms.length) throw new Error('Select at least one platform.');
  return input.platforms.map(getPlatform);
}

function skip(id: CheckId, label: string, reason: string): CheckRow {
  return { id, level: 'skip', label, reason };
}

/** When the selected platforms can't share one file: the largest minimum is above the smallest maximum. */
function sizeConflict(specs: PlatformSpec[]): string {
  const hi = specs.reduce((a, b) => (b.minSize > a.minSize ? b : a));
  const capped = specs.filter((s) => s.maxSize !== undefined);
  if (!capped.length) return '';
  const lo = capped.reduce((a, b) => (b.maxSize! < a.maxSize! ? b : a));
  if (hi.minSize <= lo.maxSize!) return '';
  return ` No single size meets ${hi.name} (at least ${hi.minSize}) and ${lo.name} (at most ${lo.maxSize}): export one file for each.`;
}

export function checkSize(input: PreflightInput): CheckRow {
  const specs = specsOf(input);
  const { width, height } = input;
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  const label = `${width}×${height}`;
  const tooSmall = specs.filter((s) => short < s.minSize);
  const tooBig = specs.filter((s) => s.maxSize !== undefined && long > s.maxSize);
  if (tooSmall.length) {
    const size = Math.max(...tooSmall.map((s) => Math.max(s.minSize, s.recommendedSize ?? 0)));
    const list = tooSmall.map((s) => `${s.name} (${s.minSize})`);
    return { id: 'size', level: 'fail', label, reason: `Below the minimum for ${joinList(list)}.${sizeConflict(specs)}`, fix: { kind: 'change_size', size } };
  }
  if (tooBig.length) {
    const size = Math.min(...tooBig.map((s) => s.maxSize!));
    const list = tooBig.map((s) => `${s.name} (${s.maxSize})`);
    return { id: 'size', level: 'fail', label, reason: `Above the maximum for ${joinList(list)}.${sizeConflict(specs)}`, fix: { kind: 'change_size', size } };
  }
  const belowRecommended = specs.filter((s) => s.recommendedSize !== undefined && short < s.recommendedSize);
  if (belowRecommended.length) {
    const size = Math.max(...belowRecommended.map((s) => s.recommendedSize!));
    const list = belowRecommended.map((s) => `${s.name}'s ${s.recommendedSize}`);
    return { id: 'size', level: 'warn', label, reason: `Above every minimum, but below the recommended size (${joinList(list)}).`, fix: { kind: 'change_size', size } };
  }
  return { id: 'size', level: 'pass', label, reason: 'Within the size range of every selected platform.' };
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function checkShape(input: PreflightInput): CheckRow {
  const specs = specsOf(input);
  if (input.width === input.height) return { id: 'shape', level: 'pass', label: 'Square', reason: 'Width and height are equal.' };
  const label = `Not square (${input.width}×${input.height})`;
  const required = specs.filter((s) => s.square === 'required');
  if (required.length) {
    return { id: 'shape', level: 'fail', label, reason: `${joinNames(required)} ${verb(required, 'requires', 'require')} square artwork.`, fix: { kind: 'crop_square' } };
  }
  const adjusted = specs.filter((s) => s.square === 'adjusted');
  if (adjusted.length) {
    return { id: 'shape', level: 'warn', label, reason: `${joinNames(adjusted)} ${verb(adjusted, 'crops', 'crop')} non-square artwork automatically. Crop it yourself to choose what stays.`, fix: { kind: 'crop_square' } };
  }
  return { id: 'shape', level: 'warn', label, reason: 'Cover art is shown as a square. Crop it yourself to choose what stays.', fix: { kind: 'crop_square' } };
}

export function checkFormat(input: PreflightInput): CheckRow {
  const specs = specsOf(input);
  const format = input.format.toLowerCase();
  const label = `${format.toUpperCase()} file`;
  const stated = specs.filter((s) => s.formats);
  if (!stated.length) return { id: 'format', level: 'pass', label, reason: 'None of the selected platforms states a file format.' };
  const rejecting = stated.filter((s) => !s.formats!.includes(format));
  if (rejecting.length) {
    const list = rejecting.map((s) => `${s.name} (${s.formats!.map((f) => f.toUpperCase()).join(', ')})`);
    const common = stated.reduce<string[]>((acc, s) => acc.filter((f) => s.formats!.includes(f)), [...stated[0]!.formats!]);
    const target = common.includes('jpg') ? 'jpg' : common[0];
    return { id: 'format', level: 'fail', label, reason: `Not accepted by ${joinList(list)}.`, ...(target ? { fix: { kind: 'convert_format', format: target } } : {}) };
  }
  return { id: 'format', level: 'pass', label, reason: `Accepted by ${joinNames(stated)}.` };
}

export function checkColor(input: PreflightInput): CheckRow {
  if (!input.color) return skip('color', 'Color', 'Not checked. Pass the color space and whether a profile is embedded as `color`.');
  const specs = specsOf(input);
  const rgb = specs.filter((s) => s.colorMode);
  const { space, embeddedProfile, orientationTag } = input.color;
  if (space === 'cmyk') {
    return {
      id: 'color',
      level: rgb.length ? 'fail' : 'warn',
      label: 'CMYK',
      reason: rgb.length ? `${joinNames(rgb)} ${verb(rgb, 'requires', 'require')} RGB.` : 'Screens show RGB, and CMYK colors shift when converted. Convert it before uploading.',
      fix: { kind: 'convert_rgb' },
    };
  }
  if (space === 'gray') {
    return {
      id: 'color',
      level: rgb.length ? 'fail' : 'warn',
      label: 'Grayscale',
      reason: rgb.length ? `${joinNames(rgb)} ${verb(rgb, 'requires', 'require')} RGB, even for a black-and-white image.` : 'Distributors usually ask for RGB. Save the image as RGB even if it looks black and white.',
      fix: { kind: 'convert_rgb' },
    };
  }
  const label = ['RGB', embeddedProfile ? 'embedded color profile' : 'no embedded profile', ...(orientationTag ? ['orientation tag'] : [])].join(', ');
  const issues: string[] = [];
  const noProfile = specs.filter((s) => s.noEmbeddedProfile);
  if (embeddedProfile && noProfile.length) issues.push(`${joinNames(noProfile)} ${verb(noProfile, "doesn't", "don't")} support an embedded color profile: convert to sRGB and remove it`);
  const noOrientation = specs.filter((s) => s.noOrientationTag);
  if (orientationTag && noOrientation.length) issues.push(`${joinNames(noOrientation)} ${verb(noOrientation, "doesn't", "don't")} support an orientation tag: rotate the pixels and remove it`);
  if (issues.length) return { id: 'color', level: 'warn', label, reason: `${issues.join('. ')}.`, fix: { kind: 'strip_metadata' } };
  return { id: 'color', level: 'pass', label, reason: 'Meets the color rules of the selected platforms.' };
}

export function checkFileSize(input: PreflightInput): CheckRow {
  if (input.bytes === undefined) return skip('filesize', 'File size', 'Not checked. Pass the file size as `bytes`.');
  const specs = specsOf(input);
  const bytes = input.bytes;
  const label = `File size ${(bytes / MB).toFixed(1)} MB`;
  const limited = specs.filter((s) => s.maxMegabytes !== undefined);
  if (!limited.length) return { id: 'filesize', level: 'pass', label, reason: 'No file size limit on the selected platforms.' };
  const over = limited.filter((s) => bytes > s.maxMegabytes! * MIB);
  if (over.length) {
    const list = over.map((s) => `${s.name} (${s.maxMegabytes} MB)`);
    return { id: 'filesize', level: 'fail', label, reason: `Over the limit for ${joinList(list)}.`, fix: { kind: 'lower_quality' } };
  }
  // the pages say "MB" without saying which: between 10,000,000 and 10,485,760 bytes it depends on the uploader
  const maybe = limited.filter((s) => bytes > s.maxMegabytes! * MB);
  if (maybe.length) {
    const list = maybe.map((s) => `${s.name} (${s.maxMegabytes} MB)`);
    return { id: 'filesize', level: 'warn', label, reason: `Over the limit for ${joinList(list)} if a megabyte is counted as 1,000,000 bytes.`, fix: { kind: 'lower_quality' } };
  }
  const list = limited.map((s) => `${s.name} (${s.maxMegabytes} MB)`);
  return { id: 'filesize', level: 'pass', label, reason: `Under the limit for ${joinList(list)}.` };
}

export function checkText(input: PreflightInput): CheckRow {
  if (!input.text) return skip('text', 'Text', 'Not checked. Pass the words on the cover as `text`.');
  const specs = specsOf(input);
  let soft: CheckRow | null = null;
  for (const [index, line] of input.text.entries()) {
    const hit = findForbiddenText(line.text);
    if (!hit) continue;
    const label = `Text mentions ${hit.what}`;
    const fix: FixAction = { kind: 'remove_text', index, match: hit.match };
    const selected = forbiddenBy(hit.kind, specs);
    if (selected.length) {
      const only = selected.filter((s) => s.artistTitleOnly);
      const named = selected.filter((s) => !s.artistTitleOnly);
      const parts: string[] = [];
      if (only.length) parts.push(`${joinNames(only)} ${verb(only, 'allows', 'allow')} only the artist name and title on the cover`);
      if (named.length) parts.push(`${joinNames(named)} ${verb(named, "doesn't", "don't")} allow ${hit.what}`);
      return { id: 'text', level: 'fail', label, reason: `"${hit.match}": ${parts.join('; ')}.`, fix };
    }
    const elsewhere = forbiddenBy(hit.kind);
    soft ??= { id: 'text', level: 'warn', label, reason: `"${hit.match}": none of the selected platforms rules it out, but ${joinNames(elsewhere)} ${verb(elsewhere, 'does', 'do')}.`, fix };
  }
  if (soft) return soft;
  if (!input.text.some((l) => l.text.trim())) return { id: 'text', level: 'pass', label: 'No text on the cover', reason: 'No words to check.' };
  return { id: 'text', level: 'pass', label: 'No web addresses, prices or handles', reason: 'None of the words is ruled out by the selected platforms.' };
}

function quote(text: string): string {
  const t = text.trim();
  return `"${t.length > 24 ? `${t.slice(0, 23).trimEnd()}…` : t}"`;
}

export function checkEdges(input: PreflightInput): CheckRow {
  if (!input.text) return skip('edges', 'Safe margin', 'Not checked. Pass `text` with the position of each line.');
  const lines = input.text.map((line, index) => ({ line, index })).filter(({ line }) => line.text.trim());
  if (!lines.length) return { id: 'edges', level: 'pass', label: 'Safe margin', reason: 'No text on the cover.' };
  if (lines.some(({ line }) => [line.left, line.top, line.right, line.bottom].some((v) => v === undefined))) {
    return skip('edges', 'Safe margin', 'Not checked. Needs the position of each line of text.');
  }
  let worst: { line: TextLine; index: number; distance: number } | null = null;
  for (const { line, index } of lines) {
    const distance = Math.min(line.left!, line.top!, 1 - line.right!, 1 - line.bottom!);
    if (!worst || distance < worst.distance) worst = { line, index, distance };
  }
  const w = worst!;
  const pct = Math.round(w.distance * 100);
  const label = `${quote(w.line.text)} ${pct}% from the edge`;
  if (w.distance < EDGE_FAIL) {
    return { id: 'edges', level: 'fail', label, reason: 'Touches the edge: rounded corners and cropped player views will cut it off.', fix: { kind: 'nudge_inside', index: w.index } };
  }
  if (w.distance < EDGE_WARN) {
    return { id: 'edges', level: 'warn', label, reason: 'Inside 4% may be cut off by rounded corners and some player views. A guideline, not a platform rule.', fix: { kind: 'nudge_inside', index: w.index } };
  }
  return { id: 'edges', level: 'pass', label: 'Text inside the safe margin', reason: `Closest text is ${pct}% from the edge.` };
}

export function checkBorder(input: PreflightInput): CheckRow {
  if (!input.pixel) return skip('border', 'Border', 'Not checked. Pass `pixel` from pixelStats().');
  const b = input.pixel.borderFraction;
  const min = Math.min(b.top, b.right, b.bottom, b.left);
  if (min > BORDER_WARN) {
    const pct = Math.round(min * 100);
    return { id: 'border', level: 'warn', label: `Even border on all four sides (${pct}%)`, reason: 'A frame or photo-paper border looks like a mockup, and distributors flag mockups.', fix: { kind: 'crop_border', percent: pct } };
  }
  // a printed-photo frame: a strong luminance step at a similar depth on all four sides (see pixels.frameInset)
  const f = input.pixel.frame;
  if (f && f.strength >= FRAME_STEP_MIN) {
    const insets = [f.top, f.right, f.bottom, f.left];
    const maxIn = Math.max(...insets);
    const minIn = Math.min(...insets);
    if (minIn >= 0.02 && maxIn <= 0.18 && maxIn <= minIn * 3) {
      const pct = Math.ceil(maxIn * 100) + 1;
      return { id: 'border', level: 'warn', label: `Looks like a framed print (edge about ${Math.round(maxIn * 100)}% in)`, reason: 'A photo-paper or instant-photo frame looks like a mockup, and distributors flag mockups. Crop to the picture.', fix: { kind: 'crop_border', percent: pct } };
    }
  }
  return { id: 'border', level: 'pass', label: 'Full-bleed image', reason: 'No uniform border or print frame detected.' };
}

export function checkSimplicity(input: PreflightInput): CheckRow {
  if (!input.pixel) return skip('simplicity', 'Detail', 'Not checked. Pass `pixel` from pixelStats().');
  const { colorEntropy, edgeDensity } = input.pixel;
  if (colorEntropy < ENTROPY_LOW && edgeDensity < EDGE_DENSITY_LOW) {
    return { id: 'simplicity', level: 'warn', label: 'Very plain image', reason: 'Little color variety and few details. CD Baby says plain, generic art may be refused.' };
  }
  return { id: 'simplicity', level: 'pass', label: 'Enough detail', reason: 'Color and detail look like a finished cover.' };
}

export function checkSticker(input: PreflightInput): CheckRow {
  if (input.parentalAdvisory === undefined) return skip('sticker', 'Parental Advisory', 'Not checked. Pass `parentalAdvisory` to say whether the cover carries the label.');
  if (!input.parentalAdvisory) return { id: 'sticker', level: 'pass', label: 'No Parental Advisory label', reason: 'Nothing to flag.' };
  const strict = specsOf(input).filter((s) => s.parentalAdvisoryRule);
  return {
    id: 'sticker',
    level: 'warn',
    label: 'Parental Advisory label',
    reason: `Flag the release explicit when you upload it.${strict.length ? ` ${joinNames(strict)} ${verb(strict, 'rejects', 'reject')} the label on releases that aren't explicit.` : ''}`,
    fix: { kind: 'remove_sticker' },
  };
}

export function runPreflight(input: PreflightInput): CheckRow[] {
  return [
    checkSize(input),
    checkShape(input),
    checkFormat(input),
    checkColor(input),
    checkFileSize(input),
    checkText(input),
    checkEdges(input),
    checkBorder(input),
    checkSimplicity(input),
    checkSticker(input),
  ];
}

export interface Summary {
  pass: number;
  warn: number;
  fail: number;
  skip: number;
  text: string;
}

export function summarize(rows: readonly CheckRow[]): Summary {
  const count = (level: Level) => rows.filter((r) => r.level === level).length;
  const pass = count('pass');
  const warn = count('warn');
  const fail = count('fail');
  const skipped = count('skip');
  const parts = [`${pass} passed`];
  if (warn) parts.push(`${warn} warning${warn === 1 ? '' : 's'}`);
  if (fail) parts.push(`${fail} failed`);
  if (skipped) parts.push(`${skipped} not checked`);
  return { pass, warn, fail, skip: skipped, text: parts.join(' · ') };
}
