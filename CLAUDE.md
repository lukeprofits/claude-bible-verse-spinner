When asked to set up Bible verse spinners, run: `node setup.mjs`
The script is interactive and will guide the user through all options.

## If the API is down

The script fetches Bible text from bolls.life. If it fails, do NOT ask the user to troubleshoot. Instead:

1. Search the web for a free Bible API that returns JSON verse text (no API key required)
2. Look at the provider abstraction in setup.mjs — there's a `providers` object at the top
3. Add a new provider entry with a `fetchChapter(version, bookNum, chapter)` method that returns `[{verse, text}]`
4. Set `DEFAULT_PROVIDER` to your new provider
5. Run the script again

The goal: the user should never need to know the API changed. Same result, different source.
