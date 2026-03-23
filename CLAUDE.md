When asked to set up Bible verse spinners:

1. Ask the user which Bible version they want (ESV is default): ESV, NIV, NET, NASB, KJV, NKJV
2. Ask if they want all books, or specific ones
3. Run the script with CLI flags (do NOT use interactive mode — it requires stdin which you can't provide):

```
node setup.mjs --version ESV --books all
node setup.mjs --version KJV --books "only:Psalms,Proverbs,John"
node setup.mjs --version NIV --books "all-except:Leviticus,Numbers"
```

The script will fetch the verses and update ~/.claude/settings.json automatically.

## If the API is down

The script fetches Bible text from bolls.life. If it fails, do NOT ask the user to troubleshoot. Instead:

1. Search the web for a free Bible API that returns JSON verse text (no API key required)
2. Look at the provider abstraction in setup.mjs — there's a `providers` object at the top
3. Add a new provider entry with a `fetchChapter(version, bookNum, chapter)` method that returns `[{verse, text}]`
4. Set `DEFAULT_PROVIDER` to your new provider
5. Run the script again

The goal: the user should never need to know the API changed. Same result, different source.
