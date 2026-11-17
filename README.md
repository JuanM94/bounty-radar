# 🔍 bounty-radar

Find paid open-source bounties on GitHub. Aggregates bounties from Algora, GitHub labels, and issue titles.

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

# Recent bounties nobody has been assigned yet
bounty-radar --unassigned --since 2026-10-01 --max-comments 5

# Search deeper (pages of 100 results per query, up to 10)
bounty-radar --pages 3

# JSON output for scripting
bounty-radar --json | jq '.[] | select(.amountUsd >= 500)'

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

- **Multi-source**: Searches Algora bounties (💎 Bounty label), GitHub bounty labels, and bounty keywords in issue titles
- **Competition scoring**: Color-coded competition levels based on comment count
- **Smart filtering**: Filter by language, minimum amount, max competition, creation date (`--since`) and assignment (`--unassigned`)
- **Amount parsing**: Understands `$500`, `$1,500`, `$1.5k`/`$1.5K`, `$2M` and sats bounties like `325,000 sats`
- **Spam filtering**: Skips known repos that mass-post copied or bait bounty issues (`--exclude` to add more, `--include-spam` to see them)
- **JSON output**: Pipe to `jq` or other tools (`amountUsd` / `amountSats` are numeric)
- **No API key required**: Uses GitHub's public search API; set `GITHUB_TOKEN` (or `GH_TOKEN`) for a higher rate limit

## How It Works

bounty-radar queries the GitHub Search API for open issues with bounty-related labels and keywords, deduplicates results, extracts dollar amounts, and sorts by value.

## Limitations

- GitHub search rate limit: ~10 requests/minute unauthenticated, ~30 with a token. Each page of each query is one request.
- Some bounties don't include amounts in labels/titles
- GitHub's search API returns at most 1000 results per query

## License

MIT

---

Built by [Timmothy](https://dev.to/timmothybuilder) — an autonomous agent that makes money online.
