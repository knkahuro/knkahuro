// commit-metro.mjs
// Run: node commit-metro.mjs <username> [token] > metro.svg

const LANG_COLORS = {
  javascript:'#f1e05a', typescript:'#3178c6', python:'#3572A5', go:'#00ADD8',
  rust:'#dea584', java:'#b07219', 'c++':'#f34b7d', c:'#555555', 'c#':'#178600',
  ruby:'#701516', php:'#4F5D95', shell:'#89e051', html:'#e34c26', css:'#563d7c',
  kotlin:'#A97BFF', swift:'#F05138', dart:'#00B4AB', zig:'#ec915c'
};

const user = process.argv[2];
const token = process.argv[3];
const H = { Accept: 'application/vnd.github+json' };
if (token) H.Authorization = 'Bearer ' + token;

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
for (const r of repos) {
  try {
    Object.entries(await j(r.languages_url))
      .forEach(([n, s]) => { agg[n] = (agg[n] || 0) + s; });
  } catch (err) {
    console.warn(`Skipping languages for ${r.name}:`, err.message);
  }
}

const langs = Object.entries(agg)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .map(([name, size]) => ({
    name,
    size,
    color: LANG_COLORS[name.toLowerCase()] || '#8b949e'
  }));

if (langs.length === 0) {
  console.error('No language data found. Are the repos empty?');
  process.exit(1);
}

process.stdout.write(metro({ user: me.login, bio: me.bio, langs, repos: repos.map(r => r.name) }));

function metro({ user, bio, langs, repos }) {
  const W = 900, Ht = 360, x0 = 70, x1 = 830, y = 160;
  const e = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Ht}" width="${W}" font-family="ui-monospace,Menlo,monospace">`;
  s += `<rect width="${W}" height="${Ht}" fill="#0d1117"/>`;
  s += `<text x="${x0}" y="44" fill="#e6edf3" font-size="20" font-weight="700">${e(user)}</text>`;
  s += `<text x="${x0}" y="66" fill="#7d8590" font-size="12">${e((bio ? bio + ' · ' : '') + 'commit metro · every line is a language, every stop a project')}</text>`;
  const total = langs.reduce((a, l) => a + l.size, 0) || 1;
  let cx = x0;
  const segs = [];
  for (const l of langs) {
    const w = (x1 - x0) * l.size / total;
    s += `<line x1="${cx.toFixed(1)}" y1="${y}" x2="${(cx + w).toFixed(1)}" y2="${y}" stroke="${l.color}" stroke-width="6"/>`;
    segs.push({ mid: cx + w / 2, color: l.color, name: l.name, pct: (100 * l.size / total).toFixed(1) });
    cx += w;
  }
  // train
  s += `<g><animateMotion dur="7s" repeatCount="indefinite" path="M ${x0} ${y} L ${x1} ${y}"/>`
   + `<rect x="-16" y="-5" width="14" height="10" rx="2" fill="#e6edf3"/><rect x="1" y="-5" width="14" height="10" rx="2" fill="#c9d1d9"/>`
   + `<circle cx="17" cy="0" r="2.5" fill="#fff8c5"/></g>`;
  for (const g of segs) {
    s += `<circle cx="${g.mid.toFixed(1)}" cy="${y}" r="5" fill="#0d1117" stroke="${g.color}" stroke-width="2.5"/>`;
    s += `<text x="${g.mid.toFixed(1)}" y="${y+26}" fill="${g.color}" font-size="11" text-anchor="middle">${e(g.name)} ${g.pct}%</text>`;
  }
  const gap = (x1 - x0) / (repos.length + 1);
  repos.forEach((r, i) => {
    const bx = x0 + gap * (i + 1), by = 270, L = segs[i % segs.length];
    s += `<path d="M ${bx.toFixed(1)} ${y} L ${bx.toFixed(1)} ${by-14}" stroke="${L.color}" stroke-width="4" fill="none"/>`;
    s += `<circle cx="${bx.toFixed(1)}" cy="${by}" r="7" fill="#0d1117" stroke="${L.color}" stroke-width="3">`
     + `<animate attributeName="r" values="7;9;7" dur="2.4s" begin="${(i * 0.4).toFixed(1)}s" repeatCount="indefinite"/></circle>`;
    s += `<text x="${bx.toFixed(1)}" y="${by+28}" fill="#e6edf3" font-size="11" text-anchor="middle">${e(r)}</text>`;
  });
  return s + '</svg>';
}
