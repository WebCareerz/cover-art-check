/**
 * Node entry: reads an image file with sharp and runs every check a file can answer. The main entry never imports
 * this, so the library stays free of native code in browsers and Workers.
 */
import { stat } from 'node:fs/promises';
import sharp from 'sharp';
import { pixelStats, type PixelStats } from './pixels.js';
import { runPreflight, type CheckRow, type ColorInfo, type TextLine } from './rules.js';
import { DEFAULT_PLATFORMS, type PlatformId } from './specs.js';

export interface ImageFacts {
  /** as displayed, after the EXIF orientation is applied */
  width: number;
  height: number;
  format: string;
  bytes: number;
  color: ColorInfo;
  pixel: PixelStats;
}

export interface CheckFileOptions {
  platforms?: PlatformId[];
  text?: TextLine[];
  parentalAdvisory?: boolean;
}

export interface FileReport {
  file: string;
  image: Omit<ImageFacts, 'pixel'>;
  rows: CheckRow[];
}

const FORMAT_NAMES: Record<string, string> = { jpeg: 'jpg', heif: 'heic' };

function colorSpace(space: string | undefined): ColorInfo['space'] {
  if (space === 'cmyk') return 'cmyk';
  if (space === 'b-w' || space === 'grey16') return 'gray';
  return 'rgb';
}

export async function readImage(file: string): Promise<ImageFacts> {
  const [{ size: bytes }, meta] = await Promise.all([stat(file), sharp(file).metadata()]);
  if (!meta.width || !meta.height || !meta.format) throw new Error('Not an image this tool can read.');
  // orientations 5–8 turn the image a quarter, so the displayed width is the stored height
  const turned = (meta.orientation ?? 1) >= 5;
  // a 512 px copy is enough for the border and detail checks; rotate() applies the EXIF orientation first
  const { data, info } = await sharp(file).rotate().resize(512, 512, { fit: 'fill' }).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`Expected 4 channels after decoding, got ${info.channels}.`);
  return {
    width: turned ? meta.height : meta.width,
    height: turned ? meta.width : meta.height,
    format: FORMAT_NAMES[meta.format] ?? meta.format,
    bytes,
    color: { space: colorSpace(meta.space), embeddedProfile: Boolean(meta.hasProfile), orientationTag: meta.orientation !== undefined && meta.orientation !== 1 },
    pixel: pixelStats({ data, width: info.width, height: info.height }),
  };
}

/** Read a file and run every check. Text and the Parental Advisory label can't be read from pixels: pass them in. */
export async function checkFile(file: string, options: CheckFileOptions = {}): Promise<FileReport> {
  const { pixel, ...image } = await readImage(file);
  const rows = runPreflight({ ...image, platforms: options.platforms ?? DEFAULT_PLATFORMS, text: options.text, parentalAdvisory: options.parentalAdvisory, pixel });
  return { file, image, rows };
}
