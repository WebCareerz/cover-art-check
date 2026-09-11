# cover-art-check

Check album cover art against the published rules of Spotify, Apple Music, DistroKid, TuneCore, CD Baby and Bandcamp before your distributor rejects it.

```sh
npx cover-art-check cover.jpg --platforms apple,distrokid,tunecore
```

Distributors reject artwork for reasons you can check in advance: the wrong size, a CMYK file, a web address in the corner, a year next to the title, a Parental Advisory label on a release that isn't explicit. The rules are published, but they are spread across six platforms' help pages and they disagree with each other. Apple Music asks for at least 4000 px, while TuneCore and CD Baby accept nothing above 3000, so no single file satisfies both.

`cover-art-check` puts those rules in one place. Use it as a library in your own tool, or as a command on a file.

## What it checks

| Check | Fails or warns when |
|---|---|
| `size` | The short side is below a platform's minimum, or the long side is above its maximum (TuneCore and CD Baby 3000, Spotify 10000). Warns between DistroKid's 1000 minimum and its recommended 3000. Says so when the selected platforms can't share one file. |
| `shape` | The image isn't square. Fails for platforms that require square, and warns for DistroKid, which crops it automatically. |
| `format` | A platform doesn't accept the file format. For example, DistroKid takes JPG only. |
| `color` | The image is CMYK or grayscale where RGB is required. For Spotify, also when it has an embedded color profile or an orientation tag. |
| `filesize` | The file is over TuneCore's 10 MB or CD Baby's 25 MB. Neither page says how big a megabyte is, so a file between 10,000,000 and 10,485,760 bytes warns. |
| `text` | The words on the cover include a web address, a social handle, a date, a year, a price, "Exclusive", a physical format such as "CD", a barcode or code number, a store name such as "Spotify", a Parental Advisory phrase, or promotional wording such as "out now". Each hit names the platforms whose rules forbid it. Release details such as "feat." and "EP" are allowed. |
| `edges` | Text sits closer than 2% to the edge (fail) or 4% (warn). The 4% line is this library's guideline, not a platform rule. |
| `border` | There is a uniform band on all four sides, or the image looks like a photographed print with a paper frame. |
| `simplicity` | The image has very little color variety and detail. CD Baby says plain, generic art may be refused. |
| `sticker` | The cover carries a Parental Advisory label, which is a reminder to flag the release explicit when you upload it. |

Every result is `pass`, `warn`, `fail` or `skip`.

**A check only passes if it actually looked.** An image file doesn't carry its words as text or say whether a label is on it, so those checks report `skip` until you supply the information. They never pass by default.

## Platform rules

Taken from each platform's own help page. All six pages were read on 2026-09-11.

| Platform | Size | Square | Format and color | File size | Text on the cover |
|---|---|---|---|---|---|
| Spotify | 640–10000 px | Required | JPG, PNG or TIFF · sRGB · no embedded color profile or orientation tag | Not stated | Not stated |
| Apple Music | at least 4000 px | Required | JPG, PNG or GIF | Not stated | Only the artist name and the release or song title. No handles, email or web addresses, logos, prices, years or dates, barcodes, advertising, or mentions of other stores. Parental Advisory only on explicit releases. |
| DistroKid | at least 1000 px, 3000 recommended | Adjusted automatically | JPG · RGB (CMYK and grayscale are rejected) | Not stated | No web addresses, QR codes, X page names, prices, streaming or social logos, or physical formats such as "CD". Don't reuse one image across releases. |
| TuneCore | 1600–3000 px | Required | JPG, PNG or GIF · RGB, even for black and white · at least 72 dpi | under 10 MB | Artist name and release title only, exactly as entered, or no text at all. No contact details, prices, store names such as "iTunes", "CD", "DVD" or "Digital Exclusive". |
| CD Baby | 1400–3000 px | Not stated | PNG, GIF or JPG · RGB · 72–300 dpi | under 25 MB | Any text must match the release details exactly. No web addresses, handles, contact details, prices, barcodes or QR codes, physical formats, exclusivity claims, or time-bound words such as "new". |
| Bandcamp | at least 1400 px | Required | Not stated | Not stated | Not stated. Releases without cover art are left out of search, tags and Discover. |

## Command line

```sh
npx cover-art-check cover.jpg --platforms apple,distrokid,tunecore
```

```
cover.jpg  3000×3000  JPG  0.1 MB
Apple Music · DistroKid · TuneCore

  ✗  3000×3000                    Below the minimum for Apple Music (4000). No single size meets Apple Music (at least 4000) and TuneCore (at most 3000): export one file for each.
  ✓  Square                       Width and height are equal.
  ✓  JPG file                     Accepted by Apple Music, DistroKid and TuneCore.
  ✓  RGB, no embedded profile     Meets the color rules of the selected platforms.
  ✓  File size 0.1 MB             Under the limit for TuneCore (10 MB).
  –  Text                         Not checked. Pass --text with each line on the cover, or --no-text.
  –  Safe margin                  Not checked. Needs the position of each line of text (library only).
  ✓  Full-bleed image             No uniform border or print frame detected.
  ✓  Enough detail                Color and detail look like a finished cover.
  –  Parental Advisory            Not checked. Pass --parental-advisory yes or no.

  6 passed · 1 failed · 3 not checked
```

The first line isn't a bug: Apple Music and TuneCore cannot share a file. Export 4000 for Apple Music and 3000 for the others.

| Option | |
|---|---|
| `-p, --platforms <ids>` | Comma-separated: `spotify`, `apple`, `distrokid`, `tunecore`, `cdbaby`, `bandcamp`. Default `spotify,apple,distrokid`. |
| `-t, --text <line>` | A line of text on the cover. Repeat for each line: `--text "Midnight Vending Machine" --text "Neon Quiet"`. |
| `--no-text` | The cover has no text. |
| `--parental-advisory <yes\|no>` | Whether the cover carries a Parental Advisory label. |
| `--json` | Print the results as JSON. |

Pass several files to check them in one go. The command exits with 1 when any check fails and 2 when a file can't be read, so it can guard an upload step in CI.

## Library

```sh
npm install cover-art-check
```

The main entry has no dependencies and uses no platform APIs, so it runs in the browser, Node, Deno and Cloudflare Workers. It checks a description of the image; reading the file is up to you.

```ts
import { runPreflight, summarize } from 'cover-art-check';

const rows = runPreflight({
  width: 3000,
  height: 3000,
  format: 'jpg',
  bytes: 2_200_000,
  platforms: ['apple', 'distrokid', 'tunecore'],
  color: { space: 'rgb', embeddedProfile: false },
  text: [
    { text: 'Midnight Vending Machine', left: 0.06, top: 0.7, right: 0.9, bottom: 0.82 },
    { text: 'Neon Quiet', left: 0.06, top: 0.9, right: 0.4, bottom: 0.94 },
  ],
});

summarize(rows).text; // "6 passed · 1 failed · 3 not checked"
```

Each row:

```ts
interface CheckRow {
  id: 'size' | 'shape' | 'format' | 'color' | 'filesize' | 'text' | 'edges' | 'border' | 'simplicity' | 'sticker';
  level: 'pass' | 'warn' | 'fail' | 'skip';
  label: string;   // "3000×3000"
  reason: string;  // "Below the minimum for Apple Music (4000)."
  fix?: FixAction; // e.g. { kind: 'change_size', size: 4000 }, which an editor can apply
}
```

The input, and which checks each field turns on:

```ts
interface PreflightInput {
  width: number;                // px                                          → size, shape
  height: number;
  format: string;               // 'jpg', 'png', 'gif', 'tiff', …              → format
  platforms: PlatformId[];
  bytes?: number;               // file size                                   → filesize
  color?: {                     //                                             → color
    space: 'rgb' | 'cmyk' | 'gray';
    embeddedProfile: boolean;
    orientationTag?: boolean;
  };
  text?: TextLine[];            // one entry per line, [] for no text          → text; edges when every line has a position
  parentalAdvisory?: boolean;   // whether the cover carries the label         → sticker
  pixel?: PixelStats;           // from pixelStats()                           → border, simplicity
}

interface TextLine {
  text: string;
  left?: number;                // position as fractions of the image, 0 to 1
  top?: number;
  right?: number;
  bottom?: number;
}
```

### Checking a file in Node

`cover-art-check/node` reads the file with [sharp](https://sharp.pixelplumbing.com), which is installed with the package, and fills in everything a file can answer:

```ts
import { checkFile } from 'cover-art-check/node';

const { image, rows } = await checkFile('cover.jpg', {
  platforms: ['apple', 'tunecore'],
  text: [{ text: 'Midnight Vending Machine' }, { text: 'Neon Quiet' }],
  parentalAdvisory: false,
});
```

### Checking words on their own

```ts
import { findForbiddenText, forbiddenBy } from 'cover-art-check';

findForbiddenText('Out now');                       // { kind: 'promo', what: 'promotional wording', match: 'Out now' }
findForbiddenText('Midnight Vending Machine 2026'); // { kind: 'year', what: 'a year', match: '2026' }
findForbiddenText('Midnight Vending Machine');      // null

forbiddenBy('year').map((p) => p.name);             // ['Apple Music', 'TuneCore']
```

### Pixel statistics

The `border` and `simplicity` checks read a small summary of the image instead of the image itself. Compute it from RGBA pixels. A copy downscaled to about 512 px is enough:

```ts
import { pixelStats } from 'cover-art-check';

const pixel = pixelStats({ data, width, height }); // data: Uint8ClampedArray or Uint8Array, RGBA
```

In a browser, `data` is what `getImageData()` returns from a canvas.

### The rules as data

`cover-art-check/specs.json` holds one entry per platform, with only the fields its page states:

```json
{
  "id": "tunecore",
  "name": "TuneCore",
  "minSize": 1600,
  "maxSize": 3000,
  "square": "required",
  "formats": ["jpg", "png", "gif"],
  "colorMode": "RGB",
  "minDpi": 72,
  "maxMegabytes": 10,
  "artistTitleOnly": true,
  "text": "Artist name and release title only, exactly as entered in TuneCore, or no text at all. …",
  "checked": "2026-09-11",
  "sources": ["https://support.tunecore.com/hc/en-us/articles/115006685728-What-are-TuneCore-s-cover-art-formatting-requirements"]
}
```

A missing field means the page doesn't state that rule, not that anything goes. The same data is exported as `PLATFORMS`.

## Limitations

- **It reads pixels, not words.** It can't see the title in an image. Pass the words with `--text` or `text`, or the text check is skipped.
- **The word list is strict on purpose.** A title that is literally "New York" or "1999" is flagged, because "new" and years are exactly what some pages forbid. Read the reason before renaming a real song.
- **Some checks are heuristics.** Size, shape, format, color, file size and the forbidden words come from the platforms' pages. The safe margin, the border detector and the plain-image check flag what reviewers tend to reject; they don't reproduce a platform's review.
- **Not everything on the pages can be checked from a file.** Logos, QR codes, nudity, rights to the image and reusing art across releases are left to you, and so is dpi, which is a metadata number rather than a property of the pixels.
- **Rules change.** Each platform's entry carries the date its page was read.
- **A clean report is not an approval.** A clean report means the file matches the published rules; a reviewer can still refuse it. Not affiliated with any platform named here.

## Contributing

The rules change only when a platform's own page changes. If a help page has changed, open an issue with the page's address, the date you read it, and the sentence that changed.

## Sources

Read on 2026-09-11.

- Spotify: [Cover art requirements](https://support.spotify.com/us/artists/article/cover-art-requirements/)
- Apple Music: [Cover art](https://artists.apple.com/support/1120-cover-art)
- DistroKid: [What are the requirements for album artwork?](https://support.distrokid.com/hc/en-us/articles/360013534334-What-Are-the-Requirements-for-Album-Artwork)
- TuneCore: [What are TuneCore's cover art formatting requirements?](https://support.tunecore.com/hc/en-us/articles/115006685728-What-are-TuneCore-s-cover-art-formatting-requirements)
- CD Baby: [Artwork requirements](https://support.cdbaby.com/hc/en-us/articles/360037660592-Artwork-Requirements) and [Cover art guidelines and restrictions](https://support.cdbaby.com/hc/en-us/articles/210998563-What-are-the-cover-art-guidelines-and-restrictions)
- Bandcamp: [Bandcamp design tutorial](https://get.bandcamp.help/en/articles/15263106-bandcamp-design-tutorial)

## Used by

`cover-art-check` is the export check inside [Album Art Creator](https://www.albumartcreator.com), extracted so any tool can use it.

## License

MIT
