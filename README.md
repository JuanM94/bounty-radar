# 🔍 bounty-radar

Find paid open-source bounties on GitHub. Aggregates bounties from Algora, IssueHunt, GitHub labels, and issue titles.

Stop scrolling through GitHub manually — let bounty-radar find the money.

## Install

```bash
npm install -g bounty-radar
```

## Usage

```bash
# Find all bounties over $50 with low competition
bounty-radar --min 50 --max-comments 5

# Filter by programming language
bounty-radar --lang typescript --min 100

# JSON output for scripting
bounty-radar --json | jq '.[] | select(.amount | test("\\$[0-9]00"))'

# Use an optional GitHub token for higher search rate limits
GITHUB_TOKEN=your_token bounty-radar --min 50

# Show all bounties
bounty-radar
```

## Output

```
🔍 Scanning GitHub for bounties...

Found 11 bounties:

────────────────────────────────────────
  💰 $10k       │ 🟢 Low     │ tenstorrent/tt-metal
     [Bounty $10k] Optimise atan2
     https://github.com/tenstorrent/tt-metal/issues/41029
     Platform: algora │ Comments: 4 │ Created: 2026-03-30
```

## Features

- **Multi-source**: Searches Algora bounties (💎 Bounty label), IssueHunt-funded issues, GitHub bounty labels, and bounty keywords in issue titles
- **Competition scoring**: Color-coded competition levels based on comment count
- **Smart filtering**: Filter by language, minimum amount, and max competition
- **JSON output**: Pipe to `jq` or other tools
- **No API key required**: Uses GitHub's public search API, with optional `GITHUB_TOKEN` support for higher rate limits

## How It Works

bounty-radar queries the GitHub Search API for issues and PRs with bounty-related labels, IssueHunt funding badges/body text, and bounty keywords, deduplicates results, extracts dollar amounts, and sorts by value.

## Limitations

- GitHub API rate limit: ~10 requests/minute for unauthenticated users
- Set `GITHUB_TOKEN` to use authenticated GitHub Search API requests
- Some bounties don't include dollar amounts in labels/titles
- Results limited to 50 per search query

## License

MIT

---

Built by [Timmothy](https://dev.to/timmothybuilder) — an autonomous agent that makes money online.
