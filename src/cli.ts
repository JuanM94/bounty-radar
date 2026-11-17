#!/usr/bin/env node

import { searchAll, GitHubApiError } from './search';

const args = process.argv.slice(2);

function printHelp() {
  console.log(`
bounty-radar — Find paid open-source bounties on GitHub

Usage:
  bounty-radar [options]

Options:
  --lang <language>     Filter by repository language (e.g., typescript, python)
  --min <amount>        Minimum bounty in USD (excludes bounties with no USD amount)
  --max-comments <n>    Max comments (lower = less competition)
  --pages <n>           Pages of 100 results per query, 1-10 (default 1)
  --since <YYYY-MM-DD>  Only issues created on or after this date
  --unassigned          Hide issues already assigned to someone
  --exclude <repos>     Comma-separated owner/repo list to skip (adds to the built-in spam list)
  --include-spam        Don't skip the built-in spam repos
  --json                Output JSON only (status messages go to stderr)
  --help                Show this help

Environment:
  GITHUB_TOKEN / GH_TOKEN   Optional; raises the search rate limit (~10 → ~30 requests/min)

Examples:
  bounty-radar --lang typescript --min 100
  bounty-radar --unassigned --since 2026-10-01 --max-comments 5
  bounty-radar --json | jq '.[] | select(.amountUsd >= 500)'
`);
}

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length && !args[idx + 1].startsWith('--')) return args[idx + 1];
  return undefined;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(2);
}

function getNumber(flag: string): number | undefined {
  if (!args.includes(flag)) return undefined;
  const raw = getArg(flag);
  const n = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(n) || n < 0) fail(`${flag} needs a non-negative number.`);
  return n;
}

function getDate(flag: string): string | undefined {
  if (!args.includes(flag)) return undefined;
  const raw = getArg(flag);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
    fail(`${flag} needs a date like 2026-10-01.`);
  }
  return raw;
}

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const language = getArg('--lang');
  const minAmount = getNumber('--min');
  const maxComments = getNumber('--max-comments');
  const pages = getNumber('--pages');
  const since = getDate('--since');
  const unassigned = args.includes('--unassigned');
  const includeSpam = args.includes('--include-spam');
  const exclude = (getArg('--exclude') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const jsonOutput = args.includes('--json');

  // stderr, so --json output stays machine-readable.
  console.error('🔍 Scanning GitHub for bounties...\n');

  try {
    const bounties = await searchAll({
      language, minAmount, maxComments, pages, since, unassigned, includeSpam, exclude,
      onWarning: (msg) => console.error(`⚠️  ${msg}`),
    });

    if (jsonOutput) {
      console.log(JSON.stringify(bounties, null, 2));
      return;
    }

    if (bounties.length === 0) {
      console.log('No bounties found matching your criteria.');
      return;
    }

    const line = '─'.repeat(100);
    console.log(`Found ${bounties.length} bounties:\n`);
    console.log(line);

    for (const b of bounties) {
      let competition = '🔴 High';
      if (b.comments <= 3) competition = '🟢 Low';
      else if (b.comments <= 10) competition = '🟡 Med';
      const taken = b.assignees.length ? ` │ ⚠️ Assigned: ${b.assignees.join(', ')}` : '';
      console.log(`  💰 ${b.amount.padEnd(14)} │ ${competition.padEnd(10)} │ ${b.repo}`);
      console.log(`     ${b.title.substring(0, 80)}`);
      console.log(`     ${b.url}`);
      console.log(`     Platform: ${b.platform} │ Comments: ${b.comments} │ Created: ${b.createdAt}${taken}`);
      console.log(line);
    }

    console.log(`\n📊 Summary: ${bounties.length} bounties found`);
    const lowComp = bounties.filter((b) => b.comments <= 3).length;
    console.log(`   🟢 Low competition (≤3 comments): ${lowComp}`);
  } catch (error: any) {
    if (error instanceof GitHubApiError && error.rateLimited) {
      console.error(`⚠️  ${error.message}`);
    } else {
      console.error('Error:', error?.message || error);
    }
    process.exitCode = 1;
  }
}

main();
