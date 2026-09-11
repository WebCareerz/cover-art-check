# cover-art-check

Check album cover art against the published rules of Spotify, Apple Music, DistroKid, TuneCore, CD Baby and Bandcamp — before your distributor rejects it.

```sh
npx cover-art-check cover.jpg --platforms apple,distrokid,tunecore
```

Distributors reject artwork for reasons you can check in advance: the wrong size, a web address in the corner, a year next to the title, a Parental Advisory label on a release that isn't explicit. The rules are published, but they are spread across six platforms' pages and they disagree with each other. Apple Music asks for at least 4000 px; TuneCore and CD Baby accept nothing above 3000. No single file satisfies both.

`cover-art-check` puts those rules in one place — as a library you can call from your own tool, and as a command you can run on a file.

## What it checks

| Check | Fails or warns when |
|---|---|
| `size` | The image is below a platform's minimum or above its maximum (TuneCore and CD Baby cap at 3000, Spotify at 10000). Between DistroKid's 1000 minimum and its 3000 recommendation it warns. |
| `filesize` | The file is over TuneCore's 10 MB or CD Baby's 25 MB limit, or within 10% of it. |
| `color` | The image is not RGB (CMYK is rejected), or carries an embedded ICC profile (Spotify asks for sRGB with none). |
| `text` | The words on the cover include a web address, a social handle, a date, a year, a price, "Exclusive", a physical format such as "CD", a barcode or ISRC, a Parental Advisory phrase, or promotional wording such as "out now". Release details such as "feat.", "EP" and "Prod. by" are allowed. |
| `edges` | Text sits closer than 2% to the edge (fail) or 4% (warn). The 4% line is this library's guideline, not a platform rule. |
| `border` | There is a uniform band on all four sides, or the image looks like a photographed print with a paper frame. |
| `simplicity` | The image has very little color variety and detail. CD Baby says plain, generic art may be refused. |
| `sticker` | The cover carries a Parental Advisory label: a reminder to flag the release explicit with your distributor. |

Every result is `pass`, `warn`, `fail` or `skip`.

**A check only passes if it actually looked.** A flat image file doesn't carry its title as text or say whether a sticker is on it, so those checks are reported as `skip` unless you supply the information. They never pass by default.

## Platform rules

Read from each platform's own pages. The date is when the rule was last checked.

| Platform | Size | Format | File size | Text on the cover | Checked |
|---|---|---|---|---|---|
| Spotify | 640–10000 px | JPG, PNG or TIFF · sRGB, 24-bit, no embedded ICC profile | — | Not stated. Spotify doesn't take uploads from artists; your distributor does. | TODO: date |
| Apple Music | at least 4000 px | JPG, PNG or GIF | — | Artist name and title only. No web addresses, social handles, logos, prices, years or barcodes. Parental Advisory only on explicit releases. | TODO: date |
| DistroKid | at least 1000 px, 3000 recommended, square | JPG, RGB | — | No web addresses, QR codes, X page names, prices, streaming or social logos, or physical formats such as "CD". Don't reuse one image across releases. | 2026-09-07 |
| TuneCore | 1600–3000 px, square | JPG, PNG or GIF · RGB · at least 72 dpi | under 10 MB | Artist name and release title only, exactly as entered in TuneCore — or no text at all. No contact details, prices, store names or logos, "CD" or "Digital Exclusive". | 2026-09-07 |
| CD Baby | 1400–3000 px | PNG, GIF or JPG · RGB · 72–300 dpi | under 25 MB | Artist name and title must match the submission word for word. No web addresses, handles, contact details, prices, barcodes, physical formats, exclusivity claims, or time-bound words such as "new". | 2026-09-07 |
| Bandcamp | at least 1400 px, square | Not stated | — | Not stated. Releases without cover art are left out of search, tags and Discover. | 2026-09-07 |

DistroKid adjusts smaller or non-square art automatically rather than rejecting it.

## Command line

```sh
npx cover-art-check cover.jpg --platforms apple,distrokid,tunecore
```

```
cover.jpg  3000×3000  JPG  2.1 MB
Apple Music · DistroKid · TuneCore

  ✗  3000×3000                 Below the minimum for Apple Music (4000).
  ✓  sRGB, no embedded profile
  ✓  File size 2.1 MB          Under the 10 MB limit on all selected platforms.
  ✓  Full-bleed image          No uniform border or print frame detected.
  ✓  Enough detail             Color and detail look like a finished cover.
  –  Text                      Not checked. Pass --text to check the words on the cover.
  –  Safe margin               Not checked. Needs the position of each line of text (library only).
  –  Parental Advisory         Not checked. Pass --parental-advisory if the cover carries the label.

  4 passed · 1 failed · 3 not checked
```

Export the same design at 4000 px and TuneCore fails instead: *Above the maximum for TuneCore (3000).* That isn't a bug in the check — those two platforms cannot share a file. Export 4000 for Apple Music and 3000 for everyone else.

| Option | |
|---|---|
| `--platforms <ids>` | Comma-separated: `spotify`, `apple`, `distrokid`, `tunecore`, `cdbaby`, `bandcamp`. Default `spotify,apple,distrokid`. |
| `--text "<words>"` | The words on the cover. Repeat for each line: `--text "Midnight Vending Machine" --text "Neon Quiet"`. |
| `--parental-advisory` | The cover carries a Parental Advisory label. |
| `--json` | Print the results as JSON. |

The command exits with code 1 when any check fails, so it can guard an upload step in CI.

## Library

The core has no dependencies and no platform APIs — it runs in the browser, Node, Deno and Cloudflare Workers. Reading an image file is left to you (the command line uses [sharp](https://sharp.pixelplumbing.com)).

```sh
npm install cover-art-check
```

```ts
import { runPreflight, summarize } from 'cover-art-check';

const rows = runPreflight({
  size: 3000,
  format: 'jpg',
  bytes: 2_200_000,
  platforms: ['apple', 'distrokid', 'tunecore'],
  color: { space: 'srgb', iccProfile: false },
  text: [
    { layer: 'title', text: 'Midnight Vending Machine', left: 0.06, top: 0.70, right: 0.90, bottom: 0.82 },
    { layer: 'artist', text: 'Neon Quiet', left: 0.06, top: 0.90, right: 0.40, bottom: 0.94 },
  ],
});

summarize(rows).text; // "4 passed · 1 failed · 3 not checked"
```

Each row:

```ts
interface CheckRow {
  id: 'size' | 'filesize' | 'color' | 'text' | 'edges' | 'border' | 'simplicity' | 'sticker';
  level: 'pass' | 'warn' | 'fail' | 'skip';
  label: string;   // "3000×3000"
  reason: string;  // "Below the minimum for Apple Music (4000)."
  fix?: FixAction; // e.g. { kind: 'change_size', size: 4096 } — an editor can apply it
}
```

The input, and which checks each field turns on:

```ts
interface PreflightInput {
  size: number;                  // side of the square image, in px          → size
  format: 'jpg' | 'png';
  platforms: PlatformId[];
  bytes?: number;                // file size                                 → filesize
  color?: { space: string; iccProfile: boolean };                          // → color
  text?: TextBox[];              // the words on the cover                    → text, and edges when every box has a position
  parentalAdvisory?: boolean;    // the cover carries the label               → sticker
  pixel?: PixelStats;            // from pixelStats()                         → border, simplicity
}
```

### Checking words on their own

```ts
import { findForbiddenText } from 'cover-art-check';

findForbiddenText('Out now on Spotify');           // { what: 'promotional wording', pattern: 'Out now' }
findForbiddenText('Midnight Vending Machine 2026'); // { what: 'a year', pattern: '2026' }
findForbiddenText('Midnight Vending Machine');      // null
```

### Pixel statistics

The `border` and `simplicity` checks read a small summary of the image instead of the image itself. Compute it from RGBA pixels — a copy downscaled to about 512 px is enough:

```ts
import { pixelStats } from 'cover-art-check';

const pixel = pixelStats({ data, width, height }); // data: Uint8ClampedArray, RGBA
```

### The rules as data

`cover-art-check/specs.json` holds one entry per platform, with only the fields that platform's page actually states:

```json
{
  "id": "tunecore",
  "name": "TuneCore",
  "minSize": 1600,
  "maxSize": 3000,
  "square": true,
  "formats": ["jpg", "png", "gif"],
  "colorMode": "RGB",
  "minDpi": 72,
  "maxBytes": 10485760,
  "text": "Artist name and release title only, exactly as entered in TuneCore, or no text at all.",
  "checked": "2026-09-07"
}
```

A missing field means the page doesn't state that rule — not that anything goes.

## Limitations

- **It reads pixels, not words.** On a flat image it can't see the title. Pass the words with `--text` or `text`, or the text check is skipped.
- **The word list is strict on purpose.** A title that is literally "New York" or "1999" is flagged, because "new" and years are exactly what the help pages rule out. Read the reason before renaming a real song.
- **Some checks are heuristics.** Size, format, file size and the forbidden words come from the platforms' pages. The safe margin, the border detector and the plain-image check flag what reviewers tend to reject; they don't reproduce a platform's review.
- **Rules change.** Every platform row carries the date it was read.
- **A clean report is not an approval.** It means the file matches the published rules. A reviewer can still refuse artwork for reasons no file check can see, such as rights to the image. Not affiliated with any platform named here.

## Contributing

Rules change only from a platform's own page. If a help page has changed, open an issue with the page's address, the date you read it, and the sentence that changed.

## Sources

- Spotify — artist artwork guidelines, checked TODO: date <!-- TODO: URL -->
- Apple Music for Artists — artwork guidelines, checked TODO: date <!-- TODO: URL -->
- DistroKid Help Center, checked 2026-09-07 <!-- TODO: URL -->
- TuneCore Help Center, checked 2026-09-07 <!-- TODO: URL -->
- CD Baby Help Center, checked 2026-09-07 <!-- TODO: URL -->
- Bandcamp design tutorial, checked 2026-09-07 <!-- TODO: URL -->

## Used by

`cover-art-check` is the export check inside [Album Art Creator](https://www.albumartcreator.com), extracted so any tool can use it.

## License

MIT
