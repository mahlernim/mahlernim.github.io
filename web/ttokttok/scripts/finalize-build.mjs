import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(import.meta.dirname, '../../../ttokttok/app');
const sourceAssets = resolve(import.meta.dirname, '../../../ttokttok/assets');
await mkdir(resolve(output, 'calendar'), { recursive: true });
for (const size of [192, 512]) await copyFile(resolve(sourceAssets, `icon-${size}.png`), resolve(output, `icon-${size}.png`));
await writeFile(resolve(output, 'LICENSE.txt'), (await readFile(resolve(sourceAssets, 'LICENSE-app.txt'), 'utf8')).replace(/\r\n/g, '\n'));
const base = '/ttokttok/app/';
const manifest = {
  id: base, name: '똑똑 · 우리 집 가스 기록', short_name: '똑똑', lang: 'ko',
  start_url: base, scope: base, display: 'standalone', background_color: '#f8f7f2', theme_color: '#086b5d',
  icons: [192, 512].map(size => ({ src: `icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
};
await writeFile(resolve(output, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const rules = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const calendarFiles = [];
for (let day = 1; day <= 7; day++) for (let hour = 0; hour < 24; hour++) {
  const hh = String(hour).padStart(2, '0');
  const name = `calendar/${days[day - 1]}-${hh}00.ics`;
  const date = String(4 + day).padStart(2, '0'); // 2026-01-05 was Monday.
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ahn Lab//Ttokttok Meter Reminder//KO', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:똑똑 계량기 확인', 'X-WR-TIMEZONE:Asia/Seoul',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Seoul', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'TZNAME:KST', 'END:STANDARD', 'END:VTIMEZONE',
    'BEGIN:VEVENT', `UID:ttokttok-${days[day - 1]}-${hh}00@ahn-lab.org`, 'DTSTAMP:20260101T000000Z',
    `DTSTART;TZID=Asia/Seoul:202601${date}T${hh}0000`, 'DURATION:PT5M', `RRULE:FREQ=WEEKLY;BYDAY=${rules[day - 1]}`,
    'SUMMARY:똑똑 계량기 확인', 'DESCRIPTION:실제 계량기 숫자를 확인하고 똑똑에 기록해 주세요.', `URL:https://ahn-lab.org${base}`,
    'TRANSP:TRANSPARENT', 'BEGIN:VALARM', 'TRIGGER:PT0S', 'ACTION:DISPLAY', 'DESCRIPTION:계량기를 확인할 시간이에요.', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ];
  // RFC 5545 lines are folded by UTF-8 octets, without splitting a character.
  const folded = lines.flatMap(line => {
    const parts = []; let part = '';
    for (const character of line) {
      if (Buffer.byteLength(part + character) > 74) { parts.push(part); part = ' '; }
      part += character;
    }
    parts.push(part); return parts;
  });
  await writeFile(resolve(output, name), folded.join('\r\n'));
  calendarFiles.push(name);
}
const html = await readFile(resolve(output, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)="(\/ttokttok\/app\/assets\/[^"?#]+)"/g)].map(match => match[1].slice(base.length));
const files = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'LICENSE.txt', ...new Set(assets), ...calendarFiles];
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(resolve(output, file)));
const version = hash.digest('hex').slice(0, 16);
const shell = [base, ...files.map(file => base + file)];
const sw = `/* Generated offline shell. Personal records live only in IndexedDB. */
const CACHE = 'ttokttok-shell-${version}';
const SHELL = ${JSON.stringify(shell)};
const paths = new Set(SHELL);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Activation follows successful full shell installation. Never touch other apps or IndexedDB.
    for (const key of await caches.keys()) if (key.startsWith('ttokttok-shell-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.search || !paths.has(url.pathname)) return;
  if (event.request.mode === 'navigate') {
    // Keep HTML and its hashed assets on the same installed version until the user applies an update.
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match('${base}')) || fetch(event.request)));
  } else {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
  }
});
`;
await writeFile(resolve(output, 'service-worker.js'), sw);
await writeFile(resolve(output, 'build-info.json'), JSON.stringify({ version, shellFiles: files.length }) + '\n');
console.log(`Built offline shell ${version} with ${files.length} files and 168 generic calendar choices.`);
