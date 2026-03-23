#!/usr/bin/env node

import { createInterface } from 'readline';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Provider abstraction — swap or add sources here
// ---------------------------------------------------------------------------
const providers = {
  bolls: {
    name: 'Bolls Bible (bolls.life)',
    versions: ['ESV', 'NIV', 'NET', 'NASB', 'KJV', 'NKJV'],
    fetchChapter(version, bookNum, chapter) {
      return fetchJSON(`https://bolls.life/get-text/${version}/${bookNum}/${chapter}/`);
    },
  },
  // Future fallback example:
  // wldeh: {
  //   name: 'wldeh Bible API (jsdelivr CDN)',
  //   versions: ['KJV', 'WEB', 'BSB', 'ASV'],
  //   fetchChapter(version, bookNum, chapter) { ... },
  // },
};

const DEFAULT_PROVIDER = 'bolls';

// ---------------------------------------------------------------------------
// Supported versions (display order, first = default)
// ---------------------------------------------------------------------------
const VERSIONS = [
  { code: 'ESV', name: 'English Standard Version' },
  { code: 'NIV', name: 'New International Version' },
  { code: 'NET', name: 'New English Translation' },
  { code: 'NASB', name: 'New American Standard Bible' },
  { code: 'KJV', name: 'King James Version' },
  { code: 'NKJV', name: 'New King James Version' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${url}`));
        }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Strip HTML tags and clean up text from API responses */
function cleanText(text) {
  return text
    .replace(/<S>\d+<\/S>/g, '')       // Strong's concordance numbers (KJV)
    .replace(/<sup>.*?<\/sup>/g, '')    // Footnotes
    .replace(/<br\s*\/?>/g, ' ')        // Line breaks (NIV section headers)
    .replace(/<\/?[^>]+>/g, '')         // Any remaining HTML tags (<i>, etc.)
    .replace(/\s{2,}/g, ' ')           // Collapse multiple spaces
    .trim();
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatVerse(bookName, chapter, verse, text) {
  return `${bookName} ${chapter}:${verse} - ${text}`;
}

// ---------------------------------------------------------------------------
// Book loading & filtering
// ---------------------------------------------------------------------------

function loadBooks() {
  return JSON.parse(readFileSync(join(__dirname, 'books.json'), 'utf-8'));
}

function filterBooks(allBooks, filter) {
  if (filter === 'all') return allBooks;

  if (filter.startsWith('all-except:')) {
    const exclude = filter
      .slice('all-except:'.length)
      .split(',')
      .map((s) => s.trim().toLowerCase());
    return allBooks.filter((b) => !exclude.includes(b.name.toLowerCase()));
  }

  if (filter.startsWith('only:')) {
    const include = filter
      .slice('only:'.length)
      .split(',')
      .map((s) => s.trim().toLowerCase());
    return allBooks.filter((b) => include.includes(b.name.toLowerCase()));
  }

  throw new Error(
    `Invalid --books value: "${filter}". Use "all", "all-except:Book1,Book2", or "only:Book1,Book2".`
  );
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function drawProgress(current, total, bookName) {
  const width = 30;
  const filled = Math.round((current / total) * width);
  const bar = '='.repeat(filled) + ' '.repeat(width - filled);
  const pct = Math.round((current / total) * 100);
  process.stdout.write(`\r  [${bar}] ${current}/${total} (${pct}%) ${bookName}` + ' '.repeat(20));
}

// ---------------------------------------------------------------------------
// Core: fetch & format
// ---------------------------------------------------------------------------

async function fetchAndFormat({ version, books, provider: providerKey }) {
  const provider = providers[providerKey];
  if (!provider) throw new Error(`Unknown provider: ${providerKey}`);
  if (!provider.versions.includes(version)) {
    throw new Error(`Provider "${provider.name}" does not support version "${version}". Supported: ${provider.versions.join(', ')}`);
  }

  const entries = [];
  let totalChapters = books.reduce((sum, b) => sum + b.chapters, 0);
  let fetched = 0;

  for (const book of books) {
    for (let ch = 1; ch <= book.chapters; ch++) {
      drawProgress(fetched, totalChapters, book.name);

      let verses;
      try {
        verses = await provider.fetchChapter(version, book.number, ch);
      } catch (err) {
        process.stdout.write('\n');
        console.error(`\nError fetching ${book.name} ${ch}: ${err.message}`);
        console.error('The API may be down. See CLAUDE.md for fallback instructions.');
        process.exit(1);
      }

      for (const v of verses) {
        entries.push(formatVerse(book.name, ch, v.verse, cleanText(v.text)));
      }

      fetched++;
      await sleep(50); // Be polite to the API
    }
  }

  drawProgress(totalChapters, totalChapters, 'Done!');
  process.stdout.write('\n');

  return entries;
}

// ---------------------------------------------------------------------------
// Settings.json modification
// ---------------------------------------------------------------------------

function getSettingsPath() {
  return join(os.homedir(), '.claude', 'settings.json');
}

function updateSettings(entries, dryRun) {
  if (dryRun) {
    console.log(`\nDry run — would add ${entries.length} spinner entries.`);
    console.log('\nSample entries:');
    const samples = [];
    for (let i = 0; i < Math.min(5, entries.length); i++) {
      samples.push(entries[Math.floor(Math.random() * entries.length)]);
    }
    samples.forEach((s) => console.log(`  "${s.length > 120 ? s.slice(0, 120) + '...' : s}"`));
    return;
  }

  const settingsPath = getSettingsPath();
  let settings = {};

  if (existsSync(settingsPath)) {
    const raw = readFileSync(settingsPath, 'utf-8');
    try {
      settings = JSON.parse(raw);
    } catch {
      console.error(`\nError: ${settingsPath} contains invalid JSON. Please fix it manually before running this script.`);
      process.exit(1);
    }

    // Backup
    const backupPath = settingsPath + '.bak';
    writeFileSync(backupPath, raw, 'utf-8');
    console.log(`\nBacked up original to ${backupPath}`);
  }

  settings.spinnerVerbs = {
    mode: 'replace',
    verbs: entries,
  };

  const json = JSON.stringify(settings, null, 2) + '\n';

  // Warn if large
  const sizeMB = (Buffer.byteLength(json) / (1024 * 1024)).toFixed(1);
  if (parseFloat(sizeMB) > 2) {
    console.log(`\nWarning: settings.json will be ${sizeMB}MB. Consider using fewer books to reduce size.`);
  }

  // Atomic write
  const tmpPath = settingsPath + '.tmp';
  writeFileSync(tmpPath, json, 'utf-8');
  renameSync(tmpPath, settingsPath);

  console.log(`\nAdded ${entries.length} spinner entries to ${settingsPath}`);

  // Show samples
  const samples = [];
  for (let i = 0; i < Math.min(3, entries.length); i++) {
    samples.push(entries[Math.floor(Math.random() * entries.length)]);
  }
  console.log('\nSample entries:');
  samples.forEach((s) => console.log(`  "${s.length > 120 ? s.slice(0, 120) + '...' : s}"`));
  console.log('\nRestart Claude Code for changes to take effect.');
}

// ---------------------------------------------------------------------------
// Interactive prompts
// ---------------------------------------------------------------------------

function createRL() {
  return createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function promptVersion(rl) {
  console.log('\nWhich Bible version?');
  VERSIONS.forEach((v, i) => {
    const tag = i === 0 ? ' (default)' : '';
    console.log(`  ${i + 1}. ${v.code} - ${v.name}${tag}`);
  });
  const answer = await ask(rl, '> ');
  if (!answer.trim()) return VERSIONS[0].code;
  const idx = parseInt(answer) - 1;
  if (idx >= 0 && idx < VERSIONS.length) return VERSIONS[idx].code;
  // Try matching by code
  const match = VERSIONS.find((v) => v.code.toLowerCase() === answer.trim().toLowerCase());
  if (match) return match.code;
  console.log('Invalid selection, using default (ESV).');
  return VERSIONS[0].code;
}

async function promptBooks(rl, allBooks) {
  console.log('\nWhich books?');
  console.log('  1. All books (default)');
  console.log('  2. All except... (you\'ll list exclusions)');
  console.log('  3. Only these books... (you\'ll list inclusions)');
  const answer = await ask(rl, '> ');

  if (!answer.trim() || answer.trim() === '1') return 'all';

  if (answer.trim() === '2') {
    console.log('\nAvailable books:');
    const names = allBooks.map((b) => b.name);
    // Print in columns
    for (let i = 0; i < names.length; i += 3) {
      const cols = names.slice(i, i + 3).map((n) => n.padEnd(20));
      console.log('  ' + cols.join(''));
    }
    const exclude = await ask(rl, '\nBooks to exclude (comma-separated): ');
    return `all-except:${exclude}`;
  }

  if (answer.trim() === '3') {
    console.log('\nAvailable books:');
    const names = allBooks.map((b) => b.name);
    for (let i = 0; i < names.length; i += 3) {
      const cols = names.slice(i, i + 3).map((n) => n.padEnd(20));
      console.log('  ' + cols.join(''));
    }
    const include = await ask(rl, '\nBooks to include (comma-separated): ');
    return `only:${include}`;
  }

  console.log('Invalid selection, using all books.');
  return 'all';
}

async function interactive() {
  console.log('\n📖 Bible Verse Spinner Setup\n');

  const rl = createRL();
  const allBooks = loadBooks();

  try {
    const version = await promptVersion(rl);
    const booksFilter = await promptBooks(rl, allBooks);
    rl.close();

    const books = filterBooks(allBooks, booksFilter);
    if (books.length === 0) {
      console.error('\nNo books matched your selection. Check spelling and try again.');
      process.exit(1);
    }

    const totalChapters = books.reduce((sum, b) => sum + b.chapters, 0);
    console.log(`\nFetching ${version} Bible text (${books.length} books, ${totalChapters} chapters)...\n`);

    const entries = await fetchAndFormat({
      version,
      books,
      provider: DEFAULT_PROVIDER,
    });

    updateSettings(entries, false);
  } catch (err) {
    rl.close();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    version: 'ESV',
    books: 'all',
    dryRun: false,
    interactive: false,
    provider: DEFAULT_PROVIDER,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--interactive' || arg === '-i') {
      args.interactive = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--version' && argv[i + 1]) {
      args.version = argv[++i].toUpperCase();
    } else if (arg === '--books' && argv[i + 1]) {
      args.books = argv[++i];
    } else if (arg === '--provider' && argv[i + 1]) {
      args.provider = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}. Use --help for usage.`);
      process.exit(1);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
📖 Bible Verse Spinner Setup

Usage:
  node setup.mjs                                    Interactive mode (default)
  node setup.mjs [options]                          CLI mode

Options:
  --version <code>    Bible version: ESV (default), NIV, NET, NASB, KJV, NKJV
  --books <filter>    "all" (default), "all-except:Book1,Book2", "only:Book1,Book2"
  --dry-run           Preview without modifying settings.json
  --interactive, -i   Force interactive mode
  --help, -h          Show this help

Examples:
  node setup.mjs --version ESV --books all
  node setup.mjs --version KJV --books "only:Psalms,Proverbs,John"
  node setup.mjs --version NIV --books "all-except:Leviticus,Numbers"
  node setup.mjs --dry-run --version NET --books "only:Romans"
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const hasArgs = process.argv.length > 2;

  if (!hasArgs) {
    // No arguments = interactive mode
    await interactive();
    return;
  }

  const args = parseArgs(process.argv);

  if (args.interactive) {
    await interactive();
    return;
  }

  // CLI mode
  const allBooks = loadBooks();
  const books = filterBooks(allBooks, args.books);

  if (books.length === 0) {
    console.error('No books matched your selection. Check spelling and try again.');
    process.exit(1);
  }

  const totalChapters = books.reduce((sum, b) => sum + b.chapters, 0);
  console.log(`\nFetching ${args.version} Bible text (${books.length} books, ${totalChapters} chapters)...\n`);

  const entries = await fetchAndFormat({
    version: args.version,
    books,
    provider: args.provider,
  });

  updateSettings(entries, args.dryRun);
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
