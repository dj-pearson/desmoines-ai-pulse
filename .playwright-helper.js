/**
 * Playwright Helper Script
 *
 * This script provides utilities for running tests with Context7 MCP integration
 * and generating detailed test reports.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes for better terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60) + '\n');
}

function runCommand(command, description) {
  log(`\n▶ ${description}...`, 'blue');
  try {
    execSync(command, { stdio: 'inherit' });
    log(`✓ ${description} completed\n`, 'green');
    return true;
  } catch (error) {
    log(`✗ ${description} failed\n`, 'red');
    return false;
  }
}

function checkDevServer() {
  log('Checking if dev server is running...', 'yellow');

  try {
    const http = require('http');
    return new Promise((resolve) => {
      const req = http.get('http://localhost:5173', (res) => {
        if (res.statusCode === 200) {
          log('✓ Dev server is running', 'green');
          resolve(true);
        } else {
          log('✗ Dev server returned status ' + res.statusCode, 'red');
          resolve(false);
        }
      });

      req.on('error', () => {
        log('✗ Dev server is not running. Please run: npm run dev', 'red');
        resolve(false);
      });

      req.setTimeout(2000, () => {
        req.destroy();
        log('✗ Dev server check timed out', 'red');
        resolve(false);
      });
    });
  } catch (error) {
    return false;
  }
}

function generateTestSummary() {
  logSection('📊 Test Summary Generator');

  const resultsPath = path.join(__dirname, 'test-results', 'results.json');

  if (!fs.existsSync(resultsPath)) {
    log('No test results found. Run tests first.', 'yellow');
    return;
  }

  try {
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

    console.log('\n' + '─'.repeat(60));
    log('Test Execution Summary', 'bright');
    console.log('─'.repeat(60));

    const stats = results.stats || results;

    console.log(`Total Tests:    ${stats.expected || 0}`);
    log(`✓ Passed:       ${stats.passed || 0}`, 'green');
    log(`✗ Failed:       ${stats.failed || 0}`, stats.failed > 0 ? 'red' : 'green');
    log(`⏭ Skipped:      ${stats.skipped || 0}`, 'yellow');
    console.log(`Duration:       ${((stats.duration || 0) / 1000).toFixed(2)}s`);

    console.log('─'.repeat(60) + '\n');

    if (stats.failed > 0) {
      log('\n⚠ Some tests failed. Run `npm run test:report` to see details.', 'yellow');
    } else {
      log('\n🎉 All tests passed!', 'green');
    }
  } catch (error) {
    log('Error reading test results: ' + error.message, 'red');
  }
}

function displayTestMenu() {
  logSection('🎭 Playwright Test Suite - Des Moines Insider');

  console.log('Available Test Commands:\n');

  const commands = [
    { cmd: 'npm test', desc: 'Run all tests' },
    { cmd: 'npm run test:ui', desc: 'Run tests in interactive UI mode (recommended)' },
    { cmd: 'npm run test:mobile', desc: 'Test mobile devices only' },
    { cmd: 'npm run test:links', desc: 'Test links and buttons' },
    { cmd: 'npm run test:mobile-responsive', desc: 'Test mobile responsive layout' },
    { cmd: 'npm run test:visual', desc: 'Test visual regression' },
    { cmd: 'npm run test:performance', desc: 'Test performance and Core Web Vitals' },
    { cmd: 'npm run test:forms', desc: 'Test form validation' },
    { cmd: 'npm run test:search', desc: 'Test search and filters (debouncing)' },
    { cmd: 'npm run test:a11y', desc: 'Test accessibility (WCAG 2.1 AA)' },
    { cmd: 'npm run test:report', desc: 'View last test report' },
  ];

  commands.forEach(({ cmd, desc }) => {
    log(`  ${cmd}`, 'cyan');
    console.log(`    ${desc}\n`);
  });

  console.log('\nQuick Tips:');
  console.log('  • Start dev server first: npm run dev');
  console.log('  • Use UI mode for debugging: npm run test:ui');
  console.log('  • Run mobile tests first (most critical)');
  console.log('  • Check TESTING.md for full documentation\n');
}

async function runFullTestSuite() {
  logSection('🚀 Running Full Test Suite');

  // Check dev server
  const serverRunning = await checkDevServer();
  if (!serverRunning) {
    log('\nPlease start the dev server in another terminal:', 'yellow');
    log('  npm run dev\n', 'cyan');
    process.exit(1);
  }

  // Run test suites in order of priority
  const suites = [
    { name: 'Mobile Responsive', cmd: 'npm run test:mobile-responsive' },
    { name: 'Links & Buttons', cmd: 'npm run test:links' },
    { name: 'Accessibility', cmd: 'npm run test:a11y' },
    { name: 'Search & Filters', cmd: 'npm run test:search' },
    { name: 'Forms', cmd: 'npm run test:forms' },
    { name: 'Visual Regression', cmd: 'npm run test:visual' },
    { name: 'Performance', cmd: 'npm run test:performance' },
  ];

  let passed = 0;
  let failed = 0;

  for (const suite of suites) {
    if (runCommand(suite.cmd, `Testing ${suite.name}`)) {
      passed++;
    } else {
      failed++;
    }
  }

  // Generate summary
  logSection('📊 Test Suite Results');
  console.log(`Test Suites Passed: ${passed}/${suites.length}`);
  console.log(`Test Suites Failed: ${failed}/${suites.length}\n`);

  if (failed === 0) {
    log('🎉 All test suites passed! Your site is production-ready.', 'green');
  } else {
    log('⚠ Some test suites failed. Run `npm run test:report` for details.', 'yellow');
  }

  log('\nView detailed report: npm run test:report', 'cyan');
}

// CLI Interface
const command = process.argv[2];

(async () => {
  switch (command) {
    case 'menu':
      displayTestMenu();
      break;

    case 'check-server':
      await checkDevServer();
      break;

    case 'summary':
      generateTestSummary();
      break;

    case 'full':
      await runFullTestSuite();
      break;

    default:
      displayTestMenu();
      log('\nUsage:', 'yellow');
      log('  node .playwright-helper.js [command]', 'cyan');
      log('\nCommands:', 'yellow');
      log('  menu          - Show test menu (default)', 'cyan');
      log('  check-server  - Check if dev server is running', 'cyan');
      log('  summary       - Generate test summary from results', 'cyan');
      log('  full          - Run complete test suite', 'cyan');
      console.log('');
  }
})();

module.exports = {
  checkDevServer,
  generateTestSummary,
  displayTestMenu,
  runFullTestSuite,
};
