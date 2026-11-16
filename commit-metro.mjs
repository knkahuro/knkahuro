// commit-metro.mjs
// Run: node commit-metro.mjs <username> > metro.svg
// No GitHub token needed — uses unauthenticated API (60 req/hour).

// TfL London Underground palette
const METRO_PALETTE = [
  '#A45A2A', // Bakerloo
  '#DA291C', // Central
  '#FFCD00', // Circle
  '#007A33', // District
  '#E89CAE', // Hammersmith & City
  '#7C878E', // Jubilee
  '#840B55', // Metropolitan
  '#000000', // Northern
  '#10069F', // Piccadilly
  '#0098D4', // Victoria
  '#000099', // TFL Blue
  '#CC3333'  // TFL Red
];

const user = process.argv[2];
const H = { Accept: 'application/vnd.github+json' };

const j = async u => {
  const res = await fetch(u, { headers: H });
  if (!res.ok) {
    console.error(`API error ${res.status} for ${u}`);
    process.exit(1);
  }
  return res.json();
};

// fetch profile
const me = await j(`https://api.github.com/users/${user}`);

// fetch repos — handle error / empty response
let reposRaw;
try {
  reposRaw = await j(`https://api.github.com/users/${user}/repos?sort=pushed&per_page=100`);
} catch (err) {
  console.error('Failed to fetch repos:', err.message);
  process.exit(1);
}

// ensure we got an array
const repos = (Array.isArray(reposRaw) ? reposRaw : [])
  .filter(r => r && !r.fork)
  .slice(0, 5);

if (repos.length === 0) {
  console.error('No non-fork public repositories found for user', user);
  console.error('Add at least one public non-fork repo, or disable "fork" filtering by removing the .filter() call.');
  process.exit(1);
}

// aggregate language bytes
const agg = {};
const repoLangs = {}; // repo name -> { lang: bytes }
for (const r of repos) {
  try {
    const langs = await j(r.languages_url);
    repoLangs[r.name] = langs;
    Object.entries(langs)
      .forEach(([n, s]) => { agg[n] = (agg[n] || 0) + s; });
  } catch (err) {
    console.warn(`Skipping languages for ${r.name}:`, err.message);
    repoLangs[r.name] = {};
  }
}

const langs = Object.entries(agg)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .map(([name, size], i) => ({
    name,
    size,
    color: METRO_PALETTE[i] || METRO_PALETTE[0]
  }));

if (langs.length === 0) {
  console.error('No language data found. Are the repos empty?');
  process.exit(1);
}

// each language is a line; each project is a station on its dominant language line
const langNames = new Set(langs.map(l => l.name));
const dominantLang = r => {
  const rl = repoLangs[r] || {};
  let best = null, bestSize = 0;
  for (const [n, s] of Object.entries(rl)) {
    if (langNames.has(n) && s > bestSize) { best = n; bestSize = s; }
  }
  return best || langs[0].name;
};

const lines = langs.map(l => ({
  name: l.name,
  color: l.color,
  stations: repos.filter(r => dominantLang(r) === l.name).map(r => r.name)
}));

process.stdout.write(metro({ user: me.login, bio: me.bio, lines }));

function metro({ user, bio, lines }) {
  const W = 900, Ht = 460;
  const x0 = 100, x1 = 860;
  const lineTop = 130, lineGap = 52;
  const chipX = 14, chipW = 110, chipH = 22;
  const e = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Ht}" width="100%" height="auto" preserveAspectRatio="xMidYMid meet" font-family="ui-monospace,Menlo,monospace">`;
  s += `<rect width="${W}" height="${Ht}" fill="#0d1117"/>`;
  s += `<text x="${x0}" y="40" fill="#e6edf3" font-size="20" font-weight="700">${e(user)}</text>`;
  s += `<text x="${x0}" y="62" fill="#7d8590" font-size="12">${e((bio ? bio + ' · ' : '') + 'commit metro · every line is a language, every stop a project')}</text>`;

  lines.forEach((line, i) => {
    const y = lineTop + i * lineGap;
    const stations = line.stations;
    const n = stations.length;
    const lineColor = line.color;
    const lineStart = chipX + chipW + 8;

    // language line — fixed width
    s += `<line x1="${lineStart}" y1="${y}" x2="${x1}" y2="${y}" stroke="${lineColor}" stroke-width="5" stroke-linecap="round" opacity="0.9"/>`;

    // language name as a solid chip at the left of the line
    s += `<rect x="${chipX}" y="${y - chipH / 2}" width="${chipW}" height="${chipH}" rx="11" fill="${lineColor}"/>`;
    s += `<text x="${chipX + chipW / 2}" y="${y}" fill="#0d1117" font-size="10" font-weight="700" text-anchor="middle" dominant-baseline="central">${e(line.name)}</text>`;

    // stations — blank circles with the line's color as border
    stations.forEach((st, j) => {
      const bx = n === 1 ? (lineStart + x1) / 2 : lineStart + (x1 - lineStart) * (j + 1) / (n + 1);
      s += `<circle cx="${bx.toFixed(1)}" cy="${y}" r="6" fill="#0d1117" stroke="${lineColor}" stroke-width="2.5"/>`;
      // project name below the station tick
      s += `<text x="${bx.toFixed(1)}" y="${y + 22}" fill="#e6edf3" font-size="10" text-anchor="middle">${e(st)}</text>`;
    });
  });

  return s + '</svg>';
}
