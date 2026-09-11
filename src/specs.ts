/**
 * Artwork rules as each platform publishes them. Only what the platform's own page states: a missing field
 * means the page doesn't say, not that anything goes. `checked` is the date the page was last read.
 */

export type PlatformId = 'spotify' | 'apple' | 'distrokid' | 'tunecore' | 'cdbaby' | 'bandcamp';

/** What a line of text on the cover can mention that some platform rules out. */
export type ForbiddenKind = 'url' | 'handle' | 'date' | 'year' | 'price' | 'exclusive' | 'cd' | 'format' | 'barcode' | 'store' | 'advisory' | 'promo';

export interface PlatformSpec {
  id: PlatformId;
  name: string;
  /** shortest side, px */
  minSize: number;
  /** longest side, px */
  maxSize?: number;
  recommendedSize?: number;
  /** 'required': the page says the image must be square. 'adjusted': non-square art is cropped automatically. */
  square?: 'required' | 'adjusted';
  /** lower-case file extensions */
  formats?: string[];
  colorMode?: 'RGB' | 'sRGB';
  /** the page says an embedded ICC profile isn't supported */
  noEmbeddedProfile?: boolean;
  /** the page says orientation metadata isn't supported */
  noOrientationTag?: boolean;
  minDpi?: number;
  maxDpi?: number;
  /** as stated on the page; the page doesn't say whether a megabyte is 1,000,000 or 1,048,576 bytes */
  maxMegabytes?: number;
  /** the page allows only the artist name and the title on the cover */
  artistTitleOnly?: boolean;
  /** text the page rules out by name */
  forbids?: ForbiddenKind[];
  /** the page allows a Parental Advisory label only on explicit releases */
  parentalAdvisoryRule?: boolean;
  /** the page's text rules, in short */
  text?: string;
  checked: string;
  sources: string[];
}

export const PLATFORMS: readonly PlatformSpec[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    minSize: 640,
    maxSize: 10000,
    square: 'required',
    formats: ['jpg', 'png', 'tiff'],
    colorMode: 'sRGB',
    noEmbeddedProfile: true,
    noOrientationTag: true,
    checked: '2026-09-11',
    sources: ['https://support.spotify.com/us/artists/article/cover-art-requirements/'],
  },
  {
    id: 'apple',
    name: 'Apple Music',
    minSize: 4000,
    square: 'required',
    formats: ['jpg', 'png', 'gif'],
    artistTitleOnly: true,
    parentalAdvisoryRule: true,
    text: 'Only the artist name and the release or song title as released. No social handles, email or web addresses, logos, prices, years or dates, barcodes, advertising, or mentions of other stores. Parental Advisory only on explicit releases.',
    checked: '2026-09-11',
    sources: ['https://artists.apple.com/support/1120-cover-art'],
  },
  {
    id: 'distrokid',
    name: 'DistroKid',
    minSize: 1000,
    recommendedSize: 3000,
    square: 'adjusted',
    formats: ['jpg'],
    colorMode: 'RGB',
    forbids: ['url', 'handle', 'price', 'cd'],
    text: 'No web addresses, QR codes, X page names, prices, streaming or social logos, or physical formats such as "CD". Don\'t reuse one image across releases.',
    checked: '2026-09-11',
    sources: ['https://support.distrokid.com/hc/en-us/articles/360013534334-What-Are-the-Requirements-for-Album-Artwork'],
  },
  {
    id: 'tunecore',
    name: 'TuneCore',
    minSize: 1600,
    maxSize: 3000,
    square: 'required',
    formats: ['jpg', 'png', 'gif'],
    colorMode: 'RGB',
    minDpi: 72,
    maxMegabytes: 10,
    artistTitleOnly: true,
    text: 'Artist name and release title only, exactly as entered in TuneCore, or no text at all. No contact details, prices, store names such as "iTunes", "CD", "DVD" or "Digital Exclusive".',
    checked: '2026-09-11',
    sources: ['https://support.tunecore.com/hc/en-us/articles/115006685728-What-are-TuneCore-s-cover-art-formatting-requirements'],
  },
  {
    id: 'cdbaby',
    name: 'CD Baby',
    minSize: 1400,
    maxSize: 3000,
    formats: ['png', 'gif', 'jpg'],
    colorMode: 'RGB',
    minDpi: 72,
    maxDpi: 300,
    maxMegabytes: 25,
    forbids: ['url', 'handle', 'price', 'barcode', 'cd', 'format', 'exclusive', 'promo'],
    text: 'Any text must match the release details exactly. No web addresses, handles, contact details, prices, barcodes or QR codes, physical formats, exclusivity claims, or time-bound words such as "new".',
    checked: '2026-09-11',
    sources: [
      'https://support.cdbaby.com/hc/en-us/articles/360037660592-Artwork-Requirements',
      'https://support.cdbaby.com/hc/en-us/articles/210998563-What-are-the-cover-art-guidelines-and-restrictions',
    ],
  },
  {
    id: 'bandcamp',
    name: 'Bandcamp',
    minSize: 1400,
    square: 'required',
    checked: '2026-09-11',
    sources: ['https://get.bandcamp.help/en/articles/15263106-bandcamp-design-tutorial'],
  },
];

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id);

export const DEFAULT_PLATFORMS: PlatformId[] = ['spotify', 'apple', 'distrokid'];

export function isPlatformId(id: string): id is PlatformId {
  return PLATFORMS.some((p) => p.id === id);
}

export function getPlatform(id: PlatformId): PlatformSpec {
  const p = PLATFORMS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown platform "${id}". Use one of: ${PLATFORM_IDS.join(', ')}.`);
  return p;
}
