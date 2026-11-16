// stats.mjs
// Run: node stats.mjs <username> > stats.svg
// No GitHub token needed — uses unauthenticated API (60 req/hour).
// Note: contribution counts / streaks require authentication; not available publicly.

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

// fetch repos
let reposRaw;
try {
  reposRaw = await j(`https://api.github.com/users/${user}/repos?sort=pushed&per_page=100`);
} catch (err) {
  console.error('Failed to fetch repos:', err.message);
  process.exit(1);
}

const repos = (Array.isArray(reposRaw) ? reposRaw : [])
  .filter(r => r && !r.fork)
  .slice(0, 5);

if (repos.length === 0) {
  console.error('No non-fork public repositories found for user', user);
  console.error('Add at least one public non-fork repo, or disable "fork" filtering by removing the .filter() call.');
  process.exit(1);
}

// aggregate repo stats
let stars = 0, forks = 0;
let langBytes = {};
for (const r of repos) {
  stars += r.stargazers_count || 0;
  forks += r.forks_count || 0;
  try {
    const langs = await j(r.languages_url);
    Object.entries(langs).forEach(([n, s]) => { langBytes[n] = (langBytes[n] || 0) + s; });
  } catch (err) {
    console.warn(`Skipping languages for ${r.name}:`, err.message);
  }
}

// aggregate language bytes
const topLang = Object.entries(langBytes)
  .sort((a, b) => b[1] - a[1])[0];

const totalRepos = repos.length;

const W = 900, Ht = 220;
const e = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function build() {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Ht}" width="${W}" height="${Ht}" font-family="ui-monospace,Menlo,monospace">`;
  s += `<rect width="${W}" height="${Ht}" fill="#0d1117"/>`;

  // panel separator lines
  s += `<line x1="${W/3}" y1="16" x2="${W/3}" y2="${Ht-16}" stroke="#21262d" stroke-width="1"/>`;
  s += `<line x1="${2*W/3}" y1="16" x2="${2*W/3}" y2="${Ht-16}" stroke="#21262d" stroke-width="1"/>`;

  // helper: render one stat card
  const card = (cx, big, small, note, accent) => {
    s += `<text x="${cx}" y="72" fill="#e6edf3" font-size="30" font-weight="700" text-anchor="middle">${big}</text>`;
    s += `<text x="${cx}" y="104" fill="#7d8590" font-size="13" text-anchor="middle">${e(small)}</text>`;
    if (note) {
      s += `<text x="${cx}" y="126" fill="#8b949e" font-size="11" text-anchor="middle">${e(note)}</text>`;
    }
    // accent dot above number
    s += `<circle cx="${cx - 55}" cy="62" r="6" fill="${accent}"/>`;
    s += `<circle cx="${cx - 55}" cy="62" r="2" fill="#fff"/>`;
  };

  // card 1: total repos
  card(W/6, totalRepos.toLocaleString(), 'Public Repositories', '', '#10069F');
  // card 2: total stars
  card(W/2, stars.toLocaleString(), 'Total Stars', '', '#DA291C');
  // card 3: total forks
  card(5*W/6, forks.toLocaleString(), 'Total Forks', topLang ? `top lang: ${e(topLang[0])}` : '', '#FFCD00');

  return s + '</svg>';
}

process.stdout.write(build());