#!/usr/bin/env node

// Simple script to run the event datetime crawler
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Event Time Fixer');
console.log('This will crawl event source URLs to get correct date/time information');
console.log('-------------------------------------------------------------------');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = !args.includes('--apply');
const eventId = args.includes('--event-id') ? args[args.indexOf('--event-id') + 1] : null;
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;

console.log(`Mode: ${isDryRun ? 'DRY RUN (use --apply to make changes)' : 'LIVE UPDATE'}`);
if (eventId) console.log(`Target Event ID: ${eventId}`);
if (limit) console.log(`Limit: ${limit} events`);
console.log('');

// Prepare arguments for the TypeScript script
const tsArgs = [];
if (!isDryRun) tsArgs.push('--apply');
if (eventId) {
  tsArgs.push('--event-id', eventId);
}
if (limit) {
  tsArgs.push('--limit', limit.toString());
}

// Run the TypeScript crawler
const crawler = spawn('npx', ['tsx', 'scripts/event-datetime-crawler.ts', ...tsArgs], {
  stdio: 'inherit',
  cwd: process.cwd()
});

crawler.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ Event time fixing complete!');
    if (isDryRun) {
      console.log('\n💡 To apply changes, run: npm run fix-event-times -- --apply');
    }
  } else {
    console.error(`\n❌ Process exited with code ${code}`);
  }
});

crawler.on('error', (err) => {
  console.error('❌ Failed to start crawler:', err.message);
  console.log('\n💡 Make sure you have tsx installed: npm install -g tsx');
});