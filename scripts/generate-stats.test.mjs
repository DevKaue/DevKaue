import test from 'node:test';
import assert from 'node:assert/strict';
import { collectStats, renderStats, request } from './generate-stats.mjs';

test('paginates and excludes private data and stars inherited from forks', async () => {
  const paths = [];
  const stats = await collectStats(async path => {
    paths.push(path);
    if (path === '/users/DevKaue') return { followers: 7 };
    if (path.includes('type:pr')) return { total_count: 8 };
    if (path.includes('type:issue')) return { total_count: 9 };
    if (path.endsWith('page=1')) return Array.from({ length: 100 }, () => ({ private: false, fork: false, stargazers_count: 2, forks_count: 1 }));
    return [{ private: true, stargazers_count: 999, forks_count: 999 }, { private: false, fork: true, stargazers_count: 1000, forks_count: 1000 }];
  });
  assert.deepEqual(stats.map(([, value]) => value), [101, 200, 100, 8, 9, 7]);
  assert.ok(paths.some(path => path.endsWith('page=2')));
});

test('rejects incomplete or unavailable data instead of fabricating zeroes', async () => {
  await assert.rejects(() => collectStats(async path => path.includes('search') ? { incomplete_results: true } : {}), /Incomplete/);
  await assert.rejects(() => request('/users/DevKaue', async () => ({ ok: false, status: 429 })), /429/);
});

test('escapes SVG text and includes the actual update date', () => {
  const svg = renderStats([['<unsafe & text>', 1234]], new Date('2026-09-13T00:00:00Z'));
  assert.ok(svg.includes('&lt;unsafe &amp; text&gt;'));
  assert.ok(svg.includes('13/09/2026'));
  assert.ok(!svg.includes('<unsafe'));
});
