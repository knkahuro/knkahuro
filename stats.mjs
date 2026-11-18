// stats.mjs
// Run: node stats.mjs <username> > stats.svg
// No GitHub token needed — uses unauthenticated API (60 req/hour).

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

// aggregate language stats
let langBytes = {};
for (const r of repos) {
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

let commits = 0;
for (const r of repos) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${r.full_name}/commits?author=${encodeURIComponent(user)}&per_page=1`,
      { headers: H }
    );
    if (!res.ok) continue;

    const link = res.headers.get('link');
    if (link) {
      const last = link.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/);
      commits += last ? Number(last[1]) : 1;
    } else {
      const data = await res.json();
      commits += Array.isArray(data) ? data.length : 0;
    }
  } catch (err) {
    console.warn(`Skipping commits for ${r.name}:`, err.message);
  }
}

let streak = 0;
try {
  const events = await j(`https://api.github.com/users/${encodeURIComponent(user)}/events/public?per_page=100`);
  const pushDates = new Set(
    (Array.isArray(events) ? events : [])
      .filter(event => event.type === 'PushEvent')
      .map(event => String(event.created_at).slice(0, 10))
  );

  const today = new Date();
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const yesterday = new Date(cursor);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const newest = new Set(pushDates).size
    ? [...pushDates].sort().at(-1)
    : null;
  const newestDate = newest ? new Date(`${newest}T00:00:00Z`) : null;

  if (newestDate && (newestDate.getTime() === cursor.getTime() || newestDate.getTime() === yesterday.getTime())) {
    while (pushDates.has(newestDate.toISOString().slice(0, 10))) {
      streak++;
      newestDate.setUTCDate(newestDate.getUTCDate() - 1);
    }
  }
} catch (err) {
  console.warn(`Skipping public streak for ${user}:`, err.message);
}

const totalRepos = repos.length;

const W = 900, Ht = 220;
const e = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function build() {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Ht}" font-family="ui-monospace,Menlo,monospace">`;
  s += `<rect width="${W}" height="${Ht}" fill="#0d1117"/>`;
  s += `<defs>
    <linearGradient id="flame-outer" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ff3b30"/>
      <stop offset=".55" stop-color="#ff7a00"/>
      <stop offset="1" stop-color="#ffd43b"/>
    </linearGradient>
    <linearGradient id="flame-inner" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ffd43b"/>
      <stop offset="1" stop-color="#fff3b0"/>
    </linearGradient>
  </defs>`;

  // panel separator lines
  s += `<line x1="${W/3}" y1="16" x2="${W/3}" y2="${Ht-16}" stroke="#21262d" stroke-width="1"/>`;
  s += `<line x1="${2*W/3}" y1="16" x2="${2*W/3}" y2="${Ht-16}" stroke="#21262d" stroke-width="1"/>`;

  // helper: render one stat card
  const flameEngine = (cx, streakValue) => {
    const tier = streakValue >= 30 ? 3 : streakValue >= 7 ? 2 : streakValue > 0 ? 1 : 0;
    if (tier === 0) return;

    const scale = [0, 0.72, 0.88, 1.05][tier];
    const duration = [0, 1.4, 1.05, 0.72][tier];
    const x = cx + 55;
    const y = 62;
    s += `<g transform="translate(${x} ${y}) scale(${scale})">`;
    s += `<g>
      <animateTransform attributeName="transform" type="rotate" values="-3 0 0;3 0 0;-3 0 0" dur="${duration}s" repeatCount="indefinite"/>
      <animateTransform attributeName="transform" type="translate" values="0 1;-1 -2;1 -1;0 1" dur="${duration}s" repeatCount="indefinite" additive="sum"/>
      <path d="M0 14 C-15 8-17-7-8-16 C-5-20-2-24 1-31 C2-18 10-15 12-8 C20 5 13 13 0 14Z" fill="url(#flame-outer)"/>
    </g>`;
    s += `<g>
      <animateTransform attributeName="transform" type="translate" values="0 2;-1 -1;1 -2;0 2" dur="${duration * 0.7}s" repeatCount="indefinite"/>
      <path d="M0 12 C-8 7-8-2-3-8 C-1-11 1-13 2-18 C5-8 9-5 8 1 C8 7 5 10 0 12Z" fill="url(#flame-inner)"/>
    </g>`;
    if (tier >= 2) {
      s += `<circle cx="-7" cy="-5" r="1.5" fill="#ffd43b" opacity=".9">
        <animate attributeName="cy" values="-5;-24;-5" dur="${duration}s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values=".9;0;.9" dur="${duration}s" repeatCount="indefinite"/>
      </circle>`;
    }
    if (tier >= 3) {
      s += `<circle cx="7" cy="-2" r="1.5" fill="#ff7a00" opacity=".9">
        <animate attributeName="cy" values="-2;-28;-2" dur="${(duration * 0.85).toFixed(2)}s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values=".9;0;.9" dur="${(duration * 0.85).toFixed(2)}s" repeatCount="indefinite"/>
      </circle>`;
    }
    s += `</g>`;
  };

  const card = (cx, big, small, note, accent, streakValue) => {
    s += `<text x="${cx}" y="72" fill="#e6edf3" font-size="30" font-weight="700" text-anchor="middle">${big}</text>`;
    s += `<text x="${cx}" y="104" fill="#7d8590" font-size="13" text-anchor="middle">${e(small)}</text>`;
    if (note) {
      s += `<text x="${cx}" y="126" fill="#8b949e" font-size="11" text-anchor="middle">${e(note)}</text>`;
    }
    s += `<circle cx="${cx - 55}" cy="62" r="6" fill="${accent}"/>`;
    s += `<circle cx="${cx - 55}" cy="62" r="2" fill="#fff"/>`;
    if (typeof streakValue === 'number') flameEngine(cx, streakValue);
  };

  // card 1: total repos
  card(W/6, totalRepos.toLocaleString(), 'Public Repositories', '', '#10069F');
  // card 2: public activity streak
  card(W/2, streak.toLocaleString(), 'Day Streak', 'based on public push events', '#DA291C', streak);
  // card 3: commits
  card(5*W/6, commits.toLocaleString(), 'Commits', topLang ? `top lang: ${e(topLang[0])}` : '', '#FFCD00');

  return s + '</svg>';
}

process.stdout.write(build());