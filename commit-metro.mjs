// commit-metro.mjs
// Run: node commit-metro.mjs <username> > metro.svg
// No GitHub token needed — uses unauthenticated API (60 req/hour).

// Canonical metro palette — Red, Orange, Yellow, Green, Blue, Purple
// (sourced from London Underground, NYC MTA, Paris Métro, Boston MBTA, Tokyo Metro)
const METRO_PALETTE = ['#E8112D', '#FF6319', '#FFD100', '#00933C', '#0062CF', '#9A38A1'];
const FALLBACK_COLORS = {
  javascript:'#f1e05a', typescript:'#3178c6', python:'#3572A5', go:'#00ADD8',
  rust:'#dea584', java:'#b07219', 'c++':'#f34b7d', c:'#555555', 'c#':'#178600',
  ruby:'#701516', php:'#4F5D95', shell:'#89e051', html:'#e34c26', css:'#563d7c',
  kotlin:'#A97BFF', swift:'#F05138', dart:'#00B4AB', zig:'#ec915c'
};

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
    color: METRO_PALETTE[i] || FALLBACK_COLORS[name.toLowerCase()] || '#8b949e'
  }));

if (langs.length === 0) {
  console.error('No language data found. Are the repos empty?');
  process.exit(1);
}

// each project is a line; each language it uses is a station on that line
const langColor = {};
langs.forEach(l => { langColor[l.name] = l.color; });

const lines = repos.map(r => {
  const rl = repoLangs[r.name] || {};
  const entries = Object.entries(rl)
    .filter(([n]) => langColor[n])
    .map(([n, s]) => ({ name: n, size: s, color: langColor[n] }))
    .sort((a, b) => b.size - a.size);
  if (entries.length === 0) {
    return { name: r.name, langs: [{ name: langs[0].name, size: 1, color: langs[0].color }], dominant: langs[0] };
  }
  return { name: r.name, langs: entries, dominant: entries[0] };
}).filter(l => l.dominant);

process.stdout.write(metro({ user: me.login, bio: me.bio, lines }));

function metro({ user, bio, lines }) {
  const W = 900, Ht = 460;
  const x0 = 100, x1 = 860;
  const lineTop = 130, lineGap = 52;
  const e = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // deterministic RNG so the same run produces the same map
  let seed = lines.reduce((a, l) => a + l.name.charCodeAt(0), 0);
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Ht}" width="100%" height="auto" preserveAspectRatio="xMidYMid meet" font-family="ui-monospace,Menlo,monospace">`;
  s += `<rect width="${W}" height="${Ht}" fill="#0d1117"/>`;
  s += `<text x="${x0}" y="40" fill="#e6edf3" font-size="20" font-weight="700">${e(user)}</text>`;
  s += `<text x="${x0}" y="62" fill="#7d8590" font-size="12">${e((bio ? bio + ' · ' : '') + 'commit metro · every line is a project, every stop a language')}</text>`;

  lines.forEach((line, i) => {
    const y = lineTop + i * lineGap;
    const stations = line.langs;
    const n = stations.length;
    const lineColor = line.dominant.color;

    // project line — fixed width, colored by its dominant language
    s += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${lineColor}" stroke-width="5" stroke-linecap="round" opacity="0.9"/>`;

    // project name as a chip (badge) at the left of the line
    const tw = e(line.name).length * 6.5 + 16;
    const th = 20;
    const chipY = y - th / 2;
    s += `<rect x="${x0 - 12 - tw}" y="${chipY}" width="${tw}" height="${th}" rx="10" fill="#0d1117" stroke="${lineColor}" stroke-width="1.5"/>`;
    s += `<text x="${x0 - 12 - tw / 2}" y="${y + 4}" fill="${lineColor}" font-size="11" font-weight="700" text-anchor="middle">${e(line.name)}</text>`;

    // stations — blank circles with the line's color as border
    stations.forEach((st, j) => {
      const bx = n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * (j + 1) / (n + 1);
      s += `<circle cx="${bx.toFixed(1)}" cy="${y}" r="6" fill="#0d1117" stroke="${lineColor}" stroke-width="2.5"/>`;
      // language name below the station tick
      s += `<text x="${bx.toFixed(1)}" y="${y + 22}" fill="${st.color}" font-size="10" text-anchor="middle">${e(st.name)}</text>`;
    });

    // train — randomized duration, delay, and direction
    const dur = (4 + rnd() * 6).toFixed(1);
    const delay = (rnd() * 8).toFixed(1);
    const reverse = rnd() > 0.5;
    const path = reverse ? `M ${x1} ${y} L ${x0} ${y}` : `M ${x0} ${y} L ${x1} ${y}`;
    s += `<g><animateMotion dur="${dur}s" begin="${delay}s" repeatCount="indefinite" path="${path}"/>`
     + `<rect x="-16" y="-5" width="14" height="10" rx="2" fill="#e6edf3"/><rect x="1" y="-5" width="14" height="10" rx="2" fill="#c9d1d9"/>`
     + `<circle cx="17" cy="0" r="2.5" fill="#fff8c5"/></g>`;
  });

  return s + '</svg>';
}
