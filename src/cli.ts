#!/usr/bin/env node

import { searchAll, Bounty } from './search';

const args = process.argv.slice(2);

function printHelp() {
  console.log(`
bounty-radar — Find paid open-source bounties on GitHub

Usage:
  bounty-radar [options]

Options:
  --lang <language>     Filter by programming language (e.g., typescript, python)
  --min <amount>        Minimum bounty amount in USD (e.g., 50)
  --max-comments <n>    Max comments (lower = less competition)
  --json                Output as JSON
  --help                Show this help

Examples:
  bounty-radar --lang typescript --min 100
  bounty-radar --max-comments 5 --min 50
  bounty-radar --json
`);
}

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const language = getArg('--lang');
  const minAmount = getArg('--min') ? parseInt(getArg('--min')!) : undefined;
  const maxComments = getArg('--max-comments') ? parseInt(getArg('--max-comments')!) : undefined;
  const jsonOutput = args.includes('--json');

  if (!jsonOutput) {
    console.log('🔍 Scanning GitHub for bounties...\n');
  }

  try {
    const bounties = await searchAll({ language, minAmount, maxComments });

    if (jsonOutput) {
      console.log(JSON.stringify(bounties, null, 2));
      return;
    }

    if (bounties.length === 0) {
      console.log('No bounties found matching your criteria.');
      return;
    }

    console.log(`Found ${bounties.length} bounties:\n`);
    console.log('─'.repeat(100));

    for (const b of bounties) {
      const competition = b.comments <= 3 ? '🟢 Low' : b.comments <= 10 ? '🟡 Med' : '🔴 High';
      console.log(`  💰 ${b.amount.padEnd(10)} │ ${competition.padEnd(10)} │ ${b.repo}`);
      console.log(`     ${b.title.substring(0, 80)}`);
      console.log(`     ${b.url}`);
      console.log(`     Platform: ${b.platform} │ Comments: ${b.comments} │ Created: ${b.createdAt}`);
      console.log('─'.repeat(100));
    }

    console.log(`\n📊 Summary: ${bounties.length} bounties found`);
    const lowComp = bounties.filter(b => b.comments <= 3).length;
    console.log(`   🟢 Low competition (≤3 comments): ${lowComp}`);
  } catch (error: any) {
    if (error.message?.includes('rate limit')) {
      console.error('⚠️  GitHub API rate limit reached. Try again in a few minutes.');
    } else {
      console.error('Error:', error.message);
    }
  }
}

main();
