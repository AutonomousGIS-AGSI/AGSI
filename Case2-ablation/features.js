/**
 * Feature flags for the WebUI. Loaded before every other app script so any
 * module can consult `window.APP_FEATURES` at init.
 *
 * Flip a value and reload (JS is served with no-cache headers, so no restart
 * is needed).
 */
window.APP_FEATURES = {
    // Handbook Generator (the chat-first handbook pipeline). When false the
    // header button is hidden, HandbookGenerator.open() is a no-op (so the
    // /handbook-generator deep link and the "back to Generator" paths from
    // Handbook Studio / Experiment 2 land on the main app instead), and its
    // in-workspace Experiment 2 launcher is unreachable. Handbook Studio is
    // unaffected. See TODO.md ("Handbook Generator is hidden behind a flag").
    handbookGenerator: false,
};
