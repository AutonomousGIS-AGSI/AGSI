/**
 * Keeps the address bar in sync with the Handbook Generator / Handbook Studio
 * workspaces so all three are shareable, bookmarkable URLs:
 *   /handbook-generator           -> Handbook Generator
 *   /handbook-studio              -> Handbook Studio (blank/new session)
 *   /handbook-studio/<session-id> -> one specific saved session
 *   /handbook-studio/shared/<id>  -> read-only view of a session its owner made public
 * Watches DOM state (the `hidden` attribute on the two workspace panels, and
 * `data-session-id` on the studio one - set by handbook_studio_mode.js's
 * render()) rather than patching HandbookGenerator/HandbookStudioMode
 * directly, so any entry point that toggles them - buttons, Escape key,
 * loadSession, etc. - stays in sync for free.
 */
(function () {
    'use strict';

    const GENERATOR_PATH = '/handbook-generator';
    const STUDIO_PATH = '/handbook-studio';
    const STUDIO_RE = /^\/handbook-studio(?:\/([^/]+))?\/?$/;
    const SHARED_RE = /^\/handbook-studio\/shared\/([^/]+)\/?$/;

    const byId = (id) => document.getElementById(id);
    const isHidden = (id) => {
        const el = byId(id);
        return !el || el.hidden;
    };
    const currentSessionId = () => byId('handbook-studio-workspace')?.dataset.sessionId || null;
    const isSharedView = () => byId('handbook-studio-workspace')?.dataset.shared === '1';

    function currentTargetPath() {
        if (!isHidden('handbook-studio-workspace')) {
            const id = currentSessionId();
            if (id && isSharedView()) return `${STUDIO_PATH}/shared/${encodeURIComponent(id)}`;
            return id ? `${STUDIO_PATH}/${encodeURIComponent(id)}` : STUDIO_PATH;
        }
        if (!isHidden('handbook-workspace')) return GENERATOR_PATH;
        return null;
    }

    // Set while a multi-step deep-link transition (open, then async
    // loadSession) is in flight, so the MutationObserver-driven sync below
    // doesn't push an intermediate URL (e.g. the blank session open() shows
    // before loadSession's fetch resolves).
    let suspendSync = false;

    let syncScheduled = false;
    function scheduleSync() {
        if (suspendSync || syncScheduled) return;
        syncScheduled = true;
        queueMicrotask(() => {
            syncScheduled = false;
            const target = currentTargetPath();
            const atKnownRoute = location.pathname === GENERATOR_PATH || STUDIO_RE.test(location.pathname) || SHARED_RE.test(location.pathname);
            if (target && location.pathname !== target) {
                history.pushState({ hbView: target }, '', target);
            } else if (!target && atKnownRoute) {
                history.pushState({ hbView: null }, '', '/');
            }
        });
    }

    async function applyRoute(path) {
        const sharedMatch = path.match(SHARED_RE);
        if (sharedMatch && window.HandbookStudioMode) {
            const id = decodeURIComponent(sharedMatch[1]);
            suspendSync = true;
            try {
                if (currentSessionId() !== id || !isSharedView()) {
                    await window.HandbookStudioMode.openShared(id);
                }
            } finally {
                suspendSync = false;
            }
            scheduleSync();
            return;
        }
        const studioMatch = path.match(STUDIO_RE);
        if (studioMatch) {
            const id = studioMatch[1] ? decodeURIComponent(studioMatch[1]) : null;
            suspendSync = true;
            try {
                if (isHidden('handbook-studio-workspace') && window.HandbookStudioMode) {
                    window.HandbookStudioMode.open();
                }
                if (window.HandbookStudioMode && currentSessionId() !== id) {
                    if (id) {
                        await window.HandbookStudioMode.loadSession(id);
                    } else {
                        window.HandbookStudioMode.newSession();
                    }
                }
            } finally {
                suspendSync = false;
            }
            scheduleSync();
            return;
        }
        if (path === GENERATOR_PATH) {
            if (!isHidden('handbook-studio-workspace') && window.HandbookStudioMode) {
                // Closing Studio only re-opens the Generator when Studio was
                // launched from it, so drive the Generator open explicitly.
                window.HandbookStudioMode.close();
                if (isHidden('handbook-workspace') && window.HandbookGenerator) {
                    window.HandbookGenerator.open();
                }
            } else if (isHidden('handbook-workspace') && window.HandbookGenerator) {
                window.HandbookGenerator.open();
            }
        } else {
            if (!isHidden('handbook-studio-workspace') && window.HandbookStudioMode) {
                window.HandbookStudioMode.close();
            } else if (!isHidden('handbook-workspace') && window.HandbookGenerator) {
                window.HandbookGenerator.close();
            }
        }
        scheduleSync();
    }

    window.addEventListener('popstate', () => {
        // If a close/open/load call above was refused (unsaved changes, a run
        // in progress, ...) the workspaces won't have actually changed - put
        // the URL back in sync with whatever is really on screen.
        applyRoute(location.pathname).then(scheduleSync);
    });

    function observeWorkspace(id, extraAttrs = []) {
        const el = byId(id);
        if (!el) return;
        new MutationObserver(scheduleSync).observe(el, { attributes: true, attributeFilter: ['hidden', ...extraAttrs] });
    }

    observeWorkspace('handbook-workspace');
    observeWorkspace('handbook-studio-workspace', ['data-session-id', 'data-shared']);

    const initialPath = location.pathname;
    if (initialPath === GENERATOR_PATH || STUDIO_RE.test(initialPath) || SHARED_RE.test(initialPath)) {
        // Defer a tick so other init scripts (auth/session restore) finish
        // mounting before we drive the open()/loadSession() calls.
        setTimeout(() => applyRoute(initialPath), 0);
    }
})();
