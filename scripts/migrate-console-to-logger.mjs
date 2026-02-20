/**
 * Script to migrate console.* calls to structured logger in src/hooks/ files.
 * This handles all remaining files that haven't been manually migrated yet.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hooksDir = path.resolve(__dirname, '..', 'src', 'hooks');

// Files already migrated manually - skip these
const alreadyMigrated = new Set([
  'use-calendar-export.ts',
  'use-keyboard-shortcuts.ts',
  'use-native-share.tsx',
  'use-user-preferences.ts',
  'useAccountLockout.ts',
  'useActiveAds.ts',
  'useAdminAuth.ts',
  'useAdminCampaigns.ts',
  'useAdminSecurity.ts',
  'useAdTracking.ts',
  'useAdvancedAnalytics.ts',
  'useAdvancedSearch.ts',
  'useAIConfiguration.ts',
  'useAIModels.ts',
  'useAnalytics.ts',
  'useApiKeys.ts',
]);

// Extract hook name from filename
function getHookName(filename) {
  // Remove extension
  const name = filename.replace(/\.(ts|tsx)$/, '');
  return name;
}

// Determine the action context from surrounding code
function inferAction(line, hookName) {
  // Try to find the enclosing function name from common patterns
  return 'operation';
}

function processFile(filePath, filename) {
  let content = fs.readFileSync(filePath, 'utf-8');

  // Check if file has console.* calls (not in comments)
  const consolePattern = /(?<!\/\/.*?)(?<!\/\*.*?)console\.(log|warn|error|debug|info)\s*\(/;
  if (!consolePattern.test(content)) {
    return false; // No console calls, skip
  }

  // Check if already has createLogger import
  if (content.includes("createLogger") && content.includes("@/lib/logger")) {
    // Already migrated (e.g., by manual step)
    return false;
  }

  const hookName = getHookName(filename);

  // Step 1: Add import. Find the last import line and add after it
  const importLines = content.split('\n');
  let lastImportIndex = -1;
  for (let i = 0; i < importLines.length; i++) {
    const line = importLines[i].trim();
    if (line.startsWith('import ') || (line.startsWith('} from ') || (line.includes(' from ') && !line.startsWith('//')))) {
      // Check if this is actually an import statement
      if (/^import\s/.test(line) || /^\}\s*from\s/.test(line)) {
        lastImportIndex = i;
      }
    }
  }

  // Find the actual end of imports (handle multi-line imports)
  for (let i = 0; i < importLines.length; i++) {
    if (/^import\s/.test(importLines[i].trim())) {
      // Find closing of this import
      let j = i;
      while (j < importLines.length && !importLines[j].includes(';') && !importLines[j].includes(' from ')) {
        j++;
      }
      if (j > lastImportIndex) lastImportIndex = j;
    }
  }

  if (lastImportIndex === -1) lastImportIndex = 0;

  // Insert logger import and const after last import
  importLines.splice(lastImportIndex + 1, 0,
    `import { createLogger } from '@/lib/logger';`,
    '',
    `const log = createLogger('${hookName}');`
  );

  content = importLines.join('\n');

  // Step 2: Replace console.* calls
  // Handle console.error('message', error) pattern
  content = content.replace(
    /console\.error\(\s*(['"`])([^'"`]*?)\1\s*,\s*(\w+)\s*\)/g,
    (match, quote, message, varName) => {
      return `log.error('operation', ${quote}${message}${quote}, { error: ${varName} })`;
    }
  );

  // Handle console.error('message:', error) pattern (with colon)
  content = content.replace(
    /console\.error\(\s*(['"`])([^'"`]*?):\s*['"`]\s*,\s*(\w+)\s*\)/g,
    (match, quote, message, varName) => {
      return `log.error('operation', '${message}', { error: ${varName} })`;
    }
  );

  // Handle console.error('message', variable) for remaining cases - more flexible
  content = content.replace(
    /console\.error\(\s*(['"`])(.*?)\1\s*,\s*([\w.]+(?:\?\.[\w]+)*)\s*\)/g,
    (match, quote, message, varName) => {
      return `log.error('operation', ${quote}${message}${quote}, { error: ${varName} })`;
    }
  );

  // Handle console.error('message') - single argument
  content = content.replace(
    /console\.error\(\s*(['"`])(.*?)\1\s*\)/g,
    (match, quote, message) => {
      return `log.error('operation', ${quote}${message}${quote})`;
    }
  );

  // Handle console.warn('message', ...) with variable
  content = content.replace(
    /console\.warn\(\s*(['"`])(.*?)\1\s*,\s*([\w.]+(?:\?\.[\w]+)*)\s*\)/g,
    (match, quote, message, varName) => {
      return `log.warn('operation', ${quote}${message}${quote}, { detail: ${varName} })`;
    }
  );

  // Handle console.warn('message') - single argument
  content = content.replace(
    /console\.warn\(\s*(['"`])(.*?)\1\s*\)/g,
    (match, quote, message) => {
      return `log.warn('operation', ${quote}${message}${quote})`;
    }
  );

  // Handle console.log('message', { ... }) with object literal
  content = content.replace(
    /console\.log\(\s*(['"`])(.*?)\1\s*,\s*(\{[^}]*\})\s*\)/g,
    (match, quote, message, obj) => {
      return `log.debug('operation', ${quote}${message}${quote}, ${obj})`;
    }
  );

  // Handle console.log('message', variable)
  content = content.replace(
    /console\.log\(\s*(['"`])(.*?)\1\s*,\s*([\w.]+(?:\?\.[\w]+)*)\s*\)/g,
    (match, quote, message, varName) => {
      return `log.debug('operation', ${quote}${message}${quote}, { detail: ${varName} })`;
    }
  );

  // Handle console.log('message') - single argument
  content = content.replace(
    /console\.log\(\s*(['"`])(.*?)\1\s*\)/g,
    (match, quote, message) => {
      return `log.debug('operation', ${quote}${message}${quote})`;
    }
  );

  // Handle console.debug('message', variable)
  content = content.replace(
    /console\.debug\(\s*(['"`])(.*?)\1\s*,\s*([\w.]+(?:\?\.[\w]+)*)\s*\)/g,
    (match, quote, message, varName) => {
      return `log.debug('operation', ${quote}${message}${quote}, { detail: ${varName} })`;
    }
  );

  // Handle console.debug('message') - single argument
  content = content.replace(
    /console\.debug\(\s*(['"`])(.*?)\1\s*\)/g,
    (match, quote, message) => {
      return `log.debug('operation', ${quote}${message}${quote})`;
    }
  );

  // Handle console.info('message', variable)
  content = content.replace(
    /console\.info\(\s*(['"`])(.*?)\1\s*,\s*([\w.]+(?:\?\.[\w]+)*)\s*\)/g,
    (match, quote, message, varName) => {
      return `log.info('operation', ${quote}${message}${quote}, { detail: ${varName} })`;
    }
  );

  // Handle console.info('message') - single argument
  content = content.replace(
    /console\.info\(\s*(['"`])(.*?)\1\s*\)/g,
    (match, quote, message) => {
      return `log.info('operation', ${quote}${message}${quote})`;
    }
  );

  // Remove if (import.meta.env.DEV) { ... } wrappers around log calls
  // Pattern: if (import.meta.env.DEV) {\n  log.*\n}
  content = content.replace(
    /if\s*\(\s*import\.meta\.env\.DEV\s*\)\s*\{\s*\n\s*(log\.\w+\([^)]*\));?\s*\n\s*\}/g,
    '$1;'
  );

  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
}

// Process all files
const files = fs.readdirSync(hooksDir);
let processed = 0;
let skipped = 0;

for (const file of files) {
  if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
  if (alreadyMigrated.has(file)) {
    continue;
  }

  const filePath = path.join(hooksDir, file);
  if (processFile(filePath, file)) {
    console.log(`Processed: ${file}`);
    processed++;
  } else {
    skipped++;
  }
}

console.log(`\nDone! Processed ${processed} files, skipped ${skipped} files (no console calls or already migrated).`);
