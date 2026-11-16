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

// each repo connects to every language line it uses (interchange stations)
const langNames = new Set(langs.map(l => l.name));
const linesOf = r => {
  const rl = repoLangs[r] || {};
  const hit = Object.entries(rl).filter(([n]) => langNames.has(n)).map(([n]) => langs.find(l => l.name === n));
  return hit.length ? hit : [langs[0]];
};

process.stdout.write(metro({ user: me.login, bio: me.bio, langs, repos: repos.map(r => r.name), linesOf }));

function metro({ user, bio, langs, repos, linesOf }) {
  const W = 900, Ht = 460;
  const x0 = 100, x1 = 860;
  const lineTop = 130, lineGap = 48;
  const e = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // line thickness proportional to byte share (TfL: thickness = base grid unit)
  const totalBytes = langs.reduce((a, l) => a + l.size, 0) || 1;
  const thickness = l => Math.max(3, Math.round(4 + 5 * l.size / totalBytes));

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Ht}" width="100%" height="auto" preserveAspectRatio="xMidYMid meet" font-family="ui-monospace,Menlo,monospace">`;
  s += `<rect width="${W}" height="${Ht}" fill="#0d1117"/>`;
  s += `<text x="${x0}" y="40" fill="#e6edf3" font-size="20" font-weight="700">${e(user)}</text>`;
  s += `<text x="${x0}" y="62" fill="#7d8590" font-size="12">${e((bio ? bio + ' · ' : '') + 'commit metro · every line is a language, every stop a project')}</text>`;

  // language lines — one per language, horizontal, octilinear
  langs.forEach((l, i) => {
    const y = lineTop + i * lineGap;
    const t = thickness(l);
    s += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${l.color}" stroke-width="${t}" stroke-linecap="round"/>`;
    s += `<text x="${x0 - 12}" y="${y + 4}" fill="${l.color}" font-size="12" font-weight="700" text-anchor="end">${e(l.name)}</text>`;
    const pct = (100 * l.size / totalBytes).toFixed(1);
    s += `<text x="${x1 + 12}" y="${y + 4}" fill="#8b949e" font-size="10" text-anchor="start">${pct}%</text>`;
    // train running on the line
    s += `<g><animateMotion dur="8s" repeatCount="indefinite" path="M ${x0} ${y} L ${x1} ${y}"/>`
     + `<rect x="-16" y="-5" width="14" height="10" rx="2" fill="#e6edf3"/><rect x="1" y="-5" width="14" height="10" rx="2" fill="#c9d1d9"/>`
     + `<circle cx="17" cy="0" r="2.5" fill="#fff8c5"/></g>`;
  });

  // stations — repos as interchange points where their language lines meet
  const n = repos.length;
  repos.forEach((r, i) => {
    const myLines = linesOf(r);
    const bx = n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * (i + 1) / (n + 1);
    const ys = myLines.map(l => lineTop + langs.indexOf(l) * lineGap);
    const by = ys.reduce((a, b) => a + b, 0) / ys.length;
    const maxT = Math.max(...myLines.map(l => thickness(l)));

    // spurs from station to each connecting line (in that line's color)
    myLines.forEach(l => {
      const ly = lineTop + langs.indexOf(l) * lineGap;
      if (Math.abs(ly - by) > 0.5) {
        s += `<line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${ly.toFixed(1)}" stroke="${l.color}" stroke-width="1.5" opacity="0.7"/>`;
      }
    });

    // station symbol — single stop vs interchange ring (TfL-style)
    const r0 = myLines.length === 1 ? maxT * 0.85 : maxT * 1.7;
    if (myLines.length === 1) {
      s += `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${r0.toFixed(1)}" fill="${myLines[0].color}"/>`;
    } else {
      s += `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${r0.toFixed(1)}" fill="#0d1117" stroke="${myLines[0].color}" stroke-width="2"/>`;
      s += `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${(r0 * 0.5).toFixed(1)}" fill="#0d1117"/>`;
      myLines.forEach((l, k) => {
        const ang = (k / myLines.length) * Math.PI * 2;
        const dx = Math.cos(ang) * r0 * 0.7, dy = Math.sin(ang) * r0 * 0.7;
        s += `<circle cx="${(bx + dx).toFixed(1)}" cy="${(by + dy).toFixed(1)}" r="2" fill="${l.color}"/>`;
      });
    }
    // station name above (cap height ~3× tick, per TfL standard)
    s += `<text x="${bx.toFixed(1)}" y="${(by - r0 - 6).toFixed(1)}" fill="#e6edf3" font-size="11" text-anchor="middle">${e(r)}</text>`;
  });

  return s + '</svg>';
}
