import https from 'https';

const MAX_GITHUB_SEARCH_RETRIES = 2;

export interface Bounty {
  repo: string;
  issue: number;
  title: string;
  amount: string;
  labels: string[];
  url: string;
  comments: number;
  createdAt: string;
  platform: string;
}

function githubSearch(query: string, attempt = 0): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=50&sort=created&order=desc`;
    const headers: Record<string, string> = {
      'User-Agent': 'bounty-radar/1.0',
      'Accept': 'application/vnd.github.v3+json'
    };

    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const req = https.get(url, {
      headers
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(parsed.message || `GitHub search failed with status ${res.statusCode}`));
            return;
          }
          resolve(parsed);
        }
        catch {
          reject(new Error('Failed to parse GitHub response'));
        }
      });
    });
    req.on('error', (error) => {
      if (attempt < MAX_GITHUB_SEARCH_RETRIES) {
        setTimeout(() => {
          githubSearch(query, attempt + 1).then(resolve, reject);
        }, 250 * (attempt + 1));
        return;
      }

      reject(error);
    });
  });
}

function extractAmount(labels: string[], title: string, body = ''): string {
  // Check labels for dollar amounts
  for (const label of labels) {
    const match = label.match(/\$[\d,.]+k?/i);
    if (match) return match[0];
  }
  // Check title
  const titleMatch = title.match(/\$[\d,.]+k?/i);
  if (titleMatch) return titleMatch[0];

  // Check common funding badge/body text such as IssueHunt summaries.
  const bodyMatch = body.match(/\$[\d,.]+k?/i);
  if (bodyMatch) return bodyMatch[0];

  return 'Unknown';
}

function parseIssue(item: any, platform: string): Bounty {
  const repoUrl = item.repository_url || '';
  const repoParts = repoUrl.split('/');
  const repo = repoParts.slice(-2).join('/');
  const labels = (item.labels || []).map((l: any) => l.name);
  
  return {
    repo,
    issue: item.number,
    title: item.title,
    amount: extractAmount(labels, item.title, item.body),
    labels,
    url: item.html_url,
    comments: item.comments || 0,
    createdAt: item.created_at?.substring(0, 10) || 'unknown',
    platform
  };
}

function extractIssueHuntAmount(body = ''): string {
  const patterns = [
    /Backers\s*\(Total:\s*(\$[\d,.]+k?)\)/i,
    /There is a\s+(\$[\d,.]+k?)\s+open bounty/i,
    /IssueHunt-[^-]*?%24([\d,.]+k?)%20Funded/i
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) {
      return match[1].startsWith('$') ? match[1] : `$${match[1]}`;
    }
  }

  return 'Unknown';
}

export async function searchAlgoraBounties(options: { language?: string; minAmount?: number }): Promise<Bounty[]> {
  const langFilter = options.language ? `+language:${options.language}` : '';
  const query = `label:"💎 Bounty" state:open${langFilter}`;
  
  const data = await githubSearch(query);
  if (!data.items) return [];
  
  return data.items
    .map((item: any) => parseIssue(item, 'algora'))
    .filter((b: Bounty) => {
      if (options.minAmount) {
        const amt = parseInt(b.amount.replace(/[$,k]/g, ''));
        if (b.amount.includes('k')) return amt * 1000 >= options.minAmount;
        return amt >= options.minAmount;
      }
      return true;
    });
}

export async function searchLabelBounties(options: { language?: string; minAmount?: number }): Promise<Bounty[]> {
  const langFilter = options.language ? `+language:${options.language}` : '';
  const queries = [
    `label:bounty state:open${langFilter}`,
    `"bounty" in:title state:open is:issue${langFilter}`
  ];
  
  const allBounties: Bounty[] = [];
  const seen = new Set<string>();
  
  for (const query of queries) {
    try {
      const data = await githubSearch(query);
      if (!data.items) continue;
      
      for (const item of data.items) {
        const key = `${item.repository_url}#${item.number}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allBounties.push(parseIssue(item, 'github-label'));
      }
    } catch {
      // Rate limited or error, skip
    }
  }
  
  return allBounties.filter((b: Bounty) => {
    if (options.minAmount) {
      const amt = parseInt(b.amount.replace(/[$,k]/g, ''));
      if (isNaN(amt)) return false;
      if (b.amount.includes('k')) return amt * 1000 >= options.minAmount;
      return amt >= options.minAmount;
    }
    return true;
  });
}

export async function searchIssueHuntBounties(options: { language?: string; minAmount?: number }): Promise<Bounty[]> {
  const langFilter = options.language ? `+language:${options.language}` : '';
  const queries = [
    `label:":dollar: Funded on Issuehunt" state:open is:issue${langFilter}`,
    `"IssueHunt" in:body state:open is:issue${langFilter}`,
    `"issuehunt.io" in:body state:open is:issue${langFilter}`
  ];

  const allBounties: Bounty[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    try {
      const data = await githubSearch(query);
      if (!data.items) continue;

      for (const item of data.items) {
        const key = `${item.repository_url}#${item.number}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const fundedAmount = extractIssueHuntAmount(item.body);
        const amount = parseAmount(fundedAmount);
        if (amount <= 0) continue;
        if (options.minAmount && amount < options.minAmount) continue;

        const bounty = parseIssue(item, 'issuehunt');
        bounty.amount = fundedAmount;
        allBounties.push(bounty);
      }
    } catch {
      // Rate limited or error, skip
    }
  }

  return allBounties;
}

export async function searchAll(options: { language?: string; minAmount?: number; maxComments?: number }): Promise<Bounty[]> {
  const [algora, labels, issuehunt] = await Promise.all([
    searchAlgoraBounties(options),
    searchLabelBounties(options),
    searchIssueHuntBounties(options)
  ]);
  
  // Deduplicate
  const seen = new Set<string>();
  const all: Bounty[] = [];
  
  for (const b of [...algora, ...labels, ...issuehunt]) {
    const key = `${b.repo}#${b.issue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (options.maxComments !== undefined && b.comments > options.maxComments) continue;
    all.push(b);
  }
  
  // Sort by amount (descending)
  return all.sort((a, b) => {
    const amtA = parseAmount(a.amount);
    const amtB = parseAmount(b.amount);
    return amtB - amtA;
  });
}

function parseAmount(amount: string): number {
  const cleaned = amount.replace(/[$,]/g, '');
  if (cleaned.endsWith('k')) return parseFloat(cleaned) * 1000;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
