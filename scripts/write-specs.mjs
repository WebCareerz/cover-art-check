// Writes specs.json at the package root from the compiled rules, so the data file never drifts from the code.
import { writeFileSync } from 'node:fs';
import { PLATFORMS } from '../dist/specs.js';

writeFileSync(new URL('../specs.json', import.meta.url), `${JSON.stringify(PLATFORMS, null, 2)}\n`);
console.log(`specs.json: ${PLATFORMS.length} platforms`);
