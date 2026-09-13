import { mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const username = 'DevKaue';
const api = 'https://api.github.com';

export async function request(path, fetcher = fetch) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'DevKaue-profile-stats', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetcher(`${api}${path}`, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`GitHub API returned ${response.status} for ${path}`);
  return response.json();
}

export async function collectStats(get = request) {
  const [user, pulls, issues] = await Promise.all([
    get(`/users/${username}`),
    get(`/search/issues?q=author:${username}+type:pr+is:public&per_page=1`),
    get(`/search/issues?q=author:${username}+type:issue+is:public&per_page=1`),
  ]);
  if (pulls.incomplete_results || issues.incomplete_results) throw new Error('Incomplete GitHub search results; preserving the last card.');
  const repos = [];
  for (let page = 1; ; page++) {
    const batch = await get(`/users/${username}/repos?type=owner&per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('Invalid repository response');
    repos.push(...batch.filter(repo => !repo.private));
    if (batch.length < 100) break;
  }
  const authored = repos.filter(repo => !repo.fork);
  const stats = [
    ['Repositórios públicos', repos.length],
    ['Estrelas recebidas', authored.reduce((sum, repo) => sum + repo.stargazers_count, 0)],
    ['Forks dos meus projetos', authored.reduce((sum, repo) => sum + repo.forks_count, 0)],
    ['Pull requests públicos', pulls.total_count],
    ['Issues públicas', issues.total_count],
    ['Seguidores', user.followers],
  ];
  if (stats.some(([, value]) => !Number.isSafeInteger(value) || value < 0)) throw new Error('Invalid statistics; preserving the last card.');
  return stats;
}

const escapeXml = value => String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);

export function renderStats(stats, date = new Date()) {
  const stamp = date.toISOString().slice(0, 10).split('-').reverse().join('/');
  const cells = stats.map(([label, value], index) => {
    const x = 30 + (index % 3) * 245;
    const y = 114 + Math.floor(index / 3) * 91;
    return `<g transform="translate(${x} ${y})"><text class="value">${escapeXml(new Intl.NumberFormat('pt-BR').format(value))}</text><text class="label" y="28">${escapeXml(label)}</text></g>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="306" viewBox="0 0 760 306" role="img" aria-labelledby="title desc">
  <title id="title">GitHub Stats — Kauê Wendt Sabino</title>
  <desc id="desc">${stats.map(([label, value]) => `${escapeXml(label)}: ${value}`).join('. ')}. Atualizado em ${stamp}. Somente dados públicos.</desc>
  <style>text{font-family:Arial,Helvetica,sans-serif}.value{fill:#f4f0e7;font-size:31px;font-weight:700}.label{fill:#c6c9be;font-size:13px}</style>
  <rect width="760" height="306" rx="8" fill="#202a26"/>
  <path d="M30 65H730 M30 252H730" stroke="#48524b"/>
  <rect x="30" y="28" width="8" height="8" fill="#da8055"/>
  <text x="48" y="37" fill="#f4f0e7" font-size="16" font-weight="700">DevKaue / GitHub Stats</text>
  <text x="730" y="37" fill="#c6c9be" font-size="12" text-anchor="end">ATIVIDADE PÚBLICA</text>
  ${cells}
  <text x="30" y="283" fill="#c6c9be" font-size="12">Atualizado em ${stamp} · GitHub Actions</text>
  <text x="730" y="283" fill="#da8055" font-size="12" text-anchor="end">github.com/DevKaue</text>
</svg>\n`;
}

async function main() {
  const stats = await collectStats();
  const output = new URL('../assets/github-stats.svg', import.meta.url);
  await mkdir(new URL('../assets/', import.meta.url), { recursive: true });
  // Replace only after every API request and validation succeeds.
  const temporary = `${fileURLToPath(output)}.tmp`;
  await writeFile(temporary, renderStats(stats), 'utf8');
  await rename(temporary, output);
  console.log('Updated public GitHub statistics.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
