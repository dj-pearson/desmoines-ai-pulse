#!/usr/bin/env node
/**
 * Export Playwright test results to various formats
 * Usage: node export-test-results.js [format]
 * Formats: markdown (default), csv, json
 */

const fs = require('fs');
const path = require('path');

const format = process.argv[2] || 'markdown';
const resultsPath = path.join(__dirname, 'test-results', 'results.json');

if (!fs.existsSync(resultsPath)) {
  console.error('❌ No test results found. Run tests first: npm test');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

// Collect all test results
const allTests = [];
function collectTests(suites) {
  suites.forEach(suite => {
    if (suite.suites && suite.suites.length > 0) {
      collectTests(suite.suites);
    }
    if (suite.specs) {
      suite.specs.forEach(spec => {
        spec.tests.forEach(test => {
          test.results.forEach(result => {
            allTests.push({
              file: spec.file.replace(/\\/g, '/').split('/').pop(),
              title: spec.title,
              status: result.status || 'unknown',
              duration: result.duration || 0,
              error: result.error?.message || '',
              project: test.projectName || 'unknown'
            });
          });
        });
      });
    }
  });
}
collectTests(data.suites);

// Use stats from Playwright if available
const stats = data.stats ? {
  total: data.stats.expected + data.stats.unexpected + data.stats.skipped,
  passed: data.stats.expected,
  failed: data.stats.unexpected,
  skipped: data.stats.skipped,
  flaky: data.stats.flaky
} : {
  total: allTests.length,
  passed: allTests.filter(t => t.status === 'passed').length,
  failed: allTests.filter(t => t.status === 'failed').length,
  skipped: allTests.filter(t => t.status === 'skipped').length,
  timedOut: allTests.filter(t => t.status === 'timedOut').length
};

const failures = allTests.filter(t => t.status === 'failed' || t.status === 'timedOut' || t.status === 'interrupted');

// Export based on format
if (format === 'markdown') {
  exportMarkdown(stats, failures);
} else if (format === 'csv') {
  exportCSV(failures);
} else if (format === 'json') {
  exportJSON(stats, failures);
} else {
  console.error('Unknown format. Use: markdown, csv, or json');
  process.exit(1);
}

function exportMarkdown(stats, failures) {
  const output = [];
  
  output.push('# Test Results Summary\n');
  output.push(`**Generated:** ${new Date().toLocaleString()}\n`);
  output.push('---\n');
  
  output.push('## 📊 Statistics\n');
  output.push(`- **Total Tests:** ${stats.total}`);
  output.push(`- **✅ Passed:** ${stats.passed} (${((stats.passed/stats.total)*100).toFixed(1)}%)`);
  output.push(`- **❌ Failed:** ${stats.failed} (${((stats.failed/stats.total)*100).toFixed(1)}%)`);
  output.push(`- **⏭️ Skipped:** ${stats.skipped}`);
  output.push(`- **🔀 Flaky:** ${stats.flaky || 0}\n`);
  
  output.push('---\n');
  output.push('## ❌ Failures to Fix\n');
  
  if (failures.length === 0) {
    output.push('🎉 **All tests passed!**\n');
  } else {
    // Group by file
    const byFile = {};
    failures.forEach(f => {
      if (!byFile[f.file]) byFile[f.file] = [];
      byFile[f.file].push(f);
    });
    
    Object.keys(byFile).sort().forEach(file => {
      output.push(`### 📄 ${file}\n`);
      byFile[file].forEach((test, i) => {
        output.push(`#### ${i + 1}. ${test.title}`);
        output.push(`- **Project:** ${test.project}`);
        output.push(`- **Status:** ${test.status}`);
        output.push(`- **Duration:** ${(test.duration / 1000).toFixed(2)}s`);
        if (test.error) {
          output.push(`- **Error:**`);
          output.push('```');
          output.push(test.error.split('\n').slice(0, 10).join('\n'));
          output.push('```');
        }
        output.push('');
      });
      output.push('---\n');
    });
  }
  
  output.push('## 🔧 Quick Fixes\n');
  output.push('### Common Issues Found:\n');
  
  const issues = categorizeIssues(failures);
  Object.keys(issues).forEach(category => {
    output.push(`#### ${category} (${issues[category].length} failures)`);
    output.push('- ' + issues[category].slice(0, 3).map(t => t.title).join('\n- '));
    output.push('');
  });
  
  const outputPath = 'TEST_FAILURES_REPORT.md';
  fs.writeFileSync(outputPath, output.join('\n'));
  console.log(`✅ Markdown report exported to: ${outputPath}`);
}

function exportCSV(failures) {
  const output = [];
  output.push('File,Test Title,Status,Duration (s),Project,Error');
  
  failures.forEach(test => {
    const error = test.error.replace(/"/g, '""').replace(/\n/g, ' ').substring(0, 200);
    output.push(`"${test.file}","${test.title}","${test.status}",${(test.duration/1000).toFixed(2)},"${test.project}","${error}"`);
  });
  
  const outputPath = 'test-failures.csv';
  fs.writeFileSync(outputPath, output.join('\n'));
  console.log(`✅ CSV exported to: ${outputPath}`);
}

function exportJSON(stats, failures) {
  const output = {
    generated: new Date().toISOString(),
    statistics: stats,
    failures: failures
  };
  
  const outputPath = 'test-failures.json';
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`✅ JSON exported to: ${outputPath}`);
}

function categorizeIssues(failures) {
  const categories = {
    'Accessibility': [],
    'Color Contrast': [],
    'Links': [],
    'Mobile Responsive': [],
    'Performance': [],
    'Forms': [],
    'Search': [],
    'Other': []
  };
  
  failures.forEach(test => {
    if (test.file.includes('accessibility') || test.title.toLowerCase().includes('accessibility')) {
      if (test.title.toLowerCase().includes('contrast')) {
        categories['Color Contrast'].push(test);
      } else {
        categories['Accessibility'].push(test);
      }
    } else if (test.file.includes('links')) {
      categories['Links'].push(test);
    } else if (test.file.includes('mobile')) {
      categories['Mobile Responsive'].push(test);
    } else if (test.file.includes('performance')) {
      categories['Performance'].push(test);
    } else if (test.file.includes('forms')) {
      categories['Forms'].push(test);
    } else if (test.file.includes('search')) {
      categories['Search'].push(test);
    } else {
      categories['Other'].push(test);
    }
  });
  
  // Remove empty categories
  Object.keys(categories).forEach(key => {
    if (categories[key].length === 0) delete categories[key];
  });
  
  return categories;
}

