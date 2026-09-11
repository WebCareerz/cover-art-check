/** The command line, as a function so tests can call it without spawning a process. */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { checkFile, type FileReport } from './node.js';
import { summarize, type CheckRow, type Level } from './rules.js';
import { DEFAULT_PLATFORMS, PLATFORM_IDS, getPlatform, isPlatformId, type PlatformId } from './specs.js';

export interface Io {
  out(text: string): void;
  err(text: string): void;
  color?: boolean;
}

const HELP = `Usage: cover-art-check <image...> [options]

Checks album cover art against the published artwork rules of streaming stores and distributors.

Options:
  -p, --platforms <ids>           Comma-separated: ${PLATFORM_IDS.join(', ')}
                                  (default: ${DEFAULT_PLATFORMS.join(',')})
  -t, --text <line>               A line of text on the cover. Repeat for each line.
      --no-text                   The cover has no text.
      --parental-advisory <yes|no>
                                  Whether the cover carries a Parental Advisory label.
      --json                      Print the results as JSON.
  -h, --help                      Show this help.
  -v, --version                   Show the version.

Exits 1 when any check fails, 2 when a file can't be read or an option is wrong.
`;

const OPTIONS = {
  platforms: { type: 'string', short: 'p' },
  text: { type: 'string', short: 't', multiple: true },
  'no-text': { type: 'boolean' },
  'parental-advisory': { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

/** What to do instead, for checks a file alone can't answer. */
const HINTS: Partial<Record<CheckRow['id'], string>> = {
  text: 'Not checked. Pass --text with each line on the cover, or --no-text.',
  edges: 'Not checked. Needs the position of each line of text (library only).',
  sticker: 'Not checked. Pass --parental-advisory yes or no.',
};

const SYMBOL: Record<Level, string> = { pass: '✓', warn: '!', fail: '✗', skip: '–' };
const ANSI: Record<Level, string> = { pass: '32', warn: '33', fail: '31', skip: '2' };

function parse(argv: string[]) {
  return parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function version(): string {
  return (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;
}

function render(report: FileReport, platforms: PlatformId[], color: boolean): string {
  const paint = (level: Level, s: string) => (color ? `\x1b[${ANSI[level]}m${s}\x1b[0m` : s);
  const { file, image, rows } = report;
  return [
    `${file}  ${image.width}×${image.height}  ${image.format.toUpperCase()}  ${(image.bytes / 1_000_000).toFixed(1)} MB`,
    platforms.map((id) => getPlatform(id).name).join(' · '),
    '',
    ...rows.map((row) => `  ${paint(row.level, SYMBOL[row.level])}  ${row.label.padEnd(28)} ${row.level === 'skip' ? (HINTS[row.id] ?? row.reason) : row.reason}`),
    '',
    `  ${summarize(rows).text}`,
    '',
  ].join('\n');
}

export async function run(argv: string[], io: Io): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    io.err(`${message(error)}\nRun cover-art-check --help for usage.\n`);
    return 2;
  }
  const { values, positionals: files } = parsed;
  if (values.help) {
    io.out(HELP);
    return 0;
  }
  if (values.version) {
    io.out(`${version()}\n`);
    return 0;
  }
  if (!files.length) {
    io.err(`No image given.\n\n${HELP}`);
    return 2;
  }

  const ids = values.platforms === undefined ? DEFAULT_PLATFORMS : values.platforms.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const unknown = ids.filter((id) => !isPlatformId(id));
  if (!ids.length || unknown.length) {
    io.err(`${ids.length ? `Unknown platform: ${unknown.join(', ')}.` : 'No platform given.'} Use: ${PLATFORM_IDS.join(', ')}.\n`);
    return 2;
  }
  const platforms = ids as PlatformId[];
  if (values.text && values['no-text']) {
    io.err('Use --text or --no-text, not both.\n');
    return 2;
  }
  const pa = values['parental-advisory'];
  if (pa !== undefined && pa !== 'yes' && pa !== 'no') {
    io.err('--parental-advisory takes yes or no.\n');
    return 2;
  }
  const text = values['no-text'] ? [] : values.text?.map((line) => ({ text: line }));
  const parentalAdvisory = pa === undefined ? undefined : pa === 'yes';

  const reports: FileReport[] = [];
  let broken = false;
  for (const file of files) {
    try {
      reports.push(await checkFile(file, { platforms, text, parentalAdvisory }));
    } catch (error) {
      broken = true;
      io.err(`${file}: ${message(error)}\n`);
    }
  }
  if (values.json) io.out(`${JSON.stringify(reports.map((r) => ({ ...r, summary: summarize(r.rows) })), null, 2)}\n`);
  else if (reports.length) io.out(reports.map((r) => render(r, platforms, io.color ?? false)).join('\n'));
  if (broken) return 2;
  return reports.some((r) => r.rows.some((row) => row.level === 'fail')) ? 1 : 0;
}
