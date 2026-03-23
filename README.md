# Bible Verse Spinner for Claude Code

> Read Scripture while Claude thinks.

Replace Claude Code's thinking spinner with random Bible verses. Instead of seeing generic status text, you'll see something like:

**Before:**
```
Thinking...
```

**After:**
```
Romans 12:2 - Do not be conformed to this world, but be transformed by the renewal of your mind.
```

---

## Setup

Paste this into Claude Code:

```
Clone https://github.com/lukeprofits/claude-bible-verse-spinner, read the CLAUDE.md, and follow its instructions
```

It will ask you to pick a translation and which books to include. Hit enter to accept the defaults (ESV, all books) or customize. One minute setup, and you're done.

To switch translations later, just run it again.

---

## How It Works

Claude Code has a `spinnerVerbs` setting that controls the status text shown while it's thinking. This script:

1. Fetches Bible text from [Bolls Bible API](https://bolls.life/) (one-time, at setup)
2. Formats each verse: `Book Chapter:Verse - Text`
3. Writes them to `~/.claude/settings.json`

The API is only contacted once during setup. After that, everything is stored locally. Your original settings are backed up automatically.

> **Why does it need to download?** Most modern Bible translations (ESV, NIV, NASB, etc.) are copyrighted and can't be bundled in an open-source repo. The script fetches them directly to your machine at setup time so you get the translation you want without any licensing issues.

---

## Supported Translations

| Code | Translation |
|------|-------------|
| **ESV** | English Standard Version (default) |
| **NIV** | New International Version |
| **NET** | New English Translation |
| **NASB** | New American Standard Bible |
| **KJV** | King James Version |
| **NKJV** | New King James Version |

---

## Manual Setup

If you prefer not to use Claude:

```bash
git clone https://github.com/lukeprofits/claude-bible-verse-spinner.git
cd claude-bible-verse-spinner
node setup.mjs
```

Requires Node.js 18+ (you already have this if you have Claude Code).

### CLI Options

```bash
node setup.mjs                                          # Interactive setup
node setup.mjs --version ESV --books all                # All ESV verses
node setup.mjs --version KJV --books "only:Psalms,Proverbs,John"
node setup.mjs --version NIV --books "all-except:Leviticus,Numbers"
node setup.mjs --dry-run                                # Preview without saving
node setup.mjs --help                                   # Full usage info
```

---

## Uninstall

Restore your original settings from the backup:

```bash
cp ~/.claude/settings.json.bak ~/.claude/settings.json
```

Or manually remove the `"spinnerVerbs"` block from `~/.claude/settings.json`.

---

## License

MIT
