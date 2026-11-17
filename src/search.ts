import https from 'https';

export interface Bounty {
  repo: string;
  issue: number;
  title: string;
  /** Display string, e.g. "$1,500", "325,000 sats" or "Unknown". */
  amount: string;
  /** Parsed USD value, or null when the bounty has no dollar amount. */
  amountUsd: number | null;
  /** Parsed satoshi value, or null when the bounty is not priced in sats. */
  amountSats: number | null;
  labels: string[];
  assignees: string[];
  url: string;
  comments: number;
  createdAt: string;
  platform: string;
}

export interface SearchOptions {
  language?: string;
  minAmount?: number;
  maxComments?: number;
  /** Pages of 100 results per query, 1-10 (default 1). */
  pages?: number;
  /** Only issues created on or after this date (YYYY-MM-DD). */
  since?: string;
  /** Hide issues that are already assigned. */
  unassigned?: boolean;
  /** Extra owner/repo names to skip. */
  exclude?: string[];
  /** Don't skip the built-in spam repos. */
  includeSpam?: boolean;
  onWarning?: (message: string) => void;
}

export class GitHubApiError extends Error {
  constructor(message: string, public status: number, public rateLimited = false) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

// ───────────────────────── GitHub API ─────────────────────────

function getToken(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
}

function githubSearch(query: string, page = 1): Promise<any> {
  return new Promise((resolve, reject) => {
    const url =
      `https://api.github.com/search/issues?q=${encodeURIComponent(query)}` +
      `&per_page=100&page=${page}&sort=created&order=desc`;
    const headers: Record<string, string> = {
      'User-Agent': 'bounty-radar/1.1',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        const status = res.statusCode || 0;
        let body: any;
        try {
          body = JSON.parse(data);
        } catch {
          return reject(new GitHubApiError(`Failed to parse GitHub response (HTTP ${status})`, status));
        }
        if (status >= 200 && status < 300) return resolve(body);

        // Previously error bodies were resolved as if they were results, so a rate limit
        // looked like "No bounties found".
        const message: string = body?.message || 'unknown error';
        const rateLimited =
          status === 429 || (status === 403 && res.headers['x-ratelimit-remaining'] === '0') || /rate limit/i.test(message);
        if (rateLimited) {
          const reset = Number(res.headers['x-ratelimit-reset']);
          const when = reset ? ` Resets at ${new Date(reset * 1000).toLocaleTimeString()}.` : '';
          const hint = token ? '' : ' Set GITHUB_TOKEN to get a higher limit.';
          return reject(new GitHubApiError(`GitHub API rate limit reached.${when}${hint}`, status, true));
        }
        reject(new GitHubApiError(`GitHub API error ${status}: ${message}`, status));
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('GitHub request timed out')));
  });
}

// ───────────────────────── Amount parsing ─────────────────────────

// The number must end at a non-digit, and a k/M suffix only counts when no letter follows it,
// so "$1.5K" → 1500, "$500USD" → 500 and "$5 million" → 5 (not 5M).
const AMOUNT_RE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?!\d)(?:\s?([kKmM])(?![a-zA-Z]))?/;
// "sats" not followed by "/", so fee rates like "10 sat/vB" are not read as bounties.
const SATS_RE = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?!\d)\s?(?:([kKmM])\s?)?sats?\b(?!\s*\/)/i;

function scale(numStr: string, suffix?: string): number | null {
  const n = Number.parseFloat(numStr.replace(/,/g, ''));
  if (Number.isNaN(n)) return null;
  const s = (suffix || '').toLowerCase();
  if (s === 'k') return n * 1e3;
  if (s === 'm') return n * 1e6;
  return n;
}

/** "$1.5k" → 1500, "$1,500" → 1500, "$2M" → 2000000. Returns null if none found. */
export function parseAmount(text: string): number | null {
  const m = text.match(AMOUNT_RE);
  return m ? scale(m[1], m[2]) : null;
}

/** "325,000 sats" → 325000, "300k sats" → 300000. Returns null if none found. */
export function parseSats(text: string): number | null {
  const m = text.match(SATS_RE);
  return m ? scale(m[1], m[2]) : null;
}

export function extractAmount(
  labels: string[],
  title: string
): Pick<Bounty, 'amount' | 'amountUsd' | 'amountSats'> {
  const sources = [...labels, title];
  for (const source of sources) {
    const m = source.match(AMOUNT_RE);
    if (m) return { amount: m[0].replace(/\s/g, ''), amountUsd: parseAmount(m[0]), amountSats: null };
  }
  for (const source of sources) {
    const sats = parseSats(source);
    if (sats !== null) return { amount: `${sats.toLocaleString('en-US')} sats`, amountUsd: null, amountSats: sats };
  }
  return { amount: 'Unknown', amountUsd: null, amountSats: null };
}

function parseIssue(item: any, platform: string): Bounty {
  const repo = String(item.repository_url || '').split('/').slice(-2).join('/');
  const labels: string[] = (item.labels || []).map((l: any) => l.name);
  return {
    repo,
    issue: item.number,
    title: item.title,
    ...extractAmount(labels, item.title),
    labels,
    assignees: (item.assignees || []).map((a: any) => a.login),
    url: item.html_url,
    comments: item.comments || 0,
    createdAt: item.created_at?.substring(0, 10) || 'unknown',
    platform,
  };
}

// ───────────────────────── Search ─────────────────────────

/**
 * Repos that flood bounty searches with copied or bait issues (one is named a bot trap).
 * Extend with --exclude; disable with --include-spam.
 */
export const DEFAULT_EXCLUDED_REPOS = [
  'zhangjiayang6835-cyber/bounty-plaza',
  'PhanKhoa95/oss-bot-trap-benchmark',
];

interface QuerySpec {
  query: string;
  platform: string;
  requireAmount?: boolean;
}

function buildQuery(base: string, opts: SearchOptions): string {
  // Qualifiers are space-separated; the old "+language:x" was URL-encoded to a literal "+".
  let q = base;
  if (opts.language) q += ` language:${opts.language}`;
  if (opts.since) q += ` created:>=${opts.since}`;
  return q;
}

async function runQuery(spec: QuerySpec, opts: SearchOptions): Promise<Bounty[]> {
  const pages = Math.max(1, Math.min(opts.pages || 1, 10));
  const results: Bounty[] = [];
  for (let page = 1; page <= pages; page++) {
    let data: any;
    try {
      data = await githubSearch(spec.query, page);
    } catch (err: any) {
      // Keep what earlier pages returned rather than losing the whole query.
      if (page === 1) throw err;
      opts.onWarning?.(`${spec.platform}: stopped at page ${page} (${err.message}); keeping ${results.length} results.`);
      break;
    }
    const items: any[] = data.items || [];
    for (const item of items) {
      if (item.pull_request) continue;
      const b = parseIssue(item, spec.platform);
      if (spec.requireAmount && b.amountUsd === null && b.amountSats === null) continue;
      results.push(b);
    }
    // GitHub sometimes returns short pages mid-result-set, so page by total_count, not page size.
    // The search API never serves more than 1000 results.
    const total = Math.min(Number(data.total_count) || 0, 1000);
    if (items.length === 0 || page * 100 >= total) break;
  }
  return results;
}

export async function searchAll(opts: SearchOptions = {}): Promise<Bounty[]> {
  const specs: QuerySpec[] = [
    { query: buildQuery('label:"💎 Bounty" -label:"💰 Rewarded" state:open is:issue', opts), platform: 'algora' },
    { query: buildQuery('label:bounty state:open is:issue', opts), platform: 'github-label' },
    { query: buildQuery('bounty in:title state:open is:issue', opts), platform: 'github-title', requireAmount: true },
  ];

  const settled = await Promise.allSettled(specs.map((s) => runQuery(s, opts)));
  const failures = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length === settled.length) throw failures[0].reason;
  for (const f of failures) opts.onWarning?.(`A search query failed: ${f.reason?.message || f.reason}`);

  const excluded = new Set(
    [...(opts.includeSpam ? [] : DEFAULT_EXCLUDED_REPOS), ...(opts.exclude || [])].map((r) => r.toLowerCase())
  );
  const seen = new Set<string>();
  const all: Bounty[] = [];
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    for (const b of r.value) {
      const key = `${b.repo}#${b.issue}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (excluded.has(b.repo.toLowerCase())) continue;
      if (opts.unassigned && b.assignees.length > 0) continue;
      if (opts.maxComments !== undefined && b.comments > opts.maxComments) continue;
      if (opts.minAmount !== undefined && (b.amountUsd === null || b.amountUsd < opts.minAmount)) continue;
      all.push(b);
    }
  }
  // USD amounts first (highest first), then sats amounts, then unknown.
  return all.sort((a, b) => (b.amountUsd || 0) - (a.amountUsd || 0) || (b.amountSats || 0) - (a.amountSats || 0));
}
