// The app's living version: the current build as one page, committed at live/<title>.html. Unlike a dated snapshot
// it is updated by every change, and the index pairs it with the app's sprint day (the "Current version" link on the
// sprint site; the homepage tile opens it). Run `npm run live` in any PR that changes the app.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const app = JSON.parse(readFileSync('app.config.json', 'utf8'));
const page = readFileSync('dist/demo/page.html', 'utf8');
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// The demo build titles the page with today's date; the living version is just the app's name.
const live = page.replace(/<title>[^<]*<\/title>/, `<title>${escape(app.title)}</title>`);
if (live === page && !page.includes(`<title>${escape(app.title)}</title>`)) throw new Error('live: the demo page has no <title> to replace');
const file = `${app.title.replace(/[\\/:*?"<>|]/g, '-')}.html`;
mkdirSync('live', { recursive: true });
writeFileSync(join('live', file), live);
console.log(`live: live/${file}`);
