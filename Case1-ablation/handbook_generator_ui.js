/**
 * Chat-first interface for the handbook pipeline.
 *
 * The established data-source form remains mounted in a hidden compatibility
 * host so the existing API, draft state, refinement, and save behavior stay
 * intact. This module owns only the new Handbook Generator presentation.
 *
 * The conversation is persisted to localStorage as a list of plain records
 * (bubbles, pipeline runs, result cards) and rebuilt on reopen. Credentials
 * entered for verification are sent once to the verify endpoint and are never
 * recorded, persisted, or rendered into messages.
 */
(function () {
    'use strict';

    const STAGES = {
        source: ['Source discovery', 'Find the official provider and documentation'],
        docs: ['Documentation analysis', 'Confirm endpoints, parameters, formats, and credentials'],
        draft: ['Handbook drafting', 'Write retrieval guidance and reusable Python code'],
        verify: ['Sample verification', 'Run a deliberately small download and inspect the result'],
        review: ['Ready for review', 'Prepare the generated handbook for saving'],
    };

    const STORE_KEY = 'agsiHandbookChat.v1';

    // Master switch lives in features.js. Off => the workspace can never be
    // shown, whichever entry point asks for it.
    const enabled = () => window.APP_FEATURES?.handbookGenerator !== false;

    const state = {
        returnParent: null,
        returnBefore: null,
        open: false,
        running: false,
        runElement: null,
        cards: new Map(),
        runRecord: null,        // transcript record backing the live run
        lastSource: null,
        lastVerification: null,
        lastRunMessage: '',     // for "Retry this request"
        transcript: [],         // persisted conversation records
        restoring: false,       // suppress recording while rebuilding the DOM
        restored: false,        // transcript restored once per page load
    };

    const byId = (id) => document.getElementById(id);
    const legacyForm = () => byId('ds-form-card');
    const thread = () => byId('handbook-chat-thread');
    const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');

    function scrollToLatest() {
        const scroller = byId('handbook-chat-scroll');
        if (scroller) requestAnimationFrame(() => {
            scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
        });
    }

    // ── Transcript persistence ───────────────────────────────────────────────

    function persist() {
        if (state.restoring) return;
        try {
            const items = state.transcript.slice(-80);
            localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, items }));
        } catch (_) {
            // Storage full: keep only the recent tail, else give up silently.
            try {
                localStorage.setItem(STORE_KEY,
                    JSON.stringify({ v: 1, items: state.transcript.slice(-15) }));
            } catch (_) { /* persistence is best-effort */ }
        }
    }

    function record(item) {
        if (!state.restoring) {
            state.transcript.push(item);
            persist();
        }
        return item;
    }

    function clearStored() {
        state.transcript = [];
        try { localStorage.removeItem(STORE_KEY); } catch (_) { /* ignore */ }
    }

    // ── Compatibility form bridge ────────────────────────────────────────────

    function mountCompatibilityForm() {
        const card = legacyForm();
        const host = byId('handbook-form-host');
        if (!card || !host) return false;
        if (!state.returnParent) {
            state.returnParent = card.parentNode;
            state.returnBefore = card.nextSibling;
        }
        host.appendChild(card);
        if (typeof window._dsWireFormInputs === 'function') window._dsWireFormInputs();
        return true;
    }

    function restoreCompatibilityForm() {
        const card = legacyForm();
        if (!card || !state.returnParent) return;
        if (state.returnBefore && state.returnBefore.parentNode === state.returnParent) {
            state.returnParent.insertBefore(card, state.returnBefore);
        } else {
            state.returnParent.appendChild(card);
        }
    }

    // ── Conversation rendering ───────────────────────────────────────────────

    function addBubble(role, text) {
        const container = thread();
        if (!container) return null;
        const row = document.createElement('div');
        row.className = `handbook-chat-row ${role}`;
        const bubble = document.createElement('div');
        bubble.className = 'handbook-chat-bubble';
        bubble.textContent = text;
        row.appendChild(bubble);
        container.appendChild(row);
        record({ kind: 'bubble', role, text });
        scrollToLatest();
        return bubble;
    }

    function createPipelineRun(opts) {
        const container = thread();
        if (!container) return null;
        const heading = opts.verifyOnly ? 'Verifying your handbook'
            : opts.refining ? 'Updating your handbook' : 'Building your handbook';
        const run = document.createElement('section');
        run.className = 'handbook-chat-run';
        run.innerHTML = `
            <div class="handbook-run-heading">
                <span class="handbook-run-avatar" aria-hidden="true">H</span>
                <div>
                    <strong></strong>
                    <small>Live pipeline activity</small>
                </div>
            </div>
            <div class="handbook-run-cards"></div>
        `;
        run.querySelector('strong').textContent = heading;
        container.appendChild(run);
        state.runElement = run;
        state.cards = new Map();
        state.runRecord = state.restoring ? null : record({
            kind: 'run',
            refining: !!opts.refining,
            verifyOnly: !!opts.verifyOnly,
            done: null,
            stages: [],
        });
        scrollToLatest();
        return run;
    }

    function ensureStageCard(stage) {
        if (state.cards.has(stage)) return state.cards.get(stage);
        const details = STAGES[stage];
        const cards = state.runElement?.querySelector('.handbook-run-cards');
        if (!details || !cards) return null;
        const card = document.createElement('article');
        card.className = 'handbook-stream-card waiting';
        card.dataset.stage = stage;
        card.innerHTML = `
            <div class="handbook-stream-state" aria-hidden="true"></div>
            <div class="handbook-stream-copy">
                <h4></h4>
                <p></p>
            </div>
        `;
        card.querySelector('h4').textContent = details[0];
        card.querySelector('p').textContent = details[1];
        cards.appendChild(card);
        state.cards.set(stage, card);
        return card;
    }

    function updateStage(stage, status, message) {
        const card = ensureStageCard(stage);
        if (!card) return;
        card.classList.remove('waiting', 'running', 'complete', 'warning', 'error');
        card.classList.add(status === 'start' ? 'running' : status);
        const copy = card.querySelector('p');
        if (copy && message) copy.textContent = message;
        if (state.runRecord) {
            const hit = state.runRecord.stages.find((s) => s.stage === stage);
            if (hit) {
                hit.status = status;
                if (message) hit.message = message;
            } else {
                state.runRecord.stages.push({ stage, status, message: message || '' });
            }
            persist();
        }
        scrollToLatest();
    }

    // ── Pipeline lifecycle (called from script.js) ───────────────────────────

    function startPipeline(refining, message) {
        if (!state.open) return;
        state.running = true;
        state.lastRunMessage = message || '';
        byId('handbook-chat-welcome')?.remove();
        addBubble('user', message || 'Generate a handbook for this data source.');
        createPipelineRun({ refining });
        if (refining) {
            updateStage('draft', 'start', 'Applying your feedback while preserving the parts that already work.');
        } else {
            updateStage('source', 'start', 'Your request reached the generator. Starting official-source research.');
        }
        setComposerBusy(true);
    }

    function onProgress(event) {
        if (!state.open || !event?.stage) return;
        updateStage(event.stage, event.status || 'start', event.message);
    }

    function finishPipeline(message, details) {
        if (!state.open) return;
        state.running = false;
        state.cards.forEach((card) => {
            if (card.classList.contains('running')) {
                card.classList.remove('running');
                card.classList.add('complete');
            }
        });
        const verifyOnly = !!(details && details.verifyOnly);
        if (!verifyOnly && !state.cards.has('review')) {
            updateStage('review', 'complete', 'Your handbook is ready to save and use.');
        }
        if (state.runElement) state.runElement.classList.add('finished');
        if (state.runRecord) {
            // Mirror the card flip above so restored runs don't show spinners.
            state.runRecord.stages.forEach((s) => {
                if (s.status === 'start') s.status = 'complete';
            });
            state.runRecord.done = 'ok';
            state.runRecord = null;
        }

        const source = (details && details.source) || collectCurrentSource();
        const verification = (details && details.verification) || null;
        state.lastSource = source;
        state.lastVerification = verification;
        const rec = record({
            kind: 'result',
            source,
            verification,
            message: message || '',
            saved: false,
        });
        renderResultCard(rec);
        if (needsCredential(source, verification)) renderCredentialPrompt(rec);
        setComposerBusy(false);
        persist();
    }

    function failPipeline(message) {
        if (!state.open) return;
        state.running = false;
        const wasVerify = !!(state.runRecord && state.runRecord.verifyOnly);
        const active = [...state.cards.values()].find((card) => card.classList.contains('running'));
        if (active) {
            updateStage(active.dataset.stage, 'error',
                message || 'This stage could not be completed.');
        }
        if (state.runRecord) {
            state.runRecord.done = 'error';
            state.runRecord = null;
        }
        addBubble('assistant error', `I couldn’t finish this run: ${message || 'Unknown error'}`);
        if (wasVerify) {
            // Let the user re-enter the credential and try the test again.
            const rec = lastResultRecord();
            if (rec && needsCredential(rec.source, rec.verification)) renderCredentialPrompt(rec);
        } else if (state.lastRunMessage) {
            renderRetry(record({ kind: 'retry', message: state.lastRunMessage }));
        }
        setComposerBusy(false);
        persist();
    }

    function renderRetry(rec) {
        const container = thread();
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'handbook-chat-row assistant';
        const actions = document.createElement('div');
        actions.className = 'handbook-result-actions handbook-retry-row';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Retry this request';
        btn.addEventListener('click', () => {
            if (state.running) return;
            const legacyInput = byId('ds-ai-input');
            if (!legacyInput || typeof window.dsAiSend !== 'function') return;
            btn.disabled = true;
            legacyInput.value = rec.message;
            window.dsAiSend();
        });
        actions.appendChild(btn);
        row.appendChild(actions);
        container.appendChild(row);
        scrollToLatest();
    }

    // ── Result card ──────────────────────────────────────────────────────────

    function collectCurrentSource() {
        return (typeof window._dsCollectFormSource === 'function')
            ? window._dsCollectFormSource() : null;
    }

    function lastResultRecord() {
        for (let i = state.transcript.length - 1; i >= 0; i--) {
            if (state.transcript[i].kind === 'result') return state.transcript[i];
        }
        return null;
    }

    const needsCredential = (source, verification) =>
        !!source && String(source.requires_key || '') === 'true' &&
        !!verification && verification.status === 'passed_smoke';

    function verificationSummary(v) {
        if (!v || !v.status) return null;
        const map = {
            passed: ['ok', 'Sample download ran successfully'],
            passed_smoke: ['info', 'Drafted from live docs; a full test needs your API credential'],
            failed: ['warn', 'Sample download did not complete — review before use'],
            skipped: ['info', 'Not tested yet'],
        };
        const [tone, label] = map[v.status] || ['info', v.note || v.status];
        return { tone, label };
    }

    function factRow(term, node) {
        const wrap = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = term;
        const dd = document.createElement('dd');
        dd.appendChild(node);
        wrap.append(dt, dd);
        return wrap;
    }

    function linkNode(url, label) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = label || url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
        return a;
    }

    function textNode(text, className) {
        const span = document.createElement('span');
        if (className) span.className = className;
        span.textContent = text;
        return span;
    }

    // Renders one result card from a transcript record. Used both live and
    // during restore; never records by itself.
    function renderResultCard(rec) {
        const container = thread();
        if (!container || !rec) return;
        const source = rec.source || {};
        const name = (source.data_source_name || 'New handbook').trim();

        const row = document.createElement('div');
        row.className = 'handbook-chat-row assistant';
        const result = document.createElement('div');
        result.className = 'handbook-result-card';

        const badge = document.createElement('span');
        badge.className = 'handbook-result-badge';
        badge.textContent = 'HANDBOOK READY';
        const title = document.createElement('h3');
        title.textContent = name;
        const copy = document.createElement('p');
        copy.textContent = (source.brief_description || '').trim() || rec.message
            || 'The handbook and sample retrieval code were generated successfully.';
        result.append(badge, title, copy);

        // Source transparency: provider site, credentials, verification outcome.
        const facts = document.createElement('dl');
        facts.className = 'handbook-result-facts';
        const site = safeUrl(source.website);
        if (site) facts.appendChild(factRow('Website', linkNode(site)));
        const requiresKey = String(source.requires_key || '') === 'true';
        facts.appendChild(factRow('Access', textNode(requiresKey
            ? `API key required${source.key_name ? ` (${source.key_name})` : ''}`
            : 'No API key required')));
        const signup = safeUrl(source.key_signup_url);
        if (requiresKey && signup) {
            facts.appendChild(factRow('Credentials', linkNode(signup, 'Sign up for access ↗')));
        }
        const verdict = verificationSummary(rec.verification);
        if (verdict) {
            facts.appendChild(factRow('Verification',
                textNode(verdict.label, `handbook-fact-${verdict.tone}`)));
        }
        if (facts.childElementCount) result.appendChild(facts);

        // Expandable read-only preview of the full instructions and code.
        const previewBtn = document.createElement('button');
        previewBtn.type = 'button';
        previewBtn.className = 'handbook-preview-toggle';
        previewBtn.textContent = 'View instructions & code';
        const preview = document.createElement('div');
        preview.className = 'handbook-result-preview';
        preview.hidden = true;
        const previewSection = (label, text, isCode) => {
            const h = document.createElement('h5');
            h.textContent = label;
            const pre = document.createElement('pre');
            if (isCode) pre.className = 'code';
            pre.textContent = text;
            preview.append(h, pre);
        };
        if ((source.handbook || '').trim()) {
            previewSection('Retrieval instructions', source.handbook.trim(), false);
        }
        if ((source.code_example || '').trim()) {
            previewSection('Python example', source.code_example.trim(), true);
        }
        if ((source.caveats || '').trim()) {
            previewSection('Caveats', source.caveats.trim(), false);
        }
        previewBtn.addEventListener('click', () => {
            preview.hidden = !preview.hidden;
            previewBtn.textContent = preview.hidden
                ? 'View instructions & code' : 'Hide instructions & code';
            if (!preview.hidden) scrollToLatest();
        });
        if (preview.childElementCount) result.append(previewBtn, preview);

        const actions = document.createElement('div');
        actions.className = 'handbook-result-actions';
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'primary';
        const useBtn = document.createElement('button');
        useBtn.type = 'button';
        useBtn.className = 'primary';
        useBtn.textContent = 'Use this handbook';
        useBtn.addEventListener('click', () => useSaved(name));
        if (rec.saved) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saved to My Handbooks';
        } else {
            saveBtn.textContent = 'Save to My Handbooks';
            useBtn.hidden = true;
        }
        saveBtn.addEventListener('click', () => saveResult(rec, saveBtn, useBtn));
        const downloadBtn = document.createElement('button');
        downloadBtn.type = 'button';
        downloadBtn.textContent = 'Download TOML';
        downloadBtn.addEventListener('click', () => downloadSource(rec.source));
        actions.append(saveBtn, useBtn, downloadBtn);
        result.appendChild(actions);

        row.appendChild(result);
        container.appendChild(row);
        scrollToLatest();
    }

    // ── Saving, downloading, and "Use this handbook" ─────────────────────────

    async function saveResult(rec, saveBtn, useBtn) {
        if (typeof window.submitDataSource !== 'function') return;
        const name = (rec.source?.data_source_name || 'this handbook').trim();
        // The hidden form is the save path's source of truth; make sure it holds
        // THIS card's draft (older cards, or a refreshed page, may differ).
        if (rec.source && typeof window._dsPrefill === 'function') window._dsPrefill(rec.source);
        const shareToggle = byId('ds-share-toggle');
        if (shareToggle) shareToggle.checked = false;   // chat saves stay private
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving…';
        }
        const saved = await window.submitDataSource();
        if (saved) {
            rec.saved = true;
            persist();
            if (saveBtn) saveBtn.textContent = 'Saved to My Handbooks';
            if (useBtn) useBtn.hidden = false;
            addBubble('assistant',
                `Saved “${name}” to My Handbooks — kept private to you. You can now use it in retrieval requests, or keep refining it here.`);
        } else {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Try saving again';
            }
            const detail = (window._dsLastSaveError || '').trim() || 'an unknown error occurred';
            addBubble('assistant error',
                `I couldn’t save “${name}”: ${detail}`);
        }
    }

    function useSaved(name) {
        close();
        const input = byId('chat-input');
        if (!input) return;
        input.value = `Using the "${name}" data source, download `;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }

    function downloadSource(source) {
        source = source || state.lastSource || collectCurrentSource();
        if (!source) return;
        const quote = (value) => `"""${String(value || '').replaceAll('"""', '\\"\\"\\"')}"""`;
        const lines = [
            `data_source_name = ${quote(source.data_source_name)}`,
            `brief_description = ${quote(source.brief_description)}`,
            `handbook = ${quote(source.handbook)}`,
            `code_example = ${quote(source.code_example)}`,
            `website = ${quote(source.website)}`,
            `requires_key = ${quote(String(source.requires_key) === 'true' ? 'true' : '')}`,
            `key_name = ${quote(source.key_name)}`,
        ];
        if ((source.caveats || '').trim()) lines.push(`caveats = ${quote(source.caveats)}`);
        if ((source.key_signup_url || '').trim()) lines.push(`key_signup_url = ${quote(source.key_signup_url)}`);
        const blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${(source.data_source_name || 'handbook').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.toml`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    // ── In-chat credential prompt + verification run ─────────────────────────

    // Not recorded in the transcript: the prompt is re-derived from the latest
    // unsaved, unverified result on restore, and secrets never touch storage.
    function renderCredentialPrompt(rec) {
        const container = thread();
        if (!container || !rec?.source) return;
        const source = rec.source;
        const names = String(source.key_name || '').split(',')
            .map((s) => s.trim()).filter(Boolean);
        if (!names.length) names.push('API_KEY');

        const row = document.createElement('div');
        row.className = 'handbook-chat-row assistant';
        const card = document.createElement('div');
        card.className = 'handbook-credential-card';

        const title = document.createElement('h4');
        title.textContent = 'Run a real test with your credentials?';
        const copy = document.createElement('p');
        copy.textContent =
            `This source needs ${names.join(', ')} for a full sample download. ` +
            'Enter it to verify the handbook now — it is used once for this test and never stored or shown in the chat. Or verify later, after saving.';
        card.append(title, copy);

        const signup = safeUrl(source.key_signup_url);
        if (signup) {
            const p = document.createElement('p');
            p.appendChild(linkNode(signup, 'Get credentials here ↗'));
            card.appendChild(p);
        }

        const inputs = [];
        names.forEach((keyName) => {
            const label = document.createElement('label');
            label.textContent = keyName;
            const input = document.createElement('input');
            input.type = 'password';
            input.autocomplete = 'new-password';
            input.spellcheck = false;
            input.placeholder = 'Paste the value';
            inputs.push([keyName, input]);
            label.appendChild(input);
            card.appendChild(label);
        });

        const actions = document.createElement('div');
        actions.className = 'handbook-result-actions';
        const runBtn = document.createElement('button');
        runBtn.type = 'button';
        runBtn.className = 'primary';
        runBtn.textContent = 'Run verification';
        const laterBtn = document.createElement('button');
        laterBtn.type = 'button';
        laterBtn.textContent = 'Verify later';

        runBtn.addEventListener('click', () => {
            if (state.running) return;
            const keys = {};
            let firstEmpty = null;
            inputs.forEach(([keyName, input]) => {
                const value = input.value.trim();
                if (value) keys[keyName] = value;
                else if (!firstEmpty) firstEmpty = input;
            });
            if (firstEmpty) {
                firstEmpty.focus();
                return;
            }
            inputs.forEach(([, input]) => { input.value = ''; });   // clear secrets from the DOM
            row.remove();
            verifyWithKeys(rec, keys);
        });
        laterBtn.addEventListener('click', () => {
            row.remove();
            addBubble('assistant',
                'No problem — you can save the handbook now and test it once you have the credential. If the code fails later, paste the error here and I’ll fix the handbook.');
        });
        actions.append(runBtn, laterBtn);
        card.appendChild(actions);
        row.appendChild(card);
        container.appendChild(row);
        scrollToLatest();
    }

    async function verifyWithKeys(rec, keys) {
        if (state.running) return;
        state.running = true;
        setComposerBusy(true);
        createPipelineRun({ verifyOnly: true });
        updateStage('verify', 'start', 'Starting a real sample download with your credentials.');
        try {
            const resp = await fetch(`${API_BASE_URL}/api/data-sources/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: rec.source, keys }),
            });
            const ctype = resp.headers.get('Content-Type') || '';
            let data;
            if (resp.ok && ctype.includes('text/event-stream') && resp.body &&
                typeof window._dsAiConsumeStream === 'function') {
                data = await window._dsAiConsumeStream(resp);
            } else {
                data = await resp.json().catch(() => ({}));
            }
            if (!resp.ok || !data.success) {
                throw new Error(data.error || `Verification failed (HTTP ${resp.status})`);
            }
            // Keep the hidden draft in sync — the verifier may have revised the code.
            if (data.source && typeof window._dsPrefill === 'function') window._dsPrefill(data.source);
            const status = data.verification?.status;
            const summary = status === 'passed'
                ? 'Verified! The sample download ran successfully with your credentials.'
                : status === 'passed_smoke'
                    ? 'The full test still couldn’t run — a required credential was missing or empty.'
                    : 'The sample download didn’t complete. You can describe the problem below and I’ll refine the handbook.';
            finishPipeline(summary, {
                source: data.source || rec.source,
                verification: data.verification || null,
                verifyOnly: true,
            });
        } catch (e) {
            failPipeline(e.message);
        }
    }

    // ── Composer ─────────────────────────────────────────────────────────────

    function setComposerBusy(busy) {
        const input = byId('handbook-chat-input');
        const send = byId('handbook-chat-send');
        if (input) input.disabled = busy;
        if (send) send.disabled = busy;
    }

    async function sendMessage(event) {
        event?.preventDefault();
        if (state.running) return;
        const input = byId('handbook-chat-input');
        const message = (input?.value || '').trim();
        if (!message) {
            input?.focus();
            return;
        }
        const legacyInput = byId('ds-ai-input');
        if (!legacyInput || typeof window.dsAiSend !== 'function') return;
        legacyInput.value = message;
        input.value = '';
        resizeComposer();
        await window.dsAiSend();
    }

    function useExample(text) {
        const input = byId('handbook-chat-input');
        if (!input) return;
        input.value = String(text || '').trim();
        resizeComposer();
        input.focus();
    }

    function resizeComposer() {
        const input = byId('handbook-chat-input');
        if (!input) return;
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
    }

    // ── Restore after refresh ────────────────────────────────────────────────

    function restoreTranscript() {
        let items = [];
        try {
            const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            if (parsed && parsed.v === 1 && Array.isArray(parsed.items)) items = parsed.items;
        } catch (_) { /* corrupt store: start fresh */ }
        if (!items.length) return;

        state.transcript = items;
        state.restoring = true;
        byId('handbook-chat-welcome')?.remove();
        items.forEach((item) => {
            if (item.kind === 'bubble') {
                addBubble(item.role || 'assistant', item.text || '');
            } else if (item.kind === 'run') {
                createPipelineRun(item);
                (item.stages || []).forEach((s) => updateStage(s.stage, s.status, s.message));
                if (item.done === 'ok') {
                    state.runElement?.classList.add('finished');
                } else if (!item.done) {
                    // The page was refreshed mid-run; the request cannot resume.
                    state.cards.forEach((card) => {
                        if (card.classList.contains('running')) {
                            card.classList.remove('running');
                            card.classList.add('warning');
                            const copy = card.querySelector('p');
                            if (copy) copy.textContent = 'This step was interrupted before it finished.';
                        }
                    });
                    item.done = 'error';
                }
            } else if (item.kind === 'result') {
                renderResultCard(item);
            } else if (item.kind === 'retry') {
                renderRetry(item);
            }
        });
        state.runElement = null;
        state.cards = new Map();
        state.runRecord = null;
        state.restoring = false;

        const rec = lastResultRecord();
        if (rec) {
            state.lastSource = rec.source;
            state.lastVerification = rec.verification;
            // Repopulate the hidden draft so saving and refinement keep working.
            if (rec.source && !rec.saved && typeof window._dsPrefill === 'function') {
                window._dsPrefill(rec.source);
            }
            if (!rec.saved && needsCredential(rec.source, rec.verification)) {
                renderCredentialPrompt(rec);
            }
        }
        persist();
    }

    // ── Workspace lifecycle ──────────────────────────────────────────────────

    function open() {
        if (!enabled()) return;
        const workspace = byId('handbook-workspace');
        if (!workspace || !mountCompatibilityForm()) return;
        state.open = true;
        workspace.hidden = false;
        document.body.classList.add('handbook-workspace-open');
        byId('handbook-nav-btn')?.classList.add('active');
        if (!state.restored) {
            state.restored = true;
            restoreTranscript();
        }
        window.setTimeout(() => byId('handbook-chat-input')?.focus(), 60);
    }

    function close() {
        const workspace = byId('handbook-workspace');
        if (!workspace) return;
        if (state.running) {
            // Rendering is gated on state.open, so a run that lands after closing
            // is dropped entirely: no result card and no transcript record. Make
            // that cost explicit instead of losing a finished handbook silently.
            const leave = window.confirm(
                'A handbook is still being generated.\n\n'
                + 'Closing now discards this run — the result will not appear in '
                + 'the chat when you come back.\n\nClose anyway?');
            if (!leave) return;
            // Without this the run stays "active" for the life of the page, which
            // wedges the composer and blocks New chat after reopening.
            state.running = false;
            setComposerBusy(false);
            // Settle the in-flight stage first: updateStage writes through to the
            // run record, so restore won't replay a stage still marked 'start'
            // and leave a spinner running forever.
            state.cards.forEach((card) => {
                if (card.classList.contains('running')) {
                    updateStage(card.dataset.stage, 'warning',
                        'You closed the generator before this step finished.');
                }
            });
            if (state.runRecord) {
                state.runRecord.done = 'error';
                state.runRecord = null;
            }
            persist();
        }
        state.open = false;
        workspace.hidden = true;
        document.body.classList.remove('handbook-workspace-open');
        byId('handbook-nav-btn')?.classList.remove('active');
        restoreCompatibilityForm();
    }

    function newDraft() {
        if (state.running) return;
        if (typeof window._dsSetEditMode === 'function') window._dsSetEditMode(null);
        if (typeof window._dsResetForm === 'function') window._dsResetForm();
        const container = thread();
        if (container) {
            container.innerHTML = `
                <section class="handbook-chat-welcome" id="handbook-chat-welcome">
                    <div class="handbook-welcome-mark" aria-hidden="true">H</div>
                    <h3>What data source should I build a handbook for?</h3>
                    <p>Describe the source, dataset, or API you need. Including its official documentation link usually produces the best result.</p>
                    <div class="handbook-prompt-examples">
                        <button type="button" onclick="HandbookGenerator.useExample(this.textContent)">OpenTopography global DEM API</button>
                        <button type="button" onclick="HandbookGenerator.useExample(this.textContent)">USGS stream gauge observations</button>
                        <button type="button" onclick="HandbookGenerator.useExample(this.textContent)">WorldPop population raster downloads</button>
                    </div>
                </section>`;
        }
        clearStored();
        state.cards = new Map();
        state.runElement = null;
        state.runRecord = null;
        state.lastSource = null;
        state.lastVerification = null;
        state.lastRunMessage = '';
        byId('handbook-chat-input')?.focus();
    }

    function showLibrary() {
        close();
        if (typeof window.openDataSourcesPanel === 'function') window.openDataSourcesPanel();
        if (typeof window.switchLeftTab === 'function') window.switchLeftTab('datasources');
    }

    document.addEventListener('input', (event) => {
        if (event.target?.id === 'handbook-chat-input') resizeComposer();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.open) close();
        if (event.target?.id === 'handbook-chat-input' && event.key === 'Enter' &&
            !event.shiftKey) {
            event.preventDefault();
            sendMessage(event);
        }
    });

    if (!enabled()) {
        const navBtn = byId('handbook-nav-btn');
        if (navBtn) navBtn.hidden = true;
    }

    window.HandbookGenerator = {
        open, close, newDraft, showLibrary, sendMessage, useExample,
        startPipeline, onProgress, finishPipeline, failPipeline,
        // Backward-compatible entry points for older inline handlers.
        saveCurrent(button) { saveResult(lastResultRecord() || { source: state.lastSource }, button, null); },
        downloadCurrent() { downloadSource(state.lastSource); },
        syncStage() {}, resetPipeline() {},
    };
})();
