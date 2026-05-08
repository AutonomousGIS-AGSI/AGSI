// ── Feature Flags ────────────────────────────────────────────────
const ENABLE_EDA = false; // Set to true to enable EDA functionality

// When true, ignore the model/reasoning_effort picked in the UI and force
// the values below for every request. The UI dropdowns remain fully functional
// for future use — flip this flag to false to restore UI-driven selection.
const FORCE_MODEL_OVERRIDE = true;
const FORCED_MODEL = 'gpt-5.2';
const FORCED_REASONING_EFFORT = 'low';

function saveApiKey() {
    const key = document.getElementById('GIBD-API-key').value.trim();
    const status = document.getElementById('api-key-status');
    if (!key) {
        status.textContent = 'Key is empty.';
        status.style.color = 'red';
        setTimeout(() => { status.textContent = ''; }, 3000);
        return;
    }
    const prev = localStorage.getItem('agm_openai_api_key');
    const next = key.replace(/\s/g, '');
    localStorage.setItem('agm_openai_api_key', next);
    // Key changed → reset the active chat and reload the sidebar so the
    // user sees conversations that belong to the new key, not the old one.
    if (prev !== next) {
        try { startNewChat(); } catch (e) { /* UI may not be ready yet */ }
        try { loadConversationList(); } catch (e) {}
    }
    status.textContent = 'Key saved!';
    status.style.color = 'green';
    setTimeout(() => { status.textContent = ''; }, 3000);
}

function clearApiKey() {
    const status = document.getElementById('api-key-status');
    document.getElementById('GIBD-API-key').value = '';
    const hadKey = !!localStorage.getItem('agm_openai_api_key');
    localStorage.removeItem('agm_openai_api_key');
    // Tell the backend to clear the key from os.environ
    _originalFetch('/api/clear-key', { method: 'POST' }).catch(() => {});
    // Immediately reset the chat pane and sidebar so stale history from the
    // previous key isn't visible after it's been removed.
    if (hadKey) {
        try { startNewChat(); } catch (e) {}
        try { loadConversationList(); } catch (e) {}
    }
    status.textContent = 'Key cleared!';
    status.style.color = 'orange';
    setTimeout(() => { status.textContent = ''; }, 3000);
}

function toggleApiKeyVisibility(btn) {
    const input = document.getElementById('GIBD-API-key');
    if (input.type === 'text') {
        input.type = 'password';
        btn.textContent = '👁';
    } else {
        input.type = 'text';
        btn.textContent = '👁';
    }
}

// Automatically inject the user's API key into all /api/ requests.
// JSON requests: injected as X-API-Key header.
// FormData requests: appended as an 'api_key' form field — adding custom headers
// to multipart uploads can corrupt the Content-Type boundary and cause
// "Failed to fetch" errors.
const _originalFetch = window.fetch.bind(window);

// ── Shared-conversation (fork-on-write) state ────────────────────────
// When the user opens a conversation they do not own (e.g. via a shared link),
// the UI enters a read-only "shared view". The first mutating request triggers
// an automatic fork: the backend copies the conversation under the caller's
// user_id, we swap currentConversationId to the new id, and the request is
// rewritten to target the fork. The original is never modified.
let viewingSharedConversation = false;
let _forkInFlight = null;

function _showSharedBanner() {
    let bar = document.getElementById('shared-convo-banner');
    if (bar) return;
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages || !chatMessages.parentNode) return;
    bar = document.createElement('div');
    bar.id = 'shared-convo-banner';
    bar.style.cssText = 'padding:8px 14px;background:#fff3cd;color:#664d03;'
        + 'border-bottom:1px solid #ffe69c;font-size:13px;';
    bar.textContent = 'Shared conversation — you and the original owner both see updates here.';
    chatMessages.parentNode.insertBefore(bar, chatMessages);
}2

function _hideSharedBanner() {
    const bar = document.getElementById('shared-convo-banner');
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
}

async function _forkSharedConversation() {
    // Despite the legacy name, this no longer forks. It claims the shared
    // conversation as a collaborator: the same conversation_id is kept, the
    // task workspace is shared, and the conversation simply appears in the
    // current user's sidebar. Returns the (unchanged) conversation_id.
    if (_forkInFlight) return _forkInFlight;
    const sourceId = currentConversationId;
    _forkInFlight = (async () => {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        const raw = localStorage.getItem('agm_openai_api_key');
        const apiKey = raw ? raw.replace(/\s/g, '') : null;
        if (apiKey) headers.set('X-API-Key', apiKey);
        const resp = await _originalFetch(
            `${API_BASE_URL}/api/conversations/${sourceId}/collaborate`,
            { method: 'POST', headers }
        );
        if (!resp.ok) {
            let msg = 'Failed to claim shared conversation';
            try { const j = await resp.json(); if (j && j.error) msg = j.error; } catch (_) {}
            throw new Error(msg);
        }
        // Same id, just no longer in shared/viewing mode.
        viewingSharedConversation = false;
        _hideSharedBanner();
        try { loadConversationList(); } catch (_) {}
        return sourceId;
    })();
    try {
        return await _forkInFlight;
    } finally {
        _forkInFlight = null;
    }
}

window.fetch = async function(url, options = {}) {
    try {
        const raw = localStorage.getItem('agm_openai_api_key');
        const apiKey = raw ? raw.replace(/\s/g, '') : null;
        if (apiKey && typeof url === 'string' && url.includes('/api/')) {
            if (options.body instanceof FormData) {
                // Append as form field — safe, doesn't touch Content-Type
                options.body.append('api_key', apiKey);
            } else {
                options = { ...options };
                const headers = new Headers(options.headers || {});
                headers.set('X-API-Key', apiKey);
                options.headers = headers;
            }
        }
    } catch (e) {
        console.warn('[fetch override] Could not inject API key:', e);
    }

    // Fork-on-write: if we're viewing a shared conversation and this request
    // would mutate it, fork first and rewrite the body's conversation_id.
    try {
        const method = ((options && options.method) || 'GET').toUpperCase();
        const isMutation = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
        const isApi = typeof url === 'string' && url.includes('/api/');
        const isForkCall = isApi && url.indexOf('/fork') !== -1;
        // Collaborator binding now happens server-side on GET conversation —
        // see app.py /api/conversations/<id>. No on-write hook needed.
    } catch (e) {
        return Promise.reject(e);
    }

    return _originalFetch(url, options);
};

// Global State
let workflowState = {
    isRunning: false,
    isPaused: false,
    progress: 0,
    currentPhase: '',
    datasets: []
};

// ── Smart Auto-Scroll ──────────────────────────────────────────────
// Only auto-scroll the chat panel to the bottom when the user is already
// near the bottom.  If the user has manually scrolled up to read earlier
// content, we leave the scroll position alone so streaming doesn't yank
// them back down.  Inner-card / overlay scrolls are unaffected.
let _userScrolledAway = false;

(function initSmartScroll() {
    const attach = () => {
        const chat = document.getElementById('chat-messages');
        if (!chat) return;
        chat.addEventListener('scroll', () => {
            const threshold = 150;
            _userScrolledAway =
                chat.scrollHeight - chat.scrollTop - chat.clientHeight > threshold;
        });
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attach);
    } else {
        attach();
    }
})();

/**
 * Scroll #chat-messages to the bottom, respecting user scroll position.
 * @param {boolean} force – true → always scroll (e.g. user sent a message).
 */
function smartScrollChat(force = false) {
    const chat = document.getElementById('chat-messages');
    if (!chat) return;
    // During a manuscript rerun, the UI is driven section-by-section via
    // _focusRerunSection which centers each target card. Bail out of
    // competing auto-scrolls so the view doesn't flip between the chat
    // bottom and the target card.
    if (window._msRerunActive && !force) return;
    if (force || !_userScrolledAway) {
        chat.scrollTop = chat.scrollHeight;
    }
}

/**
 * Attach a "Copy" button to a Generated Code header element.
 * `getCode` is a lazy accessor so the button always copies the current
 * code (important after edits / debugger repair / re-run).
 */
function attachCopyCodeButton(headerEl, getCode) {
    if (!headerEl) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-copy-code';
    btn.textContent = 'Copy';
    btn.title = 'Copy code to clipboard';
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        let code = '';
        try { code = typeof getCode === 'function' ? (getCode() || '') : ''; } catch (_) { code = ''; }
        if (!code) return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(code);
            } else {
                const ta = document.createElement('textarea');
                ta.value = code;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            const prev = btn.textContent;
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = prev;
                btn.classList.remove('copied');
            }, 1500);
        } catch (err) {
            btn.textContent = 'Failed';
            setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        }
    });
    headerEl.appendChild(btn);
}

// Global Abort Controller — allows any running stream to be interrupted
let activeAbortController = null;

// Conversation persistence state
let currentConversationId = null;

function startInterruptableStream() {
    activeAbortController = new AbortController();
    const sendBtn = document.getElementById('btn-send');
    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.classList.remove('loading');
        sendBtn.classList.add('interrupt');
        sendBtn.title = 'Stop running process';
    }
    return activeAbortController;
}

function stopInterruptableStream() {
    activeAbortController = null;
    const sendBtn = document.getElementById('btn-send');
    if (sendBtn) {
        sendBtn.classList.remove('interrupt');
        sendBtn.title = 'Send message';
    }
}

function interruptRunningStream() {
    if (activeAbortController) {
        activeAbortController.abort();
        hideThinkingIndicator();
        addLog('[System] Process interrupted by user', 'warning');
        addChatMessage('Process interrupted.', 'agm');
        stopInterruptableStream();

        // Finalize all workflow cards (stop spinners, mark interrupted)
        finalizeAllWorkflowCards();

        // Cancel any active feedback mode (code review, research plan, etc.)
        if (feedbackMode.active) {
            cancelFeedbackMode();
        }
        _codeReviewFeedback = null;

        // Tell the backend to cancel running threads
        fetch(`${API_BASE_URL}/api/cancel`, { method: 'POST' }).catch(() => {});

        // Reset UI
        const input = document.getElementById('chat-input');
        const sendBtn = document.getElementById('btn-send');
        if (input) { input.disabled = false; input.focus(); }
        if (sendBtn) { sendBtn.disabled = false; sendBtn.classList.remove('loading'); }

        const statusDot = document.getElementById('llm-status-dot');
        const statusText = document.getElementById('llm-status-text');
        if (statusDot) statusDot.className = 'status-dot ready';
        if (statusText) statusText.textContent = 'Ready';
    }
}

// Feedback Mode State
let feedbackMode = {
    active: false,
    type: null, // 'workflow' or 'code'
    taskId: null,
    iframe: null,
    contextData: {} // Store task, data_overview, etc.
};

// Utility Functions
function getCurrentTimestamp() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour12: false });
}

// Remove task ID from display names
// Removes patterns like: task_<uuid>_, _task_<uuid>, or any UUID-like pattern
function getDisplayName(filename) {
    if (!filename) return filename;

    // Remove task ID prefix pattern: task_<uuid>_<name> -> <name>
    let displayName = filename.replace(/^task_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, '');

    // Remove task ID suffix pattern: <name>_task_<uuid> -> <name>
    displayName = displayName.replace(/_task_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, '');

    // Remove standalone UUID pattern if present: <uuid>_<name> -> <name>
    displayName = displayName.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, '');

    // Remove UUID suffix (works with or without extension): <name>_<uuid>.ext -> <name>.ext
    displayName = displayName.replace(/_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]+)?$/i, '$1');

    return displayName;
}

function addLog(message, type = 'info') {
    const logsContent = document.getElementById('logs-content');
    if (!logsContent) return;
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${getCurrentTimestamp()}] ${message}`;
    logsContent.appendChild(logEntry);
    logsContent.scrollTop = logsContent.scrollHeight;
}

function clearLogs() {
    const logsContent = document.getElementById('logs-content');
    if (!logsContent) return;
    logsContent.innerHTML = '<div class="log-entry info">[System] Logs cleared</div>';
}

function clearResults() {
    const resultsContent = document.getElementById('results-content-main');
    if (resultsContent) {
        resultsContent.innerHTML = '<p class="empty-message">No results yet</p>';
    }
}

function clearLLMResponse() {
    const llmContent = document.getElementById('llm-response-content');
    if (llmContent) {
        llmContent.innerHTML = '<div class="empty-message">Waiting for LLM response...</div>';
    }
    const statusDot = document.getElementById('llm-status-dot');
    const statusText = document.getElementById('llm-status-text');
    if (statusDot) statusDot.className = 'status-dot';
    if (statusText) statusText.textContent = 'Ready';
}

function clearGPTStream() {
    const gptContent = document.getElementById('gpt-stream-content');
    if (gptContent) {
        gptContent.innerHTML = '<div class="empty-message">Waiting for GPT API stream...</div>';
    }
    const statusDot = document.getElementById('gpt-stream-status-dot');
    const statusText = document.getElementById('gpt-stream-status-text');
    if (statusDot) statusDot.className = 'status-dot';
    if (statusText) statusText.textContent = 'Ready';
}

function addLLMResponse(content, isStreaming = false) {
    const llmContent = document.getElementById('llm-response-content');
    if (!llmContent) return;

    // Remove empty message if present
    const emptyMessage = llmContent.querySelector('.empty-message');
    if (emptyMessage) {
        emptyMessage.remove();
    }

    // Create response entry
    const entry = document.createElement('div');
    entry.className = 'llm-response-entry' + (isStreaming ? ' streaming' : '');

    // Add timestamp
    const timestamp = document.createElement('div');
    timestamp.className = 'timestamp';
    const now = new Date();
    timestamp.textContent = now.toLocaleTimeString('en-US', { hour12: false });
    entry.appendChild(timestamp);

    // Add content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    contentDiv.textContent = content;
    entry.appendChild(contentDiv);

    llmContent.appendChild(entry);
    llmContent.scrollTop = llmContent.scrollHeight;

    // Update status
    const statusDot = document.getElementById('llm-status-dot');
    const statusText = document.getElementById('llm-status-text');
    if (statusDot && statusText) {
        if (isStreaming) {
            statusDot.className = 'status-dot running';
            statusText.textContent = 'Streaming...';
        } else {
            statusDot.className = 'status-dot completed';
            statusText.textContent = 'Ready';
        }
    }
}

// Feedback Mode Management
function showFeedbackModeBanner(type, taskId) {
    // Remove any existing banner
    hideFeedbackModeBanner();

    const chatSection = document.querySelector('.chat-section');
    const banner = document.createElement('div');
    banner.id = 'feedback-mode-banner';
    banner.className = 'feedback-mode-banner';

    const icon = type === 'workflow' ? '🔄' : '💻';
    const typeText = type === 'workflow' ? 'Workflow Graph' : 'Generated Code';

    banner.innerHTML = `
        <div class="feedback-banner-content">
            <span class="feedback-banner-icon">${icon}</span>
            <span class="feedback-banner-text">
                <strong>Feedback Mode Active</strong> - Provide feedback for ${typeText} (Task: ${taskId.substring(0, 8)}...)
            </span>
        </div>
        <button class="feedback-banner-close" onclick="cancelFeedbackMode()" title="Cancel feedback mode">
            ✕
        </button>
    `;

    // Insert banner before chat messages
    const chatMessages = document.getElementById('chat-messages');
    chatSection.insertBefore(banner, chatMessages);

    // Update input placeholder
    const chatInput = document.getElementById('chat-input');
    chatInput.placeholder = `Enter your feedback for the ${type}...`;
    chatInput.focus();
}

function hideFeedbackModeBanner() {
    const banner = document.getElementById('feedback-mode-banner');
    if (banner) {
        banner.remove();
    }

    // Reset input placeholder
    const chatInput = document.getElementById('chat-input');
    chatInput.placeholder = 'Enter a request here ....';
}

function activateFeedbackMode(type, taskId, iframe = null, contextData = {}) {
    feedbackMode.active = true;
    feedbackMode.type = type;
    feedbackMode.taskId = taskId;
    feedbackMode.iframe = iframe;
    feedbackMode.contextData = contextData;

    showFeedbackModeBanner(type, taskId);
    addLog(`[System] Feedback mode activated for ${type}: ${taskId}`, 'info');
}

function cancelFeedbackMode() {
    feedbackMode.active = false;
    feedbackMode.type = null;
    feedbackMode.taskId = null;
    feedbackMode.iframe = null;
    feedbackMode.contextData = {};

    hideFeedbackModeBanner();
    addLog('[System] Feedback mode cancelled', 'info');
}

async function handleWorkflowFeedback(feedback) {
    const taskId = feedbackMode.taskId;
    const iframe = feedbackMode.iframe;

    console.log('[handleWorkflowFeedback] Called with feedback:', feedback);
    console.log('[handleWorkflowFeedback] Task ID:', taskId);
    console.log('[handleWorkflowFeedback] Iframe:', iframe);

    addChatMessage(feedback, 'user');
    addLog(`[User] Submitting workflow feedback for task: ${taskId}`, 'info');
    addLog(`[User] Feedback: ${feedback}`, 'info');

    // Create or get streaming display that replaces the iframe during streaming
    let streamingOverlay = document.getElementById(`workflow-stream-${taskId}`);
    if (!streamingOverlay) {
        // Create streaming display container (takes iframe's place)
        streamingOverlay = document.createElement('div');
        streamingOverlay.id = `workflow-stream-${taskId}`;
        streamingOverlay.style.cssText = `
            width: 100%;
            height: 100%;
            background: #f8f9fa;
            border: 2px solid #007bff;
            border-radius: 4px;
            padding: 20px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            white-space: pre-wrap;
            word-wrap: break-word;
            box-sizing: border-box;
        `;

        // Insert in the same container as the iframe
        if (iframe && iframe.parentElement) {
            iframe.parentElement.insertBefore(streamingOverlay, iframe);
        }
    }

    // Hide iframe and show streaming overlay in its place
    if (iframe) {
        iframe.style.display = 'none';
    }
    streamingOverlay.style.display = 'block';
    streamingOverlay.innerHTML = '<div style="color: #007bff; font-weight: bold; margin-bottom: 15px; font-size: 1.1em;">🔄 Refining Workflow Graph</div><div style="color: #666; font-style: italic;">Waiting for LLM response...</div>';

    // Also update sidebar panels for secondary display
    clearLLMResponse();
    clearGPTStream();
    const llmStatusDot = document.getElementById('llm-status-dot');
    const llmStatusText = document.getElementById('llm-status-text');
    const gptStatusDot = document.getElementById('gpt-stream-status-dot');
    const gptStatusText = document.getElementById('gpt-stream-status-text');

    if (llmStatusDot) llmStatusDot.className = 'status-dot running';
    if (llmStatusText) llmStatusText.textContent = 'Streaming...';
    if (gptStatusDot) gptStatusDot.className = 'status-dot running';
    if (gptStatusText) gptStatusText.textContent = 'Refining workflow...';

    // Variables to track streaming content
    let currentStreamContent = '';
    let llmStreamEntry = null;
    let gptStreamEntry = null;

    try {
        // Use streaming endpoint
        const streamUrl = `${API_BASE_URL}/api/workflow/refine-stream/${taskId}`;
        console.log('[handleWorkflowFeedback] Fetching:', streamUrl);

        const response = await fetch(streamUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ feedback: feedback })
        });

        console.log('[handleWorkflowFeedback] Response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
                    try {
                        const update = JSON.parse(jsonStr);

                        if (update.type === 'llm_stream') {
                            // Accumulate stream content
                            currentStreamContent += update.content;

                            // PRIMARY: Update workflow streaming overlay (in the workflow section)
                            if (streamingOverlay) {
                                streamingOverlay.innerHTML = `<div style="color: #28a745; font-weight: bold; margin-bottom: 10px;">🔄 Generating refined workflow...</div>${currentStreamContent}`;
                                streamingOverlay.scrollTop = streamingOverlay.scrollHeight;
                            }

                            // SECONDARY: Update LLM Response panel (sidebar)
                            const llmContent = document.getElementById('llm-response-content');
                            if (llmContent) {
                                if (!llmStreamEntry) {
                                    llmStreamEntry = document.createElement('div');
                                    llmStreamEntry.className = 'llm-response-entry llm-stream-entry streaming';

                                    const timestamp = document.createElement('div');
                                    timestamp.className = 'timestamp';
                                    timestamp.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
                                    llmStreamEntry.appendChild(timestamp);

                                    const contentDiv = document.createElement('div');
                                    contentDiv.className = 'content';
                                    llmStreamEntry.appendChild(contentDiv);

                                    llmContent.appendChild(llmStreamEntry);
                                }

                                const llmContentDiv = llmStreamEntry.querySelector('.content');
                                if (llmContentDiv) llmContentDiv.textContent = currentStreamContent;
                                llmContent.scrollTop = llmContent.scrollHeight;
                            }

                            // SECONDARY: Update GPT Stream panel (sidebar)
                            const gptContent = document.getElementById('gpt-stream-content');
                            if (gptContent) {
                                if (!gptStreamEntry) {
                                    gptStreamEntry = document.createElement('div');
                                    gptStreamEntry.className = 'gpt-stream-entry streaming';

                                    const timestamp = document.createElement('div');
                                    timestamp.className = 'timestamp';
                                    timestamp.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
                                    gptStreamEntry.appendChild(timestamp);

                                    const contentDiv = document.createElement('div');
                                    contentDiv.className = 'content';
                                    gptStreamEntry.appendChild(contentDiv);

                                    gptContent.appendChild(gptStreamEntry);
                                }

                                const gptContentDiv = gptStreamEntry.querySelector('.content');
                                if (gptContentDiv) gptContentDiv.textContent = currentStreamContent;
                            }
                            gptContent.scrollTop = gptContent.scrollHeight;

                        } else if (update.type === 'llm_update') {
                            // Status updates
                            addLog(`[AGM] ${update.content}`, 'info');
                            if (streamingOverlay) {
                                streamingOverlay.innerHTML = `<div style="color: #17a2b8; font-weight: bold;">${update.content}</div>` +
                                    (currentStreamContent ? `<div style="margin-top: 10px;">${currentStreamContent}</div>` : '');
                            }
                        } else if (update.type === 'log') {
                            addLog(`[Log] ${jsonData.message}`, 'info');
                        
                        } else if (update.type === 'result') {
                            // Final result received
                            addLog('[AGM] Workflow refined successfully', 'success');

                            // Update streaming overlay with success message
                            if (streamingOverlay) {
                                streamingOverlay.innerHTML = '<div style="color: #28a745; font-weight: bold; font-size: 1.2em; text-align: center; margin-top: 50px;">✅ Workflow refined successfully!<br><br><span style="font-size: 0.9em;">Loading updated graph...</span></div>';
                            }

                            // Reload the iframe with updated graph (using the SAME iframe reference)
                            if (iframe) {
                                console.log('[handleWorkflowFeedback] Updating iframe with new graph');
                                iframe.src = `${API_BASE_URL}/api/graph/${taskId}?v=${Date.now()}`;

                                // When graph loads, hide streaming overlay and show iframe
                                iframe.onload = () => {
                                    console.log('[handleWorkflowFeedback] Graph loaded, showing iframe');
                                    // Hide streaming overlay and show iframe
                                    if (streamingOverlay) {
                                        streamingOverlay.style.display = 'none';
                                    }
                                    iframe.style.display = 'block';
                                };
                            }

                            addChatMessage('✅ Workflow has been refined based on your feedback. Please review the updated graph above.', 'agm');
                        } else if (update.type === 'complete') {
                            // Stream complete
                            addLog('[AGM] Workflow refinement stream complete', 'success');

                            // Exit feedback mode
                            cancelFeedbackMode();
                        } else if (update.type === 'error') {
                            addLog(`[Error] ${update.error}`, 'error');
                            addChatMessage(`❌ Error: ${update.error}`, 'agm');

                            if (streamingOverlay) {
                                streamingOverlay.innerHTML = `<div style="color: #dc3545; font-weight: bold;">❌ Error: ${update.error}</div>`;
                            }
                        }

                    } catch (e) {
                        console.error('Error parsing SSE data:', e);
                    }
                }
            }
        }

        // Update status to ready
        if (llmStatusDot) llmStatusDot.className = 'status-dot success';
        if (llmStatusText) llmStatusText.textContent = 'Ready';
        if (gptStatusDot) gptStatusDot.className = 'status-dot success';
        if (gptStatusText) gptStatusText.textContent = 'Complete';

    } catch (error) {
        addLog(`[Error] ${error.message}`, 'error');
        addChatMessage(`❌ Connection error: ${error.message}`, 'agm');

        if (llmStatusDot) llmStatusDot.className = 'status-dot error';
        if (llmStatusText) llmStatusText.textContent = 'Error';
        if (gptStatusDot) gptStatusDot.className = 'status-dot error';
        if (gptStatusText) gptStatusText.textContent = 'Error';
    }
}

async function handleResearchPlanFeedback(feedback) {
    const taskId = feedbackMode.taskId;
    const iframe = feedbackMode.iframe;

    addChatMessage(feedback, 'user');
    addLog(`[User] Research plan feedback for: ${taskId}`, 'info');

    // Disable input while LLM is working
    const rpInput = document.getElementById('chat-input');
    const rpSendBtn = document.getElementById('btn-send');
    rpInput.disabled = true;
    rpInput.value = '';
    rpInput.style.height = 'auto';
    rpInput.placeholder = 'Revising research plan...';
    if (rpSendBtn) rpSendBtn.disabled = true;

    // Create streaming overlay
    let streamingOverlay = document.getElementById(`rp-stream-${taskId}`);
    if (!streamingOverlay) {
        streamingOverlay = document.createElement('div');
        streamingOverlay.id = `rp-stream-${taskId}`;
        streamingOverlay.style.cssText = 'width:100%;height:100%;background:#f8f9fa;border:2px solid #667eea;border-radius:4px;padding:20px;overflow-y:auto;font-family:"Courier New",monospace;font-size:0.9em;white-space:pre-wrap;word-wrap:break-word;box-sizing:border-box;';
        if (iframe && iframe.parentElement) {
            iframe.parentElement.insertBefore(streamingOverlay, iframe);
        }
    }
    if (iframe) iframe.style.display = 'none';
    streamingOverlay.style.display = 'block';
    streamingOverlay.innerHTML = '<div style="color:#667eea;font-weight:bold;margin-bottom:15px;">🔄 Revising Research Plan...</div><div style="color:#666;font-style:italic;">Waiting for LLM response...</div>';

    let currentStreamContent = '';

    try {
        const abortCtrl = startInterruptableStream();
        const response = await fetch(`${API_BASE_URL}/api/research-plan/revise-stream/${taskId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedback }),
            signal: abortCtrl.signal,
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const update = JSON.parse(line.substring(6));

                    if (update.type === 'llm_stream') {
                        currentStreamContent += update.content;
                        streamingOverlay.innerHTML = `<div style="color:#28a745;font-weight:bold;margin-bottom:10px;">🔄 Revising research plan...</div>${currentStreamContent}`;
                        streamingOverlay.scrollTop = streamingOverlay.scrollHeight;

                    } else if (update.type === 'result') {
                        addLog('[AGM] Research plan revised successfully', 'success');
                        streamingOverlay.innerHTML = '<div style="color:#28a745;font-weight:bold;font-size:1.2em;text-align:center;margin-top:50px;">✅ Research plan revised!<br><br><span style="font-size:0.9em;">Loading updated plan...</span></div>';

                        if (iframe) {
                            // Preserve whichever tab (Plan View vs Geoprocessing Workflow)
                            // was active before feedback. Using a hard-coded research-plan
                            // URL resets the geoprocessing tab back to plan view, so the
                            // regenerated geoprocessing HTML never appears.
                            const prevSrc = iframe.src || `${API_BASE_URL}/api/research-plan/${taskId}`;
                            const baseUrl = prevSrc.split('?')[0];
                            iframe.src = `${baseUrl}?v=${Date.now()}`;
                            iframe.onload = () => {
                                if (streamingOverlay) streamingOverlay.style.display = 'none';
                                iframe.style.display = 'block';
                            };
                        }
                        addChatMessage('✅ Research plan revised based on your feedback. Please review above.', 'agm');

                    } else if (update.type === 'complete') {
                        // Exit feedback mode but keep input disabled — user must approve or provide more feedback
                        cancelFeedbackMode();
                        const rpInput = document.getElementById('chat-input');
                        const rpSendBtn = document.getElementById('btn-send');
                        rpInput.disabled = true;
                        rpInput.placeholder = 'Review the revised plan — Approve or Provide Feedback to continue';
                        if (rpSendBtn) rpSendBtn.disabled = true;

                    } else if (update.type === 'error') {
                        addLog(`[Error] ${update.error}`, 'error');
                        addChatMessage(`❌ Error: ${update.error}`, 'agm');
                        streamingOverlay.innerHTML = `<div style="color:#dc3545;font-weight:bold;">❌ Error: ${update.error}</div>`;
                        cancelFeedbackMode();
                        const rpInput2 = document.getElementById('chat-input');
                        const rpSendBtn2 = document.getElementById('btn-send');
                        rpInput2.disabled = true;
                        rpInput2.placeholder = 'Review the plan — Approve or Provide Feedback to continue';
                        if (rpSendBtn2) rpSendBtn2.disabled = true;
                    }
                } catch (e) {
                    console.error('Error parsing SSE data:', e);
                }
            }
        }
    } catch (error) {
        stopInterruptableStream();
        if (error.name === 'AbortError') return;
        addLog(`[Error] ${error.message}`, 'error');
        addChatMessage(`❌ Connection error: ${error.message}`, 'agm');
    }
    stopInterruptableStream();
}

async function handleGeoprocessingWorkflowFeedback(feedback) {
    const taskId = feedbackMode.taskId;
    const iframe = feedbackMode.iframe;
    await _submitGeoprocessingWorkflowFeedback(taskId, iframe, feedback, { viaChatInput: true });
}

async function _submitGeoprocessingWorkflowFeedback(taskId, iframe, feedback, opts = {}) {
    const viaChatInput = !!opts.viaChatInput;

    if (viaChatInput) addChatMessage(feedback, 'user');
    addLog(`[User] Geoprocessing workflow feedback for: ${taskId}`, 'info');

    const gwInput = document.getElementById('chat-input');
    const gwSendBtn = document.getElementById('btn-send');
    if (viaChatInput) {
        gwInput.disabled = true;
        gwInput.value = '';
        gwInput.style.height = 'auto';
    }
    gwInput.placeholder = 'Revising geoprocessing workflow...';
    if (gwSendBtn) gwSendBtn.disabled = true;

    let streamingOverlay = document.getElementById(`gw-stream-${taskId}`);
    if (!streamingOverlay) {
        streamingOverlay = document.createElement('div');
        streamingOverlay.id = `gw-stream-${taskId}`;
        streamingOverlay.style.cssText = 'width:100%;height:100%;background:#f8f9fa;border:2px solid #667eea;border-radius:4px;padding:20px;overflow-y:auto;font-family:"Courier New",monospace;font-size:0.9em;white-space:pre-wrap;word-wrap:break-word;box-sizing:border-box;';
        if (iframe && iframe.parentElement) {
            iframe.parentElement.insertBefore(streamingOverlay, iframe);
        }
    }
    if (iframe) iframe.style.display = 'none';
    streamingOverlay.style.display = 'block';
    streamingOverlay.innerHTML = '<div style="color:#667eea;font-weight:bold;margin-bottom:15px;">🔄 Revising Geoprocessing Workflow...</div><div style="color:#666;font-style:italic;">Waiting for LLM response...</div>';

    let currentStreamContent = '';

    try {
        const abortCtrl = startInterruptableStream();
        const response = await fetch(`${API_BASE_URL}/api/geoprocessing-workflow/revise-stream/${taskId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedback, conversation_id: currentConversationId }),
            signal: abortCtrl.signal,
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const update = JSON.parse(line.substring(6));

                    if (update.type === 'llm_stream') {
                        currentStreamContent += update.content;
                        streamingOverlay.innerHTML = `<div style="color:#28a745;font-weight:bold;margin-bottom:10px;">🔄 Revising geoprocessing workflow...</div>${currentStreamContent}`;
                        streamingOverlay.scrollTop = streamingOverlay.scrollHeight;

                    } else if (update.type === 'result') {
                        addLog('[AGM] Geoprocessing workflow revised successfully', 'success');
                        streamingOverlay.innerHTML = '<div style="color:#28a745;font-weight:bold;font-size:1.2em;text-align:center;margin-top:50px;">✅ Geoprocessing workflow revised!<br><br><span style="font-size:0.9em;">Loading updated workflow...</span></div>';

                        if (iframe) {
                            const prevSrc = iframe.src || `${API_BASE_URL}/api/research-plan/${taskId}`;
                            const baseUrl = prevSrc.split('?')[0];
                            iframe.src = `${baseUrl}?v=${Date.now()}`;
                            iframe.onload = () => {
                                if (streamingOverlay) streamingOverlay.style.display = 'none';
                                iframe.style.display = 'block';
                            };
                        }
                        if (viaChatInput) addChatMessage('✅ Geoprocessing workflow revised based on your feedback. Please review above.', 'agm');

                    } else if (update.type === 'complete') {
                        if (viaChatInput) cancelFeedbackMode();
                        const gwInput2 = document.getElementById('chat-input');
                        const gwSendBtn2 = document.getElementById('btn-send');
                        gwInput2.disabled = true;
                        gwInput2.placeholder = 'Review the revised workflow — Approve or Provide Feedback to continue';
                        if (gwSendBtn2) gwSendBtn2.disabled = true;

                    } else if (update.type === 'error') {
                        addLog(`[Error] ${update.error}`, 'error');
                        if (viaChatInput) addChatMessage(`❌ Error: ${update.error}`, 'agm');
                        streamingOverlay.innerHTML = `<div style="color:#dc3545;font-weight:bold;">❌ Error: ${update.error}</div>`;
                        if (viaChatInput) cancelFeedbackMode();
                        const gwInput3 = document.getElementById('chat-input');
                        const gwSendBtn3 = document.getElementById('btn-send');
                        gwInput3.disabled = true;
                        gwInput3.placeholder = 'Review the workflow — Approve or Provide Feedback to continue';
                        if (gwSendBtn3) gwSendBtn3.disabled = true;
                    }
                } catch (e) {
                    console.error('Error parsing SSE data:', e);
                }
            }
        }
    } catch (error) {
        stopInterruptableStream();
        if (error.name === 'AbortError') return;
        addLog(`[Error] ${error.message}`, 'error');
        if (viaChatInput) addChatMessage(`❌ Connection error: ${error.message}`, 'agm');
    }
    stopInterruptableStream();
}

// Build/toggle a dedicated inline feedback textarea + submit/cancel for the
// geoprocessing workflow card. Mirrors the pattern used for code regeneration
// so the user doesn't have to type feedback through the main chat input.
function _showGeoprocessingWorkflowFeedbackUI(taskId, iframe, controlsDiv, approveBtn, feedbackBtn) {
    const existing = controlsDiv.parentElement.querySelector(`#gw-feedback-panel-${taskId}`);
    if (existing) {
        existing.remove();
        return;
    }

    const panel = document.createElement('div');
    panel.id = `gw-feedback-panel-${taskId}`;
    panel.style.cssText = 'margin-top:10px; padding:12px; background:#f8f9fa; border:1px solid #dee2e6; border-radius:6px;';

    const label = document.createElement('div');
    label.textContent = 'Describe how to revise the geoprocessing workflow:';
    label.style.cssText = 'font-weight:600; color:#495057; margin-bottom:6px; font-size:0.9em;';
    panel.appendChild(label);

    const textarea = document.createElement('textarea');
    textarea.className = 'wf-feedback-textarea';
    textarea.placeholder = 'e.g., Add a buffer operation around the hazardous waste points before the overlay...';
    textarea.spellcheck = true;
    textarea.style.cssText = 'width:100%; min-height:90px; padding:8px; border:1px solid #ced4da; border-radius:4px; font-family:inherit; font-size:0.9em; box-sizing:border-box; resize:vertical;';
    panel.appendChild(textarea);

    const actions = document.createElement('div');
    actions.className = 'rp-controls';
    actions.style.cssText = 'margin-top:8px;';

    const submitBtn = document.createElement('button');
    submitBtn.className = 'rp-btn-approve';
    submitBtn.textContent = '\u2713 Revise Workflow';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'rp-btn-cancel';
    cancelBtn.textContent = 'Cancel';

    actions.appendChild(submitBtn);
    actions.appendChild(cancelBtn);
    panel.appendChild(actions);

    controlsDiv.parentElement.insertBefore(panel, controlsDiv.nextSibling);
    textarea.focus();

    cancelBtn.onclick = () => panel.remove();

    submitBtn.onclick = async () => {
        const feedback = textarea.value.trim();
        if (!feedback) {
            textarea.focus();
            return;
        }
        submitBtn.disabled = true;
        cancelBtn.disabled = true;
        textarea.disabled = true;
        if (approveBtn) approveBtn.disabled = true;
        if (feedbackBtn) feedbackBtn.disabled = true;
        try {
            await _submitGeoprocessingWorkflowFeedback(taskId, iframe, feedback, { viaChatInput: false });
        } finally {
            panel.remove();
            if (approveBtn) approveBtn.disabled = false;
            if (feedbackBtn) feedbackBtn.disabled = false;
        }
    };
}

async function handleRqBreakdownFeedback(feedback) {
    const taskId = feedbackMode.taskId;
    const card = feedbackMode.contextData?.card || document.getElementById('wf-card-rq_breakdown_summary');

    addLog(`[User] Task breakdown feedback for: ${taskId}`, 'info');

    // Disable input while LLM is working
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send');
    chatInput.disabled = true;
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatInput.placeholder = 'Revising task breakdown...';
    if (sendBtn) sendBtn.disabled = true;

    // Remove the existing summary sub-card — it will be recreated after revision
    const summaryCard = document.getElementById('wf-card-rq_breakdown_summary');
    if (summaryCard) summaryCard.remove();

    // Create a temporary streaming card for the revision output
    const container = _ensureCardsContainer();
    const tempCard = document.createElement('div');
    tempCard.className = 'wf-card active';
    tempCard.id = 'wf-card-rq_breakdown_summary';
    tempCard.innerHTML = `
        <div class="wf-card-header">
            <span class="step-check" style="display:none;">&#10004;</span>
            <span class="step-spinner"></span>
            <span class="wf-card-status">Revising Task Breakdown...</span>
        </div>
    `;
    container.appendChild(tempCard);

    const body = document.createElement('div');
    body.className = 'wf-card-body';
    tempCard.appendChild(body);

    let streamPre = null;
    if (body) {
        streamPre = document.createElement('pre');
        streamPre.className = 'wf-stream-log';
        streamPre.textContent = 'Revising task breakdown...\n';
        body.appendChild(streamPre);
    }

    let currentStreamContent = '';

    try {
        const abortCtrl = startInterruptableStream();
        const response = await fetch(`${API_BASE_URL}/api/rq-breakdown/revise-stream/${taskId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedback, conversation_id: currentConversationId }),
            signal: abortCtrl.signal,
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const update = JSON.parse(line.substring(6));

                    if (update.type === 'llm_stream') {
                        currentStreamContent += update.content;
                        if (streamPre) {
                            streamPre.textContent = currentStreamContent;
                            streamPre.scrollTop = streamPre.scrollHeight;
                        }

                    } else if (update.type === 'llm_update' && update.step === 'rq_breakdown_complete') {
                        // Revised breakdown arrived — render the structured summary
                        const rqData = update.data?.rq_breakdown;
                        if (rqData) {
                            // Remove the temp streaming card — displayRqBreakdownSummary
                            // will create the real summary sub-card
                            const tc = document.getElementById('wf-card-rq_breakdown_summary');
                            if (tc) tc.remove();
                            displayRqBreakdownSummary(rqData, {
                                taskId: update.data?.task_id || taskId,
                            });
                        }
                        addLog('[AGM] Task breakdown revised successfully', 'success');

                    } else if (update.type === 'complete') {
                        cancelFeedbackMode();
                        const ci = document.getElementById('chat-input');
                        const sb = document.getElementById('btn-send');
                        if (ci) {
                            ci.disabled = true;
                            ci.placeholder = 'Review the revised breakdown — Proceed or Provide Feedback to continue';
                        }
                        if (sb) sb.disabled = true;

                    } else if (update.type === 'error') {
                        addLog(`[Error] ${update.error}`, 'error');
                        addChatMessage(`Error: ${update.error}`, 'agm');
                        cancelFeedbackMode();
                        const ci2 = document.getElementById('chat-input');
                        const sb2 = document.getElementById('btn-send');
                        if (ci2) {
                            ci2.disabled = true;
                            ci2.placeholder = 'Review the breakdown — Proceed or Provide Feedback to continue';
                        }
                        if (sb2) sb2.disabled = true;
                    }
                } catch (e) {
                    console.error('Error parsing SSE data:', e);
                }
            }
        }
    } catch (error) {
        stopInterruptableStream();
        if (error.name === 'AbortError') return;
        addLog(`[Error] ${error.message}`, 'error');
        addChatMessage(`Connection error: ${error.message}`, 'agm');
    }
    stopInterruptableStream();
}

async function handleCodeFeedback(feedback, options = {}) {
    const taskId = feedbackMode.taskId;
    const autoRun = options.autoRun !== false; // default: refine AND run

    addChatMessage(feedback, 'user');
    addLog(`[User] Submitting code feedback for task: ${taskId} (auto-run=${autoRun})`, 'info');
    addLog(`[User] Feedback: ${feedback}`, 'info');

    if (!autoRun) {
        addChatMessage('⏳ Processing your feedback and refining the code...', 'agm');
        try {
            const response = await fetch(`${API_BASE_URL}/api/workflow/refine-code/${taskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedback }),
            });
            const data = await response.json();
            if (data.success) {
                addLog('[AGM] Code refined successfully', 'success');
                addRichChatMessage('Updated Code', { _task_id: taskId, code: data.refined_code || data.code }, 'agm', 'code');
                addChatMessage('✅ Code has been refined. Click Re-execute on the code card when you are ready to run it.', 'agm');
                cancelFeedbackMode();
            } else {
                addLog(`[Error] Failed to refine code: ${data.error}`, 'error');
                addChatMessage(`❌ Failed to refine code: ${data.error}`, 'agm');
            }
        } catch (error) {
            addLog(`[Error] ${error.message}`, 'error');
            addChatMessage(`❌ Connection error: ${error.message}`, 'agm');
        }
        return;
    }

    // Auto-run path: stream refine + execute via SSE so the new code, console
    // output, and result tiles all flow back into the UI in one step.
    addChatMessage('⏳ Refining the code and running it...', 'agm');
    cancelFeedbackMode();

    try {
        const response = await fetch(`${API_BASE_URL}/api/workflow/refine-and-run/${taskId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
            body: JSON.stringify({ feedback }),
        });
        if (!response.ok || !response.body) {
            const errText = await response.text().catch(() => '');
            throw new Error(`refine-and-run failed: ${response.status} ${errText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';
            for (const evt of events) {
                const line = evt.split('\n').find(l => l.startsWith('data: '));
                if (!line) continue;
                let payload;
                try { payload = JSON.parse(line.slice(6)); } catch (_) { continue; }
                _handleRefineAndRunEvent(payload, taskId);
            }
        }
        addLog('[AGM] Refine-and-run stream completed', 'success');
    } catch (error) {
        addLog(`[Error] ${error.message}`, 'error');
        addChatMessage(`❌ ${error.message}`, 'agm');
    }
}

function _handleRefineAndRunEvent(payload, taskId) {
    const t = payload && payload.type;
    if (!t) return;
    if (t === 'code_refined') {
        addLog('[AGM] Code refined — executing new version...', 'info');
        addRichChatMessage(
            'Updated Code (running...)',
            { _task_id: taskId, code: payload.code || '' },
            'agm', 'code'
        );
        return;
    }
    if (t === 'llm_stream') {
        // Route into the workflow-card stream so the assembly_execution
        // card gets created and the streamed code/output is visible.
        if (typeof appendToWorkflowCard === 'function') {
            appendToWorkflowCard(payload.content || '', payload.step || 'assembly_execution');
        } else {
            addLog(payload.content || '', 'info');
        }
        return;
    }
    if (t === 'status' || t === 'llm_update') {
        const msg = payload.content || payload.message || '';
        // updateWorkflowCard creates the card if it doesn't exist yet, which
        // is what displayStepResult later relies on.
        if (typeof updateWorkflowCard === 'function') {
            updateWorkflowCard(msg, payload.step || 'assembly_execution');
        }
        addLog(`[AGM] ${msg}`, 'info');
        return;
    }
    if (t === 'step_result') {
        if (typeof displayStepResult === 'function') {
            displayStepResult(payload);
        } else {
            addLog(`[AGM] Execution finished (status=${payload.status})`, 'info');
            if (Array.isArray(payload.artifacts)) {
                payload.artifacts.forEach(a => addLog(`  • ${a.filename}`, 'info'));
            }
        }
        return;
    }
    if (t === 'error') {
        addLog(`[Error] ${payload.error || 'unknown error'}`, 'error');
        addChatMessage(`❌ ${payload.error || 'Refinement or execution failed.'}`, 'agm');
        return;
    }
}


// ── EDA Approval Request ─────────────────────────────────────────
// Shows approval UI BELOW the EDA workflow card (as a separate element)
function displayEdaApproval(data) {
    const question = data.question || 'The EDA agent needs your input.';
    const options = data.options || ['Yes', 'No'];

    addLog(`[EDA] Approval requested: ${question}`, 'info');

    // Find the EDA workflow card to insert after it
    const edaCard = _wfCardsContainer ? _wfCardsContainer.querySelector('#wf-card-eda') : null;
    const insertParent = edaCard ? edaCard.parentNode : document.getElementById('chat-messages');

    if (!insertParent) {
        console.error('[displayEdaApproval] Could not find container to insert approval');
        return;
    }

    // Create approval container as a standalone element
    const container = document.createElement('div');
    container.className = 'eda-approval-container';
    container.style.cssText = 'border:1px solid #e0c36a; border-radius:8px; padding:16px; margin:12px 0; background:#fffbea;';

    // Question
    const questionEl = document.createElement('div');
    questionEl.className = 'eda-approval-question';
    questionEl.style.cssText = 'font-weight:600; margin-bottom:12px; color:#7a6c00; font-size:14px;';
    questionEl.textContent = question;
    container.appendChild(questionEl);

    // Option buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px;';

    // Hidden file input for upload
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.xlsx,.xls,.gpkg,.shp,.geojson,.json,.zip';
    fileInput.style.display = 'none';
    container.appendChild(fileInput);

    // Helper: detect if text is upload-related
    const isUploadIntent = (text) => {
        const lower = text.toLowerCase();
        return /\bupload\b|\bprovide.*file\b|\bload.*data\b|\bimport\b|\battach\b/.test(lower);
    };

    const disableAll = () => {
        btnRow.querySelectorAll('button').forEach(b => {
            b.disabled = true;
            b.style.opacity = '0.5';
            b.style.cursor = 'default';
        });
        customInput.disabled = true;
        customBtn.disabled = true;
        customBtn.style.opacity = '0.5';
    };

    // Upload file and send to backend
    const uploadFile = async (file) => {
        disableAll();
        addLog(`[User] EDA: uploading ${file.name}...`, 'info');

        // Add to data layers UI (reuse existing flow)
        processSingleFile(file);

        // Show upload status in container
        const statusEl = document.createElement('div');
        statusEl.style.cssText = 'margin-top:8px; color:#7a6c00; font-size:13px;';
        statusEl.textContent = `Uploading and auditing ${file.name}...`;
        container.appendChild(statusEl);

        const formData = new FormData();
        formData.append('file', file);
        if (currentConversationId) formData.append('conversation_id', currentConversationId);
        try {
            const resp = await fetch(`${API_BASE_URL}/api/eda-approval`, {
                method: 'POST',
                body: formData,
            });
            const result = await resp.json();
            if (result.success) {
                statusEl.textContent = `${file.name} uploaded and audited. EDA resuming...`;
                addLog(`[User] File uploaded: ${file.name}`, 'success');
            } else {
                statusEl.textContent = `Upload failed: ${result.error}`;
                addLog(`[Error] Upload failed: ${result.error}`, 'error');
            }
        } catch (e) {
            statusEl.textContent = `Upload error: ${e.message}`;
            console.error('[displayEdaApproval] Upload failed:', e);
            addLog(`[Error] File upload failed: ${e.message}`, 'error');
        }
        setTimeout(() => container.remove(), 2000);
    };

    // When file is selected via dialog
    fileInput.onchange = () => {
        if (fileInput.files && fileInput.files[0]) {
            uploadFile(fileInput.files[0]);
        }
    };

    const submitResponse = async (response) => {
        addLog(`[User] EDA approval: ${response}`, 'info');
        try {
            await fetch(`${API_BASE_URL}/api/eda-approval`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ response }),
            });
        } catch (e) {
            console.error('[displayEdaApproval] Failed to submit:', e);
            addLog(`[Error] Failed to submit EDA approval: ${e.message}`, 'error');
        }
    };

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.style.cssText = 'padding:8px 16px; border:1px solid #d4a800; border-radius:6px; background:#fff; color:#7a6c00; cursor:pointer; font-size:13px; transition:background 0.2s;';
        btn.onmouseenter = () => btn.style.background = '#fff3c4';
        btn.onmouseleave = () => btn.style.background = '#fff';
        btn.onclick = async () => {
            // If the option text is upload-related, open file dialog instead
            if (isUploadIntent(opt)) {
                fileInput.click();
                return;
            }
            disableAll();
            btn.style.background = '#d4a800';
            btn.style.color = '#fff';
            btn.style.opacity = '1';
            await submitResponse(opt);
            container.remove();
        };
        btnRow.appendChild(btn);
    });

    // Custom text input
    const customRow = document.createElement('div');
    customRow.style.cssText = 'display:flex; gap:8px; margin-top:8px;';
    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.placeholder = 'Or type a custom response...';
    customInput.style.cssText = 'flex:1; padding:8px 12px; border:1px solid #d4a800; border-radius:6px; font-size:13px;';
    const customBtn = document.createElement('button');
    customBtn.textContent = 'Send';
    customBtn.style.cssText = 'padding:8px 16px; border:1px solid #d4a800; border-radius:6px; background:#d4a800; color:#fff; cursor:pointer; font-size:13px;';
    customBtn.onclick = async () => {
        const val = customInput.value.trim();
        if (!val) return;
        // If user typed something upload-related, open file dialog
        if (isUploadIntent(val)) {
            fileInput.click();
            return;
        }
        disableAll();
        await submitResponse(val);
        container.remove();
    };
    customInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') customBtn.click();
    });
    customRow.appendChild(customInput);
    customRow.appendChild(customBtn);

    container.appendChild(btnRow);
    container.appendChild(customRow);

    // Insert AFTER the EDA card, not inside it
    if (edaCard && edaCard.nextSibling) {
        insertParent.insertBefore(container, edaCard.nextSibling);
    } else {
        insertParent.appendChild(container);
    }

    smartScrollChat();
}


// ── Data Download Failure Approval ────────────────────────────────
// Rendered when one or more data_download_req_X failed/returned no files.
// Modeled on displayEdaApproval — lets the user proceed, upload missing
// files, or abort the workflow.
function displayDataDownloadApproval(data) {
    const question = data.question || 'Some data requests failed. How would you like to proceed?';
    const options = data.options || ['Proceed with available data', 'Upload missing files', 'Abort workflow'];
    const failedRequests = data.failed_requests || [];

    addLog(`[AGM] Data download approval requested (${failedRequests.length} failed)`, 'warning');

    // Anchor the approval AFTER the last data_download_req_N sub-card so the
    // user doesn't have to scroll up past them. Fall back to the parent
    // data_download summary card only when there are no sub-cards.
    let anchorCard = null;
    if (_wfCardsContainer) {
        const reqCards = _wfCardsContainer.querySelectorAll(
            '[id^="wf-card-data_download_req_"]'
        );
        if (reqCards.length) {
            anchorCard = reqCards[reqCards.length - 1];
        } else {
            anchorCard = _wfCardsContainer.querySelector('#wf-card-data_download');
        }
    }
    const insertParent = anchorCard ? anchorCard.parentNode : document.getElementById('chat-messages');
    if (!insertParent) {
        console.error('[displayDataDownloadApproval] Could not find container to insert approval');
        return;
    }

    // Remove any previous approval card for the same pause (re-displayed after upload)
    const prev = document.getElementById('data-download-approval-container');
    if (prev) prev.remove();

    const container = document.createElement('div');
    container.id = 'data-download-approval-container';
    container.className = 'data-download-approval-container';
    container.style.cssText = 'border:1px solid #e08a3c; border-radius:8px; padding:16px; margin:12px 0; background:#fff5eb;';

    // Header
    const headerEl = document.createElement('div');
    headerEl.style.cssText = 'display:flex; align-items:center; gap:8px; font-weight:700; margin-bottom:10px; color:#8a4a00; font-size:14px;';
    headerEl.innerHTML = '<span>\u26A0\uFE0F</span><span>Data Download Issue</span>';
    container.appendChild(headerEl);

    // Question (preserve newlines)
    const questionEl = document.createElement('div');
    questionEl.style.cssText = 'white-space:pre-wrap; margin-bottom:12px; color:#5a3000; font-size:13px; line-height:1.5;';
    questionEl.textContent = question;
    container.appendChild(questionEl);

    // Failed requests list (structured)
    if (failedRequests.length) {
        const list = document.createElement('ul');
        list.style.cssText = 'margin:0 0 12px 0; padding-left:20px; font-size:12px; color:#6a3a00;';
        failedRequests.forEach(f => {
            const li = document.createElement('li');
            li.style.marginBottom = '4px';
            const strong = document.createElement('strong');
            strong.textContent = `Request ${f.idx}: `;
            li.appendChild(strong);
            li.appendChild(document.createTextNode(String(f.request || '')));
            if (f.reason) {
                li.appendChild(document.createElement('br'));
                const reasonSpan = document.createElement('span');
                reasonSpan.style.color = '#8a6a3a';
                reasonSpan.textContent = `(${String(f.reason)})`;
                li.appendChild(reasonSpan);
            }
            list.appendChild(li);
        });
        container.appendChild(list);
    }

    // Hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.xlsx,.xls,.gpkg,.shp,.geojson,.json,.zip,.tif,.tiff,.nc,.kml,.gml';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    container.appendChild(fileInput);

    const isUploadIntent = (text) => /\bupload\b|\bprovide.*file\b|\bmissing.*file\b|\battach\b/i.test(text);

    const disableAll = () => {
        container.querySelectorAll('button').forEach(b => {
            b.disabled = true;
            b.style.opacity = '0.5';
            b.style.cursor = 'default';
        });
        if (customInput) customInput.disabled = true;
    };

    const uploadFile = async (file) => {
        addLog(`[User] Data download: uploading ${file.name}...`, 'info');
        // Add to sidebar layers list (reuse existing flow)
        try { processSingleFile(file); } catch (_) {}

        const statusEl = document.createElement('div');
        statusEl.style.cssText = 'margin-top:8px; color:#6a3a00; font-size:12px;';
        statusEl.textContent = `Uploading and auditing ${file.name}...`;
        container.appendChild(statusEl);

        const formData = new FormData();
        formData.append('file', file);
        if (currentConversationId) formData.append('conversation_id', currentConversationId);
        try {
            const resp = await fetch(`${API_BASE_URL}/api/data-download-approval`, {
                method: 'POST',
                body: formData,
            });
            const result = await resp.json();
            if (result.success) {
                statusEl.textContent = `${file.name} uploaded and registered.`;
                addLog(`[User] Uploaded ${file.name}`, 'success');
            } else {
                statusEl.textContent = `Upload failed: ${result.error}`;
                addLog(`[Error] Upload failed: ${result.error}`, 'error');
            }
        } catch (e) {
            statusEl.textContent = `Upload error: ${e.message}`;
            addLog(`[Error] Upload failed: ${e.message}`, 'error');
        }
        // The backend will re-send a fresh data_download_approval event; leave
        // this card in place until the new one arrives (it removes the old one).
    };

    fileInput.onchange = () => {
        if (!fileInput.files) return;
        for (const f of fileInput.files) {
            uploadFile(f);
        }
    };

    const submitResponse = async (response) => {
        addLog(`[User] Data download choice: ${response}`, 'info');
        try {
            await fetch(`${API_BASE_URL}/api/data-download-approval`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ response }),
            });
        } catch (e) {
            addLog(`[Error] Failed to submit data download choice: ${e.message}`, 'error');
        }
    };

    // Option buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px;';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.style.cssText = 'padding:8px 16px; border:1px solid #c86b1a; border-radius:6px; background:#fff; color:#8a4a00; cursor:pointer; font-size:13px; transition:background 0.2s;';
        btn.onmouseenter = () => { if (!btn.disabled) btn.style.background = '#ffe5cc'; };
        btn.onmouseleave = () => { if (!btn.disabled) btn.style.background = '#fff'; };
        btn.onclick = async () => {
            if (isUploadIntent(opt)) {
                fileInput.click();
                return;
            }
            disableAll();
            btn.style.background = '#c86b1a';
            btn.style.color = '#fff';
            btn.style.opacity = '1';
            await submitResponse(opt);
            container.remove();
        };
        btnRow.appendChild(btn);
    });
    container.appendChild(btnRow);

    // Custom text input
    const customRow = document.createElement('div');
    customRow.style.cssText = 'display:flex; gap:8px; margin-top:10px;';
    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.placeholder = 'Or type a custom response...';
    customInput.style.cssText = 'flex:1; padding:8px 12px; border:1px solid #c86b1a; border-radius:6px; font-size:13px;';
    const customBtn = document.createElement('button');
    customBtn.textContent = 'Send';
    customBtn.style.cssText = 'padding:8px 16px; border:1px solid #c86b1a; border-radius:6px; background:#c86b1a; color:#fff; cursor:pointer; font-size:13px;';
    customBtn.onclick = async () => {
        const val = customInput.value.trim();
        if (!val) return;
        if (isUploadIntent(val)) { fileInput.click(); return; }
        disableAll();
        await submitResponse(val);
        container.remove();
    };
    customInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') customBtn.click(); });
    customRow.appendChild(customInput);
    customRow.appendChild(customBtn);
    container.appendChild(customRow);

    // Insert after the anchor card (or append to chat if no anchor)
    if (anchorCard && anchorCard.nextSibling) {
        insertParent.insertBefore(container, anchorCard.nextSibling);
    } else {
        insertParent.appendChild(container);
    }

    smartScrollChat();
}


// ── Data Source Selection Approval ────────────────────────────────
// Rendered BEFORE each data download executes. Shows the LLM's chosen
// data source, what will be downloaded, and a confidence score. The
// user can Proceed, pick a different source, Retry, Abort, or click
// Always Proceed to skip this prompt for remaining requests in the run.
function displayDataSourceSelectApproval(data) {
    const dataRequest = data.data_request || '(unknown request)';
    const llmChoice = data.llm_choice || 'Unknown';
    const llmExplanation = data.llm_explanation || '';
    const idealSource = (data.ideal_source || '').trim();
    const idealReasoning = (data.ideal_source_reasoning || '').trim();
    const dataToDownload = data.data_to_download || '';
    const confidence = Number(data.confidence || 0);
    const isRecognized = data.is_recognized !== false;  // default true
    const availableSources = data.available_sources || [];
    const step = data.step || 'data_download';
    // Does the finalized source match the LLM's ideal suggestion?
    const idealMatches = idealSource
        && idealSource.toLowerCase() === String(llmChoice).toLowerCase();

    addLog(
        `[AGM] Data source confirmation: "${llmChoice}" `
        + `(confidence=${confidence}/10, recognized=${isRecognized})`,
        isRecognized ? 'info' : 'warning'
    );

    // Anchor to the per-request sub-card if we can find it. While the prompt
    // is interactive (waiting for the user), keep the original behavior of
    // inserting it as a standalone panel after the card. Once the user
    // resolves the prompt, the interactive panel is swapped for a read-only
    // review placed INSIDE the card body so the final layout matches reload:
    // Execution Log → Data Source Review → Generated Code → Downloaded file.
    let anchorCard = null;
    if (_wfCardsContainer) {
        anchorCard = _wfCardsContainer.querySelector(`#wf-card-${step}`)
            || _wfCardsContainer.querySelector('#wf-card-data_download');
    }
    const cardBody = anchorCard ? anchorCard.querySelector('.wf-card-body') : null;
    const insertParent = anchorCard ? anchorCard.parentNode : document.getElementById('chat-messages');
    if (!insertParent) {
        console.error('[displayDataSourceSelectApproval] No container to insert approval');
        return;
    }

    // Remove any stale approval card (in case of repeat prompts)
    const prev = document.getElementById(`data-source-select-${step}`);
    if (prev) prev.remove();

    const container = document.createElement('div');
    container.id = `data-source-select-${step}`;
    container.className = 'data-source-select-container';
    container.style.cssText = 'border:1px solid #b36bd1; border-radius:8px; padding:16px; margin:12px 0; background:#faf5fd;';

    // Header — different colour/text based on recognition
    const headerEl = document.createElement('div');
    headerEl.style.cssText = 'display:flex; align-items:center; gap:8px; font-weight:700; margin-bottom:10px; color:#5e1f7a; font-size:14px;';
    const headerIcon = document.createElement('span');
    headerIcon.textContent = isRecognized ? '\u{1F4E5}' : '\u2753';
    const headerText = document.createElement('span');
    headerText.textContent = isRecognized
        ? 'Confirm Data Source Before Download'
        : 'Data Source Not Recognized';
    headerEl.appendChild(headerIcon);
    headerEl.appendChild(headerText);
    container.appendChild(headerEl);

    // Data request
    const reqEl = document.createElement('div');
    reqEl.style.cssText = 'margin-bottom:6px; font-size:13px; color:#3d1450;';
    const reqLabel = document.createElement('strong');
    reqLabel.textContent = 'Data request: ';
    reqEl.appendChild(reqLabel);
    reqEl.appendChild(document.createTextNode(String(dataRequest)));
    container.appendChild(reqEl);

    // Ideal source (LLM's unconstrained suggestion) — shown above the
    // finalized selection so the user can see the LLM's reasoning chain:
    // "what I'd pick in a perfect world → what I settled on from the
    // available handbooks".
    if (idealSource) {
        const idealRow = document.createElement('div');
        idealRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:13px; color:#3d1450; flex-wrap:wrap;';
        const idealLabel = document.createElement('strong');
        idealLabel.textContent = 'Ideal source (LLM suggestion): ';
        idealRow.appendChild(idealLabel);
        const idealSpan = document.createElement('span');
        idealSpan.style.cssText = 'color:#5e1f7a; font-weight:600;';
        idealSpan.textContent = idealSource;
        idealRow.appendChild(idealSpan);
        const matchTag = document.createElement('span');
        if (idealMatches) {
            matchTag.style.cssText = 'display:inline-block; padding:2px 8px; border-radius:10px; background:#d1e7dd; color:#0f5132; font-size:11px; font-weight:600;';
            matchTag.textContent = 'available \u2713';
        } else {
            matchTag.style.cssText = 'display:inline-block; padding:2px 8px; border-radius:10px; background:#fff3cd; color:#664d03; font-size:11px; font-weight:600;';
            matchTag.textContent = 'not in handbooks \u2192 fallback';
        }
        idealRow.appendChild(matchTag);
        container.appendChild(idealRow);

        if (idealReasoning) {
            const idealReasonEl = document.createElement('div');
            idealReasonEl.style.cssText = 'margin:0 0 8px 0; font-size:12px; color:#66406e; font-style:italic;';
            idealReasonEl.textContent = `Why ideal: ${idealReasoning}`;
            container.appendChild(idealReasonEl);
        }
    }

    // LLM's source choice + confidence badge
    const choiceRow = document.createElement('div');
    choiceRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:13px; color:#3d1450; flex-wrap:wrap;';
    const choiceLabel = document.createElement('strong');
    choiceLabel.textContent = idealSource ? 'Selected (finalized): ' : 'Data source: ';
    choiceRow.appendChild(choiceLabel);
    const choiceSpan = document.createElement('span');
    choiceSpan.style.cssText = `color:${isRecognized ? '#1a6b2e' : '#a31b1b'}; font-weight:600;`;
    choiceSpan.textContent = String(llmChoice);
    choiceRow.appendChild(choiceSpan);
    if (!isRecognized) {
        const warn = document.createElement('span');
        warn.style.cssText = 'color:#a31b1b; font-size:12px;';
        warn.textContent = '(not in handbook)';
        choiceRow.appendChild(warn);
    }
    // Confidence badge
    const confBadge = document.createElement('span');
    let confColor = '#6c757d', confBg = '#e9ecef';
    if (confidence >= 8) { confColor = '#0f5132'; confBg = '#d1e7dd'; }
    else if (confidence >= 5) { confColor = '#664d03'; confBg = '#fff3cd'; }
    else if (confidence > 0) { confColor = '#842029'; confBg = '#f8d7da'; }
    confBadge.style.cssText = `display:inline-block; padding:2px 10px; border-radius:10px; background:${confBg}; color:${confColor}; font-size:12px; font-weight:600;`;
    confBadge.textContent = `Confidence: ${confidence}/10`;
    choiceRow.appendChild(confBadge);
    container.appendChild(choiceRow);

    // Data to download
    if (dataToDownload) {
        const dataEl = document.createElement('div');
        dataEl.style.cssText = 'margin-bottom:6px; font-size:13px; color:#3d1450;';
        const dataLabel = document.createElement('strong');
        dataLabel.textContent = 'Will download: ';
        dataEl.appendChild(dataLabel);
        dataEl.appendChild(document.createTextNode(String(dataToDownload)));
        container.appendChild(dataEl);
    }

    // LLM explanation (italic)
    if (llmExplanation) {
        const explEl = document.createElement('div');
        explEl.style.cssText = 'margin-bottom:10px; font-size:12px; color:#66406e; font-style:italic;';
        explEl.textContent = `Rationale: ${String(llmExplanation)}`;
        container.appendChild(explEl);
    }

    const disableAll = () => {
        container.querySelectorAll('button, select').forEach(el => {
            el.disabled = true;
            el.style.opacity = '0.5';
            el.style.cursor = 'default';
        });
    };

    const submitResponse = async (payload) => {
        addLog(`[User] Data source select: ${JSON.stringify(payload)}`, 'info');
        try {
            await fetch(`${API_BASE_URL}/api/data-source-select`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (e) {
            addLog(`[Error] Failed to submit source select: ${e.message}`, 'error');
        }
    };

    // Finalize helper — dismiss the interactive prompt and stash the review
    // payload on the sub-card. The review is rendered into the card body only
    // when the request completes (data_request_files arrives), so streaming
    // during execution looks exactly like it did before.
    const finalizeReview = (decisionText, decisionColor) => {
        if (anchorCard) {
            anchorCard._pendingDataSourceReview = {
                data_request: dataRequest,
                llm_choice: llmChoice,
                llm_explanation: llmExplanation,
                ideal_source: idealSource,
                ideal_source_reasoning: idealReasoning,
                data_to_download: dataToDownload,
                confidence: confidence,
                is_recognized: isRecognized,
                _decisionText: decisionText || '',
                _decisionColor: decisionColor || '',
            };
        }
        container.remove();
    };

    // Source picker (dropdown + Use button) — lets user override the LLM
    if (availableSources.length) {
        const pickerRow = document.createElement('div');
        pickerRow.className = 'ds-picker-row';
        pickerRow.style.cssText = 'display:flex; gap:8px; margin:10px 0; align-items:center;';

        const select = document.createElement('select');
        select.style.cssText = 'flex:1; padding:8px 12px; border:1px solid #b36bd1; border-radius:6px; font-size:13px; background:#fff;';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '-- Change to a different source --';
        placeholder.disabled = true;
        placeholder.selected = true;
        select.appendChild(placeholder);
        availableSources.forEach(src => {
            const opt = document.createElement('option');
            opt.value = src;
            opt.textContent = src;
            select.appendChild(opt);
        });

        const useBtn = document.createElement('button');
        useBtn.textContent = 'Use This Source';
        useBtn.style.cssText = 'padding:8px 16px; border:1px solid #8a3aa8; border-radius:6px; background:#8a3aa8; color:#fff; cursor:pointer; font-size:13px;';
        useBtn.onclick = async () => {
            const chosen = select.value;
            if (!chosen) {
                select.style.border = '1px solid #a31b1b';
                return;
            }
            disableAll();
            await submitResponse({ action: 'use', source: chosen });
            finalizeReview(`Using ${chosen}`, '#0f5132');
        };

        pickerRow.appendChild(select);
        pickerRow.appendChild(useBtn);
        container.appendChild(pickerRow);
    }

    // Action buttons row
    const actionsRow = document.createElement('div');
    actionsRow.className = 'ds-actions-row';
    actionsRow.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';

    // Proceed (only meaningful if source is recognized)
    if (isRecognized) {
        const proceedBtn = document.createElement('button');
        proceedBtn.textContent = '\u2713 Proceed with Download';
        proceedBtn.style.cssText = 'padding:8px 16px; border:1px solid #1a6b2e; border-radius:6px; background:#1a6b2e; color:#fff; cursor:pointer; font-size:13px; font-weight:600;';
        proceedBtn.onmouseenter = () => { if (!proceedBtn.disabled) proceedBtn.style.background = '#155824'; };
        proceedBtn.onmouseleave = () => { if (!proceedBtn.disabled) proceedBtn.style.background = '#1a6b2e'; };
        proceedBtn.onclick = async () => {
            disableAll();
            await submitResponse({ action: 'proceed' });
            finalizeReview('Proceeded', '#0f5132');
        };
        actionsRow.appendChild(proceedBtn);

        const alwaysBtn = document.createElement('button');
        alwaysBtn.textContent = '\u23E9 Always Proceed';
        alwaysBtn.title = 'Skip this prompt for remaining data requests in this run';
        alwaysBtn.style.cssText = 'padding:8px 16px; border:1px solid #1a6b2e; border-radius:6px; background:#fff; color:#1a6b2e; cursor:pointer; font-size:13px;';
        alwaysBtn.onmouseenter = () => { if (!alwaysBtn.disabled) alwaysBtn.style.background = '#e6f4ea'; };
        alwaysBtn.onmouseleave = () => { if (!alwaysBtn.disabled) alwaysBtn.style.background = '#fff'; };
        alwaysBtn.onclick = async () => {
            disableAll();
            await submitResponse({ action: 'always_proceed' });
            finalizeReview('Always proceed (rest of run)', '#0f5132');
        };
        actionsRow.appendChild(alwaysBtn);
    }

    const retryBtn = document.createElement('button');
    retryBtn.textContent = '\u{1F504} Retry LLM Selection';
    retryBtn.style.cssText = 'padding:8px 16px; border:1px solid #b36bd1; border-radius:6px; background:#fff; color:#5e1f7a; cursor:pointer; font-size:13px;';
    retryBtn.onmouseenter = () => { if (!retryBtn.disabled) retryBtn.style.background = '#f1e0f8'; };
    retryBtn.onmouseleave = () => { if (!retryBtn.disabled) retryBtn.style.background = '#fff'; };
    retryBtn.onclick = async () => {
        disableAll();
        await submitResponse({ action: 'retry' });
        finalizeReview('Retry selection requested', '#664d03');
    };
    actionsRow.appendChild(retryBtn);

    const abortBtn = document.createElement('button');
    abortBtn.textContent = '\u274C Abort This Request';
    abortBtn.style.cssText = 'padding:8px 16px; border:1px solid #a31b1b; border-radius:6px; background:#fff; color:#a31b1b; cursor:pointer; font-size:13px;';
    abortBtn.onmouseenter = () => { if (!abortBtn.disabled) abortBtn.style.background = '#fde0e0'; };
    abortBtn.onmouseleave = () => { if (!abortBtn.disabled) abortBtn.style.background = '#fff'; };
    abortBtn.onclick = async () => {
        disableAll();
        await submitResponse({ action: 'abort' });
        finalizeReview('Aborted', '#a31b1b');
    };
    actionsRow.appendChild(abortBtn);

    container.appendChild(actionsRow);

    // Insert the interactive prompt after the anchor card (original behavior).
    if (anchorCard && anchorCard.nextSibling) {
        insertParent.insertBefore(container, anchorCard.nextSibling);
    } else {
        insertParent.appendChild(container);
    }

    // This prompt blocks the workflow until the user responds, so force-scroll
    // it into view even if the user had scrolled away during streaming.
    try {
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {
        container.scrollIntoView();
    }
    // Briefly highlight to draw the user's attention
    const _origBoxShadow = container.style.boxShadow;
    container.style.boxShadow = '0 0 0 3px rgba(179, 107, 209, 0.55)';
    setTimeout(() => { container.style.boxShadow = _origBoxShadow; }, 1600);
}


// Read-only variant used when rehydrating a conversation from the DB.
// Renders the same review card (ideal source, selected source, confidence,
// rationale) but without any interactive buttons — the decision was already
// made during the original run.
function renderDataSourceSelectReviewReadOnly(rc) {
    const dataRequest = rc.data_request || '(unknown request)';
    const llmChoice = rc.llm_choice || 'Unknown';
    const llmExplanation = rc.llm_explanation || '';
    const idealSource = (rc.ideal_source || '').trim();
    const idealReasoning = (rc.ideal_source_reasoning || '').trim();
    const dataToDownload = rc.data_to_download || '';
    const confidence = Number(rc.confidence || 0);
    const isRecognized = rc.is_recognized !== false;
    const idealMatches = idealSource
        && idealSource.toLowerCase() === String(llmChoice).toLowerCase();

    const container = document.createElement('div');
    container.className = 'data-source-select-container data-source-select-readonly';
    container.style.cssText = 'border:1px solid #b36bd1; border-radius:8px; padding:14px; margin:10px 0; background:#faf5fd;';

    const headerEl = document.createElement('div');
    headerEl.style.cssText = 'display:flex; align-items:center; gap:8px; font-weight:700; margin-bottom:10px; color:#5e1f7a; font-size:13px;';
    const headerIcon = document.createElement('span');
    headerIcon.textContent = isRecognized ? '\u{1F4E5}' : '❓';
    const headerText = document.createElement('span');
    headerText.textContent = isRecognized
        ? 'Data Source Review'
        : 'Data Source Not Recognized';
    headerEl.appendChild(headerIcon);
    headerEl.appendChild(headerText);
    container.appendChild(headerEl);

    const reqEl = document.createElement('div');
    reqEl.style.cssText = 'margin-bottom:6px; font-size:13px; color:#3d1450;';
    const reqLabel = document.createElement('strong');
    reqLabel.textContent = 'Data request: ';
    reqEl.appendChild(reqLabel);
    reqEl.appendChild(document.createTextNode(String(dataRequest)));
    container.appendChild(reqEl);

    if (idealSource) {
        const idealRow = document.createElement('div');
        idealRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:13px; color:#3d1450; flex-wrap:wrap;';
        const idealLabel = document.createElement('strong');
        idealLabel.textContent = 'Ideal source (LLM suggestion): ';
        idealRow.appendChild(idealLabel);
        const idealSpan = document.createElement('span');
        idealSpan.style.cssText = 'color:#5e1f7a; font-weight:600;';
        idealSpan.textContent = idealSource;
        idealRow.appendChild(idealSpan);
        const matchTag = document.createElement('span');
        if (idealMatches) {
            matchTag.style.cssText = 'display:inline-block; padding:2px 8px; border-radius:10px; background:#d1e7dd; color:#0f5132; font-size:11px; font-weight:600;';
            matchTag.textContent = 'available ✓';
        } else {
            matchTag.style.cssText = 'display:inline-block; padding:2px 8px; border-radius:10px; background:#fff3cd; color:#664d03; font-size:11px; font-weight:600;';
            matchTag.textContent = 'not in handbooks → fallback';
        }
        idealRow.appendChild(matchTag);
        container.appendChild(idealRow);

        if (idealReasoning) {
            const idealReasonEl = document.createElement('div');
            idealReasonEl.style.cssText = 'margin:0 0 8px 0; font-size:12px; color:#66406e; font-style:italic;';
            idealReasonEl.textContent = `Why ideal: ${idealReasoning}`;
            container.appendChild(idealReasonEl);
        }
    }

    const choiceRow = document.createElement('div');
    choiceRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:13px; color:#3d1450; flex-wrap:wrap;';
    const choiceLabel = document.createElement('strong');
    choiceLabel.textContent = idealSource ? 'Selected (finalized): ' : 'Data source: ';
    choiceRow.appendChild(choiceLabel);
    const choiceSpan = document.createElement('span');
    choiceSpan.style.cssText = `color:${isRecognized ? '#1a6b2e' : '#a31b1b'}; font-weight:600;`;
    choiceSpan.textContent = String(llmChoice);
    choiceRow.appendChild(choiceSpan);
    if (!isRecognized) {
        const warn = document.createElement('span');
        warn.style.cssText = 'color:#a31b1b; font-size:12px;';
        warn.textContent = '(not in handbook)';
        choiceRow.appendChild(warn);
    }
    const confBadge = document.createElement('span');
    let confColor = '#6c757d', confBg = '#e9ecef';
    if (confidence >= 8) { confColor = '#0f5132'; confBg = '#d1e7dd'; }
    else if (confidence >= 5) { confColor = '#664d03'; confBg = '#fff3cd'; }
    else if (confidence > 0) { confColor = '#842029'; confBg = '#f8d7da'; }
    confBadge.style.cssText = `display:inline-block; padding:2px 10px; border-radius:10px; background:${confBg}; color:${confColor}; font-size:12px; font-weight:600;`;
    confBadge.textContent = `Confidence: ${confidence}/10`;
    choiceRow.appendChild(confBadge);
    container.appendChild(choiceRow);

    if (dataToDownload) {
        const dataEl = document.createElement('div');
        dataEl.style.cssText = 'margin-bottom:6px; font-size:13px; color:#3d1450;';
        const dataLabel = document.createElement('strong');
        dataLabel.textContent = 'Will download: ';
        dataEl.appendChild(dataLabel);
        dataEl.appendChild(document.createTextNode(String(dataToDownload)));
        container.appendChild(dataEl);
    }

    if (llmExplanation) {
        const explEl = document.createElement('div');
        explEl.style.cssText = 'margin-bottom:4px; font-size:12px; color:#66406e; font-style:italic;';
        explEl.textContent = `Rationale: ${String(llmExplanation)}`;
        container.appendChild(explEl);
    }

    return container;
}


// ── EDA Explore Approval (inline in explore section) ──────────────
function _displayExploreApproval(approvalSlot, data) {
    const question = data.question || 'The EDA agent needs your input.';
    const options = data.options || ['Yes', 'No'];

    approvalSlot.innerHTML = '';
    const container = document.createElement('div');
    container.style.cssText = 'border:1px solid #e0c36a; border-radius:8px; padding:12px; margin:8px 0; background:#fffbea;';

    const questionEl = document.createElement('div');
    questionEl.style.cssText = 'font-weight:600; margin-bottom:10px; color:#7a6c00; font-size:13px;';
    questionEl.textContent = question;
    container.appendChild(questionEl);

    // Hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,.xlsx,.xls,.gpkg,.shp,.geojson,.json,.zip';
    fileInput.style.display = 'none';
    container.appendChild(fileInput);

    const isUploadIntent = (text) => /\bupload\b|\bprovide.*file\b|\bload.*data\b|\bimport\b|\battach\b/i.test(text);

    const disableAll = () => {
        container.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
        if (customInput) { customInput.disabled = true; }
    };

    const uploadFile = async (file) => {
        disableAll();
        processSingleFile(file);
        const statusEl = document.createElement('div');
        statusEl.style.cssText = 'margin-top:6px; color:#7a6c00; font-size:12px;';
        statusEl.textContent = `Uploading ${file.name}...`;
        container.appendChild(statusEl);

        const formData = new FormData();
        formData.append('file', file);
        if (currentConversationId) formData.append('conversation_id', currentConversationId);
        try {
            const resp = await fetch(`${API_BASE_URL}/api/eda-explore-approval`, { method: 'POST', body: formData });
            const result = await resp.json();
            statusEl.textContent = result.success ? `${file.name} uploaded. Resuming...` : `Upload failed: ${result.error}`;
        } catch (e) {
            statusEl.textContent = `Upload error: ${e.message}`;
        }
        setTimeout(() => container.remove(), 2000);
    };

    fileInput.onchange = () => { if (fileInput.files && fileInput.files[0]) uploadFile(fileInput.files[0]); };

    const submitResponse = async (response) => {
        try {
            await fetch(`${API_BASE_URL}/api/eda-explore-approval`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ response }),
            });
        } catch (e) { console.error('[ExploreApproval] Failed:', e); }
    };

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px;';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.style.cssText = 'padding:6px 14px; border:1px solid #d4a800; border-radius:6px; background:#fff; color:#7a6c00; cursor:pointer; font-size:12px;';
        btn.onclick = async () => {
            if (isUploadIntent(opt)) { fileInput.click(); return; }
            disableAll();
            btn.style.background = '#d4a800'; btn.style.color = '#fff'; btn.style.opacity = '1';
            await submitResponse(opt);
            container.remove();
        };
        btnRow.appendChild(btn);
    });
    container.appendChild(btnRow);

    const customRow = document.createElement('div');
    customRow.style.cssText = 'display:flex; gap:6px; margin-top:6px;';
    var customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.placeholder = 'Or type a response...';
    customInput.style.cssText = 'flex:1; padding:6px 10px; border:1px solid #d4a800; border-radius:6px; font-size:12px;';
    const customBtn = document.createElement('button');
    customBtn.textContent = 'Send';
    customBtn.style.cssText = 'padding:6px 14px; border:1px solid #d4a800; border-radius:6px; background:#d4a800; color:#fff; cursor:pointer; font-size:12px;';
    customBtn.onclick = async () => {
        const val = customInput.value.trim();
        if (!val) return;
        if (isUploadIntent(val)) { fileInput.click(); return; }
        disableAll();
        await submitResponse(val);
        container.remove();
    };
    customInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') customBtn.click(); });
    customRow.appendChild(customInput);
    customRow.appendChild(customBtn);
    container.appendChild(customRow);

    approvalSlot.appendChild(container);
    smartScrollChat();
}


// ── Interactive Code Review ───────────────────────────────────────
// Injects code review UI into the current workflow card body
function displayCodeReview(data) {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send');
    const taskId = data.task_id || 'default';
    let currentCode = data.code || '';
    const stepIndex = data.step_index ?? '';
    const stepDesc = data.step_description || 'Generated Code';
    const agentName = data.agent_name || 'Agent';
    const stepTag = data.step || '';

    addLog(`[AGM] Code review requested for step ${stepIndex}: ${stepDesc}`, 'info');
    console.log('[displayCodeReview] data:', JSON.stringify({taskId, stepTag, stepIndex, stepDesc, codeLen: currentCode.length}));
    console.log('[displayCodeReview] _wfCurrentPhase:', _wfCurrentPhase, '_wfCardsContainer:', !!_wfCardsContainer);

    // ── Find or create the target card in the workflow container ──
    const phase = stepTag ? _getPhase(stepTag) : _wfCurrentPhase;
    console.log('[displayCodeReview] resolved phase:', phase);

    if (!phase || !_wfCardsContainer) {
        updateWorkflowCard(`Code review: ${stepDesc}`, stepTag || 'objective_execution');
    }
    const cardPhase = phase || _wfCurrentPhase;
    let card = _wfCardsContainer ? _wfCardsContainer.querySelector(`#wf-card-${cardPhase}`) : null;
    if (!card) {
        updateWorkflowCard(`Code review: ${stepDesc}`, stepTag || 'objective_execution');
        card = _wfCardsContainer ? _wfCardsContainer.querySelector(`#wf-card-${_wfCurrentPhase}`) : null;
    }
    console.log('[displayCodeReview] card found:', !!card, 'cardPhase:', cardPhase);

    if (!card) {
        // Last resort fallback: if we still can't find a card, log error and bail
        console.error('[displayCodeReview] Could not find or create workflow card');
        addLog(`[Error] Code review: could not find workflow card for phase "${cardPhase}"`, 'error');
        return;
    }

    // Expand the card if collapsed so user can see the code
    card.classList.remove('collapsed');
    const toggleEl = card.querySelector('.wf-card-toggle');
    if (toggleEl) toggleEl.innerHTML = '&#9660;';

    // Get or create the card body
    let body = card.querySelector('.wf-card-body');
    if (!body) {
        body = document.createElement('div');
        body.className = 'wf-card-body';
        card.appendChild(body);
        _makeCardCollapsible(card);
    }

    // Clear previous streaming text and mark body for code review styling
    body.innerHTML = '';
    body.classList.add('code-review-body');

    // Show debug fix banner if this is a debugger repair
    const isDebugFix = stepDesc.startsWith('[DEBUG FIX]');
    if (isDebugFix) {
        const debugBanner = document.createElement('div');
        debugBanner.className = 'code-review-debug-banner';
        debugBanner.innerHTML = '<strong>Debugger Fix</strong> — The previous code failed. Review the debugger\'s fix below.';
        body.appendChild(debugBanner);
    }

    // ── Code review container ──
    const container = document.createElement('div');
    container.className = 'code-review-container';
    if (isDebugFix) container.classList.add('debug-fix');

    // Highlighted code view (default)
    const codeView = document.createElement('pre');
    codeView.className = 'code-review-view';
    const codeBlock = document.createElement('code');
    codeBlock.className = 'language-python';
    codeBlock.textContent = currentCode;
    codeView.appendChild(codeBlock);
    if (window.hljs) hljs.highlightElement(codeBlock);

    // Textarea editor (hidden until Edit is clicked)
    const editor = document.createElement('textarea');
    editor.className = 'code-review-editor';
    editor.value = currentCode;
    editor.spellcheck = false;
    editor.style.display = 'none';

    // Helper: re-highlight the code view with current code
    function refreshHighlight() {
        codeBlock.textContent = currentCode;
        codeBlock.classList.remove('hljs');
        if (window.hljs) hljs.highlightElement(codeBlock);
    }

    // ── Action buttons ──
    const actions = document.createElement('div');
    actions.className = 'code-review-actions';

    const runBtn = document.createElement('button');
    runBtn.className = 'btn-run-code';
    runBtn.textContent = 'Run Code';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-edit-code';
    editBtn.textContent = 'Edit Code';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-save-code';
    saveBtn.textContent = 'Save';
    saveBtn.style.display = 'none';

    const regenBtn = document.createElement('button');
    regenBtn.className = 'btn-regenerate';
    regenBtn.textContent = 'Regenerate';

    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn-skip-step';
    skipBtn.textContent = 'Skip Step';

    // Edit Code — swap to textarea
    editBtn.onclick = () => {
        editor.value = currentCode;
        codeView.style.display = 'none';
        editor.style.display = '';
        editor.focus();
        editBtn.style.display = 'none';
        saveBtn.style.display = '';
        addLog(`[User] Editing code for step ${stepIndex}`, 'info');
    };

    // Save — swap back to highlighted view
    saveBtn.onclick = () => {
        currentCode = editor.value;
        editor.style.display = 'none';
        codeView.style.display = '';
        refreshHighlight();
        saveBtn.style.display = 'none';
        editBtn.style.display = '';
        addLog(`[User] Saved code edits for step ${stepIndex}`, 'info');
    };

    // After user takes action, clear the code review UI and re-enable streaming
    function disableReviewButtons(msg) {
        // Grab code from editor if open
        if (editor.style.display !== 'none') {
            currentCode = editor.value;
        }

        // Replace the code review UI with a status message, then allow streaming to resume
        body.innerHTML = '';
        body.classList.remove('code-review-body');
        body.textContent = msg + '\n';
    }

    // Run Code — approve with current (possibly edited) code
    runBtn.onclick = async () => {
        if (editor.style.display !== 'none') currentCode = editor.value;
        disableReviewButtons('Running...');
        addLog(`[User] Approved code for step ${stepIndex}`, 'info');
        try {
            await fetch(`${API_BASE_URL}/api/workflow/code-review/${taskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'approve', code: currentCode })
            });
        } catch (e) {
            addLog(`[Error] Code review submit failed: ${e.message}`, 'error');
        }
    };

    // Regenerate — activate feedback mode so the next chat message becomes feedback
    regenBtn.onclick = () => {
        if (editor.style.display !== 'none') currentCode = editor.value;
        disableReviewButtons('Waiting for feedback...');
        addLog(`[User] Requesting code regeneration for step ${stepIndex}`, 'info');

        _codeReviewFeedback = { taskId, stepIndex, stepDesc };

        if (chatInput) {
            chatInput.disabled = false;
            chatInput.placeholder = `Enter feedback for step ${stepIndex}: ${stepDesc}...`;
            chatInput.focus();
        }
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.classList.remove('interrupt', 'loading');
            sendBtn.title = 'Send feedback';
        }

        activateFeedbackMode('code_review', taskId, null, { stepIndex, stepDesc });
    };

    // Skip Step
    skipBtn.onclick = async () => {
        disableReviewButtons('Skipped');
        addLog(`[User] Skipped step ${stepIndex}`, 'info');
        try {
            await fetch(`${API_BASE_URL}/api/workflow/code-review/${taskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'skip' })
            });
        } catch (e) {
            addLog(`[Error] Code review submit failed: ${e.message}`, 'error');
        }
    };

    actions.appendChild(runBtn);
    actions.appendChild(editBtn);
    actions.appendChild(saveBtn);
    actions.appendChild(regenBtn);
    actions.appendChild(skipBtn);

    container.appendChild(codeView);
    container.appendChild(editor);
    container.appendChild(actions);

    body.appendChild(container);

    // Scroll to the card
    const chatMessages = document.getElementById('chat-messages');
    smartScrollChat();

    // Disable chat input while code review is active
    if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = 'Review the generated code above — Run, Regenerate, or Skip to continue';
    }
    if (sendBtn) sendBtn.disabled = true;
}

// ── Step Result Display ──────────────────────────────────────────
// Shows step execution results (output + artifacts) inside the workflow card
/**
 * Render checkpoint body content: summary counts, steps table, and action buttons.
 * Shared by both the live displayExecutionCheckpoint and the rebuild path.
 */
function _renderCheckpointBody(body, steps, taskId) {
    body.innerHTML = '';

    // Count statuses
    const completed = steps.filter(s => s.status === 'completed').length;
    const errors = steps.filter(s => s.status === 'error').length;
    const skipped = steps.filter(s => s.status === 'skipped').length;
    const total = steps.length;

    // Summary header
    const summaryHeader = document.createElement('div');
    summaryHeader.className = 'checkpoint-summary-header';
    let summaryHtml = `
        <span class="checkpoint-count completed">${completed} Completed</span>
        <span class="checkpoint-count error">${errors} Error${errors !== 1 ? 's' : ''}</span>
    `;
    if (skipped > 0) {
        summaryHtml += `<span class="checkpoint-count skipped">${skipped} Skipped</span>`;
    }
    summaryHtml += `<span class="checkpoint-count total">${total} Total</span>`;
    summaryHeader.innerHTML = summaryHtml;
    body.appendChild(summaryHeader);

    // Steps table
    const table = document.createElement('table');
    table.className = 'checkpoint-table';
    table.innerHTML = `<thead><tr>
        <th>Step</th><th>Description</th><th>Status</th>
    </tr></thead>`;
    const tbody = document.createElement('tbody');
    steps.forEach(s => {
        const tr = document.createElement('tr');
        const statusClass = s.status === 'completed' ? 'success' : (s.status === 'skipped' ? 'skipped' : (s.status === 'error' ? 'error' : ''));
        const statusLabel = s.status === 'completed' ? 'Completed' : (s.status === 'skipped' ? 'Skipped' : (s.status === 'error' ? 'Error' : s.status));
        tr.innerHTML = `
            <td><a class="checkpoint-step-link" href="#" data-card-id="wf-card-exec_obj${s.objective}_step${s.step_index}">Obj ${s.objective} - Step ${s.step_index}</a></td>
            <td class="checkpoint-desc">${s.description || ''}</td>
            <td><span class="wf-card-badge ${statusClass}">${statusLabel}</span></td>
        `;
        if (s.error) tr.title = s.error;
        // Click on the step link scrolls to and highlights the step card
        const link = tr.querySelector('.checkpoint-step-link');
        if (link) {
            link.onclick = (e) => {
                e.preventDefault();
                _scrollToStepCard(`exec_obj${s.objective}_step${s.step_index}`);
            };
        }
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'rp-controls checkpoint-actions';

    const proceedBtn = document.createElement('button');
    proceedBtn.className = 'rp-btn-approve';
    proceedBtn.textContent = '✓ Proceed to Result Analysis';
    proceedBtn.onclick = async () => {
        const tid = taskId || window._completedTaskId || '';
        if (!tid) {
            addLog('[Error] Cannot proceed — no task_id available. Try reloading the page or selecting the conversation again.', 'error');
            addChatMessage('Cannot proceed to Result Analysis: task_id is missing. Reload the page or reselect this conversation, then click the button again.', 'agm');
            return;  // leave button enabled so user can retry after reload
        }

        proceedBtn.disabled = true;
        updateBtn.disabled = true;
        proceedBtn.style.opacity = '0.6';
        updateBtn.style.opacity = '0.6';

        // First try the queue-based approach — but only if a live SSE stream
        // is actually being consumed by the frontend right now. Otherwise the
        // backend happily accepts queued=true and runs the pipeline, but all
        // events vanish because no fetch() reader is attached (the original
        // generator that owned the queue already returned). That produces
        // the "streams to backend but not to the WebUI" symptom after reload.
        let handledByLiveStream = false;
        const hasLiveConsumer = !!activeAbortController;
        if (hasLiveConsumer) {
            try {
                const resp = await fetch(`${API_BASE_URL}/api/workflow/checkpoint/${tid}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'proceed' }),
                });
                if (resp.ok) {
                    const result = await resp.json();
                    if (result.queued) {
                        handledByLiveStream = true;
                        addLog('[User] Proceed action queued to live stream.', 'info');
                    }
                }
            } catch (e) {
                addLog(`[Warn] Checkpoint endpoint failed (${e.message}); falling back to standalone rerun.`, 'warn');
            }
        }

        if (handledByLiveStream) {
            // Re-enable the button after a short delay so the user isn't stuck
            // if the live stream is dead and never sends updates back.
            setTimeout(() => {
                proceedBtn.disabled = false;
                proceedBtn.style.opacity = '1';
                updateBtn.disabled = false;
                updateBtn.style.opacity = '1';
            }, 5000);
            return;
        }

        // Fallback: no live stream (e.g. browser reload) — call rerun-analysis directly
        addLog('[User] Proceeding to result analysis (standalone rerun)...', 'info');
        addChatMessage('Rerunning Result Analysis → Manuscript pipeline...', 'agm');
        proceedBtn.textContent = '⏳ Running Result Analysis...';

        // Start the rerun in a FRESH AGM bubble so its cards don't mingle
        // with the prior workflow's cards. Finalize the current phase's
        // card first (drop spinner), then clear the container reference —
        // the next updateWorkflowCard() call will auto-create a new bubble
        // via _ensureCardsContainer(). Existing cards above (checkpoint,
        // execution, plan, EDA) stay intact in their original bubble.
        try { if (typeof _finalizeCard === 'function' && _wfCurrentPhase) _finalizeCard(_wfCurrentPhase); } catch {}
        _wfCardsContainer = null;
        _wfCurrentPhase = null;
        try {
            const abortCtrl = startInterruptableStream();
            const res = await fetch(`${API_BASE_URL}/api/workflow/rerun-analysis/${tid}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation_id: currentConversationId }),
                signal: abortCtrl.signal,
            });
            addLog(`[Debug] rerun-analysis response: ${res.status} ${res.headers.get('content-type') || ''}`, 'info');
            if (res.status === 409) {
                // Another rerun for the same task is already in flight.
                // Surface it instead of dumping raw JSON to the user.
                let detail = '';
                try { const j = await res.json(); detail = j.message || ''; } catch {}
                addLog(`[Warn] ${detail || 'A rerun is already running for this task.'}`, 'warn');
                addChatMessage(detail || 'A rerun is already running for this task — wait for it to finish.', 'agm');
                stopInterruptableStream();
                return;
            }
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(`rerun-analysis HTTP ${res.status}: ${txt.slice(0, 200)}`);
            }
            if (!res.body) {
                throw new Error('rerun-analysis returned no response body (cannot stream)');
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let eventCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const update = JSON.parse(line.substring(6));
                        eventCount++;
                        if (eventCount === 1) {
                            addLog(`[Debug] First SSE event received: ${update.type}`, 'info');
                        }
                        if (update.type === 'status') {
                            updateWorkflowCard(update.message || update.content, update.step || 'general');
                            addLog(`[AGM] ${update.message || update.content}`, 'info');
                        } else if (update.type === 'llm_update') {
                            updateWorkflowCard(update.content, update.step);
                            addLog(`[AGM] ${update.content}`, 'info');
                        } else if (update.type === 'llm_stream') {
                            appendToWorkflowCard(update.content, update.step);
                        } else if (update.type === 'figure_catalog') {
                            displayFigureCatalog(update.figures || [], update.step);
                        } else if (update.type === 'execution_flowchart') {
                            displayExecutionFlowchart(update.relative_path, update.step);
                        } else if (update.type === 'result_presentation') {
                            displayMarkdownResult('Result Presentation', '', update.content, update.relative_path, update.step);
                        } else if (update.type === 'result_discussion') {
                            displayMarkdownResult('Result Discussion', '', update.content, update.relative_path, update.step);
                        } else if (update.type === 'manuscript_section') {
                            displayMarkdownResult(`Manuscript: ${update.section}`, '', update.content, update.relative_path, update.step);
                        } else if (update.type === 'manuscript_complete') {
                            displayMarkdownResult('Full Manuscript', '', update.content, update.relative_path, update.step);
                        } else if (update.type === 'result') {
                            addLog('[AGM] Result analysis complete', 'success');
                            addChatMessage(update.response || 'Result analysis complete.', 'agm');
                        } else if (update.type === 'error') {
                            addLog(`[Error] ${update.error}`, 'error');
                            addChatMessage(`Error: ${update.error}`, 'agm');
                        }
                    } catch (e) { /* skip */ }
                }
            }
            stopInterruptableStream();
        } catch (e) {
            stopInterruptableStream();
            if (e.name === 'AbortError') return;
            addLog(`[Error] Result analysis failed: ${e.message}`, 'error');
            addChatMessage(`Error during result analysis: ${e.message}`, 'agm');
        } finally {
            proceedBtn.disabled = false;
            proceedBtn.style.opacity = '1';
            proceedBtn.textContent = '✓ Proceed to Result Analysis';
            updateBtn.disabled = false;
            updateBtn.style.opacity = '1';
        }
    };

    const updateBtn = document.createElement('button');
    updateBtn.className = 'rp-btn-reexecute';
    updateBtn.textContent = '🔄 Update Status';
    updateBtn.onclick = async () => {
        updateBtn.disabled = true;
        updateBtn.style.opacity = '0.6';
        const tid = taskId || window._completedTaskId || '';
        if (!tid) return;
        try {
            const resp = await fetch(`${API_BASE_URL}/api/workflow/steps/${tid}`);
            if (resp.ok) {
                const stepsData = await resp.json();
                // Rebuild table from fresh step data
                const freshSteps = _convertStepsToCheckpointFormat(stepsData);
                _renderCheckpointBody(body, freshSteps, tid);
            }
        } catch (e) { console.error('Checkpoint update failed:', e); }
        updateBtn.disabled = false;
        updateBtn.style.opacity = '1';
    };

    actions.appendChild(proceedBtn);
    actions.appendChild(updateBtn);
    body.appendChild(actions);
}

/**
 * Convert the /api/workflow/steps response into the checkpoint summary format.
 * The API returns {steps: [{objective_key, step_index, status, ...}], task_id}.
 */
function _convertStepsToCheckpointFormat(stepsData) {
    const result = [];
    const steps = stepsData.steps || [];
    for (const step of steps) {
        const objKey = step.objective_key || '';
        const objNum = objKey.replace('objective_', '');
        result.push({
            objective: objNum,
            step_index: step.step_index || step.step_number || '?',
            description: step.step_description || step.description || '',
            status: step.status || 'unknown',
            error: (step.error || '').substring(0, 200),
        });
    }
    return result;
}


/**
 * Display the execution checkpoint card — summarizes step statuses and
 * lets the user Proceed to result analysis or Update Status after re-runs.
 */
function displayExecutionCheckpoint(data) {
    const taskId = data.task_id || window._completedTaskId || '';
    const steps = data.steps || [];

    // Create or reuse a checkpoint card
    updateWorkflowCard('Execution Summary', 'execution_checkpoint');

    const phase = _getPhase('execution_checkpoint');
    if (!phase || !_wfCardsContainer) return;
    const card = _wfCardsContainer.querySelector(`#wf-card-${phase}`);
    if (!card) return;

    // Stop spinner, show check
    const spinner = card.querySelector('.step-spinner');
    const check = card.querySelector('.step-check');
    if (spinner) spinner.style.display = 'none';
    if (check) check.style.display = 'inline';
    card.classList.remove('active');

    let body = card.querySelector('.wf-card-body');
    if (!body) {
        body = document.createElement('div');
        body.className = 'wf-card-body';
        card.appendChild(body);
        _makeCardCollapsible(card);
    }
    body.classList.add('step-result-body');

    // Expand card
    card.classList.remove('collapsed');
    const toggle = card.querySelector('.wf-card-toggle');
    if (toggle) toggle.innerHTML = '&#9660;';

    _renderCheckpointBody(body, steps, taskId);
    smartScrollChat();

    // Autonomous Mode: log that checkpoint will be auto-proceeded by backend
    const autoToggle = document.getElementById('autonomous-mode-toggle');
    if (autoToggle && autoToggle.checked) {
        addLog('[AGM] Autonomous mode — auto-proceeding to result analysis', 'info');
    }
}

function displayStepResult(data) {
    const stepTag = data.step || '';
    const artifacts = data.artifacts || [];
    const output = data.output || '';
    const stepStatus = data.status || 'unknown';
    const stepIdx = data.step_index ?? '';
    const stepDesc = data.step_description || '';
    const errorMsg = data.error || '';

    const visibleArtifacts = artifacts.filter(a => !a.is_shapefile_component);
    addLog(`[AGM] Step ${stepIdx} result: ${stepStatus}, ${visibleArtifacts.length} file(s)`, 'info');

    // Find the workflow card for this step
    const phase = stepTag ? _getPhase(stepTag) : _wfCurrentPhase;
    const cardPhase = phase || _wfCurrentPhase;
    if (!cardPhase || !_wfCardsContainer) return;
    const card = _wfCardsContainer.querySelector(`#wf-card-${cardPhase}`);
    if (!card) return;

    // Add status badge to card header
    const cardHeader = card.querySelector('.wf-card-header');
    if (cardHeader) {
        let badge = cardHeader.querySelector('.wf-card-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'wf-card-badge';
            cardHeader.appendChild(badge);
        }
        const badgeClass = stepStatus === 'completed' ? 'success' : (stepStatus === 'skipped' ? 'skipped' : 'error');
        const badgeText = stepStatus === 'completed' ? 'Completed' : (stepStatus === 'skipped' ? 'Skipped' : 'Error');
        badge.className = `wf-card-badge ${badgeClass}`;
        badge.textContent = badgeText;
    }

    // Get or create body
    let body = card.querySelector('.wf-card-body');
    if (!body) {
        body = document.createElement('div');
        body.className = 'wf-card-body';
        card.appendChild(body);
        _makeCardCollapsible(card);
    }

    // If body has code-review-body class, remove it to allow normal content
    body.classList.remove('code-review-body');
    // Allow step results to expand beyond default max-height
    body.classList.add('step-result-body');

    // Wrap existing raw text into two distinct sections within the same card:
    // Section 1: Execution log (streaming status text)
    // Section 2: Generated code only (syntax-highlighted)
    const rawText = body.textContent.trim();
    const eventCode = data.code || '';
    if (rawText && !body.querySelector('.wf-stream-log')) {
        body.innerHTML = '';

        // Try to extract ```python ... ``` code block from the streamed text
        const codeMatch = rawText.match(/```python\s*([\s\S]*?)```/);
        const codeContent = codeMatch ? codeMatch[1].trim() : '';
        // Prefer the step_result event code (authoritative — may be debugger-fixed),
        // fall back to code extracted from the stream text
        const displayCode = eventCode || codeContent;

        if (displayCode) {
            // Compute status text: everything except the code block
            let statusText = rawText;
            if (codeMatch) {
                const beforeCode = rawText.substring(0, codeMatch.index).trim();
                const afterCode = rawText.substring(codeMatch.index + codeMatch[0].length).trim();
                statusText = [beforeCode, afterCode].filter(Boolean).join('\n');
            }

            // === Section 1: Execution Log ===
            if (statusText) {
                const streamSection = document.createElement('div');
                streamSection.className = 'wf-result-stream-section';
                const streamHeader = document.createElement('div');
                streamHeader.className = 'wf-section-header';
                streamHeader.innerHTML = '<span class="wf-section-toggle">&#9656;</span> Execution Log';
                streamHeader.style.cursor = 'pointer';
                streamHeader.onclick = () => streamSection.classList.toggle('collapsed');
                streamSection.appendChild(streamHeader);

                const statusDiv = document.createElement('div');
                statusDiv.className = 'wf-stream-status wf-section-content';
                statusDiv.textContent = statusText;
                streamSection.appendChild(statusDiv);

                streamSection.classList.add('collapsed');
                body.appendChild(streamSection);
            }

            // === Section 2: Generated Code ===
            const codeSection = document.createElement('div');
            codeSection.className = 'wf-result-code-section';
            const codeHeader = document.createElement('div');
            codeHeader.className = 'wf-section-header';
            codeHeader.innerHTML = '<span class="wf-section-icon">&#128221;</span> Generated Code';
            codeSection.appendChild(codeHeader);

            const codeContainer = document.createElement('pre');
            codeContainer.className = 'wf-stream-code';
            const codeEl = document.createElement('code');
            codeEl.className = 'language-python';
            codeEl.textContent = displayCode;
            codeContainer.appendChild(codeEl);
            codeSection.appendChild(codeContainer);
            if (window.hljs) hljs.highlightElement(codeEl);
            attachCopyCodeButton(codeHeader, () => codeEl.textContent);

            body.appendChild(codeSection);
        } else {
            // No code found in stream or event — wrap as streaming log only
            const streamSection = document.createElement('div');
            streamSection.className = 'wf-result-stream-section';
            const streamHeader = document.createElement('div');
            streamHeader.className = 'wf-section-header';
            streamHeader.innerHTML = '<span class="wf-section-toggle">&#9656;</span> Execution Log';
            streamHeader.style.cursor = 'pointer';
            streamHeader.onclick = () => streamSection.classList.toggle('collapsed');
            streamSection.appendChild(streamHeader);

            const pre = document.createElement('pre');
            pre.className = 'wf-stream-log wf-section-content';
            pre.textContent = rawText;
            streamSection.appendChild(pre);

            streamSection.classList.add('collapsed');
            body.appendChild(streamSection);
        }
    } else if (!rawText && eventCode) {
        // No streaming text but code provided in event — show code section only
        const codeSection = document.createElement('div');
        codeSection.className = 'wf-result-code-section';
        const codeHeader = document.createElement('div');
        codeHeader.className = 'wf-section-header';
        codeHeader.innerHTML = '<span class="wf-section-icon">&#128221;</span> Generated Code';
        codeSection.appendChild(codeHeader);

        const codeContainer = document.createElement('pre');
        codeContainer.className = 'wf-stream-code';
        const codeEl = document.createElement('code');
        codeEl.className = 'language-python';
        codeEl.textContent = eventCode;
        codeContainer.appendChild(codeEl);
        codeSection.appendChild(codeContainer);
        if (window.hljs) hljs.highlightElement(codeEl);
        attachCopyCodeButton(codeHeader, () => codeEl.textContent);

        body.appendChild(codeSection);
    }

    // Create result section
    const resultDiv = document.createElement('div');
    resultDiv.className = 'step-result-section';

    // Header row: step label + status badge
    const headerRow = document.createElement('div');
    headerRow.className = 'step-result-header';

    const stepLabel = document.createElement('span');
    stepLabel.className = 'step-result-label';
    stepLabel.textContent = stepDesc ? `Step ${stepIdx}: ${stepDesc}` : `Step ${stepIdx}`;
    headerRow.appendChild(stepLabel);

    const statusBadge = document.createElement('span');
    const statusClass = stepStatus === 'completed' ? 'success' : (stepStatus === 'skipped' ? 'skipped' : 'error');
    const statusText = stepStatus === 'completed' ? 'Completed' : (stepStatus === 'skipped' ? 'Skipped' : 'Error');
    statusBadge.className = `step-result-status ${statusClass}`;
    statusBadge.textContent = statusText;
    headerRow.appendChild(statusBadge);

    // Add "Explore More" button for EDA step results
    if (stepTag === 'eda' && stepStatus === 'completed') {
        const exploreBtn = document.createElement('button');
        exploreBtn.textContent = 'Explore More';
        exploreBtn.style.cssText = 'margin-left:auto; padding:4px 12px; border:1px solid #4a90d9; border-radius:4px; background:#f0f6ff; color:#2a6cb6; cursor:pointer; font-size:12px; transition:background 0.2s;';
        exploreBtn.onmouseenter = () => exploreBtn.style.background = '#d6e7fc';
        exploreBtn.onmouseleave = () => exploreBtn.style.background = '#f0f6ff';
        exploreBtn.onclick = () => {
            // body = the .wf-card-body of the EDA card
            // Toggle — remove existing explore section if present
            const existing = body.querySelector('.eda-explore-section');
            if (existing) {
                existing.remove();
                return;
            }

            // Create explore section as a sibling of resultDiv inside the card body
            const exploreSection = document.createElement('div');
            exploreSection.className = 'eda-explore-section step-result-section';

            // Header row mimicking step-result-header
            const exploreHeader = document.createElement('div');
            exploreHeader.className = 'step-result-header';

            const exploreLabel = document.createElement('span');
            exploreLabel.className = 'step-result-label';
            exploreLabel.textContent = 'Explore Data';
            exploreHeader.appendChild(exploreLabel);

            const exploreSpinner = document.createElement('span');
            exploreSpinner.className = 'step-spinner';
            exploreSpinner.style.display = 'none';
            exploreHeader.appendChild(exploreSpinner);

            exploreSection.appendChild(exploreHeader);

            // Input row
            const inputRow = document.createElement('div');
            inputRow.style.cssText = 'display:flex; gap:8px; align-items:center;';

            const edaInput = document.createElement('input');
            edaInput.type = 'text';
            edaInput.placeholder = 'e.g. "Show distribution of income" or "Scatter plot of X vs Y"';
            edaInput.style.cssText = 'flex:1; padding:8px 12px; border:1px solid #d0d7de; border-radius:4px; font-size:13px; font-family:inherit;';

            const edaRunBtn = document.createElement('button');
            edaRunBtn.textContent = 'Run';
            edaRunBtn.style.cssText = 'padding:8px 16px; border:none; border-radius:4px; background:#4a90d9; color:#fff; cursor:pointer; font-size:13px; white-space:nowrap;';

            inputRow.appendChild(edaInput);
            inputRow.appendChild(edaRunBtn);
            exploreSection.appendChild(inputRow);

            // Streaming body (accumulates LLM stream chunks like the main EDA card)
            const streamBody = document.createElement('div');
            streamBody.className = 'eda-explore-stream-body';
            exploreSection.appendChild(streamBody);

            // Approval container slot (for interactive approval cards)
            const approvalSlot = document.createElement('div');
            approvalSlot.className = 'eda-explore-approval-slot';
            exploreSection.appendChild(approvalSlot);

            // Artifacts area (populated on completion)
            const artifactsArea = document.createElement('div');
            artifactsArea.className = 'eda-explore-artifacts';
            exploreSection.appendChild(artifactsArea);

            edaRunBtn.onclick = async () => {
                const task = edaInput.value.trim();
                if (!task) return;
                edaInput.disabled = true;
                edaRunBtn.disabled = true;
                edaRunBtn.style.opacity = '0.7';
                exploreSpinner.style.display = '';
                exploreLabel.textContent = task;
                // Clear previous results
                streamBody.innerHTML = '';
                approvalSlot.innerHTML = '';
                artifactsArea.innerHTML = '';

                addLog(`[User] Additional EDA: ${task}`, 'info');

                try {
                    const resp = await fetch(`${API_BASE_URL}/api/eda-explore`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ task }),
                    });

                    const reader = resp.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });

                        const lines = buffer.split('\n');
                        buffer = lines.pop(); // keep incomplete line

                        for (const line of lines) {
                            if (!line.startsWith('data: ')) continue;
                            let evt;
                            try {
                                evt = JSON.parse(line.slice(6));
                            } catch { continue; }

                            if (evt.type === 'llm_stream') {
                                // Append streamed content
                                const chunk = evt.content || '';
                                // Find or create the current streaming pre
                                let pre = streamBody.querySelector('.wf-stream-log:last-child');
                                if (!pre) {
                                    pre = document.createElement('pre');
                                    pre.className = 'wf-stream-log';
                                    streamBody.appendChild(pre);
                                }
                                pre.textContent += chunk;
                                smartScrollChat();

                            } else if (evt.type === 'eda_approval') {
                                // Interactive approval card
                                _displayExploreApproval(approvalSlot, evt, edaInput, edaRunBtn);

                            } else if (evt.type === 'eda_explore_complete') {
                                // Final artifacts
                                if (evt.artifacts && evt.artifacts.length > 0) {
                                    const grid = document.createElement('div');
                                    grid.className = 'step-result-artifacts-grid';
                                    grid.style.marginTop = '8px';

                                    evt.artifacts.forEach(artifact => {
                                        const tile = document.createElement('div');
                                        tile.className = 'step-artifact-card';
                                        let icon = '📄';
                                        const t = (artifact.type || '').toLowerCase();
                                        if (t === 'png' || t === 'jpg' || t === 'jpeg') icon = '🖼️';
                                        else if (t === 'csv') icon = '📊';
                                        else if (t === 'gpkg' || t === 'shp') icon = '🗺️';
                                        else if (t === 'json' || t === 'geojson') icon = '📋';
                                        else if (t === 'html') icon = '🌐';
                                        const sizeKB = (artifact.size / 1024).toFixed(1);
                                        tile.innerHTML = `
                                            <span class="artifact-icon">${icon}</span>
                                            <span class="artifact-name" title="${artifact.filename}">${artifact.filename}</span>
                                            <span class="artifact-size">${sizeKB} KB</span>
                                        `;
                                        tile.addEventListener('click', () => previewArtifact(artifact));
                                        grid.appendChild(tile);
                                    });
                                    artifactsArea.appendChild(grid);

                                    if (window.currentArtifacts) {
                                        window.currentArtifacts.push(...evt.artifacts);
                                    } else {
                                        window.currentArtifacts = [...evt.artifacts];
                                    }
                                }
                                addLog(`[AGM] Additional EDA completed`, 'success');

                            } else if (evt.type === 'error') {
                                const errEl = document.createElement('div');
                                errEl.className = 'step-result-error';
                                errEl.textContent = evt.error || 'EDA explore failed';
                                streamBody.appendChild(errEl);
                                addLog(`[Error] EDA explore failed: ${evt.error}`, 'error');
                            }
                        }
                    }
                } catch (e) {
                    const errEl = document.createElement('div');
                    errEl.className = 'step-result-error';
                    errEl.textContent = e.message;
                    streamBody.appendChild(errEl);
                    console.error('[EDA Explore] Failed:', e);
                    addLog(`[Error] EDA explore failed: ${e.message}`, 'error');
                }

                exploreSpinner.style.display = 'none';
                edaInput.disabled = false;
                edaInput.value = '';
                edaRunBtn.disabled = false;
                edaRunBtn.style.opacity = '1';
                exploreLabel.textContent = 'Explore Data';
            };

            edaInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') edaRunBtn.click();
            });

            // Append as sibling of resultDiv inside the card body
            body.appendChild(exploreSection);
            edaInput.focus();
            smartScrollChat();
        };
        headerRow.appendChild(exploreBtn);
    }

    resultDiv.appendChild(headerRow);

    // Error message if any
    if (errorMsg) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'step-result-error';
        errorDiv.textContent = errorMsg;
        resultDiv.appendChild(errorDiv);
    }

    // Tiles grid — output tile + artifact tiles
    // Stamp _v once at render time so repeated tile clicks share a cached
    // URL, while each new step_result event produces a fresh stamp that
    // invalidates any stale copy the browser had for the same relative_path.
    const _artifactStamp = Date.now();
    artifacts.forEach(a => { if (!a._v) a._v = _artifactStamp; });
    const hasTiles = (output && output.trim()) || visibleArtifacts.length > 0;
    if (hasTiles) {
        const grid = document.createElement('div');
        grid.className = 'step-result-artifacts-grid';

        // Output tile (clickable — shows full output in Results & Artifacts panel)
        if (output && output.trim()) {
            const outputTile = document.createElement('div');
            outputTile.className = 'step-artifact-card step-output-tile';
            outputTile.innerHTML = `
                <span class="artifact-icon">📝</span>
                <span class="artifact-name" title="Click to view full output">Console Output</span>
                <span class="artifact-size">${output.length} chars</span>
            `;
            outputTile.addEventListener('click', () => {
                showOutputInResultsPanel(stepIdx, stepDesc, output, stepStatus, errorMsg);
            });
            grid.appendChild(outputTile);
        }

        // Artifact tiles
        visibleArtifacts.forEach(artifact => {
            const tile = document.createElement('div');
            tile.className = 'step-artifact-card';

            // Icon based on type
            let icon = '📄';
            const t = (artifact.type || '').toLowerCase();
            if (t === 'png' || t === 'jpg' || t === 'jpeg') icon = '🖼️';
            else if (t === 'csv') icon = '📊';
            else if (t === 'html') icon = '🌐';
            else if (t === 'json' || t === 'geojson') icon = '📋';
            else if (t === 'gpkg' || t === 'shp') icon = '🗺️';
            else if (t === 'txt' || t === 'md') icon = '📝';
            else if (t === 'npy') icon = '🔢';

            const sizeKB = (artifact.size / 1024).toFixed(1);
            const displayName = getDisplayName(artifact.filename);

            tile.innerHTML = `
                <span class="artifact-icon">${icon}</span>
                <span class="artifact-name" title="${artifact.filename}">${displayName}</span>
                <span class="artifact-size">${sizeKB} KB</span>
            `;

            // Click to preview in Results & Artifacts panel
            tile.addEventListener('click', () => {
                previewArtifact(artifact);
            });

            grid.appendChild(tile);
        });

        resultDiv.appendChild(grid);

        // Track artifacts globally
        if (visibleArtifacts.length > 0) {
            if (window.currentArtifacts) {
                window.currentArtifacts.push(...artifacts);
            } else {
                window.currentArtifacts = [...artifacts];
            }
        }
    }

    // Inline edit buttons on the EXISTING wf-stream-code block
    const stepCode = data.code || '';
    const objKey = data.objective_key || '';
    const statusNorm = (stepStatus || '').toLowerCase();
    if (!stepCode && objKey && (statusNorm === 'skipped' || statusNorm === 'error')) {
        // Step has no generated code (skipped upstream, or errored before code-gen).
        // Offer Re-execute / Provide Feedback so the user can retry.
        _buildMinimalStepActions(resultDiv, objKey, stepIdx);
    }
    if (stepCode && objKey) {
        // Find the existing wf-stream-code <pre> that was already rendered above
        const existingCodePre = body.querySelector('.wf-stream-code');
        if (existingCodePre) {
            const existingCodeEl = existingCodePre.querySelector('code');

            // Create a textarea editor (hidden until Edit is clicked), placed right after the code block
            const editorArea = document.createElement('textarea');
            editorArea.className = 'wf-stream-code-editor';
            editorArea.value = stepCode;
            editorArea.spellcheck = false;
            editorArea.style.display = 'none';
            existingCodePre.parentNode.insertBefore(editorArea, existingCodePre.nextSibling);

            let currentCode = stepCode;

            // Action buttons — inserted right after the code block (or editor)
            const actions = document.createElement('div');
            actions.className = 'step-code-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-edit-code';
            editBtn.textContent = 'Edit Code';

            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn-save-code';
            saveBtn.textContent = 'Save';
            saveBtn.style.display = 'none';

            const runBtn = document.createElement('button');
            runBtn.className = 'btn-run-code';
            runBtn.textContent = 'Re-run';

            const regenBtn = document.createElement('button');
            regenBtn.className = 'btn-regenerate';
            regenBtn.textContent = 'Provide Feedback';

            const reExecBtn = document.createElement('button');
            reExecBtn.className = 'btn-re-execute';
            reExecBtn.textContent = 'Re-execute Step';

            editBtn.onclick = () => {
                editorArea.value = currentCode;
                existingCodePre.style.display = 'none';
                editorArea.style.display = '';
                editBtn.style.display = 'none';
                saveBtn.style.display = '';
            };

            saveBtn.onclick = () => {
                currentCode = editorArea.value;
                editorArea.style.display = 'none';
                existingCodePre.style.display = '';
                if (existingCodeEl) {
                    existingCodeEl.textContent = currentCode;
                    existingCodeEl.classList.remove('hljs');
                    if (window.hljs) hljs.highlightElement(existingCodeEl);
                }
                saveBtn.style.display = 'none';
                editBtn.style.display = '';
            };

            runBtn.onclick = () => {
                // If currently editing, save first
                if (editorArea.style.display !== 'none') {
                    currentCode = editorArea.value;
                    editorArea.style.display = 'none';
                    existingCodePre.style.display = '';
                    if (existingCodeEl) {
                        existingCodeEl.textContent = currentCode;
                        existingCodeEl.classList.remove('hljs');
                        if (window.hljs) hljs.highlightElement(existingCodeEl);
                    }
                    saveBtn.style.display = 'none';
                    editBtn.style.display = '';
                }
                const taskId = _activeTaskId();
                if (!taskId) { addLog('[Error] No task ID available for re-run', 'error'); return; }
                if (objKey === 'assembly') {
                    rerunAssembly(taskId, 'edit', currentCode, '', resultDiv);
                } else {
                    rerunStep(taskId, objKey, stepIdx, 'edit', currentCode, '', resultDiv);
                }
            };

            // Re-execute Step — re-execute the saved code through the full pipeline
            reExecBtn.onclick = () => {
                const taskId = _activeTaskId();
                if (!taskId) { addLog('[Error] No task ID available for re-execute', 'error'); return; }
                if (objKey === 'assembly') {
                    rerunAssembly(taskId, 're_execute', null, '', resultDiv);
                } else {
                    rerunStep(taskId, objKey, stepIdx, 're_execute', null, '', resultDiv);
                }
            };

            // Feedback textarea (hidden until Provide Feedback is clicked)
            const feedbackArea = document.createElement('textarea');
            feedbackArea.className = 'wf-feedback-textarea';
            feedbackArea.placeholder = 'Describe what you want changed or improved...';
            feedbackArea.spellcheck = true;
            feedbackArea.style.display = 'none';

            const feedbackActions = document.createElement('div');
            feedbackActions.className = 'wf-feedback-actions';
            feedbackActions.style.display = 'none';

            const submitFeedbackBtn = document.createElement('button');
            submitFeedbackBtn.className = 'btn-run-code';
            submitFeedbackBtn.textContent = 'Revise Code';

            const cancelFeedbackBtn = document.createElement('button');
            cancelFeedbackBtn.className = 'btn-edit-code';
            cancelFeedbackBtn.textContent = 'Cancel';

            feedbackActions.appendChild(submitFeedbackBtn);
            feedbackActions.appendChild(cancelFeedbackBtn);

            regenBtn.onclick = () => {
                const isVisible = feedbackArea.style.display !== 'none';
                feedbackArea.style.display = isVisible ? 'none' : '';
                feedbackActions.style.display = isVisible ? 'none' : '';
                if (!isVisible) feedbackArea.focus();
            };

            submitFeedbackBtn.onclick = () => {
                const instructions = feedbackArea.value.trim();
                const taskId = _activeTaskId();
                if (!taskId) { addLog('[Error] No task ID available for re-run', 'error'); return; }
                if (objKey === 'assembly') {
                    rerunAssembly(taskId, 'regenerate', null, instructions, resultDiv);
                } else {
                    rerunStep(taskId, objKey, stepIdx, 'regenerate', null, instructions, resultDiv);
                }
                feedbackArea.style.display = 'none';
                feedbackActions.style.display = 'none';
                feedbackArea.value = '';
            };

            cancelFeedbackBtn.onclick = () => {
                feedbackArea.style.display = 'none';
                feedbackActions.style.display = 'none';
            };

            actions.appendChild(editBtn);
            actions.appendChild(saveBtn);
            actions.appendChild(runBtn);
            actions.appendChild(regenBtn);
            actions.appendChild(reExecBtn);

            // Insert actions, feedback textarea, and feedback buttons after the editor
            editorArea.parentNode.insertBefore(actions, editorArea.nextSibling);
            actions.parentNode.insertBefore(feedbackArea, actions.nextSibling);
            feedbackArea.parentNode.insertBefore(feedbackActions, feedbackArea.nextSibling);

            // Store refs for updating after re-run
            resultDiv._existingCodePre = existingCodePre;
            resultDiv._existingCodeEl = existingCodeEl;
            resultDiv._editorArea = editorArea;
            resultDiv._setCurrentCode = (c) => { currentCode = c; };
        }
    }

    body.appendChild(resultDiv);

    // Expand card if collapsed
    card.classList.remove('collapsed');
    const toggleEl = card.querySelector('.wf-card-toggle');
    if (toggleEl) toggleEl.innerHTML = '&#9660;';

    smartScrollChat();
}

// Global state for code review feedback
let _codeReviewFeedback = null;

// Handle code review feedback (called from chatWithAI when feedbackMode.type === 'code_review')
async function handleCodeReviewFeedback(feedback) {
    const taskId = feedbackMode.taskId;

    addChatMessage(feedback, 'user');
    addLog(`[User] Submitting code review feedback for task: ${taskId}`, 'info');

    // Cancel feedback mode
    cancelFeedbackMode();

    // Disable chat input and restore the stop button while waiting for regenerated code
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send');
    if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = 'Regenerating code based on your feedback...';
    }
    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.classList.add('interrupt');
        sendBtn.title = 'Stop running process';
    }

    try {
        await fetch(`${API_BASE_URL}/api/workflow/code-review/${taskId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'feedback', feedback: feedback })
        });
    } catch (e) {
        addLog(`[Error] Code review feedback submit failed: ${e.message}`, 'error');
        if (chatInput) { chatInput.disabled = false; chatInput.placeholder = 'Enter a request here ....'; }
        if (sendBtn) sendBtn.disabled = false;
    }

    _codeReviewFeedback = null;
}

// Thinking indicator — shown after the user message until the first LLM
// token / workflow card arrives. Useful for slow local models (gemma4:31b).
function showThinkingIndicator() {
    hideThinkingIndicator();
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) return;
    const wrap = document.createElement('div');
    wrap.id = 'thinking-indicator';
    wrap.className = 'chat-message agm thinking-indicator';
    wrap.innerHTML = `
        <div class="message-avatar">
            <img src="icon/AGM.png" alt="AGM" class="avatar-img">
        </div>
        <div class="message-wrapper">
            <div class="message-header">
                <span class="message-sender">AGM</span>
            </div>
            <div class="message-bubble">
                <span class="thinking-label">thinking</span>
                <span class="thinking-dot"></span>
                <span class="thinking-dot"></span>
                <span class="thinking-dot"></span>
            </div>
        </div>
    `;
    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
function hideThinkingIndicator() {
    const el = document.getElementById('thinking-indicator');
    if (el) el.remove();
}

// Chat Management
function addChatMessage(content, sender = 'user') {
    const chatMessages = document.getElementById('chat-messages');

    // Remove empty message if present
    const emptyMessage = chatMessages.querySelector('.empty-message');
    if (emptyMessage) {
        emptyMessage.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;

    // Create avatar
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';

    if (sender === 'agm') {
        const avatarImg = document.createElement('img');
        avatarImg.src = 'icon/AGM.png';
        avatarImg.alt = 'AGM';
        avatarImg.className = 'avatar-img';
        avatar.appendChild(avatarImg);
    }
    // else {
    //     avatar.textContent = 'You';
    // }

    // Create message wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper';

    // Create header with sender and time (outside bubble)
    const messageHeader = document.createElement('div');
    messageHeader.className = 'message-header';

    const senderSpan = document.createElement('span');
    senderSpan.className = 'message-sender';
    senderSpan.textContent = sender === 'user' ? 'You' : 'AGM';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = getCurrentTimestamp();

    messageHeader.appendChild(senderSpan);
    messageHeader.appendChild(timeSpan);

    // Create message bubble
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Create content
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.textContent = content;

    bubble.appendChild(messageContent);
    wrapper.appendChild(messageHeader);
    wrapper.appendChild(bubble);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(wrapper);
    chatMessages.appendChild(messageDiv);

    // Force-scroll for user messages; smart-scroll for agent messages
    smartScrollChat(sender === 'user');
}

// ==================== Workflow Step Cards in Chat ====================

let _wfCardsContainer = null;   // The container div inside the AGM bubble
let _wfCurrentPhase = null;     // Current active phase name

// Phase-group definitions — a group is a collapsible parent panel that
// wraps all cards belonging to a pipeline. Cards with a matching phase
// are appended into the group body instead of directly into the root
// cards container, so the user can collapse the whole Result Analysis
// or Manuscript section at once.
const _PHASE_GROUPS = {
    result_analysis: {
        title: 'Result Analysis Pipeline',
        // ra_flowchart is emitted AFTER the manuscript finishes as a
        // final standalone step — keep it out of this group so it
        // renders at the bottom (below Manuscript) rather than being
        // pulled back into the Result Analysis group above.
        match: (p) => p !== 'ra_flowchart'
            && /^(ra_|rerun_result_analysis|update_result_analysis)/.test(p),
    },
    manuscript: {
        title: 'Manuscript Pipeline',
        match: (p) => /^(ms_|manuscript)/.test(p),
    },
};

function _getGroupKey(phase) {
    if (!phase) return null;
    for (const key of Object.keys(_PHASE_GROUPS)) {
        if (_PHASE_GROUPS[key].match(phase)) return key;
    }
    return null;
}

function _ensureGroup(container, groupKey) {
    let group = container.querySelector(`#wf-group-${groupKey}`);
    if (group) return group.querySelector('.wf-group-body');
    const def = _PHASE_GROUPS[groupKey];
    group = document.createElement('div');
    group.id = `wf-group-${groupKey}`;
    group.className = 'wf-group';
    const header = document.createElement('div');
    header.className = 'wf-group-header';
    header.innerHTML = `<span class="wf-group-toggle">▼</span><span class="wf-group-title">${def.title}</span>`;
    const body = document.createElement('div');
    body.className = 'wf-group-body';
    header.onclick = () => {
        const collapsed = group.classList.toggle('collapsed');
        header.querySelector('.wf-group-toggle').textContent = collapsed ? '▶' : '▼';
    };
    group.appendChild(header);
    group.appendChild(body);
    container.appendChild(group);
    return body;
}

function _getCardParent(container, phase) {
    const key = _getGroupKey(phase);
    return key ? _ensureGroup(container, key) : container;
}

function _getPhase(step) {
    if (!step) return 'general';
    if (step.startsWith('intent') || step === 'streaming_chat') return 'intent';
    if (step === 'agent_registration') return 'setup';
    if (step === 'rq_breakdown_summary') return 'rq_breakdown_summary';
    if (step.startsWith('rq_breakdown')) return 'rq_breakdown';
    if (step.startsWith('data_audit') || step === 'data_registry_init') return 'data_audit';
    if (step === 'data_download' || step === 'data_download_complete') return 'data_download';
    if (step.startsWith('data_download_req_')) return step;
    if (step.startsWith('data_summary')) return 'data_summary';
    if (step.startsWith('eda')) return 'eda';
    if (step.startsWith('research_plan')) return 'research_plan';
    // Execution: each objective step gets its own card (exec_obj1_step2 → exec_obj1_step2)
    // Objective-level messages (exec_obj1) get their own card too
    if (step === 'execution_checkpoint') return 'execution_checkpoint';
    if (step.startsWith('exec_obj')) return step;
    if (step.startsWith('extract') || step.startsWith('objective') || step.startsWith('plan_')) return 'execution';
    // Spatial analysis: each operation and assembly gets its own card
    if (step.startsWith('operation_')) return step;
    if (step.startsWith('assembly_')) return step;
    if (step.startsWith('geoprocessing_')) return step;
    // Result analysis: each pipeline node gets its own card (ra_flowchart, ra_collate, etc.)
    if (step.startsWith('ra_')) return step;
    if (step.startsWith('result_analysis')) return 'result_analysis';
    // Manuscript: each section gets its own card (ms_title_abstract, ms_introduction, etc.)
    if (step.startsWith('ms_')) return step;
    if (step.startsWith('manuscript')) return 'manuscript';
    return 'general';
}

function _ensureCardsContainer() {
    if (_wfCardsContainer) return _wfCardsContainer;

    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message agm';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = '<img src="icon/AGM.png" alt="AGM" class="avatar-img">';

    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper full-width';

    const header = document.createElement('div');
    header.className = 'message-header';
    const now = new Date();
    header.innerHTML = `
        <span class="message-sender">AGM</span>
        <span class="message-time">${now.toLocaleTimeString('en-US', { hour12: false })}</span>
    `;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    _wfCardsContainer = document.createElement('div');
    _wfCardsContainer.className = 'workflow-cards-container';

    bubble.appendChild(_wfCardsContainer);
    wrapper.appendChild(header);
    wrapper.appendChild(bubble);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(wrapper);
    chatMessages.appendChild(messageDiv);

    return _wfCardsContainer;
}

/**
 * Scroll to a step card by phase name, expand it, and briefly highlight it.
 * Used by the Execution Summary table and the Execution Flowchart popup.
 */
function _scrollToStepCard(phase) {
    // Search across all workflow containers (live + rebuilt)
    const card = document.querySelector(`#wf-card-${phase}`);
    if (!card) {
        addLog(`[UI] Step card not found: ${phase}`, 'warning');
        return;
    }
    // Expand the card if it's collapsed
    if (card.classList.contains('collapsed')) {
        card.classList.remove('collapsed');
        const toggle = card.querySelector('.wf-card-toggle');
        if (toggle) toggle.innerHTML = '&#9660;';
    }
    // Scroll into view
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Brief highlight animation
    card.classList.add('highlight-flash');
    setTimeout(() => card.classList.remove('highlight-flash'), 1500);
}

/**
 * Find all step cards belonging to a given objective number. Step cards
 * have IDs like `wf-card-exec_obj1_step2` and live as siblings of the
 * objective card inside `_wfCardsContainer`.
 */
function _objectiveStepCards(objNum) {
    if (!_wfCardsContainer) return [];
    return Array.from(
        _wfCardsContainer.querySelectorAll(`[id^="wf-card-exec_obj${objNum}_step"]`)
    );
}

function _setCardCollapsed(card, collapsed) {
    if (!card) return;
    const hasBody = !!card.querySelector('.wf-card-body');
    if (!hasBody) return; // nothing to hide
    card.classList.toggle('collapsed', collapsed);
    const toggle = card.querySelector('.wf-card-toggle');
    if (toggle) toggle.innerHTML = collapsed ? '&#9654;' : '&#9660;';
}

/**
 * Ensure a master exec toolbar exists at the top of the workflow container
 * with "Collapse all / Expand all" controls that affect every objective
 * card and step card in the run.
 */
function _ensureExecToolbar(container) {
    let bar = container.querySelector('#wf-exec-toolbar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'wf-exec-toolbar';
    bar.className = 'wf-exec-toolbar';
    bar.innerHTML = `
        <span class="wf-exec-toolbar-label">Objective execution:</span>
        <button type="button" class="wf-exec-btn" data-act="collapse-all">Collapse all</button>
        <button type="button" class="wf-exec-btn" data-act="expand-all">Expand all</button>
    `;
    bar.addEventListener('click', (e) => {
        const btn = e.target.closest('.wf-exec-btn');
        if (!btn) return;
        const collapse = btn.dataset.act === 'collapse-all';
        const cards = container.querySelectorAll(
            '.wf-card-objective, .wf-card-step'
        );
        cards.forEach((c) => _setCardCollapsed(c, collapse));
    });
    // Insert at the very top so it sits above the first objective card.
    container.insertBefore(bar, container.firstChild);
    return bar;
}

/**
 * Add a per-objective collapse/expand button to an objective card's header.
 * Clicking it toggles all step cards that belong to this objective.
 * Stops event propagation so it doesn't also fire the card's own collapse.
 */
function _addObjectiveGroupToggle(card, objNum) {
    if (!card || card.querySelector('.wf-obj-group-toggle')) return;
    const header = card.querySelector('.wf-card-header');
    if (!header) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wf-obj-group-toggle';
    btn.title = 'Collapse/expand all steps under this objective';
    btn.textContent = 'Collapse steps';
    btn.dataset.collapsed = 'false';
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const collapsed = btn.dataset.collapsed !== 'true';
        _objectiveStepCards(objNum).forEach((c) => _setCardCollapsed(c, collapsed));
        btn.dataset.collapsed = collapsed ? 'true' : 'false';
        btn.textContent = collapsed ? 'Expand steps' : 'Collapse steps';
    });
    header.appendChild(btn);
}

/**
 * Add collapse toggle and click handler to a card that now has content.
 * No-op if toggle already exists.
 */
function _makeCardCollapsible(card) {
    if (card.querySelector('.wf-card-toggle')) return; // already collapsible
    const header = card.querySelector('.wf-card-header');
    if (!header) return;
    const toggle = document.createElement('span');
    toggle.className = 'wf-card-toggle';
    toggle.title = 'Collapse/Expand';
    toggle.innerHTML = '&#9660;';
    header.appendChild(toggle);
    header.addEventListener('click', () => {
        card.classList.toggle('collapsed');
        toggle.innerHTML = card.classList.contains('collapsed') ? '&#9654;' : '&#9660;';
    });
}

function _finalizeCard(phase) {
    if (!_wfCardsContainer) return;
    const card = _wfCardsContainer.querySelector(`#wf-card-${phase}`);
    if (!card) return;
    card.classList.remove('active');
    card.classList.add('completed');
    // Auto-collapse completed cards (unless marked to keep expanded)
    if (card.querySelector('.wf-card-body') && !card.dataset.keepExpanded) {
        card.classList.add('collapsed');
        const toggle = card.querySelector('.wf-card-toggle');
        if (toggle) toggle.innerHTML = '&#9654;';
    }
    const spinner = card.querySelector('.step-spinner');
    const check = card.querySelector('.step-check');
    if (spinner) spinner.style.display = 'none';
    if (check) check.style.display = 'inline';
}

// Map ms_* phase IDs to user-visible labels so cards never show raw tags.
const _MS_PHASE_LABELS = {
    'ms_title_abstract': 'Title & Abstract',
    'ms_introduction':   'Introduction',
    'ms_methodology':    'Methodology',
    'ms_results':        'Results',
    'ms_discussion':     'Discussion',
    'ms_conclusion':     'Conclusion',
    'ms_references':     'References',
    'ms_assemble':       'Full Manuscript',
};

function _prettyPhaseLabel(phase, fallback) {
    if (phase && _MS_PHASE_LABELS[phase]) return _MS_PHASE_LABELS[phase];
    if (!fallback) return phase || '';
    // If the fallback is just the raw phase id, swap it for the mapped label
    if (fallback === phase && _MS_PHASE_LABELS[phase]) return _MS_PHASE_LABELS[phase];
    return fallback;
}

/**
 * Create or update a workflow step card in the chat panel.
 * Same-phase updates replace the status text; new phase creates a new card.
 */
function updateWorkflowCard(content, step) {
    const container = _ensureCardsContainer();
    const phase = _getPhase(step);

    // Scope to current container — avoids finding old cards from previous runs
    let card = container.querySelector(`#wf-card-${phase}`);

    if (!card) {
        // Finalize previous phase
        if (_wfCurrentPhase && _wfCurrentPhase !== phase) {
            _finalizeCard(_wfCurrentPhase);
        }
        _wfCurrentPhase = phase;

        // Create new card
        card = document.createElement('div');
        // Tag objective-level vs step-level cards for distinct styling
        const isObjCard = /^exec_obj\d+$/.test(phase);
        const isStepCard = /^exec_obj\d+_step\d+/.test(phase);
        const isManuscriptCard = phase === 'manuscript';
        const isMsSectionCard = /^ms_/.test(phase);
        const isDataReqCard = /^data_download_req_\d+$/.test(phase);
        card.className = 'wf-card active' + (isObjCard ? ' wf-card-objective' : '') + (isStepCard ? ' wf-card-step' : '') + (isManuscriptCard ? ' wf-card-manuscript' : '') + (isMsSectionCard ? ' wf-card-ms-section' : '') + (isDataReqCard ? ' wf-card-data-request' : '');
        card.id = `wf-card-${phase}`;
        if (phase === 'ms_assemble') card.dataset.keepExpanded = 'true';
        const displayContent = _prettyPhaseLabel(phase, content);
        card.innerHTML = `
            <div class="wf-card-header">
                <span class="step-check" style="display:none;">&#10004;</span>
                <span class="step-spinner"></span>
                <span class="wf-card-status">${displayContent}</span>
            </div>
        `;
        _getCardParent(container, phase).appendChild(card);
        if (isManuscriptCard) _ensureRerunManuscriptBtn(card);
        // Objective-execution controls: master toolbar + per-objective toggle
        if (isObjCard) {
            _ensureExecToolbar(container);
            const m = phase.match(/^exec_obj(\d+)$/);
            if (m) _addObjectiveGroupToggle(card, m[1]);
        }
    } else {
        // Same phase — replace status text. For ms_* cards, keep the
        // fixed pretty label so streaming status updates don't overwrite
        // the section name in the header.
        const statusEl = card.querySelector('.wf-card-status');
        if (statusEl) {
            if (_MS_PHASE_LABELS[phase]) {
                statusEl.textContent = _MS_PHASE_LABELS[phase];
            } else {
                statusEl.textContent = content;
            }
        }
        if (phase === 'manuscript') _ensureRerunManuscriptBtn(card);
    }

    // Smart-scroll: only if user is near the bottom
    smartScrollChat();
}

/**
 * Append streaming/log content to the current phase card body.
 * If step is provided and maps to a different phase, a new card is created first.
 */
function appendToWorkflowCard(content, step) {
    // If a step is provided, check if it maps to a new phase
    if (step) {
        const phase = _getPhase(step);
        if (phase !== _wfCurrentPhase) {
            // Create a new card for this phase (use first line as header)
            const firstLine = content.split('\n')[0].trim();
            updateWorkflowCard(firstLine || phase, step);
            // Remaining content goes into the body
            const rest = content.substring(content.indexOf('\n') + 1);
            if (rest && rest.trim()) {
                _appendToCurrentCard(rest);
            }
            return;
        }
    }
    _appendToCurrentCard(content);
}

function _appendToCurrentCard(content) {
    if (!_wfCurrentPhase || !_wfCardsContainer) return;
    const card = _wfCardsContainer.querySelector(`#wf-card-${_wfCurrentPhase}`);
    if (!card) return;

    let body = card.querySelector('.wf-card-body');
    if (!body) {
        body = document.createElement('div');
        body.className = 'wf-card-body';
        card.appendChild(body);
        // Card now has content — make it collapsible
        _makeCardCollapsible(card);
    }

    // Don't overwrite the code review UI with streaming text
    if (body.classList.contains('code-review-body')) return;

    // If body already has structured content (from displayStepResult formatting),
    // append to an existing wf-stream-log or create a new one at the end,
    // so we don't clobber the formatted code/tiles.
    const hasStructured = body.querySelector('.wf-stream-code, .wf-stream-status, .step-result-section, .wf-result-stream-section, .wf-result-code-section, .data-source-select-container');
    let activeLog = null;
    if (hasStructured) {
        // Find or create a trailing stream log for new streaming text
        let trailingLog = body.lastElementChild;
        if (!trailingLog || !trailingLog.classList.contains('wf-stream-log')) {
            trailingLog = document.createElement('pre');
            trailingLog.className = 'wf-stream-log';
            body.appendChild(trailingLog);
        }
        trailingLog.textContent += content;
        activeLog = trailingLog;
    } else {
        const streamLog = body.querySelector('.wf-stream-log');
        if (streamLog) {
            streamLog.textContent += content;
            activeLog = streamLog;
        } else {
            body.textContent += content;
        }
    }
    // The inner .wf-stream-log has its own overflow-y/max-height, so it is
    // the actual scroll container — pin it to the bottom. Also pin the outer
    // card body in case there is no inner log.
    if (activeLog) activeLog.scrollTop = activeLog.scrollHeight;
    body.scrollTop = body.scrollHeight;

    // Don't scroll the whole chat panel — card-internal scroll above is enough
}

/**
 * Render the parsed Task Breakdown (rq_breakdown) summary as a new sibling div
 * inside the Task Breakdown card, with Proceed / Provide Feedback buttons.
 *
 * Called after the streaming response is complete. Collapses the raw stream log
 * by default and shows a small "Show raw response" toggle.
 *
 * @param {Object} rqData - Parsed rq_breakdown JSON (title, intent, category,
 *                          scale, data_requirement, data_available, data_requests,
 *                          data_available_sufficiency).
 * @param {Object} [options] - Optional rendering options.
 * @param {HTMLElement} [options.card] - Explicit card element (used during
 *   conversation reload, when the live _wfCardsContainer isn't set).
 * @param {boolean} [options.isReload] - When true, suppress the autonomous-mode
 *   auto-click (the workflow has already advanced past this point).
 */
function displayRqBreakdownSummary(rqData, options = {}) {
    if (!rqData || typeof rqData !== 'object') return;

    const container = _ensureCardsContainer();
    if (!container) return;

    // Finalize the streaming rq_breakdown card (mark complete with checkmark)
    _finalizeCard('rq_breakdown');

    // If the summary card already exists (e.g. duplicate event), remove it first
    // so we can rebuild it (important for the revision/feedback flow)
    const existing = container.querySelector('#wf-card-rq_breakdown_summary');
    if (existing) existing.remove();

    // Compute sufficiency early so we can show it in the card header
    const sufficiency = rqData.data_available_sufficiency || '';
    const isSufficient = sufficiency && /^yes/i.test(sufficiency.trim());
    const suffBadgeClass = sufficiency ? (isSufficient ? 'success' : 'warning') : '';
    const suffBadgeText = sufficiency ? (isSufficient ? 'Data Sufficient' : 'Data Insufficient') : '';

    // ---- Create the Data Availability child card ----
    const card = document.createElement('div');
    card.className = 'wf-card active wf-card-child';
    card.id = 'wf-card-rq_breakdown_summary';

    const taskId = options.taskId || window._completedTaskId || null;
    if (taskId) card.dataset.rqTaskId = taskId;

    card.innerHTML = `
        <div class="wf-card-header">
            <span class="step-check" style="display:none;">&#10004;</span>
            <span class="step-spinner" style="display:none;"></span>
            <span class="wf-card-status">Data Availability</span>
            ${/* ${suffBadgeClass ? `<span class="wf-card-badge ${suffBadgeClass}">${suffBadgeText}</span>` : ''} */ ''}
        </div>
    `;
    // Insert right after the rq_breakdown (log) card so they appear as siblings
    const logCard = container.querySelector('#wf-card-rq_breakdown');
    if (logCard && logCard.nextSibling) {
        container.insertBefore(card, logCard.nextSibling);
    } else {
        container.appendChild(card);
    }
    _wfCurrentPhase = 'rq_breakdown_summary';

    // ---- Build body with structured summary ----
    const body = document.createElement('div');
    body.className = 'wf-card-body';
    card.appendChild(body);
    _makeCardCollapsible(card);

    const summary = document.createElement('div');
    summary.className = 'rq-breakdown-summary';

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Build scale tags
    const scale = rqData.scale || {};
    const scaleTags = [];
    if (scale.spatial_scale) scaleTags.push(`<span class="rq-tag rq-tag-spatial">${esc(scale.spatial_scale)}</span>`);
    if (scale.temporal_scale) scaleTags.push(`<span class="rq-tag rq-tag-temporal">${esc(scale.temporal_scale)}</span>`);

    // Build category + scale badges row
    const badges = [];
    if (rqData.category) badges.push(`<span class="rq-tag rq-tag-category">${esc(rqData.category)}</span>`);
    badges.push(...scaleTags);
    const badgesHtml = badges.length ? `<div class="rq-badges">${badges.join('')}</div>` : '';

    // The rq_understanding agent may return list items as plain strings OR as
    // dicts like {name, description, source, ...} depending on the LLM. Coerce
    // to a readable string so we never render "[object Object]".
    const stringifyRqItem = (it) => {
        if (it == null) return '';
        if (typeof it === 'string') return it;
        if (typeof it !== 'object') return String(it);
        const name = it.name || it.dataset || it.title || it.variable;
        const desc = it.description || it.details || it.purpose;
        const src  = it.source || it.provider;
        const parts = [];
        if (name) parts.push(name);
        if (desc) parts.push(desc);
        if (src)  parts.push(`(${src})`);
        if (parts.length) return parts.join(' — ');
        try { return JSON.stringify(it); } catch (_) { return String(it); }
    };

    // Data available list
    const dataAvailItems = Array.isArray(rqData.data_available) && rqData.data_available.length
        ? rqData.data_available.map(it => `<li class="rq-data-available">${esc(stringifyRqItem(it))}</li>`).join('')
        : '';

    // Show data_requests in two cases:
    //   (1) Auto Data Download toggle is ON — the system will fetch them.
    //   (2) Intent mode is "data_retriever" — the user is explicitly running
    //       the Data Retriever flow, so identified requests are the point.
    // Other modes (research/task/spatial-analysis/chat) suppress the list.
    const autoDataOn = localStorage.getItem('agm_data_download_mode') === 'true';
    const intentModeEl = document.querySelector('input[name="intent-mode"]:checked');
    const intentMode = intentModeEl ? intentModeEl.value
                                    : (localStorage.getItem('agm_intent_mode') || '');
    const isDataRetrieverMode = intentMode === 'data_retriever';
    const showDataRequests = autoDataOn || isDataRetrieverMode;

    const dataReqRequestItems = showDataRequests
        && Array.isArray(rqData.data_requests) && rqData.data_requests.length
        ? rqData.data_requests.map(it => `<li class="rq-data-request">${esc(stringifyRqItem(it))}</li>`).join('')
        : '';

    summary.innerHTML = `
        ${autoDataOn && sufficiency && !isSufficient ? `<div class="rq-sufficiency-detail">${esc(sufficiency)}</div>` : ''}
        ${dataAvailItems ? `<ul class="rq-list rq-list-available">${dataAvailItems}</ul>` : ''}
        ${dataReqRequestItems ? `
            <div class="rq-subsection-header">Datasets to Retrieve</div>
            <ul class="rq-list rq-list-requests">${dataReqRequestItems}</ul>
        ` : ''}
    `;

    // ---- Buttons: Proceed / Provide Feedback ----
    const controls = document.createElement('div');
    controls.className = 'rq-breakdown-controls';

    const runProceed = async (btn, { skipDataDownload = false } = {}) => {
        const activeTaskId = card.dataset.rqTaskId || taskId;
        if (!activeTaskId) {
            addLog('[AGM] No task ID available to proceed task breakdown.', 'error');
            return;
        }
        proceedBtn.disabled = true;
        feedbackBtn.disabled = true;
        if (skipBtn) skipBtn.disabled = true;
        _finalizeCard('rq_breakdown_summary');
        addLog(
            skipDataDownload
                ? '[AGM] Proceeding past task breakdown (skipping data download)...'
                : '[AGM] Proceeding past task breakdown...',
            'info',
        );
        try {
            const abortCtrl = startInterruptableStream();
            const res = await fetch(`${API_BASE_URL}/api/rq-breakdown/proceed/${activeTaskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation_id: currentConversationId,
                    skip_data_download: skipDataDownload,
                }),
                signal: abortCtrl.signal,
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const update = JSON.parse(line.substring(6));
                        if (update.type === 'status') { updateWorkflowCard(update.message || update.content, update.step || 'general'); }
                        else if (update.type === 'llm_update') { updateWorkflowCard(update.content, update.step); }
                        else if (update.type === 'llm_stream') { appendToWorkflowCard(update.content, update.step); }
                        else if (update.type === 'log') { addLog(`[AGM] ${update.content}`, 'info'); }
                        else if (update.type === 'code_review') { displayCodeReview(update); }
                        else if (update.type === 'step_result') { displayStepResult(update); }
                        else if (update.type === 'execution_checkpoint') { displayExecutionCheckpoint(update); }
                        else if (update.type === 'figure_catalog') { displayFigureCatalog(update.figures || [], update.step); }
                        else if (update.type === 'execution_flowchart') { displayExecutionFlowchart(update.relative_path, update.step); }
                        else if (update.type === 'research_plan_viz') {
                            addLog('[AGM] Research plan visualization ready', 'success');
                            if (update.viz_id) displayResearchPlanViz(update.viz_id);
                        }
                        else if (update.type === 'geoprocessing_workflow_viz') {
                            addLog('[AGM] Geoprocessing workflow visualization ready', 'success');
                            if (update.viz_id) spatial_analysis_displayWorkflowViz(update.viz_id);
                        }
                        else if (update.type === 'data_download_summary') { displayDataDownloadSummary(update); }
                        else if (update.type === 'data_request_files') { displayDataRequestTiles(update); }
                        else if (update.type === 'eda_approval') { displayEdaApproval(update); }
                        else if (update.type === 'data_download_approval') { displayDataDownloadApproval(update); }
                        else if (update.type === 'data_source_select_approval') { displayDataSourceSelectApproval(update); }
                        else if (update.type === 'result_presentation') { displayMarkdownResult('Result Presentation', '\u{1F4CA}', update.content, update.relative_path, update.step); }
                        else if (update.type === 'result_discussion') { displayMarkdownResult('Result Discussion', '\u{1F4AC}', update.content, update.relative_path, update.step); }
                        else if (update.type === 'manuscript_section') { displayMarkdownResult(`Manuscript: ${update.section}`, '\u{1F4DD}', update.content, update.relative_path, update.step); }
                        else if (update.type === 'manuscript_complete') { displayMarkdownResult('Full Manuscript', '\u{1F4D6}', update.content, update.relative_path, update.step); }
                        else if (update.type === 'result') {
                            if (update.task_id) window._completedTaskId = update.task_id;
                            addLog('[AGM] Reached next checkpoint', 'info');
                        }
                        else if (update.type === 'error') { finalizeAllWorkflowCards(); addLog(`[Error] ${update.error}`, 'error'); addChatMessage(`Error: ${update.error}`, 'agm'); }
                    } catch (_) {}
                }
            }
            stopInterruptableStream();
        } catch (e) {
            stopInterruptableStream();
            if (e.name === 'AbortError') return;
            addLog(`[Error] Failed: ${e.message}`, 'error');
            proceedBtn.disabled = false;
            feedbackBtn.disabled = false;
            if (skipBtn) skipBtn.disabled = false;
        }
    };

    let skipBtn = null;

    const proceedBtn = document.createElement('button');
    proceedBtn.type = 'button';
    proceedBtn.className = 'rq-btn-proceed';
    proceedBtn.textContent = '\u2713 Proceed';
    proceedBtn.addEventListener('click', () => {
        // Take the data-download route when either:
        //   (1) the Auto Data Download toggle is ON, or
        //   (2) the user is in Data Retriever intent mode (the whole point of
        //       that mode is to retrieve datasets — skipping would be wrong).
        const autoDataOn = localStorage.getItem('agm_data_download_mode') === 'true';
        const intentModeEl = document.querySelector('input[name="intent-mode"]:checked');
        const intentMode = intentModeEl ? intentModeEl.value
                                        : (localStorage.getItem('agm_intent_mode') || '');
        const isDataRetrieverMode = intentMode === 'data_retriever';
        const shouldDownload = autoDataOn || isDataRetrieverMode;
        runProceed(proceedBtn, { skipDataDownload: !shouldDownload });
    });

    const feedbackBtn = document.createElement('button');
    feedbackBtn.type = 'button';
    feedbackBtn.className = 'rq-btn-feedback';
    feedbackBtn.textContent = '\u270E Provide Feedback';
    feedbackBtn.addEventListener('click', () => {
        const activeTaskId = card.dataset.rqTaskId || taskId;
        if (!activeTaskId) {
            addLog('[AGM] No task ID available for feedback.', 'error');
            return;
        }

        // Toggle: if input area already exists, remove it
        const existing = card.querySelector('.rq-feedback-area');
        if (existing) { existing.remove(); return; }

        // Build inline feedback input below the card body
        const feedbackArea = document.createElement('div');
        feedbackArea.className = 'rq-feedback-area';

        const feedbackInput = document.createElement('textarea');
        feedbackInput.className = 'rq-feedback-input';
        feedbackInput.placeholder = 'Describe what you\'d like to change...';
        feedbackInput.rows = 3;

        const feedbackActions = document.createElement('div');
        feedbackActions.className = 'rq-feedback-actions';

        const submitBtn = document.createElement('button');
        submitBtn.type = 'button';
        submitBtn.className = 'rq-btn-proceed';
        submitBtn.textContent = 'Submit Feedback';
        submitBtn.addEventListener('click', async () => {
            const text = feedbackInput.value.trim();
            if (!text) { feedbackInput.focus(); return; }

            // Disable everything while revising
            submitBtn.disabled = true;
            cancelBtn.disabled = true;
            feedbackInput.disabled = true;
            proceedBtn.disabled = true;
            feedbackBtn.disabled = true;

            addLog(`[User] Task breakdown feedback for: ${activeTaskId}`, 'info');

            // Remove feedback area and the summary card — revision will recreate it
            feedbackArea.remove();
            const summaryCard = document.getElementById('wf-card-rq_breakdown_summary');
            if (summaryCard) summaryCard.remove();

            // Create temp streaming card (child of Task Breakdown)
            const cont = _ensureCardsContainer();
            const tempCard = document.createElement('div');
            tempCard.className = 'wf-card active wf-card-child';
            tempCard.id = 'wf-card-rq_breakdown_summary';
            tempCard.innerHTML = `
                <div class="wf-card-header">
                    <span class="step-check" style="display:none;">&#10004;</span>
                    <span class="step-spinner"></span>
                    <span class="wf-card-status">Revising Data Availability...</span>
                </div>
            `;
            const parentLog = cont.querySelector('#wf-card-rq_breakdown');
            if (parentLog && parentLog.nextSibling) {
                cont.insertBefore(tempCard, parentLog.nextSibling);
            } else {
                cont.appendChild(tempCard);
            }
            const tempBody = document.createElement('div');
            tempBody.className = 'wf-card-body';
            tempCard.appendChild(tempBody);
            const streamPre = document.createElement('pre');
            streamPre.className = 'wf-stream-log';
            streamPre.textContent = 'Revising task breakdown...\n';
            tempBody.appendChild(streamPre);

            let currentStreamContent = '';
            try {
                const abortCtrl = startInterruptableStream();
                const response = await fetch(`${API_BASE_URL}/api/rq-breakdown/revise-stream/${activeTaskId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ feedback: text, conversation_id: currentConversationId }),
                    signal: abortCtrl.signal,
                });
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        try {
                            const update = JSON.parse(line.substring(6));
                            if (update.type === 'llm_stream') {
                                currentStreamContent += update.content;
                                streamPre.textContent = currentStreamContent;
                                streamPre.scrollTop = streamPre.scrollHeight;
                            } else if (update.type === 'llm_update' && update.step === 'rq_breakdown_complete') {
                                const rqRevised = update.data?.rq_breakdown;
                                if (rqRevised) {
                                    const tc = document.getElementById('wf-card-rq_breakdown_summary');
                                    if (tc) tc.remove();
                                    displayRqBreakdownSummary(rqRevised, {
                                        taskId: update.data?.task_id || activeTaskId,
                                    });
                                }
                                addLog('[AGM] Task breakdown revised successfully', 'success');
                            } else if (update.type === 'error') {
                                addLog(`[Error] ${update.error}`, 'error');
                                addChatMessage(`Error: ${update.error}`, 'agm');
                            }
                        } catch (_) {}
                    }
                }
                stopInterruptableStream();
            } catch (err) {
                stopInterruptableStream();
                if (err.name === 'AbortError') return;
                addLog(`[Error] ${err.message}`, 'error');
            }
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'rq-btn-feedback';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => { feedbackArea.remove(); });

        feedbackActions.appendChild(submitBtn);
        feedbackActions.appendChild(cancelBtn);
        feedbackArea.appendChild(feedbackInput);
        feedbackArea.appendChild(feedbackActions);
        card.appendChild(feedbackArea);

        feedbackInput.focus();
        smartScrollChat();
    });

    controls.appendChild(proceedBtn);
    controls.appendChild(feedbackBtn);

    if (autoDataOn && sufficiency && !isSufficient) {
        skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = 'rq-btn-feedback';
        skipBtn.textContent = '\u23ED Skip data download';
        skipBtn.title = 'Continue the workflow without downloading the missing datasets';
        skipBtn.addEventListener('click', () => runProceed(skipBtn, { skipDataDownload: true }));
        controls.appendChild(skipBtn);
    }

    summary.appendChild(controls);
    body.appendChild(summary);

    smartScrollChat();

    // Autonomous Mode: auto-click Proceed after a brief delay.
    // Suppressed during conversation reload — the workflow has already advanced.
    if (!options.isReload) {
        const autoToggle = document.getElementById('autonomous-mode-toggle');
        if (autoToggle && autoToggle.checked) {
            setTimeout(() => {
                addLog('[AGM] Autonomous mode \u2014 auto-proceeding task breakdown', 'info');
                proceedBtn.click();
            }, 1500);
        }
    }
}

/**
 * Finalize all workflow cards (mark complete) and reset state for next workflow.
 */
function finalizeAllWorkflowCards() {
    if (_wfCurrentPhase) _finalizeCard(_wfCurrentPhase);
    _wfCurrentPhase = null;
    _wfCardsContainer = null;
}

/**
 * Rebuild workflow cards from saved metadata when loading a past conversation.
 * @param {Array} cards - Array of {phase, status, body, step, step_results}
 * @param {string} textContent - The accumulated plain-text response (shown separately)
 * @param {string} [timestamp] - Optional timestamp for the message header
 */
function rebuildWorkflowCards(cards, textContent, timestamp) {
    if (!cards || cards.length === 0) {
        if (textContent) addChatMessage(textContent, 'agm');
        return;
    }

    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message agm';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = '<img src="icon/AGM.png" alt="AGM" class="avatar-img">';

    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper full-width';

    const header = document.createElement('div');
    header.className = 'message-header';
    const timeStr = timestamp
        ? new Date(timestamp).toLocaleTimeString('en-US', { hour12: false })
        : '';
    header.innerHTML = `
        <span class="message-sender">AGM</span>
        <span class="message-time">${timeStr}</span>
    `;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    const container = document.createElement('div');
    container.className = 'workflow-cards-container';

    // Collect research_plan_viz entries to render as separate messages after the cards
    const deferredVizEntries = [];

    cards.forEach(cardData => {
        // Recover missing flowchart rich_content for cards saved before the fix
        if (cardData.phase === 'ra_flowchart' && window._completedTaskId) {
            const hasFlowchart = cardData.rich_content && cardData.rich_content.some(
                rc => rc.content_type === 'execution_flowchart'
            );
            if (!hasFlowchart) {
                cardData.rich_content = cardData.rich_content || [];
                cardData.rich_content.push({
                    content_type: 'execution_flowchart',
                    relative_path: `${window._completedTaskId}/execution_flowchart.html`,
                    step: 'ra_flowchart',
                });
            }
        }

        const hasContent = cardData.body || (cardData.step_results && cardData.step_results.length) || (cardData.rich_content && cardData.rich_content.length);
        const hasRichContent = (cardData.step_results && cardData.step_results.length) ||
            (cardData.rich_content && cardData.rich_content.some(rc =>
                rc.content_type === 'figure_catalog' ||
                rc.content_type === 'execution_flowchart' ||
                rc.content_type === 'result_presentation' ||
                rc.content_type === 'result_discussion' ||
                rc.content_type === 'manuscript_section' ||
                rc.content_type === 'manuscript_complete' ||
                rc.content_type === 'data_request_files' ||
                rc.content_type === 'data_source_select_approval'
            ));
        const card = document.createElement('div');
        // Match live styling: add objective/step/manuscript classes and keep rich cards expanded
        const isObjCard = /^exec_obj\d+$/.test(cardData.phase);
        const isStepCard = /^exec_obj\d+_step\d+/.test(cardData.phase);
        const isManuscriptCard = cardData.phase === 'manuscript';
        const isMsSectionCard = /^ms_/.test(cardData.phase);
        const isDataReqCard = /^data_download_req_\d+$/.test(cardData.phase);
        let cardClass = 'wf-card completed';
        if (isObjCard) cardClass += ' wf-card-objective';
        if (isStepCard) cardClass += ' wf-card-step';
        if (isManuscriptCard) cardClass += ' wf-card-manuscript';
        if (isMsSectionCard) cardClass += ' wf-card-ms-section';
        if (isDataReqCard) cardClass += ' wf-card-data-request';
        if (cardData.phase === 'ms_assemble') {
            // ms_assemble always stays expanded
        } else if (hasContent && !hasRichContent) {
            cardClass += ' collapsed';
        }
        card.className = cardClass;
        card.id = `wf-card-${cardData.phase}`;
        if (cardData.phase === 'ms_assemble') card.dataset.keepExpanded = 'true';

        // Derive a readable header: if the saved status is just the raw phase
        // ID (e.g. "exec_obj1_step2"), recover the description from the first
        // line of the card body or from step_results metadata.
        let displayStatus = cardData.status || cardData.phase;
        if (displayStatus === cardData.phase && /^exec_obj/.test(cardData.phase)) {
            if (cardData.body) {
                const firstLine = cardData.body.split('\n')[0].trim();
                if (firstLine) displayStatus = firstLine;
            } else if (cardData.step_results && cardData.step_results.length) {
                const sr = cardData.step_results[0];
                if (sr.step_description) {
                    displayStatus = `Step ${sr.step_index}: ${sr.step_description}`;
                }
            }
        }

        const restoredLabel = _prettyPhaseLabel(cardData.phase, displayStatus);
        card.innerHTML = `
            <div class="wf-card-header">
                <span class="step-check">&#10004;</span>
                <span class="step-spinner" style="display:none;"></span>
                <span class="wf-card-status">${restoredLabel}</span>
            </div>
        `;
        if (isManuscriptCard) _ensureRerunManuscriptBtn(card);

        // Rebuild checkpoint summary card (with action buttons)
        if (cardData.checkpoint_steps && cardData.checkpoint_steps.length > 0) {
            // If the saved card has a task_id (from the checkpoint event),
            // seed window._completedTaskId so it's available for all actions
            // including the Proceed button. Falls back to existing value.
            if (cardData.task_id && !window._completedTaskId) {
                window._completedTaskId = cardData.task_id;
            }
            const cpTid = cardData.task_id || window._completedTaskId || '';
            const body = document.createElement('div');
            body.className = 'wf-card-body step-result-body';
            _renderCheckpointBody(body, cardData.checkpoint_steps, cpTid);
            card.appendChild(body);
            _makeCardCollapsible(card);
            if (isObjCard) {
                _ensureExecToolbar(container);
                const m = cardData.phase.match(/^exec_obj(\d+)$/);
                if (m) _addObjectiveGroupToggle(card, m[1]);
            }
            _getCardParent(container, cardData.phase).appendChild(card);
            return; // skip normal card body rendering for checkpoint cards
        }

        // Add card body with content if present
        if (hasContent) {
            const body = document.createElement('div');
            body.className = 'wf-card-body';
            // Match live view: add step-result-body class for cards with step results or rich content
            if (hasRichContent) body.classList.add('step-result-body');

            // If this card has rich content that replaces the raw streamed body, skip it
            const hasRichReplacement = cardData.rich_content && cardData.rich_content.some(
                rc => rc.content_type === 'result_presentation' ||
                      rc.content_type === 'result_discussion' ||
                      rc.content_type === 'research_plan_viz' ||
                      rc.content_type === 'geoprocessing_workflow_viz' ||
                      rc.content_type === 'manuscript_section' ||
                      rc.content_type === 'manuscript_complete'
            );

            if (cardData.body && !hasRichReplacement) {
                // Format into two distinct sections (matches displayStepResult)
                const rawText = cardData.body.trim();
                const codeMatch = rawText.match(/```python\s*([\s\S]*?)```/);

                // If step_results provide authoritative code, skip the stream code section
                // to avoid showing stale/broken code from the original execution.
                // The step_results "Generated Code" section (below) will show the final code.
                const stepResultsHaveCode = cardData.step_results && cardData.step_results.some(sr => sr.code);

                if (codeMatch && !stepResultsHaveCode) {
                    const beforeCode = rawText.substring(0, codeMatch.index).trim();
                    const codeContent = codeMatch[1].trim();
                    const afterCode = rawText.substring(codeMatch.index + codeMatch[0].length).trim();

                    // Compute status text: everything except the code block
                    const statusText = [beforeCode, afterCode].filter(Boolean).join('\n');

                    // === Section 1: Execution Log ===
                    if (statusText) {
                        const streamSection = document.createElement('div');
                        streamSection.className = 'wf-result-stream-section collapsed';
                        const streamHeader = document.createElement('div');
                        streamHeader.className = 'wf-section-header';
                        streamHeader.innerHTML = '<span class="wf-section-toggle">&#9656;</span> Execution Log';
                        streamHeader.style.cursor = 'pointer';
                        streamHeader.onclick = () => streamSection.classList.toggle('collapsed');
                        streamSection.appendChild(streamHeader);

                        const statusDiv = document.createElement('div');
                        statusDiv.className = 'wf-stream-status wf-section-content';
                        statusDiv.textContent = statusText;
                        streamSection.appendChild(statusDiv);

                        body.appendChild(streamSection);
                    }

                    // === Section 2: Generated Code ===
                    const codeSection = document.createElement('div');
                    codeSection.className = 'wf-result-code-section';
                    const codeHeader = document.createElement('div');
                    codeHeader.className = 'wf-section-header';
                    codeHeader.innerHTML = '<span class="wf-section-icon">&#128221;</span> Generated Code';
                    codeSection.appendChild(codeHeader);

                    const codeContainer = document.createElement('pre');
                    codeContainer.className = 'wf-stream-code';
                    const codeEl = document.createElement('code');
                    codeEl.className = 'language-python';
                    codeEl.textContent = codeContent;
                    codeContainer.appendChild(codeEl);
                    codeSection.appendChild(codeContainer);
                    if (window.hljs) hljs.highlightElement(codeEl);
                    attachCopyCodeButton(codeHeader, () => codeEl.textContent);

                    body.appendChild(codeSection);
                } else {
                    // No code in streamed text (or step_results have authoritative code)
                    // — wrap full body as Execution Log section
                    const logText = codeMatch
                        ? [rawText.substring(0, codeMatch.index).trim(),
                           rawText.substring(codeMatch.index + codeMatch[0].length).trim()].filter(Boolean).join('\n')
                        : rawText;
                    if (logText) {
                        const streamSection = document.createElement('div');
                        streamSection.className = 'wf-result-stream-section collapsed';
                        const streamHeader = document.createElement('div');
                        streamHeader.className = 'wf-section-header';
                        streamHeader.innerHTML = '<span class="wf-section-toggle">&#9656;</span> Execution Log';
                        streamHeader.style.cursor = 'pointer';
                        streamHeader.onclick = () => streamSection.classList.toggle('collapsed');
                        streamSection.appendChild(streamHeader);

                        const pre = document.createElement('pre');
                        pre.className = 'wf-stream-log wf-section-content';
                        pre.textContent = logText;
                        streamSection.appendChild(pre);

                        body.appendChild(streamSection);
                    }
                }
            }

            // Rebuild step result sections
            if (cardData.step_results) {
                // Add status badge to card header from last step result
                const lastSr = cardData.step_results[cardData.step_results.length - 1];
                if (lastSr) {
                    const srStatus = lastSr.status || 'unknown';
                    const cardHeader = card.querySelector('.wf-card-header');
                    if (cardHeader) {
                        const badge = document.createElement('span');
                        const srBadgeClass = srStatus === 'completed' ? 'success' : (srStatus === 'skipped' ? 'skipped' : 'error');
                        const srBadgeText = srStatus === 'completed' ? 'Completed' : (srStatus === 'skipped' ? 'Skipped' : 'Error');
                        badge.className = `wf-card-badge ${srBadgeClass}`;
                        badge.textContent = srBadgeText;
                        cardHeader.appendChild(badge);
                    }
                }
                cardData.step_results.forEach(sr => {
                    const resultDiv = document.createElement('div');
                    resultDiv.className = 'step-result-section';

                    const headerRow = document.createElement('div');
                    headerRow.className = 'step-result-header';

                    const stepLabel = document.createElement('span');
                    stepLabel.className = 'step-result-label';
                    stepLabel.textContent = sr.step_description
                        ? `Step ${sr.step_index}: ${sr.step_description}`
                        : `Step ${sr.step_index}`;
                    headerRow.appendChild(stepLabel);

                    const statusBadge = document.createElement('span');
                    const srSc = sr.status === 'completed' ? 'success' : (sr.status === 'skipped' ? 'skipped' : 'error');
                    const srSt = sr.status === 'completed' ? 'Completed' : (sr.status === 'skipped' ? 'Skipped' : 'Error');
                    statusBadge.className = `step-result-status ${srSc}`;
                    statusBadge.textContent = srSt;
                    headerRow.appendChild(statusBadge);

                    resultDiv.appendChild(headerRow);

                    // Error message if any
                    if (sr.error) {
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'step-result-error';
                        errorDiv.innerHTML = `<div style="font-weight:bold;">${sr.error}</div>`;
                        resultDiv.appendChild(errorDiv);
                    }

                    // Rebuild artifact tiles (mirrors live displayStepResult)
                    const srArtifacts = sr.artifacts || [];
                    const visibleArtifacts = srArtifacts.filter(a => !a.is_shapefile_component);
                    const hasTiles = (sr.output && sr.output.trim()) || visibleArtifacts.length > 0;

                    if (hasTiles) {
                        const grid = document.createElement('div');
                        grid.className = 'step-result-artifacts-grid';

                        // Output tile
                        if (sr.output && sr.output.trim()) {
                            const outputTile = document.createElement('div');
                            outputTile.className = 'step-artifact-card step-output-tile';
                            outputTile.innerHTML = `
                                <span class="artifact-icon">\u{1F4DD}</span>
                                <span class="artifact-name" title="Click to view full output">Console Output</span>
                                <span class="artifact-size">${sr.output.length} chars</span>
                            `;
                            outputTile.addEventListener('click', () => {
                                showOutputInResultsPanel(sr.step_index, sr.step_description, sr.output, sr.status, '');
                            });
                            grid.appendChild(outputTile);
                        }

                        // Artifact file tiles
                        visibleArtifacts.forEach(artifact => {
                            const tile = document.createElement('div');
                            tile.className = 'step-artifact-card';

                            let icon = '\u{1F4C4}';
                            const t = (artifact.type || '').toLowerCase();
                            if (t === 'png' || t === 'jpg' || t === 'jpeg') icon = '\u{1F5BC}\uFE0F';
                            else if (t === 'csv') icon = '\u{1F4CA}';
                            else if (t === 'html') icon = '\u{1F310}';
                            else if (t === 'json' || t === 'geojson') icon = '\u{1F4CB}';
                            else if (t === 'gpkg' || t === 'shp') icon = '\u{1F5FA}\uFE0F';
                            else if (t === 'txt' || t === 'md') icon = '\u{1F4DD}';
                            else if (t === 'npy') icon = '\u{1F522}';

                            const sizeKB = (artifact.size / 1024).toFixed(1);
                            const displayName = typeof getDisplayName === 'function' ? getDisplayName(artifact.filename) : artifact.filename;

                            tile.innerHTML = `
                                <span class="artifact-icon">${icon}</span>
                                <span class="artifact-name" title="${artifact.filename}">${displayName}</span>
                                <span class="artifact-size">${sizeKB} KB</span>
                            `;

                            tile.addEventListener('click', () => previewArtifact(artifact));
                            grid.appendChild(tile);
                        });

                        resultDiv.appendChild(grid);

                        // Track artifacts globally
                        if (visibleArtifacts.length > 0) {
                            if (window.currentArtifacts) {
                                window.currentArtifacts.push(...srArtifacts);
                            } else {
                                window.currentArtifacts = [...srArtifacts];
                            }
                        }
                    } else if (sr.output) {
                        // Fallback: plain output if no artifact tiles
                        const outputPre = document.createElement('pre');
                        outputPre.className = 'wf-stream-log';
                        outputPre.textContent = sr.output;
                        resultDiv.appendChild(outputPre);
                    }

                    // Rebuild code editing controls (Edit / Re-run / Regenerate)
                    const stepCode = sr.code || '';
                    // Recover objective_key from the card phase for old conversations
                    // saved before objective_key was persisted (spatial-analysis
                    // assembly_execution carries objective_key='assembly' in the live
                    // event but earlier persistence dropped it, leaving the field empty).
                    let objKey = sr.objective_key || cardData.objective_key || '';
                    if (!objKey && cardData.phase === 'assembly_execution') {
                        objKey = 'assembly';
                    }
                    const stepIdx = sr.step_index;
                    const srStatusNorm = (sr.status || '').toLowerCase();
                    if (stepCode) {
                        // Wrap code + (optional) edit controls in a "Generated Code" section.
                        // Render the code block whenever stepCode is present so spatial-analysis
                        // cards (which don't carry objective_key) still display the generated
                        // code on conversation reload. Action buttons are only added below
                        // when objKey is present.
                        const codeSection = document.createElement('div');
                        codeSection.className = 'wf-result-code-section';
                        const codeSectionHeader = document.createElement('div');
                        codeSectionHeader.className = 'wf-section-header';
                        codeSectionHeader.innerHTML = '<span class="wf-section-icon">&#128221;</span> Generated Code';
                        codeSection.appendChild(codeSectionHeader);

                        // Syntax-highlighted code block
                        const codePre = document.createElement('pre');
                        codePre.className = 'wf-stream-code';
                        const codeEl = document.createElement('code');
                        codeEl.className = 'language-python';
                        codeEl.textContent = stepCode;
                        codePre.appendChild(codeEl);
                        codeSection.appendChild(codePre);
                        if (window.hljs) hljs.highlightElement(codeEl);
                        attachCopyCodeButton(codeSectionHeader, () => codeEl.textContent);

                        if (!objKey) {
                            // No objective key — just append the code section without
                            // edit/re-run controls (matches live spatial-analysis behaviour).
                            resultDiv.appendChild(codeSection);
                            body.appendChild(resultDiv);
                            return;
                        }

                        // Editor textarea (hidden until Edit is clicked)
                        const editorArea = document.createElement('textarea');
                        editorArea.className = 'wf-stream-code-editor';
                        editorArea.value = stepCode;
                        editorArea.spellcheck = false;
                        editorArea.style.display = 'none';
                        codeSection.appendChild(editorArea);

                        let currentCode = stepCode;

                        // Action buttons
                        const actions = document.createElement('div');
                        actions.className = 'step-code-actions';

                        const editBtn = document.createElement('button');
                        editBtn.className = 'btn-edit-code';
                        editBtn.textContent = 'Edit Code';

                        const saveBtn = document.createElement('button');
                        saveBtn.className = 'btn-save-code';
                        saveBtn.textContent = 'Save';
                        saveBtn.style.display = 'none';

                        const runBtn = document.createElement('button');
                        runBtn.className = 'btn-run-code';
                        runBtn.textContent = 'Re-run';

                        const regenBtn = document.createElement('button');
                        regenBtn.className = 'btn-regenerate';
                        regenBtn.textContent = 'Provide Feedback';

                        const reExecBtn = document.createElement('button');
                        reExecBtn.className = 'btn-re-execute';
                        reExecBtn.textContent = 'Re-execute Step';

                        editBtn.onclick = () => {
                            editorArea.value = currentCode;
                            codePre.style.display = 'none';
                            editorArea.style.display = '';
                            editBtn.style.display = 'none';
                            saveBtn.style.display = '';
                        };

                        saveBtn.onclick = () => {
                            currentCode = editorArea.value;
                            editorArea.style.display = 'none';
                            codePre.style.display = '';
                            codeEl.textContent = currentCode;
                            codeEl.classList.remove('hljs');
                            if (window.hljs) hljs.highlightElement(codeEl);
                            saveBtn.style.display = 'none';
                            editBtn.style.display = '';
                        };

                        runBtn.onclick = () => {
                            if (editorArea.style.display !== 'none') {
                                currentCode = editorArea.value;
                                editorArea.style.display = 'none';
                                codePre.style.display = '';
                                codeEl.textContent = currentCode;
                                codeEl.classList.remove('hljs');
                                if (window.hljs) hljs.highlightElement(codeEl);
                                saveBtn.style.display = 'none';
                                editBtn.style.display = '';
                            }
                            const tid = _activeTaskId();
                            if (!tid) { addLog('[Error] No task ID available for re-run', 'error'); return; }
                            if (objKey === 'assembly') {
                                rerunAssembly(tid, 'edit', currentCode, '', resultDiv);
                            } else {
                                rerunStep(tid, objKey, stepIdx, 'edit', currentCode, '', resultDiv);
                            }
                        };

                        // Re-execute Step — regenerate code from scratch
                        reExecBtn.onclick = () => {
                            const tid = _activeTaskId();
                            if (!tid) { addLog('[Error] No task ID available for re-execute', 'error'); return; }
                            if (objKey === 'assembly') {
                                rerunAssembly(tid, 're_execute', null, '', resultDiv);
                            } else {
                                rerunStep(tid, objKey, stepIdx, 're_execute', null, '', resultDiv);
                            }
                        };

                        // Feedback textarea (hidden until Provide Feedback is clicked)
                        const feedbackArea = document.createElement('textarea');
                        feedbackArea.className = 'wf-feedback-textarea';
                        feedbackArea.placeholder = 'Describe what you want changed or improved...';
                        feedbackArea.spellcheck = true;
                        feedbackArea.style.display = 'none';

                        const feedbackActions = document.createElement('div');
                        feedbackActions.className = 'wf-feedback-actions';
                        feedbackActions.style.display = 'none';

                        const submitFeedbackBtn = document.createElement('button');
                        submitFeedbackBtn.className = 'btn-run-code';
                        submitFeedbackBtn.textContent = 'Revise Code';

                        const cancelFeedbackBtn = document.createElement('button');
                        cancelFeedbackBtn.className = 'btn-edit-code';
                        cancelFeedbackBtn.textContent = 'Cancel';

                        feedbackActions.appendChild(submitFeedbackBtn);
                        feedbackActions.appendChild(cancelFeedbackBtn);

                        regenBtn.onclick = () => {
                            const isVisible = feedbackArea.style.display !== 'none';
                            feedbackArea.style.display = isVisible ? 'none' : '';
                            feedbackActions.style.display = isVisible ? 'none' : '';
                            if (!isVisible) feedbackArea.focus();
                        };

                        submitFeedbackBtn.onclick = () => {
                            const instructions = feedbackArea.value.trim();
                            const tid = _activeTaskId();
                            if (!tid) { addLog('[Error] No task ID available for re-run', 'error'); return; }
                            if (objKey === 'assembly') {
                                rerunAssembly(tid, 'regenerate', null, instructions, resultDiv);
                            } else {
                                rerunStep(tid, objKey, stepIdx, 'regenerate', null, instructions, resultDiv);
                            }
                            feedbackArea.style.display = 'none';
                            feedbackActions.style.display = 'none';
                            feedbackArea.value = '';
                        };

                        cancelFeedbackBtn.onclick = () => {
                            feedbackArea.style.display = 'none';
                            feedbackActions.style.display = 'none';
                        };

                        actions.appendChild(editBtn);
                        actions.appendChild(saveBtn);
                        actions.appendChild(runBtn);
                        actions.appendChild(regenBtn);
                        actions.appendChild(reExecBtn);
                        codeSection.appendChild(actions);
                        codeSection.appendChild(feedbackArea);
                        codeSection.appendChild(feedbackActions);

                        resultDiv.appendChild(codeSection);

                        // Store refs for updating after re-run
                        resultDiv._existingCodePre = codePre;
                        resultDiv._existingCodeEl = codeEl;
                        resultDiv._editorArea = editorArea;
                        resultDiv._setCurrentCode = (c) => { currentCode = c; };
                    } else if (objKey && (srStatusNorm === 'skipped' || srStatusNorm === 'error')) {
                        // No generated code (typical for steps skipped due to upstream
                        // failure, or error-before-codegen). Still offer Re-execute /
                        // Provide Feedback so the user can retry this step.
                        _buildMinimalStepActions(resultDiv, objKey, stepIdx);
                    }

                    body.appendChild(resultDiv);
                });
            }

            // Rebuild rich content (figure catalog, flowcharts, markdown results, code reviews, research plan viz)
            if (cardData.rich_content) {
                cardData.rich_content.forEach(rc => {
                    if (rc.content_type === 'figure_catalog') {
                        // Rebuild figure catalog tiles (same style as step result tiles)
                        const figures = rc.figures || [];
                        if (figures.length > 0) {
                            const grid = document.createElement('div');
                            grid.className = 'step-result-artifacts-grid';

                            figures.forEach(fig => {
                                const tile = document.createElement('div');
                                tile.className = 'step-artifact-card';

                                const filename = fig.relative_path.split('/').pop();
                                const displayName = filename.length > 18 ? filename.substring(0, 15) + '...' : filename;

                                tile.innerHTML = `
                                    <span class="artifact-icon">\u{1F5BC}\u{FE0F}</span>
                                    <span class="artifact-name" title="Figure ${fig.figure_number}: ${fig.description || filename}">${displayName}</span>
                                    <span class="artifact-size">Fig ${fig.figure_number}</span>
                                `;

                                tile.addEventListener('click', () => {
                                    previewArtifact({
                                        filename: filename,
                                        relative_path: fig.relative_path,
                                        type: 'png',
                                        size: 0,
                                        display_title: `Figure ${fig.figure_number}: ${fig.description || filename}`,
                                    });
                                });
                                grid.appendChild(tile);
                            });

                            body.appendChild(grid);
                        }
                    } else if (rc.content_type === 'execution_flowchart') {
                        const rcContainer = document.createElement('div');
                        rcContainer.className = 'ra-embed-section';

                        const iframeContainer = document.createElement('div');
                        iframeContainer.style.cssText = 'width: 100%; height: 500px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-top: 6px;';

                        const url = `${API_BASE_URL}/api/artifacts/${_encodeArtifactPath(_normalizeRelPath(rc.relative_path))}?v=${Date.now()}`;
                        const iframe = document.createElement('iframe');
                        iframe.src = url;
                        iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
                        iframeContainer.appendChild(iframe);
                        rcContainer.appendChild(iframeContainer);

                        const actionsDiv = document.createElement('div');
                        actionsDiv.style.cssText = 'margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap;';

                        const openBtn = document.createElement('button');
                        openBtn.textContent = '\u2197 Open in New Tab';
                        openBtn.className = 'btn-secondary';
                        openBtn.style.cssText = 'padding: 6px 12px; font-size: 0.82em;';
                        openBtn.onclick = () => window.open(url, '_blank');
                        actionsDiv.appendChild(openBtn);

                        const fullViewBtn = document.createElement('button');
                        fullViewBtn.innerHTML = '&#11036; Full View';
                        fullViewBtn.className = 'btn-secondary';
                        fullViewBtn.style.cssText = 'padding: 6px 12px; font-size: 0.82em;';
                        fullViewBtn.onclick = () => openIframeFullView(url, 'Execution Flowchart');
                        actionsDiv.appendChild(fullViewBtn);

                        // Results Panel button (matches live displayExecutionFlowchart)
                        const fcPanelBtn = document.createElement('button');
                        fcPanelBtn.textContent = '\u{1F4CB} Results Panel';
                        fcPanelBtn.className = 'btn-secondary';
                        fcPanelBtn.style.cssText = 'padding: 6px 12px; font-size: 0.82em;';
                        fcPanelBtn.onclick = () => {
                            previewArtifact({
                                filename: 'execution_flowchart.html',
                                relative_path: rc.relative_path,
                                type: 'html',
                                size: 0,
                            });
                        };
                        actionsDiv.appendChild(fcPanelBtn);

                        rcContainer.appendChild(actionsDiv);
                        body.appendChild(rcContainer);

                    } else if (rc.content_type === 'result_presentation' || rc.content_type === 'result_discussion') {
                        const isPresentation = rc.content_type === 'result_presentation';
                        const rcTitle = isPresentation ? 'Result Presentation' : 'Result Discussion';
                        const rcIcon = isPresentation ? '\u{1F4CA}' : '\u{1F4AC}';

                        const rcContainer = document.createElement('div');
                        rcContainer.className = 'ra-embed-section';

                        const titleSection = document.createElement('div');
                        titleSection.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; margin-top: 8px;';
                        titleSection.innerHTML = `
                            <h4 style="margin: 0; display: flex; align-items: center; gap: 8px; font-size: 0.95em;">
                                <span>${rcIcon}</span> ${rcTitle}
                            </h4>
                        `;
                        const toggleBtn = document.createElement('button');
                        toggleBtn.textContent = 'Collapse';
                        toggleBtn.className = 'btn-secondary';
                        toggleBtn.style.cssText = 'padding: 3px 10px; font-size: 0.78em;';
                        titleSection.appendChild(toggleBtn);
                        rcContainer.appendChild(titleSection);

                        const contentDiv = document.createElement('div');
                        contentDiv.className = 'result-markdown-content';
                        contentDiv.style.cssText = 'max-height: 500px; overflow: auto; border: 1px solid #ddd; border-radius: 8px; padding: 12px;';
                        if (window.marked) {
                            contentDiv.innerHTML = marked.parse(rc.content);
                            _fixResultImages(contentDiv);
                            contentDiv.querySelectorAll('pre code').forEach(block => {
                                if (window.hljs) hljs.highlightElement(block);
                            });
                        } else {
                            const pre = document.createElement('pre');
                            pre.style.cssText = 'white-space: pre-wrap; word-wrap: break-word; font-size: 0.9em;';
                            pre.textContent = rc.content;
                            contentDiv.appendChild(pre);
                        }
                        rcContainer.appendChild(contentDiv);

                        // Action buttons (match live displayMarkdownResult)
                        const rcActionsDiv = document.createElement('div');
                        rcActionsDiv.style.cssText = 'margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap;';

                        // Download button if relative_path available
                        if (rc.relative_path) {
                            const reportType = isPresentation ? 'presentation' : 'discussion';
                            const formats = [
                                { label: 'Markdown (.md)', fmt: 'md', fmtIcon: '\u{1F4DD}' },
                                { label: 'Word (.docx)', fmt: 'docx', fmtIcon: '\u{1F4C4}' },
                                { label: 'PDF (.pdf)', fmt: 'pdf', fmtIcon: '\u{1F4D5}' },
                            ];

                            const downloadWrapper = document.createElement('div');
                            downloadWrapper.style.cssText = 'position: relative; display: inline-block;';

                            const dlBtn = document.createElement('button');
                            dlBtn.textContent = '\u2B07 Download \u25BE';
                            dlBtn.className = 'btn-secondary';
                            dlBtn.style.cssText = 'padding: 6px 12px; font-size: 0.82em;';

                            const dropdownMenu = document.createElement('div');
                            dropdownMenu.style.cssText = 'display: none; position: absolute; bottom: 100%; left: 0; margin-bottom: 4px; background: #fff; border: 1px solid #ddd; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 100; min-width: 150px; overflow: hidden;';

                            formats.forEach(({ label, fmt, fmtIcon }) => {
                                const item = document.createElement('div');
                                item.textContent = `${fmtIcon} ${label}`;
                                item.style.cssText = 'padding: 8px 14px; cursor: pointer; font-size: 0.85em; transition: background 0.15s;';
                                item.onmouseenter = () => { item.style.background = '#f0f4ff'; };
                                item.onmouseleave = () => { item.style.background = ''; };
                                item.onclick = (e) => {
                                    e.stopPropagation();
                                    dropdownMenu.style.display = 'none';
                                    const _tid = _activeTaskId();
                                    window.open(`${API_BASE_URL}/api/report-download/${reportType}/${fmt}${_tid ? '?task_id=' + _tid : ''}`, '_blank');
                                };
                                dropdownMenu.appendChild(item);
                            });

                            dlBtn.onclick = (e) => {
                                e.stopPropagation();
                                dropdownMenu.style.display = dropdownMenu.style.display === 'none' ? '' : 'none';
                            };
                            document.addEventListener('click', () => { dropdownMenu.style.display = 'none'; });

                            downloadWrapper.appendChild(dlBtn);
                            downloadWrapper.appendChild(dropdownMenu);
                            rcActionsDiv.appendChild(downloadWrapper);
                        }

                        // Copy button
                        const rcCopyBtn = document.createElement('button');
                        rcCopyBtn.textContent = '\u{1F4CB} Copy';
                        rcCopyBtn.className = 'btn-secondary';
                        rcCopyBtn.style.cssText = 'padding: 6px 12px; font-size: 0.82em;';
                        rcCopyBtn.onclick = () => {
                            navigator.clipboard.writeText(rc.content).then(() => {
                                rcCopyBtn.textContent = '\u2713 Copied!';
                                setTimeout(() => { rcCopyBtn.textContent = '\u{1F4CB} Copy'; }, 2000);
                            });
                        };
                        rcActionsDiv.appendChild(rcCopyBtn);

                        // Results Panel button
                        const rcPanelBtn = document.createElement('button');
                        rcPanelBtn.textContent = '\u{1F4CB} Results Panel';
                        rcPanelBtn.className = 'btn-secondary';
                        rcPanelBtn.style.cssText = 'padding: 6px 12px; font-size: 0.82em;';
                        rcPanelBtn.onclick = () => {
                            showMarkdownInResultsPanel(rcTitle, rc.content);
                        };
                        rcActionsDiv.appendChild(rcPanelBtn);

                        rcContainer.appendChild(rcActionsDiv);

                        // Collapse/expand toggle (also hides actions, matching live view)
                        toggleBtn.onclick = () => {
                            if (contentDiv.style.display === 'none') {
                                contentDiv.style.display = '';
                                rcActionsDiv.style.display = '';
                                toggleBtn.textContent = 'Collapse';
                            } else {
                                contentDiv.style.display = 'none';
                                rcActionsDiv.style.display = 'none';
                                toggleBtn.textContent = 'Expand';
                            }
                        };

                        body.appendChild(rcContainer);

                    } else if (rc.content_type === 'code_review') {
                        // Read-only code review snapshot
                        const reviewDiv = document.createElement('div');
                        reviewDiv.className = 'code-review-container';
                        reviewDiv.style.marginTop = '8px';

                        const reviewLabel = document.createElement('div');
                        reviewLabel.className = 'step-result-header';
                        reviewLabel.innerHTML = `
                            <span class="step-result-label">${rc.step_description || 'Code Review'}</span>
                            <span class="step-result-status" style="background: #e3f2fd; color: #1565c0;">Reviewed</span>
                        `;
                        reviewDiv.appendChild(reviewLabel);

                        if (rc.code) {
                            const codeView = document.createElement('pre');
                            codeView.className = 'wf-stream-code';
                            const codeBlock = document.createElement('code');
                            codeBlock.className = 'language-python';
                            codeBlock.textContent = rc.code;
                            codeView.appendChild(codeBlock);
                            if (window.hljs) hljs.highlightElement(codeBlock);
                            reviewDiv.appendChild(codeView);
                        }

                        body.appendChild(reviewDiv);

                    } else if (rc.content_type === 'manuscript_section') {
                        const sectionNames = {
                            'title_abstract': 'Title & Abstract',
                            'introduction': 'Introduction',
                            'methodology': 'Methodology',
                            'results': 'Results',
                            'discussion': 'Discussion',
                            'conclusion': 'Conclusion',
                            'references': 'References',
                        };
                        const sectionTitle = sectionNames[rc.section] || rc.section || 'Manuscript Section';

                        const msContainer = document.createElement('div');
                        msContainer.className = 'ra-embed-section';

                        const msTitleSection = document.createElement('div');
                        msTitleSection.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; margin-top: 8px;';
                        msTitleSection.innerHTML = `
                            <h4 style="margin: 0; display: flex; align-items: center; gap: 8px; font-size: 0.95em;">
                                <span>\u{1F4D1}</span> ${sectionTitle}
                            </h4>
                        `;
                        const msToggleBtn = document.createElement('button');
                        msToggleBtn.textContent = 'Collapse';
                        msToggleBtn.className = 'btn-secondary';
                        msToggleBtn.style.cssText = 'padding: 3px 10px; font-size: 0.78em;';
                        msTitleSection.appendChild(msToggleBtn);
                        msContainer.appendChild(msTitleSection);

                        const msContentDiv = document.createElement('div');
                        msContentDiv.className = 'result-markdown-content';
                        msContentDiv.style.cssText = 'max-height: 500px; overflow: auto; border: 1px solid #ddd; border-radius: 8px; padding: 12px;';
                        if (window.marked) {
                            msContentDiv.innerHTML = marked.parse(rc.content || '');
                            _fixResultImages(msContentDiv);
                            msContentDiv.querySelectorAll('pre code').forEach(block => {
                                if (window.hljs) hljs.highlightElement(block);
                            });
                        } else {
                            const pre = document.createElement('pre');
                            pre.style.cssText = 'white-space: pre-wrap; word-wrap: break-word; font-size: 0.9em;';
                            pre.textContent = rc.content || '';
                            msContentDiv.appendChild(pre);
                        }
                        msContainer.appendChild(msContentDiv);

                        // Copy button for manuscript section
                        const msActionsDiv = document.createElement('div');
                        msActionsDiv.style.cssText = 'margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap;';

                        const msCopyBtn = document.createElement('button');
                        msCopyBtn.textContent = '\u{1F4CB} Copy';
                        msCopyBtn.className = 'btn-secondary';
                        msCopyBtn.style.cssText = 'padding: 6px 12px; font-size: 0.82em;';
                        msCopyBtn.onclick = () => {
                            navigator.clipboard.writeText(rc.content || '').then(() => {
                                msCopyBtn.textContent = '\u2713 Copied!';
                                setTimeout(() => { msCopyBtn.textContent = '\u{1F4CB} Copy'; }, 2000);
                            });
                        };
                        msActionsDiv.appendChild(msCopyBtn);

                        const msPanelBtn = document.createElement('button');
                        msPanelBtn.textContent = '\u{1F4CB} Results Panel';
                        msPanelBtn.className = 'btn-secondary';
                        msPanelBtn.style.cssText = 'padding: 6px 12px; font-size: 0.82em;';
                        msPanelBtn.onclick = () => {
                            showMarkdownInResultsPanel(sectionTitle, rc.content || '');
                        };
                        msActionsDiv.appendChild(msPanelBtn);
                        msContainer.appendChild(msActionsDiv);

                        msToggleBtn.onclick = () => {
                            if (msContentDiv.style.display === 'none') {
                                msContentDiv.style.display = '';
                                msActionsDiv.style.display = '';
                                msToggleBtn.textContent = 'Collapse';
                            } else {
                                msContentDiv.style.display = 'none';
                                msActionsDiv.style.display = 'none';
                                msToggleBtn.textContent = 'Expand';
                            }
                        };

                        body.appendChild(msContainer);

                    } else if (rc.content_type === 'manuscript_complete') {
                        const mcContainer = document.createElement('div');
                        mcContainer.className = 'ra-embed-section';

                        const mcTitleSection = document.createElement('div');
                        mcTitleSection.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; margin-top: 8px;';
                        mcTitleSection.innerHTML = `
                            <h4 style="margin: 0; display: flex; align-items: center; gap: 8px; font-size: 0.95em;">
                                <span>\u{1F4D5}</span> Complete Manuscript
                            </h4>
                        `;
                        const mcToggleBtn = document.createElement('button');
                        mcToggleBtn.textContent = 'Collapse';
                        mcToggleBtn.className = 'btn-secondary';
                        mcToggleBtn.style.cssText = 'padding: 3px 10px; font-size: 0.78em;';
                        mcTitleSection.appendChild(mcToggleBtn);
                        mcContainer.appendChild(mcTitleSection);

                        const mcContentDiv = document.createElement('div');
                        mcContentDiv.className = 'result-markdown-content';
                        mcContentDiv.style.cssText = 'max-height: 600px; overflow: auto; border: 1px solid #ddd; border-radius: 8px; padding: 12px;';
                        if (window.marked) {
                            mcContentDiv.innerHTML = marked.parse(rc.content || '');
                            _fixResultImages(mcContentDiv);
                            mcContentDiv.querySelectorAll('pre code').forEach(block => {
                                if (window.hljs) hljs.highlightElement(block);
                            });
                        } else {
                            const pre = document.createElement('pre');
                            pre.style.cssText = 'white-space: pre-wrap; word-wrap: break-word; font-size: 0.9em;';
                            pre.textContent = rc.content || '';
                            mcContentDiv.appendChild(pre);
                        }
                        mcContainer.appendChild(mcContentDiv);

                        // Action buttons for manuscript complete
                        const mcActionsDiv = document.createElement('div');
                        mcActionsDiv.style.cssText = 'margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap;';

                        // Download dropdown — PDF intentionally omitted for manuscript
                        const formats = [
                            { label: 'Markdown (.md)', fmt: 'md', fmtIcon: '\u{1F4DD}' },
                            { label: 'Word (.docx)', fmt: 'docx', fmtIcon: '\u{1F4C4}' },
                            // { label: 'PDF (.pdf)', fmt: 'pdf', fmtIcon: '\u{1F4D5}' },
                        ];

                        const downloadWrapper = document.createElement('div');
                        downloadWrapper.style.cssText = 'position: relative; display: inline-block;';

                        const dlBtn = document.createElement('button');
                        dlBtn.textContent = '\u2B07 Download \u25BE';
                        dlBtn.className = 'btn-secondary';
                        dlBtn.style.cssText = 'padding: 6px 12px; font-size: 0.82em;';

                        const dropdownMenu = document.createElement('div');
                        dropdownMenu.style.cssText = 'display: none; position: absolute; bottom: 100%; left: 0; margin-bottom: 4px; background: #fff; border: 1px solid #ddd; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 100; min-width: 150px; overflow: hidden;';

                        formats.forEach(({ label, fmt, fmtIcon }) => {
                            const item = document.createElement('div');
                            item.textContent = `${fmtIcon} ${label}`;
                            item.style.cssText = 'padding: 8px 14px; cursor: pointer; font-size: 0.85em; transition: background 0.15s;';
                            item.onmouseenter = () => { item.style.background = '#f0f4ff'; };
                            item.onmouseleave = () => { item.style.background = ''; };
                            item.onclick = (e) => {
                                e.stopPropagation();
                                dropdownMenu.style.display = 'none';
                                const _tid = _activeTaskId();
                                window.open(`${API_BASE_URL}/api/report-download/manuscript/${fmt}${_tid ? '?task_id=' + _tid : ''}`, '_blank');
                            };
                            dropdownMenu.appendChild(item);
                        });

                        dlBtn.onclick = (e) => {
                            e.stopPropagation();
                            dropdownMenu.style.display = dropdownMenu.style.display === 'none' ? '' : 'none';
                        };
                        document.addEventListener('click', () => { dropdownMenu.style.display = 'none'; });

                        downloadWrapper.appendChild(dlBtn);
                        downloadWrapper.appendChild(dropdownMenu);
                        mcActionsDiv.appendChild(downloadWrapper);

                        // Copy button
                        const mcCopyBtn = document.createElement('button');
                        mcCopyBtn.textContent = '\u{1F4CB} Copy';
                        mcCopyBtn.className = 'btn-secondary';
                        mcCopyBtn.style.cssText = 'padding: 6px 12px; font-size: 0.82em;';
                        mcCopyBtn.onclick = () => {
                            navigator.clipboard.writeText(rc.content || '').then(() => {
                                mcCopyBtn.textContent = '\u2713 Copied!';
                                setTimeout(() => { mcCopyBtn.textContent = '\u{1F4CB} Copy'; }, 2000);
                            });
                        };
                        mcActionsDiv.appendChild(mcCopyBtn);

                        // Results Panel button
                        const mcPanelBtn = document.createElement('button');
                        mcPanelBtn.textContent = '\u{1F4CB} Results Panel';
                        mcPanelBtn.className = 'btn-secondary';
                        mcPanelBtn.style.cssText = 'padding: 6px 12px; font-size: 0.82em;';
                        mcPanelBtn.onclick = () => {
                            showMarkdownInResultsPanel('Complete Manuscript', rc.content || '');
                        };
                        mcActionsDiv.appendChild(mcPanelBtn);

                        mcContainer.appendChild(mcActionsDiv);

                        // Collapse toggle (also hides actions)
                        mcToggleBtn.onclick = () => {
                            if (mcContentDiv.style.display === 'none') {
                                mcContentDiv.style.display = '';
                                mcActionsDiv.style.display = '';
                                mcToggleBtn.textContent = 'Collapse';
                            } else {
                                mcContentDiv.style.display = 'none';
                                mcActionsDiv.style.display = 'none';
                                mcToggleBtn.textContent = 'Expand';
                            }
                        };

                        body.appendChild(mcContainer);

                    } else if (rc.content_type === 'error') {
                        const errDiv = document.createElement('div');
                        errDiv.style.cssText = 'margin-top: 8px; padding: 10px 14px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; font-size: 0.9em;';
                        errDiv.innerHTML = `<strong>\u26A0 Error:</strong> ${rc.error || 'Unknown error'}`;
                        body.appendChild(errDiv);

                    } else if (rc.content_type === 'eda_explore_complete') {
                        if (rc.artifacts && rc.artifacts.length > 0) {
                            const grid = document.createElement('div');
                            grid.className = 'step-result-artifacts-grid';
                            grid.style.marginTop = '8px';
                            rc.artifacts.forEach(a => {
                                const artCard = document.createElement('div');
                                artCard.className = 'step-result-artifact-card';
                                const fileName = a.filename || a.relative_path.split('/').pop();
                                artCard.innerHTML = `
                                    <div class="artifact-icon">\u{1F4C1}</div>
                                    <div class="artifact-name" title="${fileName}">${fileName}</div>
                                `;
                                artCard.onclick = () => {
                                    window.open(`${API_BASE_URL}/api/artifacts/${_encodeArtifactPath(_normalizeRelPath(a.relative_path))}`, '_blank');
                                };
                                grid.appendChild(artCard);
                            });
                            body.appendChild(grid);
                        }

                    } else if (rc.content_type === 'data_download_summary') {
                        // Rebuild the green/red download summary panel
                        const files = rc.files || [];
                        const summaryDiv = document.createElement('div');
                        summaryDiv.className = 'wf-download-summary';

                        let html;
                        if (files.length) {
                            summaryDiv.style.cssText = 'margin-top:10px; padding:12px 14px; background:#d4edda; border:1px solid #c3e6cb; border-radius:6px; font-size:0.9em; color:#155724;';
                            html = `<div style="font-weight:600; margin-bottom:6px;">Downloaded ${files.length} file(s) added to data registry:</div>`;
                            html += '<ul style="margin:0; padding-left:18px;">';
                            for (const f of files) {
                                const shape = Array.isArray(f.shape) ? `${f.shape[0]} rows x ${f.shape[1]} cols` : (f.shape || '');
                                html += `<li><strong>${f.file || f.displayName || ''}</strong>${shape ? ` &mdash; ${shape}` : ''}</li>`;
                            }
                            html += '</ul>';
                        } else {
                            summaryDiv.style.cssText = 'margin-top:10px; padding:12px 14px; background:#f8d7da; border:1px solid #f5c6cb; border-radius:6px; font-size:0.9em; color:#721c24;';
                            html = `<div style="font-weight:600; margin-bottom:6px;">\u26A0\uFE0F No files downloaded</div>`;
                            html += `<div>${rc.content || ''}</div>`;
                        }
                        summaryDiv.innerHTML = html;
                        body.appendChild(summaryDiv);

                    } else if (rc.content_type === 'data_source_select_approval') {
                        // Rebuild the data source review card (read-only) and
                        // place it between Execution Log and Generated Code so
                        // the sub-card order matches the live view:
                        // Execution Log → Data Source Review → Generated Code → Downloaded file.
                        const reviewEl = renderDataSourceSelectReviewReadOnly(rc);
                        const codeSec = body.querySelector('.wf-result-code-section');
                        if (codeSec) {
                            body.insertBefore(reviewEl, codeSec);
                        } else {
                            body.appendChild(reviewEl);
                        }

                    } else if (rc.content_type === 'data_request_files') {
                        // Rebuild per-request file tiles on a data_download_req_N sub-card
                        const files = rc.files || [];
                        const tilesWrap = document.createElement('div');
                        tilesWrap.className = 'wf-request-tiles';
                        if (files.length === 0) {
                            tilesWrap.classList.add('wf-request-tiles-empty');
                            tilesWrap.textContent = 'No files downloaded for this request.';
                        } else {
                            const tilesHeader = document.createElement('div');
                            tilesHeader.className = 'wf-request-tiles-header';
                            tilesHeader.textContent = `Downloaded ${files.length} file(s):`;
                            tilesWrap.appendChild(tilesHeader);
                            const grid = document.createElement('div');
                            grid.className = 'step-result-artifacts-grid';
                            for (const f of files) {
                                grid.appendChild(_buildDataRequestTile(f));
                            }
                            tilesWrap.appendChild(grid);
                        }
                        body.appendChild(tilesWrap);

                    } else if (rc.content_type === 'research_plan_viz') {
                        // Defer — render as a separate chat message after the cards
                        deferredVizEntries.push(rc);
                    } else if (rc.content_type === 'geoprocessing_workflow_viz') {
                        // Defer — render as a separate chat message after the cards
                        deferredVizEntries.push({ ...rc, _vizType: 'geoprocessing' });
                    } else if (rc.content_type === 'rq_breakdown_summary') {
                        // Task Breakdown structured summary as its own sub-card.
                        // Flag as reload so autonomous auto-click doesn't re-fire.
                        displayRqBreakdownSummary(rc.rq_breakdown, {
                            taskId: rc.task_id || cardData.task_id,
                            isReload: true,
                        });
                    }
                });
            }

            card.appendChild(body);
            _makeCardCollapsible(card);
        }

        if (isObjCard) {
            _ensureExecToolbar(container);
            const m = cardData.phase.match(/^exec_obj(\d+)$/);
            if (m) _addObjectiveGroupToggle(card, m[1]);
        }
        _getCardParent(container, cardData.phase).appendChild(card);
    });

    // On conversation reload, auto-collapse the Result Analysis and
    // Manuscript group panels so the chat isn't dominated by an entire
    // pipeline's worth of cards. The user can click the header to expand.
    ['result_analysis', 'manuscript'].forEach(key => {
        const group = container.querySelector(`#wf-group-${key}`);
        if (group && !group.classList.contains('collapsed')) {
            group.classList.add('collapsed');
            const t = group.querySelector('.wf-group-toggle');
            if (t) t.textContent = '▶';
        }
    });

    // Fallback: synthesize execution checkpoint from step_results if none exists
    const hasCheckpointCard = cards.some(c => c.phase === 'execution_checkpoint' && c.checkpoint_steps && c.checkpoint_steps.length > 0);
    const hasStepCards = cards.some(c => /^exec_obj\d+_step\d+/.test(c.phase) && c.step_results && c.step_results.length > 0);
    if (!hasCheckpointCard && hasStepCards) {
        // Collect step results from all step cards
        const synthSteps = [];
        cards.forEach(c => {
            if (/^exec_obj\d+_step\d+/.test(c.phase) && c.step_results) {
                const objMatch = c.phase.match(/exec_obj(\d+)_step/);
                const objNum = objMatch ? objMatch[1] : '?';
                c.step_results.forEach(sr => {
                    synthSteps.push({
                        objective: objNum,
                        step_index: sr.step_index || '?',
                        description: sr.step_description || sr.description || '',
                        status: sr.status || 'unknown',
                        error: (sr.error || '').substring(0, 200),
                    });
                });
            }
        });
        if (synthSteps.length > 0) {
            const cpCard = document.createElement('div');
            cpCard.className = 'wf-card completed';
            cpCard.id = 'wf-card-execution_checkpoint';
            cpCard.innerHTML = `
                <div class="wf-card-header">
                    <span class="step-check">&#10004;</span>
                    <span class="step-spinner" style="display:none;"></span>
                    <span class="wf-card-status">Execution Summary</span>
                </div>
            `;
            const cpBody = document.createElement('div');
            cpBody.className = 'wf-card-body step-result-body';
            _renderCheckpointBody(cpBody, synthSteps, window._completedTaskId || '');
            cpCard.appendChild(cpBody);
            _makeCardCollapsible(cpCard);

            // Insert before result analysis cards if any, otherwise append at end
            const raCard = container.querySelector('[id^="wf-card-result_"]') || container.querySelector('[id^="wf-card-manuscript"]');
            if (raCard) {
                container.insertBefore(cpCard, raCard);
            } else {
                container.appendChild(cpCard);
            }
        }
    }

    bubble.appendChild(container);
    wrapper.appendChild(header);
    wrapper.appendChild(bubble);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(wrapper);
    chatMessages.appendChild(messageDiv);

    // Render deferred research plan / geoprocessing visualizations as separate messages
    deferredVizEntries.forEach(rc => {
        if (rc._vizType === 'geoprocessing') {
            spatial_analysis_rebuildWorkflowVizMessage(rc.viz_id, chatMessages);
        } else {
            _rebuildResearchPlanVizMessage(rc.viz_id, chatMessages);
        }
    });

    // Show the final text response in a separate bubble if present
    if (textContent && textContent.trim()) {
        addChatMessage(textContent, 'agm');
    }
}

/**
 * Rebuild a research plan visualization as a standalone chat message.
 * Mirrors the live `displayResearchPlanViz()` but without interactive
 * approve/feedback buttons (the plan was already approved in the original session).
 */
function _rebuildResearchPlanVizMessage(taskId, chatMessages) {
    const agmMessage = document.createElement('div');
    agmMessage.className = 'chat-message agm';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = '<img src="icon/AGM.png" alt="AGM" class="avatar-img">';

    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper full-width';

    const msgHeader = document.createElement('div');
    msgHeader.className = 'message-header';
    msgHeader.innerHTML = `
        <span class="message-sender">AGM</span>
        <span class="message-time"></span>
    `;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Header + toggle tabs
    const headerSection = document.createElement('div');
    headerSection.innerHTML = `
        <h4 style="margin-top: 0; display: flex; align-items: center; gap: 10px;">
            <span>\u{1F4CB}</span> Research Plan
        </h4>
        <p style="color: #666; font-size: 0.95em; margin-bottom: 10px;">
            Interactive summary of objectives, methodology, and analysis steps
        </p>
    `;
    bubble.appendChild(headerSection);

    // Tabs
    const tabsDiv = document.createElement('div');
    tabsDiv.style.cssText = 'display: flex; gap: 0; margin-bottom: 0; align-items: flex-end;';

    const planTab = document.createElement('button');
    planTab.textContent = 'Plan View';
    planTab.className = 'rp-tab active';
    planTab.style.cssText = 'padding: 8px 20px; border: 1px solid #ddd; border-bottom: none; border-radius: 8px 8px 0 0; background: #667eea; color: white; cursor: pointer; font-weight: 600; font-size: 0.9em;';

    const flowTab = document.createElement('button');
    flowTab.textContent = 'Flowchart';
    flowTab.className = 'rp-tab';
    flowTab.style.cssText = 'padding: 8px 20px; border: 1px solid #ddd; border-bottom: none; border-radius: 8px 8px 0 0; background: #f0f0f0; color: #333; cursor: pointer; font-weight: 600; font-size: 0.9em;';

    const geoTab = document.createElement('button');
    geoTab.textContent = 'AGM Geoprocessing Workflow';
    geoTab.className = 'rp-tab';
    geoTab.style.cssText = 'padding: 8px 20px; border: 1px solid #ddd; border-bottom: none; border-radius: 8px 8px 0 0; background: #f0f0f0; color: #333; cursor: pointer; font-weight: 600; font-size: 0.9em;';

    const fullViewBtn = document.createElement('button');
    fullViewBtn.className = 'rp-fullview-btn';
    fullViewBtn.style.cssText = 'margin-left: auto; padding: 6px 14px; border: 1px solid #ddd; border-bottom: none; border-radius: 8px 8px 0 0; background: #f8f9fa; color: #555; cursor: pointer; font-size: 0.85em; display: flex; align-items: center; gap: 5px; transition: background 0.15s;';
    fullViewBtn.title = 'Open in full view';
    fullViewBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        Full View
    `;

    tabsDiv.appendChild(planTab);
    tabsDiv.appendChild(flowTab);
    tabsDiv.appendChild(geoTab);
    tabsDiv.appendChild(fullViewBtn);
    bubble.appendChild(tabsDiv);

    // Iframe container
    const iframeContainer = document.createElement('div');
    iframeContainer.style.cssText = 'width: 100%; height: 800px; max-height: calc(100vh - 200px); border: 1px solid #ddd; border-radius: 0 8px 8px 8px; overflow: auto;';

    const iframe = document.createElement('iframe');
    iframe.src = `${API_BASE_URL}/api/research-plan/${taskId}?v=${Date.now()}`;
    iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
    iframe.id = `research-plan-iframe-${taskId}`;
    iframeContainer.appendChild(iframe);
    bubble.appendChild(iframeContainer);

    // Tab click handlers
    const allTabs = [planTab, flowTab, geoTab];
    function activateTab(activeTab, src) {
        allTabs.forEach(t => { t.classList.remove('active'); t.style.background = '#f0f0f0'; t.style.color = '#333'; });
        activeTab.classList.add('active'); activeTab.style.background = '#667eea'; activeTab.style.color = 'white';
        iframe.src = src;
    }
    planTab.onclick = () => activateTab(planTab, `${API_BASE_URL}/api/research-plan/${taskId}?v=${Date.now()}`);
    flowTab.onclick = () => activateTab(flowTab, `${API_BASE_URL}/api/research-plan-flowchart/${taskId}?v=${Date.now()}`);
    geoTab.onclick = () => activateTab(geoTab, `${API_BASE_URL}/api/research-plan-geoprocessing/${taskId}?v=${Date.now()}`);

    // Full View button
    fullViewBtn.onmouseenter = () => { fullViewBtn.style.background = '#e9ecef'; };
    fullViewBtn.onmouseleave = () => { fullViewBtn.style.background = '#f8f9fa'; };
    fullViewBtn.onclick = () => {
        if (typeof openResearchPlanFullView === 'function') {
            openResearchPlanFullView(iframe.src, taskId);
        } else {
            window.open(iframe.src, '_blank');
        }
    };

    // Controls: Approved banner + Approve/Feedback buttons (user can still revise after approval)
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'rp-controls';

    const banner = document.createElement('div');
    banner.className = 'rp-approved-banner';
    banner.style.cssText = 'width:100%; margin-bottom:8px; padding:6px 12px; background:#d4edda; border:1px solid #c3e6cb; border-radius:4px; color:#155724; font-weight:600; font-size:0.9em;';
    banner.textContent = '\u2705 Research Plan Approved';
    controlsDiv.appendChild(banner);

    const approveBtn = document.createElement('button');
    approveBtn.textContent = '\u2713 Approve Plan';
    approveBtn.className = 'rp-btn-approve';
    approveBtn.onclick = async () => {
        const activeTaskId = window._completedTaskId || taskId;
        if (!activeTaskId) {
            addLog('[AGM] No task ID available.', 'error');
            return;
        }
        approveBtn.disabled = true;
        feedbackBtn.disabled = true;
        banner.textContent = '\u2705 Research Plan Approved! Executing objectives...';
        try {
            document.querySelectorAll('.workflow-cards-container').forEach(c => {
                const p = c.closest('.chat-message'); if (p) p.remove();
            });
            _wfCardsContainer = null;
            _wfCurrentPhase = null;
            addChatMessage('\u2705 Research plan approved! Starting objective execution...', 'agm');
            addLog('[AGM] Research plan approved, starting execution', 'success');

            const abortCtrl = startInterruptableStream();
            const res = await fetch(`${API_BASE_URL}/api/research-plan/approve/${activeTaskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation_id: currentConversationId }),
                signal: abortCtrl.signal,
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const update = JSON.parse(line.substring(6));
                        if (update.type === 'status') { updateWorkflowCard(update.message || update.content, update.step || 'general'); }
                        else if (update.type === 'llm_update') { updateWorkflowCard(update.content, update.step); }
                        else if (update.type === 'llm_stream') { appendToWorkflowCard(update.content, update.step); }
                        else if (update.type === 'log') { addLog(`[AGM] ${update.content}`, 'info'); }
                        else if (update.type === 'code_review') { displayCodeReview(update); }
                        else if (update.type === 'step_result') { displayStepResult(update); }
                        else if (update.type === 'execution_checkpoint') { displayExecutionCheckpoint(update); }
                        else if (update.type === 'figure_catalog') { displayFigureCatalog(update.figures || [], update.step); }
                        else if (update.type === 'execution_flowchart') { displayExecutionFlowchart(update.relative_path, update.step); }
                        else if (update.type === 'result_presentation') { displayMarkdownResult('Result Presentation', '\u{1F4CA}', update.content, update.relative_path, update.step); }
                        else if (update.type === 'result_discussion') { displayMarkdownResult('Result Discussion', '\u{1F4AC}', update.content, update.relative_path, update.step); }
                        else if (update.type === 'manuscript_section') { displayMarkdownResult(`Manuscript: ${update.section}`, '\u{1F4DD}', update.content, update.relative_path, update.step); }
                        else if (update.type === 'manuscript_complete') { displayMarkdownResult('Full Manuscript', '\u{1F4D6}', update.content, update.relative_path, update.step); }
                        else if (update.type === 'result') { finalizeAllWorkflowCards(); addLog('[AGM] Workflow complete', 'success'); addChatMessage(update.response || 'Workflow complete.', 'agm'); }
                        else if (update.type === 'error') { finalizeAllWorkflowCards(); addLog(`[Error] ${update.error}`, 'error'); addChatMessage(`Error: ${update.error}`, 'agm'); }
                    } catch (_) {}
                }
            }
            stopInterruptableStream();
        } catch (e) {
            stopInterruptableStream();
            if (e.name === 'AbortError') return;
            addLog(`[Error] Failed: ${e.message}`, 'error');
        } finally {
            approveBtn.disabled = false;
            feedbackBtn.disabled = false;
        }
    };
    controlsDiv.appendChild(approveBtn);

    const feedbackBtn = document.createElement('button');
    feedbackBtn.textContent = '\u270E Provide Feedback';
    feedbackBtn.className = 'rp-btn-feedback';
    feedbackBtn.onclick = () => {
        activateFeedbackMode('research_plan', taskId, iframe, {});
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('btn-send');
        if (chatInput) { chatInput.disabled = false; chatInput.placeholder = 'Enter your feedback for the research plan...'; chatInput.focus(); }
        if (sendBtn) sendBtn.disabled = false;
    };
    controlsDiv.appendChild(feedbackBtn);

    // Re-execute button sits inside the controls row
    const reexecuteBtn = document.createElement('button');
    reexecuteBtn.textContent = '\u{1F504} Re-execute All Steps';
    reexecuteBtn.className = 'rp-btn-reexecute';
    reexecuteBtn.onclick = async () => {
        const activeTaskId = window._completedTaskId || taskId;
        if (!activeTaskId) {
            addLog('[AGM] No task ID available for re-execution.', 'error');
            return;
        }
        reexecuteBtn.disabled = true;
        reexecuteBtn.textContent = '\u{1F504} Re-executing...';
        try {
            document.querySelectorAll('.workflow-cards-container').forEach(container => {
                const parentMessage = container.closest('.chat-message');
                if (parentMessage) parentMessage.remove();
            });
            _wfCardsContainer = null;
            _wfCurrentPhase = null;

            addChatMessage('\u{1F504} Re-executing all research plan steps...', 'agm');
            addLog('[AGM] Re-executing all steps', 'info');

            const abortCtrl = startInterruptableStream();
            const res = await fetch(`${API_BASE_URL}/api/research-plan/approve/${activeTaskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation_id: currentConversationId }),
                signal: abortCtrl.signal,
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const update = JSON.parse(line.substring(6));
                        if (update.type === 'status') {
                            updateWorkflowCard(update.message || update.content, update.step || 'general');
                        } else if (update.type === 'llm_update') {
                            updateWorkflowCard(update.content, update.step);
                        } else if (update.type === 'llm_stream') {
                            appendToWorkflowCard(update.content, update.step);
                        } else if (update.type === 'code_review') {
                            displayCodeReview(update);
                        } else if (update.type === 'step_result') {
                            displayStepResult(update);
                        } else if (update.type === 'execution_checkpoint') {
                            displayExecutionCheckpoint(update);
                        } else if (update.type === 'figure_catalog') {
                            displayFigureCatalog(update.figures || [], update.step);
                        } else if (update.type === 'execution_flowchart') {
                            displayExecutionFlowchart(update.relative_path, update.step);
                        } else if (update.type === 'result_presentation') {
                            displayMarkdownResult('Result Presentation', '\u{1F4CA}', update.content, update.relative_path, update.step);
                        } else if (update.type === 'result_discussion') {
                            displayMarkdownResult('Result Discussion', '\u{1F4AC}', update.content, update.relative_path, update.step);
                        } else if (update.type === 'manuscript_section') {
                            displayMarkdownResult(`Manuscript: ${update.section}`, '\u{1F4DD}', update.content, update.relative_path, update.step);
                        } else if (update.type === 'manuscript_complete') {
                            displayMarkdownResult('Full Manuscript', '\u{1F4D6}', update.content, update.relative_path, update.step);
                        } else if (update.type === 'result') {
                            finalizeAllWorkflowCards();
                            addChatMessage(update.response || 'Re-execution complete.', 'agm');
                        } else if (update.type === 'error') {
                            finalizeAllWorkflowCards();
                            addChatMessage(`Error: ${update.error}`, 'agm');
                        }
                    } catch (parseErr) { /* skip */ }
                }
            }
            stopInterruptableStream();
        } catch (e) {
            stopInterruptableStream();
            if (e.name === 'AbortError') return;
            addChatMessage(`Error during re-execution: ${e.message}`, 'agm');
        } finally {
            reexecuteBtn.disabled = false;
            reexecuteBtn.textContent = '\u{1F504} Re-execute All Steps';
        }
    };
    controlsDiv.appendChild(reexecuteBtn);
    bubble.appendChild(controlsDiv);

    wrapper.appendChild(msgHeader);
    wrapper.appendChild(bubble);
    agmMessage.appendChild(avatar);
    agmMessage.appendChild(wrapper);
    chatMessages.appendChild(agmMessage);

    // Register postMessage listeners so the iframe can save edits, re-run steps,
    // and trigger plan regeneration after step deletion — even on conversation reload.
    // (During live execution these are registered in displayResearchPlanViz.)
    // Guard: only register once per page context to avoid duplicate handlers.
    if (window._rpRebuildListenersRegistered) return;
    window._rpRebuildListenersRegistered = true;

    window.addEventListener('message', async function _rpEditHandler(e) {
        if (!e.data || e.data.type !== 'research_plan_edit') return;
        const plan = e.data.plan;
        const rpTaskId = plan.task_id || taskId;
        addLog(`[User] Saving edited research plan (${plan.objectives.length} objectives)...`, 'info');
        try {
            const res = await fetch(`${API_BASE_URL}/api/research-plan/update/${rpTaskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ objectives: plan.objectives }),
            });
            const result = await res.json();
            if (result.success) {
                addLog('[AGM] Research plan updated successfully', 'success');
                iframe.contentWindow.postMessage({ type: 'plan_save_result', success: true }, '*');
                setTimeout(() => {
                    iframe.src = `${API_BASE_URL}/api/research-plan/${rpTaskId}?v=${Date.now()}`;
                }, 300);
            } else {
                addLog(`[Error] Plan save failed: ${result.error}`, 'error');
                iframe.contentWindow.postMessage({ type: 'plan_save_result', success: false, error: result.error }, '*');
            }
        } catch (err) {
            addLog(`[Error] Plan save failed: ${err.message}`, 'error');
            iframe.contentWindow.postMessage({ type: 'plan_save_result', success: false, error: err.message }, '*');
        }
    });

    window.addEventListener('message', async function _rpRerunHandler(e) {
        if (!e.data || e.data.type !== 'research_plan_step_rerun') return;
        const plan = e.data.plan;
        const objIdx = e.data.objective_index;
        const stepIdx = e.data.step_index;
        const rpTaskId = plan.task_id || taskId;
        const objKey = `objective_${objIdx}`;

        const activeTaskId = window._completedTaskId || rpTaskId;
        if (!window._completedTaskId) {
            addLog('[AGM] Workflow has not been executed yet — approve and execute the plan first.', 'error');
            addChatMessage('The workflow has not been executed yet. Please approve the plan and execute it before re-running individual steps.', 'agm');
            iframe.contentWindow.postMessage({ type: 'step_rerun_started' }, '*');
            return;
        }

        addLog(`[User] Edit & Re-run: ${objKey} step ${stepIdx}`, 'info');

        try {
            const saveRes = await fetch(`${API_BASE_URL}/api/research-plan/update/${rpTaskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ objectives: plan.objectives }),
            });
            const saveResult = await saveRes.json();
            if (saveResult.success) {
                addLog('[AGM] Research plan saved before re-run', 'info');
            }
        } catch (err) {
            addLog(`[Error] Could not save plan before re-run: ${err.message}`, 'error');
        }

        iframe.contentWindow.postMessage({ type: 'step_rerun_started' }, '*');

        await rerunStep(
            activeTaskId,
            objKey,
            stepIdx,
            'regenerate',
            null,
            'The step description in the research plan has been edited. Regenerate the code according to the updated description.',
            null
        );
    });

    window.addEventListener('message', async function _rpRegenHandler(e) {
        if (!e.data || e.data.type !== 'research_plan_regen_after_delete') return;
        const plan = e.data.plan;
        const deletionContext = e.data.deletion_context;
        const rpTaskId = plan.task_id || taskId;

        addLog(`[User] Regenerating plan after deleting step ${deletionContext.deleted_step_number} from objective ${deletionContext.deleted_from_objective}`, 'info');

        try {
            const res = await fetch(`${API_BASE_URL}/api/research-plan/regen-after-delete/${rpTaskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    objectives: plan.objectives,
                    deletion_context: deletionContext,
                }),
            });
            const result = await res.json();
            if (result.success) {
                addLog('[AGM] Plan regenerated successfully after step deletion', 'success');
                iframe.contentWindow.postMessage({ type: 'plan_regen_result', success: true }, '*');
            } else {
                addLog(`[Error] Plan regeneration failed: ${result.error}`, 'error');
                iframe.contentWindow.postMessage({ type: 'plan_regen_result', success: false, error: result.error }, '*');
            }
        } catch (err) {
            addLog(`[Error] Plan regeneration failed: ${err.message}`, 'error');
            iframe.contentWindow.postMessage({ type: 'plan_regen_result', success: false, error: err.message }, '*');
        }
    });
}

// Add rich content (graphs, code, etc.) to chat
function addRichChatMessage(title, content, sender = 'agm', type = 'default') {
    const chatMessages = document.getElementById('chat-messages');

    // Check if this is rich content (graph or code)
    const isRichContent = (typeof content === 'object' && (content.solution || content.code)) || type === 'code';

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;
    if (isRichContent) {
        messageDiv.classList.add('rich-content');
    }

    // Create avatar
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    if (sender === 'agm') {
        const avatarImg = document.createElement('img');
        avatarImg.src = 'icon/AGM.png';
        avatarImg.alt = 'AGM';
        avatarImg.className = 'avatar-img';
        avatar.appendChild(avatarImg);
    }

    // Create message wrapper - full width for rich content
    const wrapper = document.createElement('div');
    wrapper.className = isRichContent ? 'message-wrapper full-width' : 'message-wrapper';

    // Create header
    const messageHeader = document.createElement('div');
    messageHeader.className = 'message-header';
    const senderSpan = document.createElement('span');
    senderSpan.className = 'message-sender';
    senderSpan.textContent = sender === 'user' ? 'You' : 'AGM';
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = getCurrentTimestamp();
    messageHeader.appendChild(senderSpan);
    messageHeader.appendChild(timeSpan);

    // Create message bubble
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Create collapsible section wrapper for rich content
    let collapsibleSection = null;
    let collapsibleContent = null;

    // Add title with collapsible functionality for rich content
    if (title && isRichContent) {
        // Create collapsible section wrapper
        collapsibleSection = document.createElement('div');
        collapsibleSection.className = 'collapsible-section';

        // Create header with toggle button
        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'collapsible-section-header';

        const titleElement = document.createElement('h4');
        titleElement.textContent = title;
        titleElement.style.marginTop = '0';

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'btn-collapse-section';
        toggleBtn.innerHTML = '<span class="section-toggle-icon">▼</span> Collapse';
        toggleBtn.onclick = () => {
            collapsibleSection.classList.toggle('collapsed');
            if (collapsibleSection.classList.contains('collapsed')) {
                toggleBtn.innerHTML = '<span class="section-toggle-icon">▼</span> Expand';
            } else {
                toggleBtn.innerHTML = '<span class="section-toggle-icon">▼</span> Collapse';
            }
        };

        sectionHeader.appendChild(titleElement);
        sectionHeader.appendChild(toggleBtn);
        bubble.appendChild(sectionHeader);

        // Create collapsible content wrapper
        collapsibleContent = document.createElement('div');
        collapsibleContent.className = 'collapsible-section-content';
        collapsibleSection.appendChild(sectionHeader);
        collapsibleSection.appendChild(collapsibleContent);
        bubble.appendChild(collapsibleSection);
    } else if (title) {
        // Simple title for non-rich content
        const titleElement = document.createElement('h4');
        titleElement.textContent = title;
        titleElement.style.marginTop = '0';
        bubble.appendChild(titleElement);
    }

    // Handle graph/iframe content
    if (typeof content === 'object' && content.solution) {
        const solution = content.solution;

        // Determine where to append content (collapsible or directly to bubble)
        const contentTarget = collapsibleContent || bubble;

        // Solution info
        const solutionInfo = document.createElement('div');
        solutionInfo.innerHTML = `
            <p><strong>Nodes:</strong> ${solution.graph_data.nodes.length}</p>
            <p><strong>Edges:</strong> ${solution.graph_data.edges.length}</p>
        `;
        contentTarget.appendChild(solutionInfo);

        // Graph iframe
        const graphContainer = document.createElement('div');
        graphContainer.style.width = '100%';
        graphContainer.style.height = '500px';
        graphContainer.style.border = '1px solid #ddd';
        graphContainer.style.borderRadius = '8px';
        graphContainer.style.marginTop = '10px';

        const iframe = document.createElement('iframe');
        iframe.src = `${API_BASE_URL}/api/graph/${solution._task_id}?v=${Date.now()}`;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        graphContainer.appendChild(iframe);
        contentTarget.appendChild(graphContainer);

        // Add interactive workflow controls
        const workflowControls = document.createElement('div');
        workflowControls.className = 'workflow-controls';
        workflowControls.style.marginTop = '15px';
        workflowControls.style.padding = '15px';
        workflowControls.style.background = '#f9f9f9';
        workflowControls.style.borderRadius = '8px';
        workflowControls.style.border = '1px solid #e0e0e0';

        const controlsTitle = document.createElement('h4');
        controlsTitle.textContent = '🔧 Interactive Workflow Review';
        controlsTitle.style.marginTop = '0';
        controlsTitle.style.marginBottom = '10px';
        workflowControls.appendChild(controlsTitle);

        const controlsDescription = document.createElement('p');
        controlsDescription.textContent = 'Review the workflow above and take action:';
        controlsDescription.style.fontSize = '0.9em';
        controlsDescription.style.color = '#666';
        controlsDescription.style.marginBottom = '10px';
        workflowControls.appendChild(controlsDescription);

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.marginBottom = '10px';
        buttonContainer.style.flexWrap = 'wrap';

        // Approve button
        const approveBtn = document.createElement('button');
        approveBtn.textContent = '✓ Approve Workflow';
        approveBtn.className = 'btn-workflow-approve';
        approveBtn.style.padding = '8px 16px';
        approveBtn.style.background = '#28a745';
        approveBtn.style.color = 'white';
        approveBtn.style.border = 'none';
        approveBtn.style.borderRadius = '4px';
        approveBtn.style.cursor = 'pointer';
        approveBtn.style.fontSize = '0.9em';
        approveBtn.onclick = () => approveWorkflow(solution._task_id, workflowControls);
        buttonContainer.appendChild(approveBtn);

        // Provide Feedback button
        const feedbackBtn = document.createElement('button');
        feedbackBtn.textContent = '✎ Provide Feedback';
        feedbackBtn.className = 'btn-workflow-feedback';
        feedbackBtn.style.padding = '8px 16px';
        feedbackBtn.style.background = '#ffc107';
        feedbackBtn.style.color = '#333';
        feedbackBtn.style.border = 'none';
        feedbackBtn.style.borderRadius = '4px';
        feedbackBtn.style.cursor = 'pointer';
        feedbackBtn.style.fontSize = '0.9em';
        feedbackBtn.onclick = () => activateFeedbackMode('workflow', solution._task_id, iframe, {
            task: solution._task_id,
            graph_data: solution.graph_data
        });
        buttonContainer.appendChild(feedbackBtn);

        // List Nodes button
        const listNodesBtn = document.createElement('button');
        listNodesBtn.textContent = '📋 List Nodes';
        listNodesBtn.className = 'btn-workflow-list';
        listNodesBtn.style.padding = '8px 16px';
        listNodesBtn.style.background = '#17a2b8';
        listNodesBtn.style.color = 'white';
        listNodesBtn.style.border = 'none';
        listNodesBtn.style.borderRadius = '4px';
        listNodesBtn.style.cursor = 'pointer';
        listNodesBtn.style.fontSize = '0.9em';
        listNodesBtn.onclick = () => listWorkflowNodes(solution._task_id);
        buttonContainer.appendChild(listNodesBtn);

        workflowControls.appendChild(buttonContainer);

        // Status message area
        const statusArea = document.createElement('div');
        statusArea.id = `workflow-status-${solution._task_id}`;
        statusArea.style.marginTop = '10px';
        statusArea.style.padding = '8px';
        statusArea.style.borderRadius = '4px';
        statusArea.style.display = 'none';
        workflowControls.appendChild(statusArea);

        contentTarget.appendChild(workflowControls);
    }
    // Handle code display with interactive controls
    else if (type === 'code' && typeof content === 'object' && content.code) {
        // Determine where to append content (collapsible or directly to bubble)
        const contentTarget = collapsibleContent || bubble;

        const codeInfo = document.createElement('div');
        codeInfo.style.marginBottom = '10px';

        // Extract just the filename from the full path and remove task_id
        const codeFileName = content.code_file ? getDisplayName(content.code_file.split(/[\\/]/).pop()) : 'workflow.py';

        codeInfo.innerHTML = `
            <p><strong>Operations:</strong> ${content.operation_count}</p>
            <p><strong>Code File:</strong> ${codeFileName}</p>
        `;
        contentTarget.appendChild(codeInfo);

        // Code display area
        const codeContainer = document.createElement('div');
        codeContainer.style.marginTop = '10px';
        codeContainer.style.marginBottom = '10px';
        codeContainer.style.border = '1px solid #ddd';
        codeContainer.style.borderRadius = '8px';
        codeContainer.style.background = '#f8f9fa';
        codeContainer.style.overflow = 'hidden';

        const codeHeader = document.createElement('div');
        codeHeader.style.padding = '10px';
        codeHeader.style.background = '#e9ecef';
        codeHeader.style.borderBottom = '1px solid #ddd';
        codeHeader.style.fontWeight = 'bold';
        codeHeader.textContent = '📄 Generated Python Code';

        const codeDisplay = document.createElement('pre');
        codeDisplay.style.margin = '0';
        codeDisplay.style.padding = '15px';
        codeDisplay.style.maxHeight = '400px';
        codeDisplay.style.overflow = 'auto';
        codeDisplay.style.fontSize = '0.85em';
        codeDisplay.style.lineHeight = '1.5';
        codeDisplay.style.background = '#ffffff';
        codeDisplay.textContent = content.code;

        codeContainer.appendChild(codeHeader);
        codeContainer.appendChild(codeDisplay);
        contentTarget.appendChild(codeContainer);

        // Interactive code controls
        const codeControls = document.createElement('div');
        codeControls.className = 'code-controls';
        codeControls.style.marginTop = '15px';
        codeControls.style.padding = '15px';
        codeControls.style.background = '#f9f9f9';
        codeControls.style.borderRadius = '8px';
        codeControls.style.border = '1px solid #e0e0e0';

        const codeControlsTitle = document.createElement('h4');
        codeControlsTitle.textContent = '🔧 Code Actions';
        codeControlsTitle.style.marginTop = '0';
        codeControlsTitle.style.marginBottom = '10px';
        codeControls.appendChild(codeControlsTitle);

        const codeButtonContainer = document.createElement('div');
        codeButtonContainer.style.display = 'flex';
        codeButtonContainer.style.gap = '10px';
        codeButtonContainer.style.marginBottom = '10px';
        codeButtonContainer.style.flexWrap = 'wrap';

        // Download button
        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = '⬇ Download Code';
        downloadBtn.style.padding = '8px 16px';
        downloadBtn.style.background = '#28a745';
        downloadBtn.style.color = 'white';
        downloadBtn.style.border = 'none';
        downloadBtn.style.borderRadius = '4px';
        downloadBtn.style.cursor = 'pointer';
        downloadBtn.style.fontSize = '0.9em';
        downloadBtn.onclick = () => {
            const blob = new Blob([content.code], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `workflow_${content._task_id}.py`;
            a.click();
            URL.revokeObjectURL(url);
        };
        codeButtonContainer.appendChild(downloadBtn);

        // Refine code button
        const refineCodeBtn = document.createElement('button');
        refineCodeBtn.textContent = '✎ Refine Code';
        refineCodeBtn.style.padding = '8px 16px';
        refineCodeBtn.style.background = '#ffc107';
        refineCodeBtn.style.color = '#333';
        refineCodeBtn.style.border = 'none';
        refineCodeBtn.style.borderRadius = '4px';
        refineCodeBtn.style.cursor = 'pointer';
        refineCodeBtn.style.fontSize = '0.9em';
        refineCodeBtn.onclick = () => activateFeedbackMode('code', content._task_id, null, {
            code: content.code
        });
        codeButtonContainer.appendChild(refineCodeBtn);

        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 Copy Code';
        copyBtn.style.padding = '8px 16px';
        copyBtn.style.background = '#17a2b8';
        copyBtn.style.color = 'white';
        copyBtn.style.border = 'none';
        copyBtn.style.borderRadius = '4px';
        copyBtn.style.cursor = 'pointer';
        copyBtn.style.fontSize = '0.9em';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(content.code);
            copyBtn.textContent = '✓ Copied!';
            setTimeout(() => { copyBtn.textContent = '📋 Copy Code'; }, 2000);
        };
        codeButtonContainer.appendChild(copyBtn);

        // Execute button
        const executeBtn = document.createElement('button');
        executeBtn.textContent = '▶ Execute Code';
        executeBtn.style.padding = '8px 16px';
        executeBtn.style.background = '#6f42c1';
        executeBtn.style.color = 'white';
        executeBtn.style.border = 'none';
        executeBtn.style.borderRadius = '4px';
        executeBtn.style.cursor = 'pointer';
        executeBtn.style.fontSize = '0.9em';
        executeBtn.onclick = () => executeWorkflowCode(content._task_id, content.code, codeStatusArea);
        codeButtonContainer.appendChild(executeBtn);

        codeControls.appendChild(codeButtonContainer);

        // Status area for code refinement
        const codeStatusArea = document.createElement('div');
        codeStatusArea.id = `code-status-${content._task_id}`;
        codeStatusArea.style.marginTop = '10px';
        codeStatusArea.style.padding = '8px';
        codeStatusArea.style.borderRadius = '4px';
        codeStatusArea.style.display = 'none';
        codeControls.appendChild(codeStatusArea);

        contentTarget.appendChild(codeControls);
    }
    // Handle other object content
    else if (typeof content === 'object') {
        const pre = document.createElement('pre');
        pre.style.background = '#f4f4f4';
        pre.style.padding = '10px';
        pre.style.borderRadius = '5px';
        pre.style.overflow = 'auto';
        pre.textContent = JSON.stringify(content, null, 2);
        bubble.appendChild(pre);
    }
    // Handle string content
    else {
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.textContent = content;
        bubble.appendChild(messageContent);
    }

    wrapper.appendChild(messageHeader);
    wrapper.appendChild(bubble);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(wrapper);
    chatMessages.appendChild(messageDiv);

    // Smart-scroll: only if user is near the bottom
    smartScrollChat();

    return messageDiv;
}

// // Display initial AGM welcome message
// function displayWelcomeMessage() {
//     const chatMessages = document.getElementById('chat-messages');
//
//     // Remove empty message if present
//     const emptyMessage = chatMessages.querySelector('.empty-message');
//     if (emptyMessage) {
//         emptyMessage.remove();
//     }
//
//     const welcomeText = `Hi there!
//
// I'm your intelligent Autonomous Geographic Modeller.
//
// What geospatial research question are you working on today?
// You can describe the topic, where and when, or any requirements such as format, license, or data source.
//
// For inspiration, feel free to explore the Quick Examples in the left panel.`;
//
//     addChatMessage(welcomeText, 'agm');
// }

function clearChat() {
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';

    // Re-add welcome message
    const welcomeHTML = `
        <div class="chat-message agm">
            <div class="message-avatar">
                <img src="icon/AGM.png" alt="AGM" class="avatar-img">
            </div>
            <div class="message-wrapper">
                <div class="message-header">
                    <span class="message-sender">AGM</span>
                    <span class="message-time">${getCurrentTimestamp()}</span>
                </div>
                <div class="message-bubble">
                    <div class="message-content">Hello! I'm your intelligent Autonomous Geographic Modeller.

What geospatial research question are you working on today?
Please also upload the dataset(s) you'll be working with.</div>
                </div>
            </div>
        </div>
    `;
    chatMessages.innerHTML = welcomeHTML;
    addLog('[System] Chat cleared', 'warning');
}

// Backend API URL - auto-detect from current page origin for deployment
const API_BASE_URL = window.location.origin;

/**
 * Encode an artifact relative path for use in URLs.
 * Unlike encodeURIComponent, this preserves '/' separators so that
 * Flask's <path:filename> route receives real path segments.
 */
function _encodeArtifactPath(relPath) {
    return relPath.split('/').map(encodeURIComponent).join('/');
}

// Build an artifact URL with a cache-buster so re-runs that overwrite the
// same filename don't get served a stale copy from the browser cache.
// Prefers an explicit version stamp on the artifact (set on re-run), then
// mtime if the backend supplied it, and falls back to Date.now() for
// safety. Pass opts.noBuster=true only for deliberate long-lived links.
function _artifactUrl(artifact, opts) {
    opts = opts || {};
    const rel = _encodeArtifactPath(_normalizeRelPath(artifact.relative_path));
    const base = `${API_BASE_URL}/api/artifacts/${rel}`;
    if (opts.noBuster) return base;
    const v = artifact._v || artifact.mtime || Date.now();
    return `${base}?v=${encodeURIComponent(v)}`;
}

// If relative_path is a bare filename (no '/'), prepend the active task_id so
// serve_artifact can resolve it under Outputs/<task_id>/. Needed for historical
// events stored before relative_path consistently included the task_id segment.
function _normalizeRelPath(relPath) {
    if (!relPath) return relPath;
    if (relPath.includes('/')) return relPath;
    const tid = window._completedTaskId || (typeof currentConversationId !== 'undefined' ? currentConversationId : '');
    return tid ? `${tid}/${relPath}` : relPath;
}

// Active task_id for download-report calls. Uses _completedTaskId when set
// (end-of-workflow 'result' event), otherwise the live conversation id
// (task_id === conversation_id for WebUI workflows).
function _activeTaskId() {
    return window._completedTaskId || (typeof currentConversationId !== 'undefined' ? currentConversationId : '') || '';
}

// Listen for postMessage from embedded iframes (e.g. execution flowchart "Go to Card")
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'scrollToStepCard' && event.data.phase) {
        _scrollToStepCard(event.data.phase);
    }
});

// Listen for layer removal from map iframe — uncheck corresponding checkbox in data layer list
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'LAYER_REMOVED_FROM_MAP' && event.data.layerName) {
        const layerName = event.data.layerName;
        const allItems = document.querySelectorAll('.data-layer-item');
        allItems.forEach(item => {
            const idx = parseInt(item.dataset.layerIndex);
            const layerData = window.loadedLayers[idx];
            if (layerData && layerData.name === layerName) {
                const cb = item.querySelector('.layer-visibility-checkbox');
                if (cb && cb.checked) {
                    cb.checked = false;
                }
                // Reset the _mapLoaded flag so the tile click can re-add it
                layerData._mapLoaded = false;
                addLog(`[Map] Layer removed from map: ${layerName}`, 'info');
            }
        });
    }
});

// Start Workflow - Handle research question submission
async function startWorkflow() {
    const input = document.getElementById('research-question');
    const sendBtn = document.getElementById('btn-send');
    const question = input.value.trim();

    // Validate input
    if (!question) {
        alert('Please enter a research question');
        return;
    }

    // Disable button and show loading
    sendBtn.disabled = true;
    sendBtn.classList.add('loading');
    input.disabled = true;

    // Add user message to chat
    addChatMessage(question, 'user');
    addLog(`[User] Research question: ${question}`, 'info');

    // Clear input
    input.value = '';
    input.style.height = 'auto';

    // Add to conversation history
    addConversationToHistory(question);

    // Call the backend API
    addLog('[System] Sending request to backend...', 'info');

    try {
        const response = await fetch(`${API_BASE_URL}/api/parse-research-question`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                research_question: question
            })
        });

        const data = await response.json();

        if (data.success) {
            // Display the result from parsing_research_question
            addChatMessage(data.result, 'agm');
            addLog('[AGM] Response received from backend', 'success');

            // Show result in chat
            addRichChatMessage('Research Question Parsed', {
                question: question,
                response: data.result,
                timestamp: new Date().toISOString()
            });
        } else {
            // Handle error from backend
            addChatMessage(`Error: ${data.error}`, 'agm');
            addLog(`[Error] ${data.error}`, 'error');
        }

    } catch (error) {
        // Handle network or connection error
        const errorMsg = `Could not connect to backend server. Make sure the Flask server is running on ${API_BASE_URL}`;
        addChatMessage(errorMsg, 'agm');
        console.error('[chatWithAI] Fetch failed:', error.name, error.message, error);
        addLog(`[Error] ${error.name}: ${error.message}`, 'error');

        addRichChatMessage('Connection Error', {
            error: `${error.name}: ${error.message}`,
            hint: 'Run: python WebUI/app.py'
        });
    }

    // Re-enable button and hide loading
    sendBtn.disabled = false;
    sendBtn.classList.remove('loading');
    input.disabled = false;
    input.focus();
}

async function chatWithAI() {

    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send');
    const message = input.value.trim();

    console.log('[chatWithAI] Called with message:', message);
    console.log('[chatWithAI] feedbackMode:', JSON.stringify(feedbackMode));

    // Check feedback mode FIRST — during interactive code review the SSE stream
    // is still open (activeAbortController is set) but the user needs to send
    // feedback, not interrupt the stream.
    if (feedbackMode.active && message) {
        console.log('[chatWithAI] Feedback mode is active, type:', feedbackMode.type);
        // Route to feedback handler instead of normal chat
        if (feedbackMode.type === 'workflow') {
            console.log('[chatWithAI] Calling handleWorkflowFeedback');
            await handleWorkflowFeedback(message);
            console.log('[chatWithAI] handleWorkflowFeedback completed');
        } else if (feedbackMode.type === 'research_plan') {
            console.log('[chatWithAI] Calling handleResearchPlanFeedback');
            await handleResearchPlanFeedback(message);
        } else if (feedbackMode.type === 'geoprocessing_workflow') {
            console.log('[chatWithAI] Calling handleGeoprocessingWorkflowFeedback');
            await handleGeoprocessingWorkflowFeedback(message);
        } else if (feedbackMode.type === 'code') {
            console.log('[chatWithAI] Calling handleCodeFeedback');
            await handleCodeFeedback(message);
        } else if (feedbackMode.type === 'rq_breakdown') {
            console.log('[chatWithAI] Calling handleRqBreakdownFeedback');
            await handleRqBreakdownFeedback(message);
        } else if (feedbackMode.type === 'code_review') {
            console.log('[chatWithAI] Calling handleCodeReviewFeedback');
            await handleCodeReviewFeedback(message);
        }
        input.value = '';
        input.style.height = 'auto';
        return;
    }

    // If a stream is running (and we're not in feedback mode), interrupt it
    if (activeAbortController) {
        interruptRunningStream();
        return;
    }

    // Validate input
    if (!message) {
        alert('Please enter a message');
        return;
    }

    console.log('[chatWithAI] Not in feedback mode, proceeding with normal chat');

    // Disable button and show loading
    sendBtn.disabled = true;
    sendBtn.classList.add('loading');
    input.disabled = true;

    // Add user message to chat
    addChatMessage(message, 'user');
    showThinkingIndicator();
    addLog(`[User] Message: ${message}`, 'info');
    addLog('[System] Sending request to backend...', 'info');

    // Clear input
    input.value = '';
    input.style.height = 'auto';

    // Clear previous LLM response and set streaming status
    clearLLMResponse();
    const statusDot = document.getElementById('llm-status-dot');
    const statusText = document.getElementById('llm-status-text');
    if (statusDot) statusDot.className = 'status-dot running';
    if (statusText) statusText.textContent = 'Streaming...';

    try {
        // Reset workflow card state so a new run gets a fresh container
        // (previous cards stay in the DOM — this just ensures new ones are created)
        _wfCardsContainer = null;
        _wfCurrentPhase = null;

        // Check if there are uploaded files
        const hasFiles = window.loadedLayers && window.loadedLayers.length > 0;

        const abortCtrl = startInterruptableStream();
        let streamUrl = `${API_BASE_URL}/api/chat-with-ai-stream`;
        let requestOptions = { method: 'POST', signal: abortCtrl.signal };

        // Read interactive code review toggle
        const interactiveCodeToggle = document.getElementById('interactive-code-toggle');
        const interactiveCode = interactiveCodeToggle ? interactiveCodeToggle.checked : false;

        // Read EDA toggle
        const enableEdaToggle = document.getElementById('enable-eda-toggle');
        const enableEda = ENABLE_EDA && enableEdaToggle ? enableEdaToggle.checked : false;

        // Read intent mode (auto / chat / research)
        const intentModeEl = document.querySelector('input[name="intent-mode"]:checked');
        const intentMode = intentModeEl ? intentModeEl.value : 'auto';

        // Read Autonomous Mode toggle
        const autonomousModeToggle = document.getElementById('autonomous-mode-toggle');
        const autonomousMode = autonomousModeToggle ? autonomousModeToggle.checked : false;

        // Read Data Download Mode toggle (auto data retrieval)
        const dataDownloadMode = localStorage.getItem('agm_data_download_mode') === 'true';

        // Read selected model and reasoning effort
        // When FORCE_MODEL_OVERRIDE is true, ignore whatever the UI has selected
        // and use the forced values instead (UI selection remains functional for future use).
        let selectedModel, reasoningEffort;
        if (FORCE_MODEL_OVERRIDE) {
            selectedModel = FORCED_MODEL;
            reasoningEffort = FORCED_REASONING_EFFORT;
        } else {
            const modelSelect = document.getElementById('model-select');
            selectedModel = modelSelect ? modelSelect.value : null;
            const effortItem = document.getElementById('effort-dropdown-item');
            reasoningEffort = (effortItem && effortItem.style.display !== 'none') ? _selectedEffort : null;
        }

        if (hasFiles) {
            // Send with FormData (includes files)
            const formData = new FormData();
            formData.append('message', message);
            formData.append('model', selectedModel);
            if (reasoningEffort) formData.append('reasoning_effort', reasoningEffort);
            if (interactiveCode) formData.append('interactive_code', 'true');
            if (enableEda) formData.append('enable_eda', 'true');
            if (autonomousMode) formData.append('autonomous_mode', 'true');
            if (dataDownloadMode) formData.append('data_download_mode', 'true');
            formData.append('intent_mode', intentMode);
            if (currentConversationId) formData.append('conversation_id', currentConversationId);

            // Append all loaded files
            window.loadedLayers.forEach((layer, index) => {
                if (layer.file) {
                    // Single file (CSV, GeoJSON, GPKG, ZIP, etc.)
                    formData.append('files', layer.file);
                    addLog(`[System] Including file: ${layer.fileName}`, 'info');
                } else if (layer.files && layer.files.length > 0) {
                    // Multi-file (shapefile components: .shp, .shx, .dbf, .prj)
                    layer.files.forEach(f => {
                        formData.append('files', f);
                    });
                    addLog(`[System] Including shapefile: ${layer.fileName} (${layer.files.length} components)`, 'info');
                } else if (layer.serverBacked && layer.fileName) {
                    // Restored layer — file already on server, send name reference
                    formData.append('existing_files', layer.fileName);
                    addLog(`[System] Including restored file: ${layer.fileName}`, 'info');
                }
            });

            requestOptions.body = formData;
        } else {
            // Send JSON only (no files)
            requestOptions.headers = { 'Content-Type': 'application/json' };
            requestOptions.body = JSON.stringify({ message: message, model: selectedModel, reasoning_effort: reasoningEffort, interactive_code: interactiveCode, enable_eda: enableEda, autonomous_mode: autonomousMode, data_download_mode: dataDownloadMode, intent_mode: intentMode, conversation_id: currentConversationId });
        }

        // Use fetch with streaming
        const response = await fetch(streamUrl, requestOptions);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';
        let currentStreamContent = '';
        let resultData = null;
        let streamingChatMessage = null;
        let streamingMessageContent = null;

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            // Decode the chunk and add to buffer
            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE messages (separated by \n\n)
            const messages = buffer.split('\n\n');
            buffer = messages.pop() || ''; // Keep incomplete message in buffer

            for (const msg of messages) {
                if (msg.startsWith('data: ')) {
                    try {
                        const jsonData = JSON.parse(msg.slice(6)); // Remove 'data: ' prefix

                        // Handle different types of updates
                        if (jsonData.type === 'conversation_id') {
                            // Backend assigned/confirmed a conversation ID
                            currentConversationId = jsonData.conversation_id;
                            // Update URL so the conversation is shareable
                            const shareUrl = new URL(window.location);
                            shareUrl.searchParams.set('conversation', currentConversationId);
                            history.pushState(null, '', shareUrl);
                            loadConversationList();
                        } else if (jsonData.type === 'llm_update') {
                            // Skip noisy intent/chat status cards in chat mode
                            const silentSteps = ['intent_detected', 'chat_response'];
                            if (silentSteps.includes(jsonData.step)) {
                                // do nothing — suppress these cards
                            } else {
                            hideThinkingIndicator();
                            // Display status step in workflow card
                            updateWorkflowCard(jsonData.content, jsonData.step);
                            addLLMResponse(jsonData.content, true);
                            addLog(`[LLM] ${jsonData.content}`, 'info');

                            // Task Breakdown: once streaming finishes, render the
                            // structured summary + Proceed/Feedback buttons as a new
                            // sibling div inside the same Task Breakdown card.
                            if (jsonData.step === 'rq_breakdown_complete'
                                && jsonData.data && jsonData.data.rq_breakdown) {
                                displayRqBreakdownSummary(jsonData.data.rq_breakdown, {
                                    taskId: jsonData.data.task_id || window._completedTaskId,
                                });
                            }
                            }
                        } else if (jsonData.type === 'llm_stream') {
                            const streamStep = jsonData.step || '';
                            const isWorkflowStream = streamStep && streamStep !== 'streaming_chat';

                            if (isWorkflowStream) {
                                hideThinkingIndicator();
                                // Workflow stream — append to current workflow card body
                                appendToWorkflowCard(jsonData.content, streamStep);
                            } else {
                                // Regular chat stream — display in separate bubble
                                // Skip empty leading chunks (gemma often sends them while
                                // warming up / planning tool calls). Don't create the bubble
                                // or drop the thinking indicator until real text arrives.
                                if (!jsonData.content) {
                                    continue;
                                }
                                currentStreamContent += jsonData.content;
                                hideThinkingIndicator();

                                if (!streamingChatMessage) {
                                    const chatMessages = document.getElementById('chat-messages');
                                    streamingChatMessage = document.createElement('div');
                                    streamingChatMessage.className = 'chat-message agm rich-content';

                                    const avatar = document.createElement('div');
                                    avatar.className = 'message-avatar';
                                    avatar.innerHTML = '<img src="icon/AGM.png" alt="AGM" class="avatar-img">';

                                    const wrapper = document.createElement('div');
                                    wrapper.className = 'message-wrapper full-width';

                                    const header = document.createElement('div');
                                    header.className = 'message-header';
                                    header.innerHTML = `
                                        <span class="message-sender">AGM</span>
                                        <span class="message-time">${getCurrentTimestamp()}</span>
                                    `;

                                    const bubble = document.createElement('div');
                                    bubble.className = 'message-bubble';

                                    streamingMessageContent = document.createElement('div');
                                    streamingMessageContent.className = 'message-content streaming-content';
                                    streamingMessageContent.style.whiteSpace = 'pre-wrap';
                                    streamingMessageContent.style.fontFamily = 'monospace';
                                    streamingMessageContent.style.fontSize = '0.9em';

                                    bubble.appendChild(streamingMessageContent);
                                    wrapper.appendChild(header);
                                    wrapper.appendChild(bubble);
                                    streamingChatMessage.appendChild(avatar);
                                    streamingChatMessage.appendChild(wrapper);
                                    chatMessages.appendChild(streamingChatMessage);
                                }

                                if (streamingMessageContent) {
                                    streamingMessageContent.textContent = currentStreamContent;
                                    // Smart-scroll: don't hijack chat scroll during streaming
                                    smartScrollChat();
                                }
                            }




                        } else if (jsonData.type === 'log') {
                            addLog(`${jsonData.content}`, 'info');


                            // // Update LLM Response panel
                            // const llmContent = document.getElementById('llm-response-content');
                            // let streamEntry = llmContent.querySelector('.llm-stream-entry');

                            // if (!streamEntry) {
                            //     streamEntry = document.createElement('div');
                            //     streamEntry.className = 'llm-response-entry llm-stream-entry streaming';

                            //     const timestamp = document.createElement('div');
                            //     timestamp.className = 'timestamp';
                            //     timestamp.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
                            //     streamEntry.appendChild(timestamp);

                            //     const contentDiv = document.createElement('div');
                            //     contentDiv.className = 'content';
                            //     streamEntry.appendChild(contentDiv);

                            //     llmContent.appendChild(streamEntry);
                            // }

                            // const contentDiv = streamEntry.querySelector('.content');
                            // contentDiv.textContent = currentStreamContent;
                            // llmContent.scrollTop = llmContent.scrollHeight;



                            
                        } else if (jsonData.type === 'status') {
                            if (intentMode === 'chat') { /* suppress in chat mode */ } else {
                            updateWorkflowCard(jsonData.message, jsonData.step || 'general');
                            addLog(`[Status] ${jsonData.message}`, 'info');
                            }
                        } else if (jsonData.type === 'research_plan_stream') {
                            // Stream research plan LLM output into the workflow card body
                            appendToWorkflowCard(jsonData.content);

                        } else if (jsonData.type === 'data_download_summary') {
                            // Render download summary in a sibling panel next to the streaming card
                            displayDataDownloadSummary(jsonData);
                        } else if (jsonData.type === 'data_request_files') {
                            // Render per-request file tiles inside the matching sub-card
                            displayDataRequestTiles(jsonData);
                        } else if (jsonData.type === 'research_plan_viz') {
                            addLog('[AGM] Research plan visualization ready', 'success');
                            if (jsonData.viz_id) {
                                displayResearchPlanViz(jsonData.viz_id);
                            }
                        } else if (jsonData.type === 'geoprocessing_workflow_viz') {
                            addLog('[AGM] Geoprocessing workflow visualization ready', 'success');
                            if (jsonData.viz_id) {
                                spatial_analysis_displayWorkflowViz(jsonData.viz_id);
                            }
                        } else if (jsonData.type === 'code_review') {
                            console.log('[main-stream] code_review event received:', jsonData);
                            displayCodeReview(jsonData);
                        } else if (jsonData.type === 'eda_approval') {
                            console.log('[main-stream] eda_approval event received:', jsonData);
                            displayEdaApproval(jsonData);
                        } else if (jsonData.type === 'data_download_approval') {
                            console.log('[main-stream] data_download_approval event received:', jsonData);
                            displayDataDownloadApproval(jsonData);
                        } else if (jsonData.type === 'data_source_select_approval') {
                            console.log('[main-stream] data_source_select_approval event received:', jsonData);
                            displayDataSourceSelectApproval(jsonData);
                        } else if (jsonData.type === 'step_result') {
                            displayStepResult(jsonData);
                        } else if (jsonData.type === 'execution_checkpoint') {
                            displayExecutionCheckpoint(jsonData);
                        } else if (jsonData.type === 'figure_catalog') {
                            displayFigureCatalog(jsonData.figures || [], jsonData.step);
                        } else if (jsonData.type === 'execution_flowchart') {
                            displayExecutionFlowchart(jsonData.relative_path, jsonData.step);
                        } else if (jsonData.type === 'result_presentation') {
                            displayMarkdownResult('Result Presentation', '📊', jsonData.content, jsonData.relative_path, jsonData.step);
                        } else if (jsonData.type === 'result_discussion') {
                            displayMarkdownResult('Result Discussion', '💬', jsonData.content, jsonData.relative_path, jsonData.step);
                        } else if (jsonData.type === 'manuscript_section') {
                            displayMarkdownResult(`Manuscript: ${jsonData.section}`, '📝', jsonData.content, jsonData.relative_path, jsonData.step);
                        } else if (jsonData.type === 'manuscript_complete') {
                            displayMarkdownResult('Full Manuscript', '📖', jsonData.content, jsonData.relative_path, jsonData.step);
                        } else if (jsonData.type === 'result') {
                            // Final result received — finalize all workflow cards
                            finalizeAllWorkflowCards();
                            resultData = jsonData;
                            fullResponse = jsonData.response;
                        } else if (jsonData.type === 'complete') {
                            addLog('[System] Stream complete', 'success');
                        } else if (jsonData.type === 'error') {
                            addLog(`[Error] ${jsonData.error}`, 'error');
                            addChatMessage(`❌ Error: ${jsonData.error}`, 'agm');
                        }
                    } catch (parseError) {
                        console.error('Error parsing SSE message:', parseError, msg);
                    }
                }
            }
        }

        // Update LLM status to ready
        if (statusDot) statusDot.className = 'status-dot completed';
        if (statusText) statusText.textContent = 'Ready';

        // Display final result
        if (resultData) {
            addLog('[AGM] Response received from backend', 'success');

            // Log the response type for debugging
            if (resultData.intent) {
                addLog(`[Debug] Intent: ${resultData.intent.intent} (${resultData.intent.confidence})`, 'info');
            }

            // If solution was generated, clear stream and show graph in same message
            if (resultData.solution && streamingChatMessage && streamingMessageContent) {
        
                addLog('[AGM] Solution graph generated!', 'success');
                let bubble;



                // If we have a streaming message, use it; otherwise create a new chat message
                if (streamingChatMessage && streamingMessageContent) {
                    // Clear the streaming content
                    streamingMessageContent.innerHTML = '';
                    // Get the parent bubble to append graph to
                    bubble = streamingMessageContent.parentElement;
                } else {
                    // Create a new AGM message for the graph
                    const chatMessages = document.getElementById('chat-messages');
                    const agmMessage = document.createElement('div');
                    agmMessage.className = 'chat-message agm';

                    const avatar = document.createElement('div');
                    avatar.className = 'message-avatar';
                    avatar.innerHTML = '<img src="icon/AGM.png" alt="AGM" class="avatar-img">';

                    const wrapper = document.createElement('div');
                    wrapper.className = 'message-wrapper full-width';

                    const header = document.createElement('div');
                    header.className = 'message-header';
                    const now = new Date();
                    header.innerHTML = `
                        <span class="message-sender">AGM</span>
                        <span class="message-time">${now.toLocaleTimeString('en-US', { hour12: false })}</span>
                    `;

                    bubble = document.createElement('div');
                    bubble.className = 'message-bubble';

                    wrapper.appendChild(header);
                    wrapper.appendChild(bubble);
                    agmMessage.appendChild(avatar);
                    agmMessage.appendChild(wrapper);
                    chatMessages.appendChild(agmMessage);
                    smartScrollChat();
                }


                

                // // Clear the streaming content
                // streamingMessageContent.innerHTML = '';

                // // Get the parent bubble to append graph to
                // const bubble = streamingMessageContent.parentElement;

                // Create solution info
                const solution = resultData.solution;
                const solutionInfo = document.createElement('div');
                solutionInfo.innerHTML = `
                    <h4 style="margin-top: 0;">Workflow Graph</h4>
                    <p><strong>Nodes:</strong> ${solution.graph_data.nodes.length}</p>
                    <p><strong>Edges:</strong> ${solution.graph_data.edges.length}</p>
                `;
                bubble.appendChild(solutionInfo);

                // Create graph iframe
                const graphContainer = document.createElement('div');
                graphContainer.style.width = '100%';
                graphContainer.style.height = '500px';
                graphContainer.style.border = '1px solid #ddd';
                graphContainer.style.borderRadius = '8px';
                graphContainer.style.marginTop = '10px';

                const iframe = document.createElement('iframe');
                iframe.src = `${API_BASE_URL}/api/graph/${solution._task_id}?v=${Date.now()}`;
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = 'none';
                iframe.id = `graph-iframe-${solution._task_id}`;
                graphContainer.appendChild(iframe);
                bubble.appendChild(graphContainer);

                // Add interactive workflow controls
                const workflowControls = document.createElement('div');
                workflowControls.className = 'workflow-controls';
                workflowControls.style.marginTop = '15px';
                workflowControls.style.padding = '15px';
                workflowControls.style.background = '#f9f9f9';
                workflowControls.style.borderRadius = '8px';
                workflowControls.style.border = '1px solid #e0e0e0';

                const controlsTitle = document.createElement('h4');
                controlsTitle.textContent = '🔧 Interactive Workflow Review';
                controlsTitle.style.marginTop = '0';
                controlsTitle.style.marginBottom = '10px';
                workflowControls.appendChild(controlsTitle);

                const controlsDescription = document.createElement('p');
                controlsDescription.textContent = 'Review the workflow above and take action:';
                controlsDescription.style.fontSize = '0.9em';
                controlsDescription.style.color = '#666';
                controlsDescription.style.marginBottom = '10px';
                workflowControls.appendChild(controlsDescription);

                // Create button container
                const buttonContainer = document.createElement('div');
                buttonContainer.style.display = 'flex';
                buttonContainer.style.gap = '10px';
                buttonContainer.style.marginBottom = '10px';
                buttonContainer.style.flexWrap = 'wrap';

                // Approve button
                const approveBtn = document.createElement('button');
                approveBtn.textContent = '✓ Approve Workflow';
                approveBtn.className = 'btn-workflow-approve';
                approveBtn.style.padding = '8px 16px';
                approveBtn.style.background = '#28a745';
                approveBtn.style.color = 'white';
                approveBtn.style.border = 'none';
                approveBtn.style.borderRadius = '4px';
                approveBtn.style.cursor = 'pointer';
                approveBtn.style.fontSize = '0.9em';
                approveBtn.onclick = () => approveWorkflow(solution._task_id, workflowControls);
                buttonContainer.appendChild(approveBtn);

                // Provide Feedback button
                const feedbackBtn = document.createElement('button');
                feedbackBtn.textContent = '✎ Provide Feedback';
                feedbackBtn.className = 'btn-workflow-feedback';
                feedbackBtn.style.padding = '8px 16px';
                feedbackBtn.style.background = '#ffc107';
                feedbackBtn.style.color = '#333';
                feedbackBtn.style.border = 'none';
                feedbackBtn.style.borderRadius = '4px';
                feedbackBtn.style.cursor = 'pointer';
                feedbackBtn.style.fontSize = '0.9em';
                feedbackBtn.onclick = () => activateFeedbackMode('workflow', solution._task_id, iframe, {
                    graph_data: solution.graph_data
                });
                buttonContainer.appendChild(feedbackBtn);

                workflowControls.appendChild(buttonContainer);
                bubble.appendChild(workflowControls);

            } else if (!resultData.solution && !streamingChatMessage) {
                // No solution and no streaming message, show response normally
                addChatMessage(fullResponse, 'agm');
            }
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            // User interrupted — already handled by interruptRunningStream()
            return;
        }
        // Handle network or connection error
        const errorMsg = `Could not connect to backend server. Make sure the Flask server is running on ${API_BASE_URL}`;
        addChatMessage(errorMsg, 'agm');
        console.error('[chatWithAI] Fetch failed:', error.name, error.message, error);
        addLog(`[Error] ${error.name}: ${error.message}`, 'error');

        addRichChatMessage('Connection Error', {
            error: `${error.name}: ${error.message}`,
            hint: 'Run: python WebUI/app.py'
        });

        // Update LLM status to ready
        const statusDot = document.getElementById('llm-status-dot');
        const statusText = document.getElementById('llm-status-text');
        if (statusDot) statusDot.className = 'status-dot error';
        if (statusText) statusText.textContent = 'Error';
    }

    // Clean up interrupt state and re-enable button
    hideThinkingIndicator();
    stopInterruptableStream();
    sendBtn.disabled = false;
    sendBtn.classList.remove('loading');
    input.disabled = false;
    input.focus();
}

// Helper function for delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function updateProgress(percentage) {
    workflowState.progress = percentage;
    document.getElementById('progress-fill').style.width = percentage + '%';
    document.getElementById('progress-text').textContent = percentage + '% Complete';
}

function updateWorkflowStatus(status) {
    const statusText = document.getElementById('workflow-status-text');
    const statusDot = document.getElementById('status-dot');

    statusText.textContent = status;

    // Update status dot
    statusDot.className = 'status-dot';
    if (status === 'Running') {
        statusDot.classList.add('running');
    } else if (status === 'Completed') {
        statusDot.classList.add('completed');
    } else if (status === 'Error') {
        statusDot.classList.add('error');
    }
}

function updateAgentStatus(agentName, status, task = '') {
    // Update compact node
    const agentNode = document.querySelector(`.agent-node-compact[data-agent="${agentName}"]`);
    if (!agentNode) return;

    // Remove previous status classes
    agentNode.classList.remove('active', 'completed');

    // Add new status
    if (status === 'active') {
        agentNode.classList.add('active');
    } else if (status === 'completed') {
        agentNode.classList.add('completed');
    }

    // Update status text
    const nodeStatus = agentNode.querySelector('.node-status-compact');
    if (nodeStatus) {
        if (status === 'idle') {
            nodeStatus.textContent = 'Idle';
        } else if (status === 'active') {
            nodeStatus.textContent = 'Active';
        } else if (status === 'completed') {
            nodeStatus.textContent = 'Completed';
        }
    }
}

function updatePipelineStep(stepNumber, status) {
    const steps = document.querySelectorAll('.pipeline-step');
    if (stepNumber > 0 && stepNumber <= steps.length) {
        const step = steps[stepNumber - 1];
        step.className = 'pipeline-step ' + status;
    }
}

function updateActivity(message) {
    document.getElementById('activity-message').textContent = message;
}

function addResult(title, content, type = 'default') {
    const resultsContent = document.getElementById('results-content-main');

    // Remove empty message if present
    const emptyMessage = resultsContent.querySelector('.empty-message');
    if (emptyMessage) {
        emptyMessage.remove();
    }

    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';

    // Check if this is rich content (graph or code)
    const isRichContent = (typeof content === 'object' && (content.solution || content.code)) || type === 'code';

    // Create collapsible section wrapper for rich content
    let collapsibleSection = null;
    let collapsibleContent = null;

    if (isRichContent) {
        // Create collapsible section wrapper
        collapsibleSection = document.createElement('div');
        collapsibleSection.className = 'collapsible-section';

        // Create header with toggle button
        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'collapsible-section-header';

        const resultTitle = document.createElement('h4');
        resultTitle.textContent = title;

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'btn-collapse-section';
        toggleBtn.innerHTML = '<span class="section-toggle-icon">▼</span> Collapse';
        toggleBtn.onclick = () => {
            collapsibleSection.classList.toggle('collapsed');
            if (collapsibleSection.classList.contains('collapsed')) {
                toggleBtn.innerHTML = '<span class="section-toggle-icon">▼</span> Expand';
            } else {
                toggleBtn.innerHTML = '<span class="section-toggle-icon">▼</span> Collapse';
            }
        };

        sectionHeader.appendChild(resultTitle);
        sectionHeader.appendChild(toggleBtn);

        // Create collapsible content wrapper
        collapsibleContent = document.createElement('div');
        collapsibleContent.className = 'collapsible-section-content';

        collapsibleSection.appendChild(sectionHeader);
        collapsibleSection.appendChild(collapsibleContent);
        resultItem.appendChild(collapsibleSection);
    } else {
        // Simple title for non-rich content
        const resultTitle = document.createElement('h4');
        resultTitle.textContent = title;
        resultItem.appendChild(resultTitle);
    }

    // Check if content contains a solution graph
    if (typeof content === 'object' && content.solution) {
        const solution = content.solution;

        // Determine where to append content (collapsible or directly to resultItem)
        const contentTarget = collapsibleContent || resultItem;

        // Create solution info section
        const solutionInfo = document.createElement('div');
        solutionInfo.className = 'solution-info';
        solutionInfo.innerHTML = `
            <p><strong>Nodes:</strong> ${solution.graph_data.nodes.length}</p>
            <p><strong>Edges:</strong> ${solution.graph_data.edges.length}</p>
        `;
        contentTarget.appendChild(solutionInfo);

        // Create iframe to display the graph
        const graphContainer = document.createElement('div');
        graphContainer.className = 'graph-container';
        graphContainer.style.width = '100%';
        graphContainer.style.height = '500px';
        graphContainer.style.border = '1px solid #ddd';
        graphContainer.style.borderRadius = '8px';
        graphContainer.style.marginTop = '10px';
        graphContainer.style.overflow = 'hidden';

        const iframe = document.createElement('iframe');
        iframe.src = `${API_BASE_URL}/api/graph/${solution._task_id}?v=${Date.now()}`;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.title = 'Solution Graph Visualization';
        iframe.id = `graph-iframe-${solution._task_id}`;

        graphContainer.appendChild(iframe);
        contentTarget.appendChild(graphContainer);

        // Add interactive workflow controls
        const workflowControls = document.createElement('div');
        workflowControls.className = 'workflow-controls';
        workflowControls.style.marginTop = '15px';
        workflowControls.style.padding = '15px';
        workflowControls.style.background = '#f9f9f9';
        workflowControls.style.borderRadius = '8px';
        workflowControls.style.border = '1px solid #e0e0e0';

        const controlsTitle = document.createElement('h4');
        controlsTitle.textContent = '🔧 Interactive Workflow Review';
        controlsTitle.style.marginTop = '0';
        controlsTitle.style.marginBottom = '10px';
        workflowControls.appendChild(controlsTitle);

        const controlsDescription = document.createElement('p');
        controlsDescription.textContent = 'Review the workflow above and take action:';
        controlsDescription.style.fontSize = '0.9em';
        controlsDescription.style.color = '#666';
        controlsDescription.style.marginBottom = '10px';
        workflowControls.appendChild(controlsDescription);

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.marginBottom = '10px';
        buttonContainer.style.flexWrap = 'wrap';

        // Approve button
        const approveBtn = document.createElement('button');
        approveBtn.textContent = '✓ Approve Workflow';
        approveBtn.className = 'btn-workflow-approve';
        approveBtn.style.padding = '8px 16px';
        approveBtn.style.background = '#28a745';
        approveBtn.style.color = 'white';
        approveBtn.style.border = 'none';
        approveBtn.style.borderRadius = '4px';
        approveBtn.style.cursor = 'pointer';
        approveBtn.style.fontSize = '0.9em';
        approveBtn.onclick = () => approveWorkflow(solution._task_id, workflowControls);
        buttonContainer.appendChild(approveBtn);

        // Provide Feedback button
        const feedbackBtn = document.createElement('button');
        feedbackBtn.textContent = '✎ Provide Feedback';
        feedbackBtn.className = 'btn-workflow-feedback';
        feedbackBtn.style.padding = '8px 16px';
        feedbackBtn.style.background = '#ffc107';
        feedbackBtn.style.color = '#333';
        feedbackBtn.style.border = 'none';
        feedbackBtn.style.borderRadius = '4px';
        feedbackBtn.style.cursor = 'pointer';
        feedbackBtn.style.fontSize = '0.9em';
        feedbackBtn.onclick = () => activateFeedbackMode('workflow', solution._task_id, iframe, {
            task: solution._task_id,
            graph_data: solution.graph_data
        });
        buttonContainer.appendChild(feedbackBtn);

        // List Nodes button
        const listNodesBtn = document.createElement('button');
        listNodesBtn.textContent = '📋 List Nodes';
        listNodesBtn.className = 'btn-workflow-list';
        listNodesBtn.style.padding = '8px 16px';
        listNodesBtn.style.background = '#17a2b8';
        listNodesBtn.style.color = 'white';
        listNodesBtn.style.border = 'none';
        listNodesBtn.style.borderRadius = '4px';
        listNodesBtn.style.cursor = 'pointer';
        listNodesBtn.style.fontSize = '0.9em';
        listNodesBtn.onclick = () => listWorkflowNodes(solution._task_id);
        buttonContainer.appendChild(listNodesBtn);

        workflowControls.appendChild(buttonContainer);

        // Status message area
        const statusArea = document.createElement('div');
        statusArea.id = `workflow-status-${solution._task_id}`;
        statusArea.style.marginTop = '10px';
        statusArea.style.padding = '8px';
        statusArea.style.borderRadius = '4px';
        statusArea.style.display = 'none';
        workflowControls.appendChild(statusArea);

        contentTarget.appendChild(workflowControls);

        // Add graph data details (collapsible)
        const detailsToggle = document.createElement('button');
        detailsToggle.textContent = '▼ Show Graph Details';
        detailsToggle.style.marginTop = '10px';
        detailsToggle.style.padding = '5px 10px';
        detailsToggle.style.cursor = 'pointer';
        detailsToggle.style.background = '#f0f0f0';
        detailsToggle.style.border = '1px solid #ccc';
        detailsToggle.style.borderRadius = '4px';

        const detailsContent = document.createElement('pre');
        detailsContent.style.display = 'none';
        detailsContent.style.marginTop = '10px';
        detailsContent.style.maxHeight = '300px';
        detailsContent.style.overflow = 'auto';
        detailsContent.textContent = JSON.stringify(solution.graph_data, null, 2);

        detailsToggle.onclick = () => {
            if (detailsContent.style.display === 'none') {
                detailsContent.style.display = 'block';
                detailsToggle.textContent = '▲ Hide Graph Details';
            } else {
                detailsContent.style.display = 'none';
                detailsToggle.textContent = '▼ Show Graph Details';
            }
        };

        contentTarget.appendChild(detailsToggle);
        contentTarget.appendChild(detailsContent);

    } else if (type === 'code' && typeof content === 'object' && content.code) {
        // Determine where to append content (collapsible or directly to resultItem)
        const contentTarget = collapsibleContent || resultItem;

        // Display generated code with interactive controls
        const codeInfo = document.createElement('div');
        codeInfo.className = 'code-info';
        codeInfo.style.marginBottom = '10px';

        // Extract just the filename from the full path and remove task_id
        const codeFileName = content.code_file ? getDisplayName(content.code_file.split(/[\\/]/).pop()) : 'workflow.py';

        codeInfo.innerHTML = `
            <p><strong>Operations:</strong> ${content.operation_count}</p>
            <p><strong>Code File:</strong> ${codeFileName}</p>
        `;
        contentTarget.appendChild(codeInfo);

        // Code display area
        const codeContainer = document.createElement('div');
        codeContainer.className = 'code-container';
        codeContainer.style.marginTop = '10px';
        codeContainer.style.marginBottom = '10px';
        codeContainer.style.border = '1px solid #ddd';
        codeContainer.style.borderRadius = '8px';
        codeContainer.style.background = '#f8f9fa';
        codeContainer.style.overflow = 'hidden';

        const codeHeader = document.createElement('div');
        codeHeader.style.padding = '10px';
        codeHeader.style.background = '#e9ecef';
        codeHeader.style.borderBottom = '1px solid #ddd';
        codeHeader.style.fontWeight = 'bold';
        codeHeader.textContent = '📄 Generated Python Code';

        const codeDisplay = document.createElement('pre');
        codeDisplay.style.margin = '0';
        codeDisplay.style.padding = '15px';
        codeDisplay.style.maxHeight = '400px';
        codeDisplay.style.overflow = 'auto';
        codeDisplay.style.fontSize = '0.85em';
        codeDisplay.style.lineHeight = '1.5';
        codeDisplay.style.background = '#ffffff';
        codeDisplay.textContent = content.code;

        codeContainer.appendChild(codeHeader);
        codeContainer.appendChild(codeDisplay);
        contentTarget.appendChild(codeContainer);

        // Interactive code controls
        const codeControls = document.createElement('div');
        codeControls.className = 'code-controls';
        codeControls.style.marginTop = '15px';
        codeControls.style.padding = '15px';
        codeControls.style.background = '#f9f9f9';
        codeControls.style.borderRadius = '8px';
        codeControls.style.border = '1px solid #e0e0e0';

        const codeControlsTitle = document.createElement('h4');
        codeControlsTitle.textContent = '🔧 Code Actions';
        codeControlsTitle.style.marginTop = '0';
        codeControlsTitle.style.marginBottom = '10px';
        codeControls.appendChild(codeControlsTitle);

        // Button container
        const codeButtonContainer = document.createElement('div');
        codeButtonContainer.style.display = 'flex';
        codeButtonContainer.style.gap = '10px';
        codeButtonContainer.style.marginBottom = '10px';
        codeButtonContainer.style.flexWrap = 'wrap';

        // Download button
        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = '⬇ Download .py';
        downloadBtn.style.padding = '8px 16px';
        downloadBtn.style.background = '#28a745';
        downloadBtn.style.color = 'white';
        downloadBtn.style.border = 'none';
        downloadBtn.style.borderRadius = '4px';
        downloadBtn.style.cursor = 'pointer';
        downloadBtn.style.fontSize = '0.9em';
        downloadBtn.onclick = () => downloadWorkflowCode(content._task_id);
        codeButtonContainer.appendChild(downloadBtn);

        // Refine code button
        const refineCodeBtn = document.createElement('button');
        refineCodeBtn.textContent = '✎ Refine Code';
        refineCodeBtn.style.padding = '8px 16px';
        refineCodeBtn.style.background = '#ffc107';
        refineCodeBtn.style.color = '#333';
        refineCodeBtn.style.border = 'none';
        refineCodeBtn.style.borderRadius = '4px';
        refineCodeBtn.style.cursor = 'pointer';
        refineCodeBtn.style.fontSize = '0.9em';
        refineCodeBtn.onclick = () => activateFeedbackMode('code', content._task_id, null, {
            code: content.code
        });
        codeButtonContainer.appendChild(refineCodeBtn);

        // Copy to clipboard button
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '📋 Copy Code';
        copyBtn.style.padding = '8px 16px';
        copyBtn.style.background = '#17a2b8';
        copyBtn.style.color = 'white';
        copyBtn.style.border = 'none';
        copyBtn.style.borderRadius = '4px';
        copyBtn.style.cursor = 'pointer';
        copyBtn.style.fontSize = '0.9em';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(content.code);
            addLog('[User] Code copied to clipboard', 'success');
            copyBtn.textContent = '✓ Copied!';
            setTimeout(() => { copyBtn.textContent = '📋 Copy Code'; }, 2000);
        };
        codeButtonContainer.appendChild(copyBtn);

        codeControls.appendChild(codeButtonContainer);

        // Code feedback input area (initially hidden)
        const codeFeedbackInputArea = document.createElement('div');
        codeFeedbackInputArea.style.display = 'none';
        codeFeedbackInputArea.style.marginTop = '10px';

        const codeFeedbackTextarea = document.createElement('textarea');
        codeFeedbackTextarea.placeholder = 'Enter your feedback here (e.g., "Add error handling for file loading", "Use more efficient data structures", "Add comments to explain the logic")...';
        codeFeedbackTextarea.style.width = '100%';
        codeFeedbackTextarea.style.height = '80px';
        codeFeedbackTextarea.style.padding = '8px';
        codeFeedbackTextarea.style.border = '1px solid #ccc';
        codeFeedbackTextarea.style.borderRadius = '4px';
        codeFeedbackTextarea.style.fontSize = '0.9em';
        codeFeedbackTextarea.style.resize = 'vertical';
        codeFeedbackInputArea.appendChild(codeFeedbackTextarea);

        const codeFeedbackButtonContainer = document.createElement('div');
        codeFeedbackButtonContainer.style.display = 'flex';
        codeFeedbackButtonContainer.style.gap = '10px';
        codeFeedbackButtonContainer.style.marginTop = '8px';

        const submitCodeFeedbackBtn = document.createElement('button');
        submitCodeFeedbackBtn.textContent = '📤 Submit Feedback';
        submitCodeFeedbackBtn.style.padding = '8px 16px';
        submitCodeFeedbackBtn.style.background = '#007bff';
        submitCodeFeedbackBtn.style.color = 'white';
        submitCodeFeedbackBtn.style.border = 'none';
        submitCodeFeedbackBtn.style.borderRadius = '4px';
        submitCodeFeedbackBtn.style.cursor = 'pointer';
        submitCodeFeedbackBtn.style.fontSize = '0.9em';
        submitCodeFeedbackBtn.onclick = () => refineWorkflowCode(content._task_id, codeFeedbackTextarea.value, codeDisplay, codeFeedbackInputArea, codeFeedbackTextarea);
        codeFeedbackButtonContainer.appendChild(submitCodeFeedbackBtn);

        const cancelCodeFeedbackBtn = document.createElement('button');
        cancelCodeFeedbackBtn.textContent = 'Cancel';
        cancelCodeFeedbackBtn.style.padding = '8px 16px';
        cancelCodeFeedbackBtn.style.background = '#6c757d';
        cancelCodeFeedbackBtn.style.color = 'white';
        cancelCodeFeedbackBtn.style.border = 'none';
        cancelCodeFeedbackBtn.style.borderRadius = '4px';
        cancelCodeFeedbackBtn.style.cursor = 'pointer';
        cancelCodeFeedbackBtn.style.fontSize = '0.9em';
        cancelCodeFeedbackBtn.onclick = () => {
            codeFeedbackInputArea.style.display = 'none';
            codeFeedbackTextarea.value = '';
        };
        codeFeedbackButtonContainer.appendChild(cancelCodeFeedbackBtn);

        codeFeedbackInputArea.appendChild(codeFeedbackButtonContainer);
        codeControls.appendChild(codeFeedbackInputArea);

        // Status message area for code
        const codeStatusArea = document.createElement('div');
        codeStatusArea.id = `code-status-${content._task_id}`;
        codeStatusArea.style.marginTop = '10px';
        codeStatusArea.style.padding = '8px';
        codeStatusArea.style.borderRadius = '4px';
        codeStatusArea.style.display = 'none';
        codeControls.appendChild(codeStatusArea);

        contentTarget.appendChild(codeControls);

    } else if (typeof content === 'object') {
        // Determine where to append content
        const contentTarget = collapsibleContent || resultItem;
        // Regular object display
        const pre = document.createElement('pre');
        pre.textContent = JSON.stringify(content, null, 2);
        contentTarget.appendChild(pre);
    } else {
        // Determine where to append content
        const contentTarget = collapsibleContent || resultItem;
        // Plain text display
        const p = document.createElement('p');
        p.textContent = content;
        contentTarget.appendChild(p);
    }

    resultsContent.appendChild(resultItem);
    resultsContent.scrollTop = resultsContent.scrollHeight;
}

// Data Download Mode toggle (toolbar button)
function toggleDataDownloadMode() {
    const btn = document.getElementById('data-download-toggle-btn');
    if (!btn) return;
    const current = localStorage.getItem('agm_data_download_mode') === 'true';
    const next = !current;
    localStorage.setItem('agm_data_download_mode', next ? 'true' : 'false');
    btn.classList.toggle('active', next);
    btn.title = 'Auto-download data: ' + (next ? 'on' : 'off');
}

// Configuration Dropdown Toggle
function toggleConfigDropdown() {
    const dropdown = document.getElementById('config-dropdown');
    dropdown.classList.toggle('show');
    // Close View dropdown if it's open
    const viewDropdown = document.getElementById('view-dropdown');
    if (viewDropdown && viewDropdown.classList.contains('show')) {
        viewDropdown.classList.remove('show');
    }
}

// Inline mode selector dropdown
function toggleModeDropdown(e) {
    e.stopPropagation();
    const popup = document.getElementById('mode-dropdown-popup');
    // Close model dropdown if open
    const modelPopup = document.getElementById('model-dropdown-popup');
    if (modelPopup) modelPopup.classList.remove('show');

    popup.classList.toggle('show');

    if (popup.classList.contains('show')) {
        // Sync mode name label and checkmarks
        const currentMode = document.querySelector('input[name="intent-mode"]:checked');
        const modeValue = currentMode ? currentMode.value : 'research';
        const modeName = document.getElementById('mode-dropdown-mode-name');
        if (modeName) modeName.textContent = getModeDisplayName(modeValue);

        setTimeout(() => {
            document.addEventListener('click', _closeDropdownsOutside);
        }, 0);
    }
}

// Inline model selector dropdown
function toggleModelDropdown(e) {
    e.stopPropagation();
    const popup = document.getElementById('model-dropdown-popup');
    // Close mode dropdown if open
    const modePopup = document.getElementById('mode-dropdown-popup');
    if (modePopup) modePopup.classList.remove('show');

    popup.classList.toggle('show');

    if (popup.classList.contains('show')) {
        // Sync checkmarks
        const currentModel = document.getElementById('model-select').value;
        popup.querySelectorAll('[data-model]').forEach(item => {
            item.classList.toggle('active', item.dataset.model === currentModel);
        });
        // Update effort row visibility and label
        updateReasoningEffortOptions(currentModel);

        setTimeout(() => {
            document.addEventListener('click', _closeDropdownsOutside);
        }, 0);
    }
}

function _closeDropdownsOutside(e) {
    const modePopup = document.getElementById('mode-dropdown-popup');
    const modelPopup = document.getElementById('model-dropdown-popup');
    const effortFlyout = document.getElementById('flyout-effort');
    const modeFlyout = document.getElementById('flyout-mode');
    const isInside = (modePopup && modePopup.contains(e.target))
                  || (modelPopup && modelPopup.contains(e.target))
                  || (effortFlyout && effortFlyout.contains(e.target))
                  || (modeFlyout && modeFlyout.contains(e.target));

    if (!isInside) {
        if (modePopup) modePopup.classList.remove('show');
        if (modelPopup) modelPopup.classList.remove('show');
        document.removeEventListener('click', _closeDropdownsOutside);
    }
}

function closeModeDropdown() {
    const popup = document.getElementById('mode-dropdown-popup');
    if (popup) popup.classList.remove('show');
    const modelPopup = document.getElementById('model-dropdown-popup');
    if (modelPopup) modelPopup.classList.remove('show');
    document.removeEventListener('click', _closeDropdownsOutside);
}

var _flyoutTimers = {};

function showFlyout(type) {
    // Clear any pending hide
    if (_flyoutTimers[type]) { clearTimeout(_flyoutTimers[type]); _flyoutTimers[type] = null; }

    const flyout = document.getElementById('flyout-' + type);
    if (!flyout) return;

    const parent = flyout.closest('.has-flyout') || flyout._parentItem;
    if (!parent) return;

    // Move flyout to body so it escapes all overflow:hidden ancestors
    document.body.appendChild(flyout);
    flyout._parentItem = parent;

    const rect = parent.getBoundingClientRect();
    flyout.style.left = (rect.right + 6) + 'px';
    flyout.style.top = rect.top + 'px';
    flyout.classList.add('show');

    // If it goes off the right edge, show on the left
    const flyoutRect = flyout.getBoundingClientRect();
    if (flyoutRect.right > window.innerWidth) {
        flyout.style.left = (rect.left - flyoutRect.width - 6) + 'px';
    }
    // If it goes off the bottom edge, shift it up
    if (flyoutRect.bottom > window.innerHeight) {
        flyout.style.top = Math.max(4, window.innerHeight - flyoutRect.height - 4) + 'px';
    }

    // Keep open when hovering over the flyout itself
    flyout.onmouseenter = function() {
        if (_flyoutTimers[type]) { clearTimeout(_flyoutTimers[type]); _flyoutTimers[type] = null; }
    };
    flyout.onmouseleave = function() {
        hideFlyout(type);
    };

    if (type === 'mode') {
        const currentMode = document.querySelector('input[name="intent-mode"]:checked');
        const modeValue = currentMode ? currentMode.value : 'research';
        flyout.querySelectorAll('[data-mode]').forEach(item => {
            item.classList.toggle('active', item.dataset.mode === modeValue);
        });
    } else if (type === 'model') {
        const currentModel = document.getElementById('model-select').value;
        flyout.querySelectorAll('[data-model]').forEach(item => {
            item.classList.toggle('active', item.dataset.model === currentModel);
        });
    } else if (type === 'effort') {
        flyout.querySelectorAll('[data-effort]').forEach(item => {
            item.classList.toggle('active', item.dataset.effort === _selectedEffort);
        });
    }
}

function clickToggleFlyout(type, e) {
    e.stopPropagation();
    const flyout = document.getElementById('flyout-' + type);
    if (flyout && flyout.classList.contains('show')) {
        // Clear any pending hide timer and close immediately
        if (_flyoutTimers[type]) { clearTimeout(_flyoutTimers[type]); _flyoutTimers[type] = null; }
        flyout.classList.remove('show');
        if (flyout._parentItem) { flyout._parentItem.appendChild(flyout); flyout._parentItem = null; }
    } else {
        showFlyout(type);
    }
}

function hideFlyout(type) {
    // Delay so mouse can travel from parent item to flyout
    _flyoutTimers[type] = setTimeout(function() {
        const flyout = document.getElementById('flyout-' + type);
        if (!flyout) return;
        flyout.classList.remove('show');
        if (flyout._parentItem) {
            flyout._parentItem.appendChild(flyout);
            flyout._parentItem = null;
        }
    }, 150);
}

// Map internal mode value → user-facing display label
function getModeDisplayName(modeValue) {
    const map = { research: 'Research', task: 'Spatial Analysis', data_retriever: 'Data Retriever', chat: 'Chat' };
    return map[modeValue] || (modeValue.charAt(0).toUpperCase() + modeValue.slice(1));
}

function selectModeFromDropdown(modeValue, modeLabel) {
    const radio = document.querySelector(`input[name="intent-mode"][value="${modeValue}"]`);
    if (radio) radio.checked = true;

    try { localStorage.setItem('agm_intent_mode', modeValue); } catch (e) {}

    const pillLabel = document.getElementById('mode-selector-label');
    if (pillLabel) pillLabel.textContent = modeLabel;

    const modeName = document.getElementById('mode-dropdown-mode-name');
    if (modeName) modeName.textContent = modeLabel;

    // Update checkmarks in flyout
    const flyout = document.getElementById('flyout-mode');
    if (flyout) {
        flyout.querySelectorAll('[data-mode]').forEach(item => {
            item.classList.toggle('active', item.dataset.mode === modeValue);
        });
    }

    // Autonomous toggle only active in Research mode
    updateAutonomousToggleState(modeValue);
}

function updateAutonomousToggleState(modeValue) {
    const autoRow = document.getElementById('autonomous-toggle-row');
    if (!autoRow) return;
    // Autonomous mode is available for Research, Spatial Analysis (task), and Data Retriever
    if (modeValue === 'research' || modeValue === 'task' || modeValue === 'data_retriever') {
        autoRow.classList.remove('disabled');
    } else {
        autoRow.classList.add('disabled');
        // Also uncheck when disabled
        const toggle = document.getElementById('autonomous-mode-toggle-inline');
        if (toggle) {
            toggle.checked = false;
            document.getElementById('autonomous-mode-toggle').checked = false;
            localStorage.setItem('agm_autonomous_mode', 'false');
        }
    }
}

// Reasoning effort options per model
const REASONING_EFFORT_MAP = {
    'gpt-5.1':       ['none', 'low', 'medium', 'high'],
    'gpt-5.2':       ['none', 'low', 'medium', 'high', 'xhigh'],
    'gpt-5.3':       ['low', 'medium', 'high', 'xhigh'],
    'gpt-5.3-codex': ['low', 'medium', 'high', 'xhigh'],
    'gpt-5.4':       ['none', 'low', 'medium', 'high', 'xhigh'],
};

// Track the currently selected effort
let _selectedEffort = 'medium';

function updateReasoningEffortOptions(modelValue) {
    const effortItem = document.getElementById('effort-dropdown-item');
    const effortSep = document.getElementById('effort-sep');
    const effortName = document.getElementById('mode-dropdown-effort-name');
    if (!effortItem) return;

    const efforts = REASONING_EFFORT_MAP[modelValue];
    if (!efforts) {
        effortItem.style.display = 'none';
        if (effortSep) effortSep.style.display = 'none';
        return;
    }

    effortItem.style.display = '';
    if (effortSep) effortSep.style.display = '';

    // If current selection isn't valid for this model, pick a default
    if (!efforts.includes(_selectedEffort)) {
        _selectedEffort = efforts.includes('medium') ? 'medium' : efforts[0];
    }

    // Rebuild the effort flyout items
    const flyout = document.getElementById('flyout-effort');
    if (flyout) {
        flyout.innerHTML = '';
        efforts.forEach(level => {
            const div = document.createElement('div');
            div.className = 'flyout-item' + (level === _selectedEffort ? ' active' : '');
            div.dataset.effort = level;
            div.onclick = function() { selectEffortFromDropdown(level); };
            const label = level.charAt(0).toUpperCase() + level.slice(1);
            div.innerHTML = '<span>' + label + '</span><span class="flyout-check">&#10003;</span>';
            flyout.appendChild(div);
        });
    }

    if (effortName) effortName.textContent = _selectedEffort.charAt(0).toUpperCase() + _selectedEffort.slice(1);
}

function selectEffortFromDropdown(effortValue) {
    _selectedEffort = effortValue;
    const effortName = document.getElementById('mode-dropdown-effort-name');
    if (effortName) effortName.textContent = effortValue.charAt(0).toUpperCase() + effortValue.slice(1);

    // Update effort flyout checkmarks
    const flyout = document.getElementById('flyout-effort');
    if (flyout) {
        flyout.querySelectorAll('[data-effort]').forEach(item => {
            item.classList.toggle('active', item.dataset.effort === effortValue);
        });
    }

    // Update all sub-flyout checkmarks
    document.querySelectorAll('.sub-flyout-effort .effort-item').forEach(item => {
        item.classList.toggle('active', item.dataset.effort === effortValue);
    });
}

function selectModelFromDropdown(modelValue, modelLabel) {
    const select = document.getElementById('model-select');
    if (select) select.value = modelValue;

    // Update button label
    const modelBtnLabel = document.getElementById('model-selector-label');
    if (modelBtnLabel) modelBtnLabel.textContent = modelLabel;

    // Update checkmarks in popup
    const popup = document.getElementById('model-dropdown-popup');
    if (popup) {
        popup.querySelectorAll('[data-model]').forEach(item => {
            item.classList.toggle('active', item.dataset.model === modelValue);
        });
    }

    // Update reasoning effort options for this model
    updateReasoningEffortOptions(modelValue);
}

// View Dropdown Toggle
function toggleViewDropdown() {
    const dropdown = document.getElementById('view-dropdown');
    if (!dropdown) return;
    dropdown.classList.toggle('show');
    // Close Config dropdown if it's open
    const configDropdown = document.getElementById('config-dropdown');
    if (configDropdown && configDropdown.classList.contains('show')) {
        configDropdown.classList.remove('show');
    }
}

// Show Panel Function
function showPanel(panelId) {
    const panel = document.getElementById(panelId);
    if (panel) {
        // Expand the panel if it's collapsed
        panel.classList.remove('collapsed');

        // Scroll the panel into view
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Log the action
        const panelName = panelId.replace('-section', '').replace('-', ' ');
        addLog(`[System] ${panelName} panel opened`, 'info');

        // Close the View dropdown
        toggleViewDropdown();
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('config-dropdown');
    const toggleBtn = document.querySelector('.config-toggle-btn');
    const viewDropdown = document.getElementById('view-dropdown');
    const viewToggleBtn = document.querySelector('.view-toggle-btn');

    if (dropdown && toggleBtn) {
        if (!dropdown.contains(event.target) && !toggleBtn.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    }

    if (viewDropdown && viewToggleBtn) {
        if (!viewDropdown.contains(event.target) && !viewToggleBtn.contains(event.target)) {
            viewDropdown.classList.remove('show');
        }
    }
});

// Dataset Management
function addDataset() {
    const datasetList = document.getElementById('dataset-list-dropdown');
    if (!datasetList) return; // Element not in DOM
    const datasetItem = document.createElement('div');
    datasetItem.className = 'dataset-item';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Name (e.g., County_Data)';

    const pathInput = document.createElement('input');
    pathInput.type = 'text';
    pathInput.placeholder = 'Path (e.g., data/mydata.shp)';

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = () => datasetItem.remove();

    datasetItem.appendChild(nameInput);
    datasetItem.appendChild(pathInput);
    datasetItem.appendChild(removeBtn);
    datasetList.appendChild(datasetItem);
}





// Simulate Workflow (Mock Implementation)
async function simulateWorkflow(rq, datasets) {
    const model = document.getElementById('model-select').value;
    const temperature = document.getElementById('temperature').value;

    addLog(`[Config] Model: ${model}, Temperature: ${temperature}`, 'info');
    updateActivity('Initializing workflow...');

    // Step 1: Data Audit Phase
    await sleep(1000);
    updateProgress(10);
    updatePipelineStep(1, 'active');
    updateActivity('Step 1: Data Audit - TaskManager routing to DataAgent');
    updateAgentStatus('TaskManager', 'active');
    addLog('[TaskManager] Analyzing workflow requirements...', 'info');

    await sleep(1500);
    updateAgentStatus('TaskManager', 'completed');
    updateAgentStatus('DataAgent', 'active');
    addLog('[TaskManager] Routing to DataAgent', 'success');
    addLog('[DataAgent] Starting data audit...', 'info');

    await sleep(2000);
    updateProgress(25);
    datasets.forEach(ds => {
        addLog(`[DataAgent] Processing ${ds.name}...`, 'info');
    });

    await sleep(1500);
    updateAgentStatus('DataAgent', 'completed');
    updatePipelineStep(1, 'completed');
    addLog('[DataAgent] Data audit complete', 'success');
    addLog('[DataAgent] Found 3142 rows, 45 columns', 'info');

    addRichChatMessage('Data Audit', {
        datasets: datasets.length,
        total_rows: 3142,
        columns: 45,
        geometry: 'Polygon',
        crs: 'EPSG:4326'
    });

    // Step 2: RQ Parsing Phase
    await sleep(1000);
    updateProgress(40);
    updatePipelineStep(2, 'active');
    updateActivity('Step 2: Research Question Parsing');
    updateAgentStatus('RQUnderstandingAgent', 'active');
    addLog('[RQAgent] Parsing research question...', 'info');

    await sleep(2500);
    updateProgress(50);
    updateAgentStatus('RQUnderstandingAgent', 'completed');
    updatePipelineStep(2, 'completed');
    addLog('[RQAgent] Identified 2 objectives', 'success');
    addLog('[RQAgent] Study units: Counties', 'info');

    addRichChatMessage('RQ Analysis', {
        objectives: 2,
        study_units: 'Counties',
        spatial_extent: 'United States',
        time_frame: '2020-2021'
    });

    // Step 3: Research Planning Phase
    await sleep(1000);
    updateProgress(65);
    updatePipelineStep(3, 'active');
    updateActivity('Step 3: Generating Research Plan');
    updateAgentStatus('TaskManager', 'active');
    addLog('[TaskManager] Generating research plan...', 'info');

    await sleep(2000);
    updateProgress(75);
    updateAgentStatus('TaskManager', 'completed');
    updatePipelineStep(3, 'completed');
    addLog('[TaskManager] Research plan generated', 'success');

    addRichChatMessage('Research Plan', {
        objectives: 3,
        hypotheses: 4,
        analysis_steps: 8,
        methods: ['OLS', 'Spatial Lag', 'GWR']
    });

    // Step 4: Model Execution Phase
    await sleep(1000);
    updateProgress(80);
    updatePipelineStep(4, 'active');
    updateActivity('Step 4: Model Selection and Execution');
    updateAgentStatus('ModelingAgent', 'active');
    addLog('[ModelingAgent] Querying RAG system...', 'info');

    await sleep(2000);
    addLog('[ModelingAgent] Top models: OLS, Spatial Lag, GWR', 'success');

    await sleep(1500);
    updateProgress(90);
    addLog('[ModelingAgent] Generating analysis code...', 'info');

    await sleep(2000);
    updateProgress(95);
    addLog('[ModelingAgent] Executing models...', 'info');

    await sleep(1500);
    updateProgress(100);
    updateAgentStatus('ModelingAgent', 'completed');
    updatePipelineStep(4, 'completed');
    addLog('[ModelingAgent] All models executed successfully', 'success');

    addRichChatMessage('Modeling Results', {
        models_executed: 3,
        best_model: 'GWR',
        r_squared: 0.72,
        significant_vars: ['median_income', 'population_density']
    });

    // Workflow Complete
    await sleep(500);
    updateWorkflowStatus('Completed');
    updateActivity('Workflow completed successfully! All analysis steps finished.');
    addLog('[System] Workflow completed successfully!', 'success');

    // Reset buttons
    document.getElementById('pause-btn').disabled = true;
    document.getElementById('stop-btn').disabled = true;
    workflowState.isRunning = false;
}

// Helper function for delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Conversation History Management (DB-backed) ─────────────────────

/**
 * Load saved conversations from the backend and render them in the sidebar.
 */
async function loadConversationList() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/conversations`);
        const data = await response.json();

        const conversationList = document.getElementById('conversation-list');
        conversationList.innerHTML = '';

        let conversations = data.conversations || [];

        // If we have a loaded conversation that isn't in the list (shared link),
        // fetch it separately and prepend it so it appears in the sidebar.
        if (currentConversationId && !conversations.find(c => c.id === currentConversationId)) {
            try {
                const sharedResp = await fetch(`${API_BASE_URL}/api/conversations/${currentConversationId}`);
                const sharedData = await sharedResp.json();
                if (sharedData.success && sharedData.conversation) {
                    conversations = [sharedData.conversation, ...conversations];
                }
            } catch (_) { /* ignore */ }
        }

        if (conversations.length === 0) {
            conversationList.innerHTML = '<p class="empty-conversation">No conversations yet</p>';
            return;
        }

        conversations.forEach(convo => {
            const item = document.createElement('div');
            item.className = 'conversation-item';
            item.dataset.conversationId = convo.id;
            if (convo.id === currentConversationId) {
                item.classList.add('active');
            }

            const time = document.createElement('div');
            time.className = 'conversation-time';
            time.textContent = new Date(convo.updated_at).toLocaleString();

            const text = document.createElement('div');
            text.className = 'conversation-text';
            text.textContent = convo.title;
            text.title = convo.title;

            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'conversation-delete-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = 'Delete conversation';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteConversation(convo.id);
            };

            item.appendChild(time);
            item.appendChild(text);
            item.appendChild(deleteBtn);

            item.onclick = () => loadConversation(convo.id);

            conversationList.appendChild(item);
        });
    } catch (error) {
        console.error('Failed to load conversations:', error);
    }
}

/**
 * Load a past conversation and replay its messages into the chat area.
 */
async function loadConversation(conversationId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}`);
        const data = await response.json();

        if (!data.success) {
            addLog('[Error] Failed to load conversation', 'error');
            return;
        }

        // Interrupt any running stream
        if (activeAbortController) {
            interruptRunningStream();
        }

        // Set current conversation
        currentConversationId = conversationId;

        // Shared-view detection: if the backend says we don't own this
        // conversation, enter fork-on-write mode and show a banner.
        if (data.is_owner === false) {
            viewingSharedConversation = true;
            _showSharedBanner();
        } else {
            viewingSharedConversation = false;
            _hideSharedBanner();
        }

        // Update browser URL so the conversation is shareable
        const url = new URL(window.location);
        url.searchParams.set('conversation', conversationId);
        history.pushState(null, '', url);

        // Restore task_id so re-execute / re-run buttons work
        if (data.conversation.task_id) {
            window._completedTaskId = data.conversation.task_id;
        }

        // Clear artifacts and workflow state from previous conversation
        window.currentArtifacts = [];
        _wfCardsContainer = null;
        _wfCurrentPhase = null;
        window._rpRebuildListenersRegistered = false;

        // Clear data layers from previous conversation
        window.loadedLayers = [];
        const dataLayerList = document.getElementById('data-layer-list');
        if (dataLayerList) dataLayerList.innerHTML = '';

        // Clear all layers from the map viewer
        const mapIframe = document.getElementById('map-iframe');
        if (mapIframe && mapIframe.contentWindow) {
            mapIframe.contentWindow.postMessage({ type: 'CLEAR_ALL_LAYERS' }, '*');
        }

        // Clear chat and rebuild from saved messages
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.innerHTML = '';

        data.messages.forEach(msg => {
            if (msg.message_type === 'workflow' && msg.metadata_json) {
                try {
                    const meta = JSON.parse(msg.metadata_json);
                    rebuildWorkflowCards(meta.workflow_cards, msg.content, msg.timestamp);
                } catch (_) {
                    addChatMessage(msg.content, msg.role === 'user' ? 'user' : 'agm');
                }
            } else if (msg.message_type === 'rich' && msg.metadata_json) {
                try {
                    const meta = JSON.parse(msg.metadata_json);
                    addRichChatMessage(meta.title || '', msg.content, 'agm', meta.type || 'default');
                } catch (_) {
                    addChatMessage(msg.content, msg.role === 'user' ? 'user' : 'agm');
                }
            } else {
                addChatMessage(msg.content, msg.role === 'user' ? 'user' : 'agm');
            }
        });

        // Restore data layers associated with this conversation
        if (data.files && data.files.length > 0) {
            if (!window.loadedLayers) window.loadedLayers = [];
            const geospatialFormats = ['geojson', 'json', 'gpkg', 'shp', 'zip', 'tif', 'tiff'];
            data.files.forEach(fileRecord => {
                if (!fileRecord.file_exists) return; // skip missing files

                // Skip if already registered (avoid duplicate entries + duplicate map layers)
                const already = window.loadedLayers.some(
                    (ld) => ld && ld.fileName === fileRecord.filename && ld.conversationId === conversationId
                );
                if (already) return;

                const sizeKB = fileRecord.file_size
                    ? (fileRecord.file_size / 1024).toFixed(2) + ' KB'
                    : 'Unknown';
                const layerData = {
                    name: fileRecord.display_name,
                    fileName: fileRecord.filename,
                    filePath: null,
                    fileSize: sizeKB,
                    fileType: fileRecord.file_type || fileRecord.filename.split('.').pop(),
                    file: null,
                    serverBacked: true,
                    conversationId: conversationId,
                    loadedAt: fileRecord.added_at,
                };
                window.loadedLayers.push(layerData);
                addLayerToUI(layerData, window.loadedLayers.length - 1);

                // Load geospatial files onto the map
                const ext = (fileRecord.file_type || fileRecord.filename.split('.').pop()).toLowerCase();
                if (geospatialFormats.includes(ext) && conversationId) {
                    loadServerBackedGeospatialFile(conversationId, fileRecord.filename, fileRecord.display_name, ext);
                    layerData._mapLoaded = true;
                }
            });
            addLog(`[System] Restored ${data.files.filter(f => f.file_exists).length} data layer(s) from conversation`, 'info');
        }

        // If conversation has a linked task_id, fetch fresh step data and update cards
        if (data.conversation.task_id) {
            window._completedTaskId = data.conversation.task_id;
            addLog(`[System] Loaded conversation linked to task: ${data.conversation.task_id}`, 'info');

            // Refresh step result sections with latest data from backend ctx
            try {
                const stepsResp = await fetch(`${API_BASE_URL}/api/workflow/steps/${data.conversation.task_id}`);
                if (stepsResp.ok) {
                    const stepsData = await stepsResp.json();
                    const steps = stepsData.steps || [];
                    for (const step of steps) {
                        const stepIdx = step.step_index || step.step_number;
                        const objKey = step.objective_key || '';

                        // Match by objective card + step index to avoid cross-objective collisions
                        // Step sections live inside cards with IDs like wf-card-exec_obj1_step1
                        const objNum = objKey.replace('objective_', '');
                        const parentCardId = `wf-card-exec_obj${objNum}_step${stepIdx}`;
                        const parentCard = document.getElementById(parentCardId);
                        let matchedSection = null;

                        if (parentCard) {
                            // Find the step-result-section within this specific card
                            const sections = parentCard.querySelectorAll('.step-result-section');
                            for (const section of sections) {
                                const label = section.querySelector('.step-result-label');
                                if (label && label.textContent.startsWith(`Step ${stepIdx}:`)) {
                                    matchedSection = section;
                                    break;
                                }
                            }
                        }

                        // Fallback: search all sections if card-based match didn't work
                        if (!matchedSection) {
                            const allSections = document.querySelectorAll('.step-result-section');
                            for (const section of allSections) {
                                const label = section.querySelector('.step-result-label');
                                if (!label) continue;
                                if (!label.textContent.startsWith(`Step ${stepIdx}:`)) continue;
                                matchedSection = section;
                                break;
                            }
                        }

                        if (matchedSection) {
                            updateStepResultSection(matchedSection, {
                                status: step.status || 'unknown',
                                code: step.code || '',
                                error: step.error || '',
                                error_traceback: step.error_traceback || '',
                                output: step.output || '',
                                artifacts: step.artifacts || [],
                                step_index: stepIdx,
                                step_description: step.step_description || '',
                            }, { isReload: true });
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to refresh steps from backend:', e);
            }
        }

        // Highlight in sidebar
        highlightActiveConversation(conversationId);

        // Scroll to bottom
        smartScrollChat(true);
    } catch (error) {
        console.error('Failed to load conversation:', error);
    }
}

/**
 * Delete a conversation from the database and refresh the sidebar.
 */
async function deleteConversation(conversationId) {
    if (!confirm('Delete this conversation?')) return;

    try {
        await fetch(`${API_BASE_URL}/api/conversations/${conversationId}`, {
            method: 'DELETE'
        });

        // If deleting the active conversation, start a new chat
        if (conversationId === currentConversationId) {
            startNewChat();
        }

        // Reload sidebar
        loadConversationList();
    } catch (error) {
        console.error('Failed to delete conversation:', error);
    }
}

/**
 * Highlight the active conversation in the sidebar.
 */
function highlightActiveConversation(conversationId) {
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.toggle('active', item.dataset.conversationId === conversationId);
    });
}

/**
 * Start a new chat session — clears the chat area and resets conversation state.
 */
function startNewChat() {
    // Interrupt any running stream
    if (activeAbortController) {
        interruptRunningStream();
    }

    // Cancel feedback mode
    if (feedbackMode && feedbackMode.active) {
        cancelFeedbackMode();
    }

    // Clear chat messages DOM and restore welcome message
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = `
        <div class="chat-message agm">
            <div class="message-avatar">
                <img src="icon/AGM.png" alt="AGM" class="avatar-img">
            </div>
            <div class="message-wrapper">
                <div class="message-header">
                    <span class="message-sender">AGM</span>
                    <span class="message-time">${getCurrentTimestamp()}</span>
                </div>
                <div class="message-bubble">
                    <div class="message-content">Hello! I'm your intelligent Autonomous Geographic Modeller.

What geospatial research question are you working on today?
Please also upload the dataset(s) you'll be working with.
</div>
                </div>
            </div>
        </div>`;

    // Reset conversation ID — a new one will be created on first message
    currentConversationId = null;
    viewingSharedConversation = false;
    _hideSharedBanner();

    // Clear conversation param from URL
    const url = new URL(window.location);
    url.searchParams.delete('conversation');
    history.pushState(null, '', url);

    // Reset workflow card state
    _wfCardsContainer = null;
    _wfCurrentPhase = null;

    // Clear artifacts from previous conversation
    window.currentArtifacts = [];
    window._completedTaskId = null;
    window._rpRebuildListenersRegistered = false;

    // Clear data layers
    window.loadedLayers = [];
    const dataLayerList = document.getElementById('data-layer-list');
    if (dataLayerList) dataLayerList.innerHTML = '';

    // Clear all layers from the map viewer
    const mapIframe = document.getElementById('map-iframe');
    if (mapIframe && mapIframe.contentWindow) {
        mapIframe.contentWindow.postMessage({ type: 'CLEAR_ALL_LAYERS' }, '*');
    }

    // Clear LLM response panel
    clearLLMResponse();

    // Focus input
    const input = document.getElementById('chat-input');
    if (input) input.focus();

    // Highlight active conversation in sidebar (none selected)
    highlightActiveConversation(null);
}



// Toggle Left Sidebar
function toggleLeftSidebar() {
    const sidebar = document.getElementById('sidebar-left');
    const divider = document.getElementById('resize-divider-left');

    sidebar.classList.toggle('collapsed');

    if (sidebar.classList.contains('collapsed')) {
        sidebar.style.flex = '';
        sidebar.style.minWidth = '';
        if (divider) divider.style.display = 'none';
    } else {
        sidebar.style.flex = '0 0 250px';
        sidebar.style.minWidth = '200px';
        if (divider) divider.style.display = 'block';
    }
}

function toggleRightSidebar() {
    const rightPanel = document.getElementById('right-section-container');
    const divider = document.getElementById('resize-divider');
    const chatSection = document.querySelector('.chat-section');

    rightPanel.classList.toggle('collapsed');

    if (rightPanel.classList.contains('collapsed')) {
        rightPanel.style.flex = '';
        rightPanel.style.minWidth = '';
        if (divider) divider.style.display = 'none';
        // Drop any inline flex set by the resize-divider drag handler
        // (chatSection.style.flex = "0 0 X%") so the chat section can
        // expand to fill the space freed by the collapsed right panel.
        if (chatSection) {
            chatSection.style.flex = '';
            chatSection.style.minWidth = '';
        }
    } else {
        rightPanel.style.flex = '1';
        rightPanel.style.minWidth = '300px';
        if (divider) divider.style.display = 'block';
        if (chatSection) {
            chatSection.style.flex = '';
            chatSection.style.minWidth = '';
        }
    }
}

// Toggle Right Panel Sections
function toggleRightPanel(panelId) {
    const panel = document.getElementById(panelId);
    if (panel) {
        // Don't toggle if pinned
        if (panel.classList.contains('pinned')) return;

        panel.classList.toggle('collapsed');
        const panelName = panelId.replace('-section', '').replace('-', ' ');
        const state = panel.classList.contains('collapsed') ? 'collapsed' : 'expanded';
        addLog(`[System] ${panelName} panel ${state}`, 'info');
    }
}

// Pin Right Panel to Edge
function pinRightPanel(panelId) {
    const panel = document.getElementById(panelId);
    if (panel) {
        const wasPinned = panel.classList.contains('pinned');
        panel.classList.toggle('pinned');

        // Remove collapsed state when pinning
        if (!wasPinned) {
            panel.classList.remove('collapsed');
        }

        // Update pin indexes for all pinned panels
        updatePinIndexes();

        const panelName = panelId.replace('-section', '').replace('-', ' ');
        const state = panel.classList.contains('pinned') ? 'pinned' : 'unpinned';
        addLog(`[System] ${panelName} panel ${state}`, 'info');
    }
}

// Update pin indexes to prevent overlapping
function updatePinIndexes() {
    const pinnedPanels = document.querySelectorAll('.right-panel.pinned');
    pinnedPanels.forEach((panel, index) => {
        panel.setAttribute('data-pin-index', index);
    });

    // Check if all panels are pinned and hide sidebar if so
    checkRightSidebarVisibility();
}

// Check if all right panels are pinned and hide/show sidebar accordingly
function checkRightSidebarVisibility() {
    const rightSidebar = document.querySelector('.sidebar-right');
    if (!rightSidebar) return;
    const allPanels = document.querySelectorAll('.right-panel');
    const pinnedPanels = document.querySelectorAll('.right-panel.pinned');

    if (allPanels.length === pinnedPanels.length && allPanels.length > 0) {
        // All panels are pinned - collapse sidebar but keep pinned tabs visible
        rightSidebar.style.flex = '0 0 0';
        rightSidebar.style.minWidth = '0';
        rightSidebar.style.width = '0';
        rightSidebar.style.overflow = 'visible';
        rightSidebar.style.borderLeft = 'none';
        rightSidebar.style.padding = '0';
        addLog('[System] Right sidebar hidden - all panels pinned', 'info');
    } else {
        // At least one panel is unpinned - show the sidebar
        rightSidebar.style.flex = '0 0 300px';
        rightSidebar.style.minWidth = '250px';
        rightSidebar.style.width = '';
        rightSidebar.style.overflow = '';
        rightSidebar.style.borderLeft = '1px solid #ddd';
        rightSidebar.style.padding = '';
    }
}

// Click on pinned panel to unpin
document.addEventListener('click', function(e) {
    const pinnedPanel = e.target.closest('.right-panel.pinned');
    if (pinnedPanel && !e.target.closest('.btn-pin-panel')) {
        pinRightPanel(pinnedPanel.id);
    }
});

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    addDataset();

    // Restore saved API key into the settings input
    const savedKey = localStorage.getItem('agm_openai_api_key');
    if (savedKey) {
        const keyInput = document.getElementById('GIBD-API-key');
        if (keyInput) keyInput.value = savedKey;
    }

    // Restore Autonomous Mode toggle from localStorage and sync inline toggle
    const autonomousToggle = document.getElementById('autonomous-mode-toggle');
    const autonomousToggleInline = document.getElementById('autonomous-mode-toggle-inline');
    if (autonomousToggle) {
        autonomousToggle.checked = localStorage.getItem('agm_autonomous_mode') === 'true';
        if (autonomousToggleInline) autonomousToggleInline.checked = autonomousToggle.checked;
        autonomousToggle.addEventListener('change', (e) => {
            localStorage.setItem('agm_autonomous_mode', e.target.checked ? 'true' : 'false');
            if (autonomousToggleInline) autonomousToggleInline.checked = e.target.checked;
        });
    }

    // Restore previously selected intent mode from localStorage
    try {
        const savedMode = localStorage.getItem('agm_intent_mode');
        if (savedMode && ['research', 'task', 'data_retriever', 'chat'].includes(savedMode)) {
            selectModeFromDropdown(savedMode, getModeDisplayName(savedMode));
        }
    } catch (e) {}

    // Restore Data Download Mode button state from localStorage
    const ddBtn = document.getElementById('data-download-toggle-btn');
    if (ddBtn && localStorage.getItem('agm_data_download_mode') === 'true') {
        ddBtn.classList.add('active');
        ddBtn.title = 'Auto-download data: on';
    }

    // EDA feature flag — hide all EDA UI when disabled
    const edaToggle = document.getElementById('enable-eda-toggle');
    const edaToggleInline = document.getElementById('enable-eda-toggle-inline');
    if (!ENABLE_EDA) {
        if (edaToggle) { edaToggle.checked = false; edaToggle.closest('.toggle-label')?.style.setProperty('display', 'none'); }
        if (edaToggleInline) { edaToggleInline.checked = false; edaToggleInline.closest('.toggle-switch-inline')?.style.setProperty('display', 'none'); }
        // Hide EDA config hint too
        const edaHint = edaToggle?.closest('.toggle-label')?.nextElementSibling;
        if (edaHint && edaHint.classList.contains('config-hint')) edaHint.style.display = 'none';
    } else if (edaToggle && edaToggleInline) {
        edaToggleInline.checked = edaToggle.checked;
    }

    // Force-model-override feature flag — hide the Model inline dropdown
    // when true so users cannot pick a model/reasoning effort. The Mode
    // dropdown (Research/Task/Chat) remains visible. Flip FORCE_MODEL_OVERRIDE
    // to false to restore the Model dropdown.
    if (FORCE_MODEL_OVERRIDE) {
        const modelInline = document.getElementById('model-selector-inline');
        if (modelInline) modelInline.style.display = 'none';
    }

    // Set welcome message timestamp
    const welcomeTime = document.getElementById('welcome-time');
    if (welcomeTime) {
        welcomeTime.textContent = getCurrentTimestamp();
    }

    addLog('[System] AGM Web UI initialized', 'success');

    // Load saved conversations from database
    loadConversationList();

    // If URL contains ?conversation=<id>, auto-load that conversation
    const urlParams = new URLSearchParams(window.location.search);
    const sharedConversationId = urlParams.get('conversation');
    if (sharedConversationId) {
        loadConversation(sharedConversationId).then(() => {
            // Ensure the shared conversation appears in the sidebar
            loadConversationList();
        });
    }

    // Check right sidebar visibility on load (handles default pinned panels)
    // Use requestAnimationFrame + setTimeout to ensure browser has fully painted
    requestAnimationFrame(() => {
        setTimeout(() => {
            checkRightSidebarVisibility();
        }, 100);
    });
});

// Data Layer Management
function addDataLayer() {
    // Create a hidden file input if it doesn't exist
    let fileInput = document.getElementById('hidden-layer-file-input');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'hidden-layer-file-input';
        fileInput.accept = '.shp,.shx,.dbf,.prj,.geojson,.json,.gpkg,.zip,.csv,.xlsx,.parquet,.tif,.tiff';
        fileInput.multiple = true;
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        // Add event listener for file selection
        fileInput.addEventListener('change', function() {
            if (this.files && this.files.length > 0) {
                processDataLayerFiles(this.files);
            }
        });
    }

    // Trigger file picker
    fileInput.value = ''; // Reset to allow selecting the same file again
    fileInput.click();
}

// Process selected files and extract layer name automatically
function processDataLayerFiles(files) {
    const fileArray = Array.from(files);

    // Check if this is a shapefile (multiple component files)
    const shpFile = fileArray.find(f => f.name.toLowerCase().endsWith('.shp'));

    if (shpFile && fileArray.length > 1) {
        // This is a shapefile with multiple components
        // Extract layer name from the .shp file
        let layerName = shpFile.name.replace(/\.[^/.]+$/, '');
        layerName = layerName.replace(/_(shp|shx|dbf|prj)$/i, '');
        addLog(`[System] Loading shapefile layer: ${layerName}...`, 'info');
        loadShapefileComponents(fileArray, layerName);
        return;
    }

    // Process each file individually
    fileArray.forEach(file => {
        processSingleFile(file);
    });
}

// Process a single file
function processSingleFile(file) {
    // Extract layer name from the file (remove extension)
    let layerName = file.name.replace(/\.[^/.]+$/, '');

    addLog(`[System] Loading data layer: ${layerName}...`, 'info');

    // Store layer data globally
    if (!window.loadedLayers) {
        window.loadedLayers = [];
    }

    // Create layer object with file info
    const layerData = {
        name: layerName,
        fileName: file.name,
        filePath: file.path || URL.createObjectURL(file),
        fileSize: (file.size / 1024).toFixed(2) + ' KB',
        fileType: file.type || file.name.split('.').pop(),
        file: file,
        loadedAt: new Date().toISOString()
    };

    window.loadedLayers.push(layerData);

    // Add the layer to the UI list
    addLayerToUI(layerData, window.loadedLayers.length - 1);

    addLog(`[System] Data layer added: ${layerName} (${file.name}, ${layerData.fileSize})`, 'success');

    // Check if it's a geospatial file and send to map
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const geospatialFormats = ['geojson', 'json', 'shp', 'gpkg', 'zip'];

    if (geospatialFormats.includes(fileExtension)) {
        loadGeospatialFile(file, layerName, fileExtension);
    } else if (['tif', 'tiff'].includes(fileExtension)) {
        loadLocalTifFile(file, layerName);
    }

    // Auto-preview CSV in the Results & Artifacts panel
    if (fileExtension === 'csv') {
        previewCSVInResultsPanel(file, layerName);
    }
}

// Remove data layer
function removeDataLayer(layerIndex) {
    if (!window.loadedLayers || layerIndex >= window.loadedLayers.length) {
        console.error('Invalid layer index:', layerIndex);
        return;
    }

    const removedLayer = window.loadedLayers[layerIndex];
    const layerName = removedLayer.name;
    const layerFileName = removedLayer.fileName || '';

    // Reset flags so tile clicks can re-add after removal
    removedLayer._mapLoaded = false;
    removedLayer._tabularPreviewed = false;

    // Remove from the global layers array
    window.loadedLayers.splice(layerIndex, 1);

    // Remove from UI - find the element with matching data-layer-index
    const layerElement = document.querySelector(`.data-layer-item[data-layer-index="${layerIndex}"]`);
    if (layerElement) {
        layerElement.remove();
    }

    // Update remaining layer indices
    const allLayerItems = document.querySelectorAll('.data-layer-item');
    allLayerItems.forEach((item, idx) => {
        item.dataset.layerIndex = idx;
    });

    // Remove from map if map is open
    const mapIframe = document.getElementById('map-iframe');
    if (mapIframe && mapIframe.contentWindow) {
        mapIframe.contentWindow.postMessage({
            type: 'REMOVE_LAYER',
            layerName: layerName
        }, '*');
    }

    // Clear results panel if this was a tabular layer being previewed
    const fileExt = layerFileName.split('.').pop().toLowerCase();
    if (['csv', 'xlsx', 'parquet'].includes(fileExt)) {
        const resultsContent = document.getElementById('results-content-main');
        if (resultsContent) {
            const header = resultsContent.querySelector('h3');
            if (header && header.textContent === layerName) {
                resultsContent.innerHTML = '';
            }
        }
    }

    addLog(`[System] Data layer removed: ${layerName}`, 'warning');
}

// Helper function to add layer to UI
function addLayerToUI(layerData, layerIndex) {
    const dataLayerList = document.getElementById('data-layer-list');
    const dataLayerItem = document.createElement('div');
    dataLayerItem.className = 'data-layer-item';
    dataLayerItem.dataset.layerIndex = layerIndex;

    const layerHeader = document.createElement('div');
    layerHeader.style.display = 'flex';
    layerHeader.style.justifyContent = 'space-between';
    layerHeader.style.alignItems = 'center';

    // Create container for icon and title
    const titleContainer = document.createElement('div');
    titleContainer.style.display = 'flex';
    titleContainer.style.alignItems = 'center';
    titleContainer.style.gap = '6px';
    titleContainer.style.overflow = 'hidden';

    // Add icon
    const layerIcon = document.createElement('span');
    layerIcon.textContent = '📄';
    layerIcon.className = 'layer-icon';
    layerIcon.style.fontSize = '16px';
    layerIcon.style.flexShrink = '0';
    layerIcon.style.lineHeight = '1';

    const layerTitle = document.createElement('h3');
    layerTitle.textContent = layerData.name;
    layerTitle.style.margin = '0';
    layerTitle.style.fontSize = '0.9em';
    layerTitle.style.lineHeight = '1.2';
    layerTitle.style.maxWidth = '150px';
    layerTitle.style.overflow = 'hidden';
    layerTitle.style.textOverflow = 'ellipsis';
    layerTitle.style.whiteSpace = 'nowrap';

    titleContainer.appendChild(layerIcon);
    titleContainer.appendChild(layerTitle);
    layerHeader.appendChild(titleContainer);

    // Add visibility checkbox on the LEFT (before icon/title)
    const ext = layerData.fileName
        ? layerData.fileName.split('.').pop().toLowerCase()
        : (layerData.fileType || '').toLowerCase();
    const geospatialFormats = ['geojson', 'json', 'shp', 'gpkg', 'zip', 'shapefile', 'tif', 'tiff'];
    const tabularFormats = ['csv', 'xlsx', 'parquet'];
    const isGeospatial = geospatialFormats.includes(ext) || !!layerData.zipData || !!layerData.shapefileData || !!layerData.convertedGeoJSON;
    const isTabular = tabularFormats.includes(ext);

    if (isGeospatial || isTabular) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'layer-visibility-checkbox';
        checkbox.checked = true; // checked by default — layer is loaded on add
        checkbox.title = isGeospatial ? 'Load on Map Viewer' : 'Preview in Results Panel';
        checkbox.addEventListener('change', function(e) {
            e.stopPropagation();
            toggleLayerPreview(parseInt(dataLayerItem.dataset.layerIndex), this.checked);
        });
        // Insert checkbox before titleContainer
        layerHeader.insertBefore(checkbox, titleContainer);
    }

    // Add remove button
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.className = 'btn-remove-layer';
    removeBtn.title = 'Remove layer';
    removeBtn.onclick = function(e) {
        e.stopPropagation();
        removeDataLayer(parseInt(dataLayerItem.dataset.layerIndex));
    };

    layerHeader.appendChild(removeBtn);
    dataLayerItem.appendChild(layerHeader);

    // Right-click context menu
    dataLayerItem.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        showLayerContextMenu(e, parseInt(this.dataset.layerIndex));
    });

    dataLayerList.appendChild(dataLayerItem);
}

// ── Layer right-click context menu ──────────────────────────────────

function showLayerContextMenu(event, layerIndex) {
    // Remove any existing context menu
    closeLayerContextMenu();

    const layerData = window.loadedLayers[layerIndex];
    if (!layerData) return;

    const ext = layerData.fileName
        ? layerData.fileName.split('.').pop().toLowerCase()
        : (layerData.fileType || '').toLowerCase();
    const geospatialFormats = ['geojson', 'json', 'shp', 'gpkg', 'zip', 'shapefile', 'tif', 'tiff'];
    const rasterFormats = ['tif', 'tiff'];
    const isGeospatial = geospatialFormats.includes(ext) || !!layerData.zipData || !!layerData.shapefileData || !!layerData.convertedGeoJSON;
    const isRaster = rasterFormats.includes(ext);
    const isTabular = ['csv', 'xlsx', 'parquet'].includes(ext);

    const menu = document.createElement('div');
    menu.className = 'layer-context-menu';
    menu.id = 'layer-context-menu';

    // --- Details ---
    addCtxItem(menu, 'info-circle', 'Details', () => {
        showLayerDetails(layerIndex);
    });

    // --- Show Attribute Table (not applicable for rasters) ---
    if ((isTabular || isGeospatial) && !isRaster) {
        addCtxItem(menu, 'table', 'Show Attribute Table', () => {
            showLayerAttributeTable(layerIndex);
        });
    }

    // --- Load on Map Viewer (geospatial only) ---
    if (isGeospatial) {
        addCtxItem(menu, 'map', 'Load on Map Viewer', () => {
            toggleLayerPreview(layerIndex, true);
            syncLayerCheckbox(layerIndex, true);
            addLog(`[Map] Layer loaded to map: ${layerData.name}`, 'success');
        });
    }

    // --- Preview in Results (tabular only) ---
    if (isTabular) {
        addCtxItem(menu, 'eye', 'Preview in Results Panel', () => {
            toggleLayerPreview(layerIndex, true);
            syncLayerCheckbox(layerIndex, true);
        });
    }

    // --- Download ---
    addCtxItem(menu, 'download', 'Download', () => {
        downloadLayer(layerIndex);
    });

    // Separator
    const sep = document.createElement('div');
    sep.className = 'layer-context-menu-sep';
    menu.appendChild(sep);

    // --- Remove ---
    addCtxItem(menu, 'trash', 'Remove Layer', () => {
        removeDataLayer(layerIndex);
    }, true);

    // Position the menu at click location
    document.body.appendChild(menu);

    // Keep menu within viewport
    const rect = menu.getBoundingClientRect();
    let x = event.clientX;
    let y = event.clientY;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    // Close on click outside or Escape
    setTimeout(() => {
        document.addEventListener('click', closeLayerContextMenu, { once: true });
        document.addEventListener('keydown', function _esc(e) {
            if (e.key === 'Escape') { closeLayerContextMenu(); document.removeEventListener('keydown', _esc); }
        });
    }, 0);
}

function addCtxItem(menu, icon, label, onClick, danger) {
    const iconMap = {
        'info-circle': 'ℹ',
        'table': '☰',
        'map': '🗺',
        'eye': '👁',
        'download': '⤓',
        'trash': '🗑'
    };
    const item = document.createElement('div');
    item.className = 'layer-context-menu-item' + (danger ? ' danger' : '');
    item.innerHTML = `<span class="ctx-icon">${iconMap[icon] || ''}</span><span>${label}</span>`;
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        closeLayerContextMenu();
        onClick();
    });
    menu.appendChild(item);
}

function closeLayerContextMenu() {
    const existing = document.getElementById('layer-context-menu');
    if (existing) existing.remove();
}

// Trigger a browser download for a Blob with the given filename
function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Download a data layer's source file (local File or server-backed upload)
async function downloadLayer(layerIndex) {
    const layerData = window.loadedLayers && window.loadedLayers[layerIndex];
    if (!layerData) return;

    const filename = layerData.fileName || layerData.name || 'layer';

    try {
        // Case 1 — local File / Blob in memory
        if (layerData.file instanceof Blob) {
            triggerBlobDownload(layerData.file, filename);
            addLog(`[Download] ${filename}`, 'success');
            return;
        }

        // Case 2 — server-backed upload
        if (layerData.serverBacked && layerData.conversationId && layerData.fileName) {
            const url = `${API_BASE_URL}/api/uploads/${encodeURIComponent(layerData.conversationId)}/${encodeURIComponent(layerData.fileName)}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            triggerBlobDownload(blob, filename);
            addLog(`[Download] ${filename}`, 'success');
            return;
        }

        // Case 3 — in-memory text content (CSV preview, etc.)
        if (typeof layerData.content === 'string') {
            const blob = new Blob([layerData.content], { type: 'text/plain' });
            triggerBlobDownload(blob, filename);
            addLog(`[Download] ${filename}`, 'success');
            return;
        }

        // Case 4 — converted GeoJSON (no original file available)
        if (layerData.convertedGeoJSON) {
            const blob = new Blob([JSON.stringify(layerData.convertedGeoJSON, null, 2)], { type: 'application/geo+json' });
            const gjName = (filename.replace(/\.[^.]+$/, '') || 'layer') + '.geojson';
            triggerBlobDownload(blob, gjName);
            addLog(`[Download] ${gjName} (converted GeoJSON)`, 'success');
            return;
        }

        addLog(`[Download] No downloadable source available for ${filename}`, 'warning');
        alert('This layer has no downloadable source file.');
    } catch (err) {
        console.error('Download failed:', err);
        addLog(`[Download] Failed: ${err.message}`, 'error');
        alert('Download failed: ' + err.message);
    }
}

// Sync checkbox state for a layer item
function syncLayerCheckbox(layerIndex, checked) {
    const layerItem = document.querySelector(`.data-layer-item[data-layer-index="${layerIndex}"]`);
    if (layerItem) {
        const cb = layerItem.querySelector('.layer-visibility-checkbox');
        if (cb) cb.checked = checked;
    }
}

// Show layer details in a small popup/alert
function showLayerDetails(layerIndex) {
    const layerData = window.loadedLayers[layerIndex];
    if (!layerData) return;

    const details = [
        `Name: ${layerData.name}`,
        `File: ${layerData.fileName}`,
        `Size: ${layerData.fileSize}`,
        `Type: ${layerData.fileType || 'Unknown'}`,
        `Added: ${layerData.loadedAt ? new Date(layerData.loadedAt).toLocaleString() : 'Unknown'}`
    ];

    if (layerData.convertedGeoJSON) {
        const fc = layerData.convertedGeoJSON;
        details.push(`Features: ${fc.features ? fc.features.length : 'N/A'}`);
    }

    // Show in the Results & Artifacts panel
    const resultsContent = document.getElementById('results-content-main');
    if (resultsContent) {
        const container = document.createElement('div');
        container.style.cssText = 'padding: 15px;';

        const h3 = document.createElement('h3');
        h3.textContent = layerData.name;
        h3.style.cssText = 'margin: 0 0 12px 0; color: #2c5f7c; border-bottom: 2px solid #ddd; padding-bottom: 8px;';
        container.appendChild(h3);

        details.forEach(line => {
            const p = document.createElement('p');
            p.style.cssText = 'margin: 4px 0; font-size: 0.9em;';
            const [key, ...rest] = line.split(': ');
            p.innerHTML = `<strong>${key}:</strong> ${rest.join(': ')}`;
            container.appendChild(p);
        });

        resultsContent.innerHTML = '';
        resultsContent.appendChild(container);
    }
}

// Show attribute table for a layer in the Results & Artifacts panel
function showLayerAttributeTable(layerIndex) {
    const layerData = window.loadedLayers[layerIndex];
    if (!layerData) return;

    const ext = layerData.fileName
        ? layerData.fileName.split('.').pop().toLowerCase()
        : (layerData.fileType || '').toLowerCase();

    // CSV — use existing previewer (no need for backend)
    if (ext === 'csv') {
        if (layerData.file) {
            previewCSVInResultsPanel(layerData.file, layerData.name);
        } else if (layerData.serverBacked && layerData.conversationId) {
            previewServerCSV(layerData.conversationId, layerData.fileName, layerData.name);
        }
        return;
    }

    // GeoJSON cached from server conversion — render directly
    if (layerData.convertedGeoJSON) {
        renderGeoJSONAttributeTable(layerData.convertedGeoJSON, layerData.name);
        return;
    }

    // GeoJSON local file — read client-side (small, no backend needed)
    if (layerData.file && ['geojson', 'json'].includes(ext)) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const geoJSON = JSON.parse(e.target.result);
                renderGeoJSONAttributeTable(geoJSON, layerData.name);
            } catch (err) {
                addLog(`[System] Error parsing GeoJSON for table: ${err.message}`, 'error');
            }
        };
        reader.readAsText(layerData.file);
        return;
    }

    // All other formats (gpkg, shp, zip, etc.) — send to backend
    // Collect the file(s) to upload
    const filesToSend = [];
    if (layerData.files) {
        // Shapefile components (multiple File objects)
        filesToSend.push(...Array.from(layerData.files));
    } else if (layerData.file) {
        filesToSend.push(layerData.file);
    } else if (layerData.serverBacked && layerData.conversationId) {
        // Server-backed file — fetch from server then read attributes
        fetchAttributeTableFromServer(layerData.conversationId, layerData.fileName, layerData.name);
        return;
    }

    if (filesToSend.length === 0) {
        alert('No file data available to read attributes from.');
        return;
    }

    fetchAttributeTableFromBackend(filesToSend, layerData.name);
}

/**
 * Upload file(s) to /api/read-attributes and render the returned table.
 */
async function fetchAttributeTableFromBackend(files, layerName) {
    addLog(`[System] Reading attribute table from server: ${layerName}...`, 'info');

    try {
        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        formData.append('max_rows', '500');

        const response = await fetch(`${API_BASE_URL}/api/read-attributes`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Server failed to read attributes');
        }

        if (result.success) {
            renderAttributeTableFromJSON(result.columns, result.rows, layerName, result.total_rows, result.returned_rows);
        } else {
            throw new Error(result.error || 'Unknown error');
        }
    } catch (error) {
        const msg = (error && error.message) ? error.message : String(error);
        addLog(`[System] Error reading attributes: ${msg}`, 'error');
        alert('Error reading attribute table: ' + msg);
    }
}

/**
 * For server-backed files (conversation restore), fetch from uploads endpoint
 * then forward to /api/read-attributes.
 */
async function fetchAttributeTableFromServer(conversationId, filename, layerName) {
    addLog(`[System] Fetching server-backed file for attribute table: ${filename}...`, 'info');

    try {
        const url = `${API_BASE_URL}/api/uploads/${encodeURIComponent(conversationId)}/${encodeURIComponent(filename)}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Could not fetch file: ${response.status}`);
        }
        const blob = await response.blob();
        const file = new File([blob], filename);
        fetchAttributeTableFromBackend([file], layerName);
    } catch (error) {
        const msg = (error && error.message) ? error.message : String(error);
        addLog(`[System] Error fetching file for attributes: ${msg}`, 'error');
        alert('Error fetching file: ' + msg);
    }
}

/**
 * Render an attribute table from columns + rows JSON (from /api/read-attributes).
 */
function renderAttributeTableFromJSON(columns, rows, layerName, totalRows, returnedRows) {
    const resultsContent = document.getElementById('results-content-main');
    resultsContent.innerHTML = '';

    const container = document.createElement('div');
    container.style.cssText = 'padding: 15px; height: 100%; display: flex; flex-direction: column;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom: 10px; border-bottom: 2px solid #ddd; padding-bottom: 8px; display: flex; justify-content: space-between; align-items: center;';
    const h3 = document.createElement('h3');
    h3.style.margin = '0';
    h3.textContent = layerName;
    const meta = document.createElement('span');
    meta.style.cssText = 'font-size: 0.82em; color: #666;';
    meta.textContent = `${totalRows} rows · ${columns.length} columns`;
    header.appendChild(h3);
    header.appendChild(meta);
    container.appendChild(header);

    // Table
    const tableWrap = document.createElement('div');
    tableWrap.style.cssText = 'overflow: auto; flex: 1;';

    const table = document.createElement('table');
    table.style.cssText = 'border-collapse: collapse; width: 100%; font-size: 0.82em;';

    // Thead
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const thNum = document.createElement('th');
    thNum.textContent = '#';
    thNum.style.cssText = 'padding: 6px 8px; border: 1px solid #ddd; background: #f1f3f5; position: sticky; top: 0; font-weight: 600; color: #888; width: 40px; text-align: center;';
    headRow.appendChild(thNum);
    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        th.style.cssText = 'padding: 6px 10px; border: 1px solid #ddd; background: #f1f3f5; position: sticky; top: 0; font-weight: 600; white-space: nowrap;';
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    // Tbody
    const tbody = document.createElement('tbody');
    rows.forEach((row, i) => {
        const tr = document.createElement('tr');
        tr.style.background = i % 2 === 0 ? '#fff' : '#fafafa';
        const tdNum = document.createElement('td');
        tdNum.textContent = i + 1;
        tdNum.style.cssText = 'padding: 4px 8px; border: 1px solid #eee; color: #999; text-align: center; font-size: 0.9em;';
        tr.appendChild(tdNum);
        columns.forEach(col => {
            const td = document.createElement('td');
            td.textContent = row[col] != null ? row[col] : '';
            td.style.cssText = 'padding: 4px 10px; border: 1px solid #eee; white-space: nowrap;';
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);

    // Truncation note
    if (totalRows > returnedRows) {
        const note = document.createElement('div');
        note.style.cssText = 'padding: 8px 0; font-size: 0.82em; color: #888; text-align: center;';
        note.textContent = `Showing first ${returnedRows} of ${totalRows} rows`;
        container.appendChild(note);
    }

    resultsContent.appendChild(container);
    addLog(`[System] Attribute table loaded: ${layerName} (${totalRows} rows, ${columns.length} columns)`, 'success');
}

// Render a GeoJSON FeatureCollection as a table in Results & Artifacts
function renderGeoJSONAttributeTable(geoJSON, layerName) {
    const features = geoJSON.features || [];
    if (features.length === 0) {
        alert('No features found in this layer.');
        return;
    }

    const resultsContent = document.getElementById('results-content-main');
    resultsContent.innerHTML = '';

    const container = document.createElement('div');
    container.style.cssText = 'padding: 15px; height: 100%; display: flex; flex-direction: column;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom: 10px; border-bottom: 2px solid #ddd; padding-bottom: 8px; display: flex; justify-content: space-between; align-items: center;';
    const h3 = document.createElement('h3');
    h3.style.margin = '0';
    h3.textContent = layerName;
    const meta = document.createElement('span');
    meta.style.cssText = 'font-size: 0.82em; color: #666;';
    meta.textContent = `${features.length} features`;
    header.appendChild(h3);
    header.appendChild(meta);
    container.appendChild(header);

    // Collect all property keys across features
    const allKeys = [];
    const keySet = new Set();
    features.forEach(f => {
        if (f.properties) {
            Object.keys(f.properties).forEach(k => {
                if (!keySet.has(k)) { keySet.add(k); allKeys.push(k); }
            });
        }
    });

    // Build table
    const tableWrap = document.createElement('div');
    tableWrap.style.cssText = 'overflow: auto; flex: 1;';

    const table = document.createElement('table');
    table.style.cssText = 'border-collapse: collapse; width: 100%; font-size: 0.82em;';

    // Thead
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const thNum = document.createElement('th');
    thNum.textContent = '#';
    thNum.style.cssText = 'padding: 6px 8px; border: 1px solid #ddd; background: #f1f3f5; position: sticky; top: 0; font-weight: 600; color: #888; width: 40px; text-align: center;';
    headRow.appendChild(thNum);
    allKeys.forEach(key => {
        const th = document.createElement('th');
        th.textContent = key;
        th.style.cssText = 'padding: 6px 10px; border: 1px solid #ddd; background: #f1f3f5; position: sticky; top: 0; font-weight: 600; white-space: nowrap;';
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    // Tbody (limit to 500 rows)
    const tbody = document.createElement('tbody');
    const maxRows = Math.min(features.length, 500);
    for (let i = 0; i < maxRows; i++) {
        const props = features[i].properties || {};
        const tr = document.createElement('tr');
        tr.style.background = i % 2 === 0 ? '#fff' : '#fafafa';
        const tdNum = document.createElement('td');
        tdNum.textContent = i + 1;
        tdNum.style.cssText = 'padding: 4px 8px; border: 1px solid #eee; color: #999; text-align: center; font-size: 0.9em;';
        tr.appendChild(tdNum);
        allKeys.forEach(key => {
            const td = document.createElement('td');
            td.textContent = props[key] != null ? props[key] : '';
            td.style.cssText = 'padding: 4px 10px; border: 1px solid #eee; white-space: nowrap;';
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);

    if (features.length > 500) {
        const note = document.createElement('div');
        note.style.cssText = 'padding: 8px 0; font-size: 0.82em; color: #888; text-align: center;';
        note.textContent = `Showing first 500 of ${features.length} features`;
        container.appendChild(note);
    }

    resultsContent.appendChild(container);
    addLog(`[System] Attribute table loaded: ${layerName} (${features.length} features, ${allKeys.length} columns)`, 'success');
}

/**
 * Toggle layer preview: load/unload a layer based on checkbox state.
 * Geospatial files → Map Viewer, Tabular files → Results & Artifacts panel.
 */
function toggleLayerPreview(layerIndex, checked) {
    const layerData = window.loadedLayers[layerIndex];
    if (!layerData) return;

    const ext = layerData.fileName
        ? layerData.fileName.split('.').pop().toLowerCase()
        : (layerData.fileType || '').toLowerCase();
    const hasZipData = !!layerData.zipData;
    const geospatialFormats = ['geojson', 'json', 'shp', 'gpkg', 'zip', 'tif', 'tiff'];
    const isGeospatial = geospatialFormats.includes(ext) || hasZipData;
    const tabularFormats = ['csv', 'xlsx', 'parquet'];
    const isTabular = tabularFormats.includes(ext);

    if (checked) {
        // ── LOAD ──
        if (isGeospatial) {
            ensureMapWindowOpen();
            if (layerData.convertedGeoJSON) {
                // Cached GeoJSON from server-side conversion — just re-send it
                sendLayerToMapWhenReady({
                    id: 'layer_' + Date.now(),
                    name: layerData.name,
                    type: 'geojson',
                    geoJSON: layerData.convertedGeoJSON
                });
            } else if (hasZipData) {
                // Shapefile components stored as a zip ArrayBuffer
                sendLayerToMapWhenReady({
                    id: 'layer_' + Date.now(),
                    name: layerData.name,
                    type: 'zip',
                    fileType: 'zip',
                    data: layerData.zipData
                });
            } else if (layerData.serverBacked && layerData.conversationId) {
                loadServerBackedGeospatialFile(
                    layerData.conversationId, layerData.fileName, layerData.name, ext
                );
            } else if (layerData.file) {
                loadGeospatialFile(layerData.file, layerData.name, ext);
            }
            layerData._mapLoaded = true;
            addLog(`[Map] Layer loaded to map: ${layerData.name}`, 'success');
        } else if (isTabular) {
            if (ext === 'csv' && layerData.file) {
                previewCSVInResultsPanel(layerData.file, layerData.name);
            } else if (ext === 'csv' && layerData.serverBacked && layerData.conversationId) {
                previewServerCSV(layerData.conversationId, layerData.fileName, layerData.name);
            }
            layerData._tabularPreviewed = true;
            // Ensure the Results & Artifacts panel is visible
            const rightPanel = document.getElementById('right-section-container');
            if (rightPanel && rightPanel.classList.contains('collapsed')) {
                toggleRightSidebar();
            }
            addLog(`[System] Table previewed: ${layerData.name}`, 'success');
        }
    } else {
        // ── UNLOAD ──
        if (isGeospatial) {
            const mapIframe = document.getElementById('map-iframe');
            if (mapIframe && mapIframe.contentWindow) {
                mapIframe.contentWindow.postMessage({
                    type: 'REMOVE_LAYER',
                    layerName: layerData.name
                }, '*');
            }
            layerData._mapLoaded = false;
            addLog(`[Map] Layer removed from map: ${layerData.name}`, 'info');
        } else if (isTabular) {
            const resultsContent = document.getElementById('results-content-main');
            if (resultsContent) {
                const header = resultsContent.querySelector('h3');
                if (header && header.textContent === layerData.name) {
                    resultsContent.innerHTML = '';
                }
            }
            layerData._tabularPreviewed = false;
            addLog(`[System] Table preview cleared: ${layerData.name}`, 'info');
        }
    }
}

/**
 * Fetch a server-backed CSV file and preview it in the Results & Artifacts panel.
 */
async function previewServerCSV(conversationId, filename, layerName) {
    const url = `${API_BASE_URL}/api/uploads/${encodeURIComponent(conversationId)}/${encodeURIComponent(filename)}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            addLog(`[System] Could not fetch CSV: ${response.status}`, 'error');
            return;
        }
        const blob = await response.blob();
        const file = new File([blob], filename, { type: 'text/csv' });
        previewCSVInResultsPanel(file, layerName);
        // Ensure the Results & Artifacts panel is visible so the user sees it
        const rightPanel = document.getElementById('right-section-container');
        if (rightPanel && rightPanel.classList.contains('collapsed')) {
            toggleRightSidebar();
        }
    } catch (error) {
        addLog(`[System] Error loading CSV preview: ${error.message}`, 'error');
    }
}

function closeAddLayerModal() {
    const modal = document.getElementById('add-layer-modal');
    modal.classList.remove('show');
}

function confirmAddLayer() {
    const layerName = document.getElementById('layer-name-input').value.trim();
    const fileInput = document.getElementById('layer-file-input');
    const files = fileInput.files;

    // Validation
    if (!layerName) {
        alert('Please enter a layer name');
        return;
    }

    if (!files || files.length === 0) {
        alert('Please select a file');
        return;
    }

    addLog(`[System] Loading data layer: ${layerName}...`, 'info');

    // Check if this is a shapefile (multiple component files)
    const fileArray = Array.from(files);
    const shpFile = fileArray.find(f => f.name.toLowerCase().endsWith('.shp'));

    if (shpFile && fileArray.length > 1) {
        // This is a shapefile with multiple components
        loadShapefileComponents(fileArray, layerName);
        closeAddLayerModal();
        return;
    }

    // Single file handling
    const file = files[0];

    // Store layer data globally
    if (!window.loadedLayers) {
        window.loadedLayers = [];
    }

    // Create layer object with file info
    const layerData = {
        name: layerName,
        fileName: file.name,
        filePath: file.path || URL.createObjectURL(file),
        fileSize: (file.size / 1024).toFixed(2) + ' KB',
        fileType: file.type || file.name.split('.').pop(),
        file: file,
        loadedAt: new Date().toISOString()
    };

    window.loadedLayers.push(layerData);

    // Add the layer to the UI list (reuse shared function)
    addLayerToUI(layerData, window.loadedLayers.length - 1);

    addLog(`[System] Data layer added: ${layerName} (${file.name}, ${layerData.fileSize})`, 'success');

    // Read file content if it's a text-based format
    // loadLayerData(file, layerName);

    // Check if it's a geospatial file and send to map
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const geospatialFormats = ['geojson', 'json', 'shp', 'gpkg', 'zip'];

    if (geospatialFormats.includes(fileExtension)) {
        loadGeospatialFile(file, layerName, fileExtension);
    } else if (['tif', 'tiff'].includes(fileExtension)) {
        loadLocalTifFile(file, layerName);
    }

    // Auto-preview CSV files in Results & Artifacts panel
    if (fileExtension === 'csv') {
        previewCSVInResultsPanel(file, layerName);
    }

    // Close modal
    closeAddLayerModal();
}


/**
 * Read a CSV File object and display it as a table in the Results & Artifacts panel.
 */
function previewCSVInResultsPanel(file, layerName) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length === 0) return;

        const resultsContent = document.getElementById('results-content-main');
        resultsContent.innerHTML = '';

        const container = document.createElement('div');
        container.style.cssText = 'padding: 15px; height: 100%; display: flex; flex-direction: column;';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'margin-bottom: 10px; border-bottom: 2px solid #ddd; padding-bottom: 8px; display: flex; justify-content: space-between; align-items: center;';
        const h3 = document.createElement('h3');
        h3.style.margin = '0';
        h3.textContent = layerName;
        const meta = document.createElement('span');
        meta.style.cssText = 'font-size: 0.82em; color: #666;';
        meta.textContent = `${file.name}  ·  ${lines.length - 1} rows  ·  ${(file.size / 1024).toFixed(1)} KB`;
        header.appendChild(h3);
        header.appendChild(meta);
        container.appendChild(header);

        // Table wrapper
        const tableWrap = document.createElement('div');
        tableWrap.style.cssText = 'overflow: auto; flex: 1;';

        const table = document.createElement('table');
        table.style.cssText = 'border-collapse: collapse; width: 100%; font-size: 0.82em;';

        // Parse header
        const headerCols = _parseCSVLine(lines[0]);

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        // Row number column
        const thNum = document.createElement('th');
        thNum.textContent = '#';
        thNum.style.cssText = 'padding: 6px 8px; border: 1px solid #ddd; background: #f1f3f5; position: sticky; top: 0; font-weight: 600; color: #888; width: 40px; text-align: center;';
        headRow.appendChild(thNum);
        headerCols.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;
            th.style.cssText = 'padding: 6px 10px; border: 1px solid #ddd; background: #f1f3f5; position: sticky; top: 0; font-weight: 600; white-space: nowrap;';
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        // Parse data rows (limit preview to first 200 rows)
        const tbody = document.createElement('tbody');
        const maxRows = Math.min(lines.length, 201); // header + 200 data rows
        for (let i = 1; i < maxRows; i++) {
            const cols = _parseCSVLine(lines[i]);
            const tr = document.createElement('tr');
            // Row number
            const tdNum = document.createElement('td');
            tdNum.textContent = i;
            tdNum.style.cssText = 'padding: 4px 8px; border: 1px solid #eee; color: #999; text-align: center; font-size: 0.9em;';
            tr.appendChild(tdNum);
            cols.forEach(val => {
                const td = document.createElement('td');
                td.textContent = val;
                td.style.cssText = 'padding: 4px 10px; border: 1px solid #eee; white-space: nowrap;';
                tr.appendChild(td);
            });
            tr.style.background = i % 2 === 0 ? '#fafafa' : '#fff';
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        container.appendChild(tableWrap);

        // Footer note if truncated
        if (lines.length > 201) {
            const note = document.createElement('div');
            note.style.cssText = 'padding: 8px 0; font-size: 0.82em; color: #888; text-align: center;';
            note.textContent = `Showing first 200 of ${lines.length - 1} rows`;
            container.appendChild(note);
        }

        resultsContent.appendChild(container);
        addLog(`[System] CSV preview loaded: ${layerName} (${lines.length - 1} rows, ${headerCols.length} columns)`, 'success');
    };
    reader.readAsText(file);
}

/** Simple CSV line parser that handles quoted fields. */
function _parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                current += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current.trim());
    return result;
}

// Load and read file data
function loadLayerData(file, layerName) {
    const fileExtension = file.name.split('.').pop().toLowerCase();

    addLog(`[DataLoader] Reading file: ${file.name}...`, 'info');

    // For CSV, JSON, GeoJSON files - read as text
    if (['csv', 'json', 'geojson', 'txt'].includes(fileExtension)) {
        const reader = new FileReader();

        reader.onload = function(e) {
            const content = e.target.result;
            addLog(`[DataLoader] File loaded successfully: ${file.name}`, 'success');
            addLog(`[DataLoader] Content preview: ${content.substring(0, 100)}...`, 'info');

            // Store the content in the layer data
            const layerIndex = window.loadedLayers.findIndex(l => l.name === layerName);
            if (layerIndex !== -1) {
                window.loadedLayers[layerIndex].content = content;
                window.loadedLayers[layerIndex].preview = content.substring(0, 200);
            }

            addRichChatMessage('Data Loaded', {
                layer: layerName,
                file: file.name,
                size: (file.size / 1024).toFixed(2) + ' KB',
                type: fileExtension,
                rows: content.split('\n').length
            });
        };

        reader.onerror = function() {
            addLog(`[DataLoader] Error reading file: ${file.name}`, 'error');
            alert('Error reading file. Please try again.');
        };

        reader.readAsText(file);
    }
    // For binary formats (shp, xlsx, etc.)
    else {
        addLog(`[DataLoader] Binary file detected: ${file.name}`, 'info');
        addLog(`[DataLoader] File stored. Backend processing may be required.`, 'warning');

        addRichChatMessage('Data Loaded', {
            layer: layerName,
            file: file.name,
            size: (file.size / 1024).toFixed(2) + ' KB',
            type: fileExtension,
            note: 'Binary file - backend processing required'
        });
    }
}

// Load shapefile from multiple component files (.shp, .shx, .dbf, .prj)
// Strategy: zip the components in memory, then load as a zip (most reliable path in shp.js)
async function loadShapefileComponents(files, layerName) {
    console.log('[DEBUG shp] loadShapefileComponents called, files:', files, 'layerName:', layerName);
    addLog(`[Map] Loading shapefile components: ${files.length} files`, 'info');

    // Check JSZip availability
    if (typeof JSZip === 'undefined') {
        console.error('[DEBUG shp] JSZip is NOT defined');
        addLog('[Map] JSZip library not loaded', 'error');
        alert('JSZip library failed to load. Please refresh the page and try again.');
        return;
    }
    console.log('[DEBUG shp] JSZip is available');

    // Ensure map window is open
    ensureMapWindowOpen();

    try {
        // Read every component file into memory
        const fileArray = Array.from(files);
        console.log('[DEBUG shp] fileArray length:', fileArray.length);

        // Check total size — browsers can't handle very large files in memory
        const MAX_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB limit
        let totalBytes = 0;
        const oversized = [];
        fileArray.forEach((f, i) => {
            console.log(`[DEBUG shp]   file[${i}]: name="${f.name}", size=${f.size}, type="${f.type}"`);
            totalBytes += f.size;
            if (f.size > MAX_TOTAL_BYTES) {
                oversized.push(`${f.name} (${(f.size / (1024*1024*1024)).toFixed(1)} GB)`);
            }
        });

        if (oversized.length > 0 || totalBytes > MAX_TOTAL_BYTES) {
            const sizeStr = totalBytes > 1024*1024*1024
                ? (totalBytes / (1024*1024*1024)).toFixed(1) + ' GB'
                : (totalBytes / (1024*1024)).toFixed(0) + ' MB';

            // 2 GB hard ceiling — even server upload won't work above this
            const MAX_BACKEND_BYTES = 2 * 1024 * 1024 * 1024;
            if (totalBytes > MAX_BACKEND_BYTES) {
                addLog(`[Map] Shapefile (${sizeStr}) exceeds both browser and server limits`, 'error');
                alert(
                    `Shapefile "${layerName}" is ${sizeStr} — too large for both browser and server loading.\n\n` +
                    `Individual file sizes:\n` +
                    fileArray.map(f => `  ${f.name}: ${f.size > 1024*1024*1024 ? (f.size/(1024*1024*1024)).toFixed(1)+' GB' : (f.size/(1024*1024)).toFixed(0)+' MB'}`).join('\n') +
                    `\n\nOptions:\n` +
                    `• Use a smaller subset of the data\n` +
                    `• Simplify the shapefile externally (e.g. with ogr2ogr or QGIS)\n` +
                    `• Check if the .dbf file size is correct — 22 GB is unusual`
                );
                return;
            }

            addLog(`[Map] Shapefile too large (${sizeStr}) for browser — falling back to server-side conversion...`, 'warning');
            // 1st fallback: upload to backend and convert server-side
            await convertShapefileViaBackend(fileArray, layerName);
            return;
        }

        const results = [];

        for (const file of fileArray) {
            console.log(`[DEBUG shp] Reading file: ${file.name} ...`);
            const data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    console.log(`[DEBUG shp] FileReader onload: ${file.name}, bytes=${e.target.result.byteLength}`);
                    addLog(`[Map] Loaded component: ${file.name}`, 'info');
                    resolve(e.target.result);
                };
                reader.onerror = (e) => {
                    console.error(`[DEBUG shp] FileReader onerror for ${file.name}:`, reader.error, e);
                    reject(new Error(`Failed to read file: ${file.name} — ${reader.error}`));
                };
                reader.readAsArrayBuffer(file);
            });
            results.push({ name: file.name, data: data });
        }

        console.log('[DEBUG shp] All files read. Count:', results.length);

        // Verify we have at least .shp and .dbf
        const exts = results.map(r => r.name.split('.').pop().toLowerCase());
        console.log('[DEBUG shp] Extensions found:', exts);
        if (!exts.includes('shp') || !exts.includes('dbf')) {
            alert('Missing required shapefile components. Need at least .shp and .dbf files.');
            return;
        }

        addLog(`[Map] All components read, zipping in memory...`, 'info');
        console.log('[DEBUG shp] Creating JSZip...');

        // Zip the components using JSZip
        const zip = new JSZip();
        results.forEach(r => {
            console.log(`[DEBUG shp]   adding to zip: ${r.name} (${r.data.byteLength} bytes)`);
            zip.file(r.name, r.data);
        });

        console.log('[DEBUG shp] Generating zip arraybuffer...');
        const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
        console.log('[DEBUG shp] Zip generated, size:', zipBuffer.byteLength);

        addLog(`[Map] Zip created (${(zipBuffer.byteLength / 1024).toFixed(1)} KB), sending to map...`, 'info');

        // Calculate total size
        let totalSize = 0;
        fileArray.forEach(f => { totalSize += f.size; });

        // Store layer data globally
        if (!window.loadedLayers) {
            window.loadedLayers = [];
        }

        const layerData = {
            name: layerName,
            fileName: fileArray.map(f => f.name).join(', '),
            filePath: 'shapefile-zip',
            fileSize: (totalSize / 1024).toFixed(2) + ' KB',
            fileType: 'zip',
            files: files,
            zipData: zipBuffer,   // keep the zip ArrayBuffer for re-loading via checkbox
            loadedAt: new Date().toISOString()
        };

        window.loadedLayers.push(layerData);
        addLayerToUI(layerData, window.loadedLayers.length - 1);

        // Send to map as a zip (the most reliable loading path)
        console.log('[DEBUG shp] Sending zip to map iframe...');
        sendLayerToMapWhenReady({
            id: 'layer_' + Date.now(),
            name: layerName,
            type: 'zip',
            fileType: 'zip',
            data: zipBuffer
        });

        addLog(`[System] Shapefile layer added: ${layerName} (${fileArray.length} files, ${layerData.fileSize})`, 'success');
        console.log('[DEBUG shp] Done — shapefile loaded successfully');
    } catch (error) {
        console.error('[DEBUG shp] CAUGHT ERROR:', error);
        console.error('[DEBUG shp] error type:', typeof error);
        console.error('[DEBUG shp] error constructor:', error && error.constructor && error.constructor.name);
        console.error('[DEBUG shp] error.message:', error && error.message);
        console.error('[DEBUG shp] error.stack:', error && error.stack);
        const msg = (error && error.message) ? error.message : String(error);
        addLog(`[Map] Error reading shapefile components: ${msg}`, 'error');
        alert('Error reading shapefile components: ' + msg);
    }
}

// Load geospatial file and send to map
function loadGeospatialFile(file, layerName, fileExtension) {
    addLog(`[Map] Loading geospatial file: ${file.name}`, 'info');

    // Ensure map window is open
    ensureMapWindowOpen();

    // Raster GeoTIFFs need server-side CRS handling — delegate.
    if (fileExtension === 'tif' || fileExtension === 'tiff') {
        loadLocalTifFile(file, layerName);
        return;
    }

    // For GeoJSON - read as text and parse as JSON
    if (fileExtension === 'geojson' || fileExtension === 'json') {
        const reader = new FileReader();

        reader.onload = function(e) {
            try {
                const content = e.target.result;
                const geoJSON = JSON.parse(content);

                // Send to map after ensuring iframe is loaded
                sendLayerToMapWhenReady({
                    id: 'layer_' + Date.now(),
                    name: layerName,
                    type: 'geojson',
                    geoJSON: geoJSON
                });

                addLog(`[Map] GeoJSON layer sent to map: ${layerName}`, 'success');
                // addChatMessage(`Loaded GeoJSON layer "${layerName}" to map viewer`, 'agm');
            } catch (error) {
                addLog(`[Map] Error parsing GeoJSON: ${error.message}`, 'error');
                alert('Error parsing GeoJSON file: ' + error.message);
            }
        };

        reader.onerror = function() {
            addLog(`[Map] Error reading file: ${file.name}`, 'error');
            alert('Error reading file. Please try again.');
        };

        reader.readAsText(file);
    }
    // For GeoPackage - read as ArrayBuffer and send directly to map for client-side processing
    else if (fileExtension === 'gpkg') {
        const reader = new FileReader();

        reader.onload = function(e) {
            const arrayBuffer = e.target.result;

            sendLayerToMapWhenReady({
                id: 'layer_' + Date.now(),
                name: layerName,
                type: 'geopackage',
                fileType: 'gpkg',
                data: arrayBuffer
            });

            addLog(`[Map] GeoPackage file sent to map: ${layerName}`, 'success');
        };

        reader.onerror = function() {
            addLog(`[Map] Error reading file: ${file.name}`, 'error');
            alert('Error reading file. Please try again.');
        };

        reader.readAsArrayBuffer(file);
    }
    // For Shapefile and ZIP - read as ArrayBuffer and send to map
    else if (['shp', 'zip'].includes(fileExtension)) {
        const reader = new FileReader();

        reader.onload = function(e) {
            const arrayBuffer = e.target.result;

            // Send to map with appropriate type after ensuring iframe is loaded
            sendLayerToMapWhenReady({
                id: 'layer_' + Date.now(),
                name: layerName,
                type: fileExtension,
                fileType: fileExtension,
                data: arrayBuffer
            });

            addLog(`[Map] ${fileExtension.toUpperCase()} file sent to map: ${layerName}`, 'success');
            // addChatMessage(`Loaded ${fileExtension.toUpperCase()} file "${layerName}" to map viewer`, 'agm');
        };

        reader.onerror = function() {
            addLog(`[Map] Error reading file: ${file.name}`, 'error');
            alert('Error reading file. Please try again.');
        };

        reader.readAsArrayBuffer(file);
    }
}

/**
 * Upload a local TIF file to the server, fetch its WGS84 bounds via rasterio,
 * then send it to the map viewer.
 */
async function loadLocalTifFile(file, layerName) {
    addLog(`[Map] Preparing TIF for rendering: ${file.name}`, 'info');
    ensureMapWindowOpen();

    let wgs84Bounds = null;

    // 1. Always upload so rasterio can reproject bounds to WGS84 — required
    //    for Mapbox, which rejects non-lat/lon coordinates. A '__tmp__' conv id
    //    is used when no real conversation is active; the backend will skip
    //    the conversation_files link in that case.
    try {
        const convId = currentConversationId || '__tmp__';
        const formData = new FormData();
        formData.append('files', file);
        formData.append('conversation_id', convId);

        const uploadResp = await fetch(`${API_BASE_URL}/api/upload-and-audit-data`, {
            method: 'POST',
            body: formData,
        });
        if (uploadResp.ok) {
            try {
                const boundsResp = await fetch(
                    `${API_BASE_URL}/api/tif_bounds/${encodeURIComponent(convId)}/${encodeURIComponent(file.name)}`
                );
                if (boundsResp.ok) wgs84Bounds = await boundsResp.json();
            } catch (err) {
                addLog(`[Map] Could not fetch TIF bounds: ${err.message}`, 'warning');
            }
        } else {
            addLog(`[Map] TIF upload returned ${uploadResp.status}; rendering with embedded bounds (may fail for projected CRS)`, 'warning');
        }
    } catch (err) {
        addLog(`[Map] TIF upload failed: ${err.message}; rendering with embedded bounds (may fail for projected CRS)`, 'warning');
    }

    // 2. Read file client-side and send to map (always).
    const reader = new FileReader();
    reader.onload = function(e) {
        sendLayerToMapWhenReady({
            id: 'layer_' + Date.now(),
            name: layerName,
            type: 'tif',
            fileType: 'tif',
            data: e.target.result,
            wgs84Bounds,
        });
        addLog(`[Map] TIF layer sent to map: ${layerName}`, 'success');
    };
    reader.onerror = () => addLog(`[Map] Error reading TIF file: ${file.name}`, 'error');
    reader.readAsArrayBuffer(file);
}

// Convert GeoPackage via backend
async function convertGeoPackageViaBackend(file, layerName, autoOpenMap = true) {
    addLog(`[Map] Uploading GeoPackage to backend: ${file.name}`, 'info');
    // addChatMessage(`Converting GeoPackage "${layerName}"...`, 'agm');

    // Ensure map window is open (only if autoOpenMap is true)
    if (autoOpenMap) {
        ensureMapWindowOpen();
    }

    try {
        const formData = new FormData();
        formData.append('file', file);

        addLog(`[Map] Sending GeoPackage to backend for conversion...`, 'info');

        const response = await fetch(`${API_BASE_URL}/api/convert-geopackage`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to convert GeoPackage');
        }

        if (result.success && result.geojson) {
            addLog(`[Map] GeoPackage converted successfully. Features: ${result.feature_count}`, 'success');

            // Cache the converted GeoJSON in the layer data
            const layerIndex = window.loadedLayers.findIndex(l => l.name === layerName);
            if (layerIndex !== -1) {
                window.loadedLayers[layerIndex].convertedGeoJSON = result.geojson;
                window.loadedLayers[layerIndex].conversionInfo = {
                    feature_count: result.feature_count,
                    loaded_layer: result.loaded_layer,
                    crs: result.crs
                };
                addLog(`[Map] Cached converted GeoJSON for layer: ${layerName}`, 'info');
            }

            // Send GeoJSON to map
            sendLayerToMapWhenReady({
                id: 'layer_' + Date.now(),
                name: layerName,
                type: 'geojson',
                geoJSON: result.geojson
            });

            // addChatMessage(`Loaded GeoPackage "${layerName}" (Layer: ${result.loaded_layer}, ${result.feature_count} features, CRS: ${result.crs})`, 'agm');
        } else {
            throw new Error(result.error || 'Unknown error');
        }

    } catch (error) {
        addLog(`[Map] Error converting GeoPackage: ${error.message}`, 'error');
        // addChatMessage(`Error loading GeoPackage: ${error.message}`, 'agm');
        addChatMessage(`Error converting GeoPackage: ${error.message}`, 'agm');
    }
}

/**
 * Upload shapefile components to backend for server-side conversion to GeoJSON.
 * Used as a fallback when files are too large for browser-based loading.
 */
async function convertShapefileViaBackend(files, layerName) {
    addLog(`[Map] Uploading shapefile to server for conversion: ${layerName}...`, 'info');

    ensureMapWindowOpen();

    try {
        const formData = new FormData();
        const fileArray = Array.from(files);
        fileArray.forEach(f => formData.append('files', f));

        addLog(`[Map] Sending ${fileArray.length} file(s) to backend...`, 'info');

        const response = await fetch(`${API_BASE_URL}/api/convert-shapefile`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Server failed to convert shapefile');
        }

        if (result.success && result.geojson) {
            addLog(`[Map] Shapefile converted on server. Features: ${result.feature_count}, CRS: ${result.original_crs} → ${result.output_crs}`, 'success');

            // Calculate total size for UI
            let totalSize = 0;
            fileArray.forEach(f => { totalSize += f.size; });

            // Store layer data globally
            if (!window.loadedLayers) window.loadedLayers = [];

            const layerData = {
                name: layerName,
                fileName: fileArray.map(f => f.name).join(', '),
                filePath: 'server-converted',
                fileSize: (totalSize / 1024).toFixed(2) + ' KB',
                fileType: 'zip',
                files: files,
                convertedGeoJSON: result.geojson,  // cache for re-loading via checkbox
                loadedAt: new Date().toISOString()
            };

            window.loadedLayers.push(layerData);
            addLayerToUI(layerData, window.loadedLayers.length - 1);

            // Send GeoJSON to map
            sendLayerToMapWhenReady({
                id: 'layer_' + Date.now(),
                name: layerName,
                type: 'geojson',
                geoJSON: result.geojson
            });

            addLog(`[System] Shapefile layer added (server): ${layerName} (${result.feature_count} features)`, 'success');
        } else {
            throw new Error(result.error || 'Unknown server error');
        }
    } catch (error) {
        const msg = (error && error.message) ? error.message : String(error);
        addLog(`[Map] Server-side shapefile conversion failed: ${msg}`, 'error');
        // Final fallback: show the size-limit message
        let totalBytes = 0;
        Array.from(files).forEach(f => { totalBytes += f.size; });
        const sizeStr = totalBytes > 1024*1024*1024
            ? (totalBytes / (1024*1024*1024)).toFixed(1) + ' GB'
            : (totalBytes / (1024*1024)).toFixed(0) + ' MB';
        alert(
            `Could not load shapefile "${layerName}" (${sizeStr}).\n\n` +
            `Browser loading failed (too large) and server conversion also failed:\n${msg}\n\n` +
            `Tip: Pre-zip the shapefile on disk and try loading the .zip, or use a smaller dataset.`
        );
    }
}

/**
 * Load a server-backed geospatial file onto the map by fetching it from the
 * /api/uploads endpoint. Used when restoring conversation layers.
 */
async function loadServerBackedGeospatialFile(conversationId, filename, layerName, fileExtension) {
    const url = `${API_BASE_URL}/api/uploads/${encodeURIComponent(conversationId)}/${encodeURIComponent(filename)}`;

    // Look up the matching layer entry so we can cache the fetched data and
    // avoid re-downloading on subsequent uncheck/re-check cycles.
    const layerEntry = (window.loadedLayers || []).find(
        (ld) => ld && ld.fileName === filename && ld.conversationId === conversationId
    );

    // Serve from cache if we've already fetched this file once.
    if (layerEntry) {
        if ((fileExtension === 'geojson' || fileExtension === 'json') && layerEntry.convertedGeoJSON) {
            ensureMapWindowOpen();
            sendLayerToMapWhenReady({
                id: 'layer_' + Date.now(),
                name: layerName,
                type: 'geojson',
                geoJSON: layerEntry.convertedGeoJSON,
            });
            addLog(`[Map] Layer loaded from cache: ${layerName}`, 'info');
            return;
        }
        if (layerEntry.cachedArrayBuffer && layerEntry.cachedFileExt === fileExtension) {
            ensureMapWindowOpen();
            const typeMap = { gpkg: 'geopackage', shp: 'shp', zip: 'zip', tif: 'tif', tiff: 'tif' };
            const payload = {
                id: 'layer_' + Date.now(),
                name: layerName,
                type: typeMap[fileExtension] || fileExtension,
                fileType: fileExtension,
                data: layerEntry.cachedArrayBuffer,
            };
            if (layerEntry.cachedWgs84Bounds) payload.wgs84Bounds = layerEntry.cachedWgs84Bounds;
            sendLayerToMapWhenReady(payload);
            addLog(`[Map] Layer loaded from cache: ${layerName}`, 'info');
            return;
        }
    }

    addLog(`[Map] Fetching server-backed file: ${filename}`, 'info');

    try {
        ensureMapWindowOpen();
        const response = await fetch(url);
        if (!response.ok) {
            addLog(`[Map] Could not fetch ${filename}: ${response.status}`, 'error');
            return;
        }

        if (fileExtension === 'geojson' || fileExtension === 'json') {
            const geoJSON = await response.json();
            if (layerEntry) layerEntry.convertedGeoJSON = geoJSON;
            sendLayerToMapWhenReady({
                id: 'layer_' + Date.now(),
                name: layerName,
                type: 'geojson',
                geoJSON: geoJSON,
            });
        } else if (fileExtension === 'gpkg') {
            const arrayBuffer = await response.arrayBuffer();
            if (layerEntry) {
                layerEntry.cachedArrayBuffer = arrayBuffer;
                layerEntry.cachedFileExt = fileExtension;
            }
            sendLayerToMapWhenReady({
                id: 'layer_' + Date.now(),
                name: layerName,
                type: 'geopackage',
                fileType: 'gpkg',
                data: arrayBuffer,
            });
        } else if (['shp', 'zip'].includes(fileExtension)) {
            const arrayBuffer = await response.arrayBuffer();
            if (layerEntry) {
                layerEntry.cachedArrayBuffer = arrayBuffer;
                layerEntry.cachedFileExt = fileExtension;
            }
            sendLayerToMapWhenReady({
                id: 'layer_' + Date.now(),
                name: layerName,
                type: fileExtension,
                fileType: fileExtension,
                data: arrayBuffer,
            });
        } else if (['tif', 'tiff'].includes(fileExtension)) {
            const arrayBuffer = await response.arrayBuffer();
            // Fetch WGS84 bounds from backend (rasterio handles any source CRS)
            let wgs84Bounds = null;
            try {
                const boundsResp = await fetch(
                    `${API_BASE_URL}/api/tif_bounds/${encodeURIComponent(conversationId)}/${encodeURIComponent(filename)}`
                );
                if (boundsResp.ok) {
                    wgs84Bounds = await boundsResp.json();
                }
            } catch (err) {
                addLog(`[Map] Could not fetch TIF bounds, will attempt client-side CRS detection: ${err.message}`, 'warn');
            }
            if (layerEntry) {
                layerEntry.cachedArrayBuffer = arrayBuffer;
                layerEntry.cachedFileExt = fileExtension;
                if (wgs84Bounds) layerEntry.cachedWgs84Bounds = wgs84Bounds;
            }
            sendLayerToMapWhenReady({
                id: 'layer_' + Date.now(),
                name: layerName,
                type: 'tif',
                fileType: fileExtension,
                data: arrayBuffer,
                wgs84Bounds,
            });
        }
        addLog(`[Map] Server-backed layer loaded: ${layerName}`, 'success');
    } catch (error) {
        addLog(`[Map] Error loading server-backed file: ${error.message}`, 'error');
    }
}

// Ensure map is ready (embedded version)
function ensureMapWindowOpen() {
    const mapIframe = document.getElementById('map-iframe');

    // Un-collapse the right panel so the map is actually visible.
    const rightPanel = document.getElementById('right-section-container');
    if (rightPanel && rightPanel.classList.contains('collapsed')) {
        toggleRightSidebar();
    }

    // Map is always visible in embedded mode
    // Just ensure it's loaded
    if (!mapIframe || !mapIframe.src) {
        addLog('[Map] Initializing embedded map...', 'info');
        if (mapIframe) {
            mapIframe.src = 'map.html';
        }
    }
}

// Send layer to map when iframe is ready
function sendLayerToMapWhenReady(layerData) {
    const mapIframe = document.getElementById('map-iframe');

    // Wait for iframe to load if needed
    if (!mapIframe.src || mapIframe.src === '' || mapIframe.src === window.location.href) {
        // Map not yet initialized, wait a bit
        setTimeout(() => sendLayerToMapWhenReady(layerData), 500);
        return;
    }

    // If iframe is still loading, wait for it
    if (mapIframe.dataset.loading === 'true') {
        setTimeout(() => sendLayerToMapWhenReady(layerData), 500);
        return;
    }

    // If contentWindow is not available, wait
    if (!mapIframe.contentWindow) {
        setTimeout(() => sendLayerToMapWhenReady(layerData), 500);
        return;
    }

    // Send the layer data
    try {
        sendLayerToMap(layerData);
        addLog('[Map] Layer data sent to iframe successfully', 'info');
    } catch (error) {
        addLog(`[Map] Error sending layer to map: ${error.message}`, 'error');
    }
}

// Update file name display when file is selected
window.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('layer-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            let displayText = 'No file selected';

            if (files && files.length > 0) {
                if (files.length === 1) {
                    displayText = files[0].name;
                } else {
                    // Multiple files - show count and check if shapefile
                    const extensions = Array.from(files).map(f => f.name.split('.').pop().toLowerCase());
                    if (extensions.includes('shp')) {
                        displayText = `Shapefile (${files.length} components)`;
                    } else {
                        displayText = `${files.length} files selected`;
                    }
                }
            }

            document.getElementById('selected-file-name').textContent = displayText;
        });
    }
});



// Resizable Panel Functionality
(function initResizablePanels() {
    const divider = document.getElementById("resize-divider");
    const chatSection = document.querySelector(".chat-section");
    const resultsSection = document.getElementById("results-section-main");
    const mainCenter = document.querySelector(".main-center");
    const mapIframe = document.getElementById("map-iframe");

    if (!divider || !chatSection || !resultsSection || !mainCenter) {
        console.warn("Resize elements not found");
        return;
    }

    let isResizing = false;
    let startX = 0;
    let startChatWidth = 0;

    // Function to stop resizing
    const stopResize = function() {
        if (isResizing) {
            isResizing = false;
            document.body.style.userSelect = "";
            document.body.style.cursor = "";

            // Re-enable pointer events on iframe
            if (mapIframe) {
                mapIframe.style.pointerEvents = "";
            }
        }
    };

    divider.addEventListener("mousedown", function(e) {
        isResizing = true;
        startX = e.clientX;
        startChatWidth = chatSection.offsetWidth;

        // Prevent text selection during drag
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";

        // Disable pointer events on iframe to prevent it from capturing mouse events
        if (mapIframe) {
            mapIframe.style.pointerEvents = "none";
        }

        e.preventDefault();
    });

    document.addEventListener("mousemove", function(e) {
        if (!isResizing) return;

        const deltaX = e.clientX - startX;
        const newChatWidth = startChatWidth + deltaX;
        const mainCenterWidth = mainCenter.offsetWidth;
        const minChatWidth = 400; // Minimum chat width
        const minResultsWidth = 300; // Minimum results width

        // Calculate the maximum allowed chat width
        const maxChatWidth = mainCenterWidth - minResultsWidth - 10; // 10px for divider

        // Clamp the value to stay within bounds (always update for smooth resizing)
        const clampedWidth = Math.max(minChatWidth, Math.min(maxChatWidth, newChatWidth));
        const chatPercentage = (clampedWidth / mainCenterWidth) * 100;
        chatSection.style.flex = "0 0 " + chatPercentage + "%";
    });

    // Listen on both document and window to catch all mouseup events
    document.addEventListener("mouseup", stopResize);
    window.addEventListener("mouseup", stopResize);

    // Also stop on mouse leaving the window
    document.addEventListener("mouseleave", stopResize);
})();

// ==================== Vertical Resize Divider (Map / Results) ====================
(function initVerticalResizeDivider() {
    const divider = document.getElementById("resize-divider-vertical");
    const mapSection = document.querySelector(".map-section-embedded");
    const resultsSection = document.getElementById("results-section-main");
    const rightContainer = document.querySelector(".right-section-container");
    const mapIframe = document.getElementById("map-iframe");

    if (!divider || !mapSection || !resultsSection || !rightContainer) {
        console.warn("Vertical resize elements not found");
        return;
    }

    let isResizing = false;
    let startY = 0;
    let startMapHeight = 0;

    // Function to stop resizing
    const stopResize = function() {
        if (isResizing) {
            isResizing = false;
            document.body.style.userSelect = "";
            document.body.style.cursor = "";

            // Re-enable pointer events on iframe
            if (mapIframe) {
                mapIframe.style.pointerEvents = "";
            }
        }
    };

    divider.addEventListener("mousedown", function(e) {
        isResizing = true;
        startY = e.clientY;
        startMapHeight = mapSection.offsetHeight;

        // Prevent text selection during drag
        document.body.style.userSelect = "none";
        document.body.style.cursor = "row-resize";

        // Disable pointer events on iframe to prevent it from capturing mouse events
        if (mapIframe) {
            mapIframe.style.pointerEvents = "none";
        }

        e.preventDefault();
    });

    document.addEventListener("mousemove", function(e) {
        if (!isResizing) return;

        const deltaY = e.clientY - startY;
        const newMapHeight = startMapHeight + deltaY;
        const containerHeight = rightContainer.offsetHeight;
        const minMapHeight = 200; // Minimum map height
        const minResultsHeight = 200; // Minimum results height

        // Calculate the maximum allowed map height
        const maxMapHeight = containerHeight - minResultsHeight - 10; // 10px for divider

        // Clamp the value to stay within bounds (always update for smooth resizing)
        const clampedHeight = Math.max(minMapHeight, Math.min(maxMapHeight, newMapHeight));
        const mapPercentage = (clampedHeight / containerHeight) * 100;
        mapSection.style.flex = "0 0 " + mapPercentage + "%";
    });

    // Listen on both document and window to catch all mouseup events
    document.addEventListener("mouseup", stopResize);
    window.addEventListener("mouseup", stopResize);

    // Also stop on mouse leaving the window
    document.addEventListener("mouseleave", stopResize);
})();


// ==================== Interactive Workflow Functions ====================

async function approveWorkflow(taskId, controlsElement) {
    addLog(`[User] Approving workflow: ${taskId}`, 'info');

    try {
        const response = await fetch(`${API_BASE_URL}/api/workflow/approve/${taskId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        const data = await response.json();

        if (data.success) {
            addLog(`[AGM] Workflow approved! Revision count: ${data.revision_count}`, 'success');

            // Show success message
            const statusArea = document.getElementById(`workflow-status-${taskId}`);
            if (statusArea) {
                statusArea.style.display = 'block';
                statusArea.style.background = '#d4edda';
                statusArea.style.color = '#155724';
                statusArea.style.border = '1px solid #c3e6cb';
                statusArea.innerHTML = '<strong>✅ Workflow Approved!</strong><br>Generating code...';
            }

            // Disable the workflow controls
            const buttons = controlsElement.querySelectorAll('button');
            buttons.forEach(btn => btn.disabled = true);

            // Automatically generate code after approval
            addLog(`[AGM] Starting code generation for workflow: ${taskId}`, 'info');
            await generateWorkflowCode(taskId);

        } else {
            addLog(`[Error] Failed to approve workflow: ${data.error}`, 'error');
            alert(`Error: ${data.error}`);
        }

    } catch (error) {
        addLog(`[Error] ${error.message}`, 'error');
        alert(`Connection error: ${error.message}`);
    }
}

function toggleFeedbackInput(taskId, feedbackInputArea) {
    if (feedbackInputArea.style.display === 'none') {
        feedbackInputArea.style.display = 'block';
        addLog(`[User] Opening feedback input for workflow: ${taskId}`, 'info');
    } else {
        feedbackInputArea.style.display = 'none';
    }
}

async function submitWorkflowFeedback(taskId, feedback, iframe, feedbackInputArea, feedbackTextarea) {
    if (!feedback || feedback.trim() === '') {
        alert('Please enter feedback before submitting');
        return;
    }

    addLog(`[User] Submitting feedback for workflow: ${taskId}`, 'info');
    addLog(`[User] Feedback: ${feedback}`, 'info');

    // Show loading state
    const statusArea = document.getElementById(`workflow-status-${taskId}`);
    if (statusArea) {
        statusArea.style.display = 'block';
        statusArea.style.background = '#fff3cd';
        statusArea.style.color = '#856404';
        statusArea.style.border = '1px solid #ffeaa7';
        statusArea.innerHTML = '<strong>⏳ Processing feedback...</strong><br>Refining the workflow based on your input. This may take a moment.';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/workflow/refine/${taskId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ feedback: feedback })
        });

        const data = await response.json();

        if (data.success) {
            addLog(`[AGM] Workflow refined successfully! Revision: ${data.revision_count}`, 'success');

            // Reload the iframe with cache-busting
            iframe.src = `${API_BASE_URL}/api/graph/${taskId}?v=${Date.now()}`;

            // Show success message
            if (statusArea) {
                statusArea.style.background = '#d4edda';
                statusArea.style.color = '#155724';
                statusArea.style.border = '1px solid #c3e6cb';
                statusArea.innerHTML = `<strong>✅ Workflow Updated!</strong><br>The workflow has been refined based on your feedback. Review the updated graph above.`;
            }

            // Clear and hide feedback input
            feedbackTextarea.value = '';
            feedbackInputArea.style.display = 'none';

            // Add a message to chat
            addChatMessage(`Workflow refined based on your feedback. Please review the updated workflow graph.`, 'agm');

        } else {
            addLog(`[Error] Failed to refine workflow: ${data.error}`, 'error');
            if (statusArea) {
                statusArea.style.background = '#f8d7da';
                statusArea.style.color = '#721c24';
                statusArea.style.border = '1px solid #f5c6cb';
                statusArea.innerHTML = `<strong>❌ Error</strong><br>${data.error}`;
            }
        }

    } catch (error) {
        addLog(`[Error] ${error.message}`, 'error');
        if (statusArea) {
            statusArea.style.background = '#f8d7da';
            statusArea.style.color = '#721c24';
            statusArea.style.border = '1px solid #f5c6cb';
            statusArea.innerHTML = `<strong>❌ Connection Error</strong><br>${error.message}`;
        }
    }
}

async function listWorkflowNodes(taskId) {
    addLog(`[User] Listing nodes for workflow: ${taskId}`, 'info');

    try {
        const response = await fetch(`${API_BASE_URL}/api/workflow/nodes/${taskId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        const data = await response.json();

        if (data.success) {
            addLog(`[AGM] Retrieved ${data.total_nodes} nodes, ${data.total_edges} edges`, 'success');

            // Create a formatted display of nodes
            let nodesDisplay = '='.repeat(60) + '\n';
            nodesDisplay += 'WORKFLOW NODES\n';
            nodesDisplay += '='.repeat(60) + '\n\n';

            nodesDisplay += '📁 DATA NODES:\n';
            nodesDisplay += '-'.repeat(40) + '\n';
            data.data_nodes.forEach(node => {
                nodesDisplay += `  • ${node.name}\n`;
                nodesDisplay += `    Description: ${node.description}\n`;
                if (node.data_path) {
                    nodesDisplay += `    Path: ${node.data_path}\n`;
                }
                nodesDisplay += '\n';
            });

            nodesDisplay += '\n⚙️ OPERATION NODES:\n';
            nodesDisplay += '-'.repeat(40) + '\n';
            data.operation_nodes.forEach(node => {
                nodesDisplay += `  • ${node.name}\n`;
                nodesDisplay += `    Description: ${node.description}\n\n`;
            });

            nodesDisplay += '\n📊 EDGES:\n';
            nodesDisplay += '-'.repeat(40) + '\n';
            data.edges.forEach(edge => {
                nodesDisplay += `  ${edge.source} → ${edge.target}\n`;
            });
            nodesDisplay += '\n' + '='.repeat(60);

            // Display in chat
            addRichChatMessage(`Workflow Nodes (${taskId})`, nodesDisplay);

            // Also add to chat
            addChatMessage(`Here are the nodes in the workflow:\n\nData nodes: ${data.data_nodes.length}\nOperation nodes: ${data.operation_nodes.length}\nEdges: ${data.total_edges}`, 'agm');

        } else {
            addLog(`[Error] Failed to list nodes: ${data.error}`, 'error');
            alert(`Error: ${data.error}`);
        }

    } catch (error) {
        addLog(`[Error] ${error.message}`, 'error');
        alert(`Connection error: ${error.message}`);
    }
}

async function generateWorkflowCode(taskId) {
    addLog(`[AGM] Generating code for workflow: ${taskId}`, 'info');

    // Set LLM streaming status
    const statusDot = document.getElementById('llm-status-dot');
    const statusText = document.getElementById('llm-status-text');
    if (statusDot) statusDot.className = 'status-dot running';
    if (statusText) statusText.textContent = 'Generating Code...';

    try {
        const streamUrl = `${API_BASE_URL}/api/workflow/generate-code-stream/${taskId}`;
        const response = await fetch(streamUrl, { method: 'POST' });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let resultData = null;
        let currentStreamContent = '';
        let streamingChatMessage = null;
        let streamingMessageContent = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const messages = buffer.split('\n\n');
            buffer = messages.pop() || '';

            for (const msg of messages) {
                if (msg.startsWith('data: ')) {
                    try {
                        const jsonData = JSON.parse(msg.slice(6));

                        if (jsonData.type === 'llm_update') {
                            addLLMResponse(jsonData.content, true);
                            // addLog(`[LLM] ${jsonData.content}`, 'info');
                        } else if (jsonData.type === 'llm_stream') {
                            // Handle streaming - display in both LLM Response panel and chat
                            currentStreamContent += jsonData.content;
                            // addLLMResponse(jsonData.content, false);

                            // Also stream into chat message
                            if (!streamingChatMessage) {
                                // Create the chat message on first chunk
                                const chatMessages = document.getElementById('chat-messages');
                                streamingChatMessage = document.createElement('div');
                                streamingChatMessage.className = 'chat-message agm rich-content';

                                const avatar = document.createElement('div');
                                avatar.className = 'message-avatar';
                                avatar.innerHTML = '<img src="icon/AGM.png" alt="AGM" class="avatar-img">';

                                const wrapper = document.createElement('div');
                                wrapper.className = 'message-wrapper full-width';

                                const header = document.createElement('div');
                                header.className = 'message-header';
                                header.innerHTML = `
                                    <span class="message-sender">AGM</span>
                                    <span class="message-time">${getCurrentTimestamp()}</span>
                                `;

                                const bubble = document.createElement('div');
                                bubble.className = 'message-bubble';

                                streamingMessageContent = document.createElement('div');
                                streamingMessageContent.className = 'message-content streaming-content';
                                streamingMessageContent.style.whiteSpace = 'pre-wrap';
                                streamingMessageContent.style.fontFamily = 'monospace';
                                streamingMessageContent.style.fontSize = '0.9em';

                                bubble.appendChild(streamingMessageContent);
                                wrapper.appendChild(header);
                                wrapper.appendChild(bubble);
                                streamingChatMessage.appendChild(avatar);
                                streamingChatMessage.appendChild(wrapper);
                                chatMessages.appendChild(streamingChatMessage);
                            }

                            // Update streaming chat content
                            if (streamingMessageContent) {
                                streamingMessageContent.textContent = currentStreamContent;
                                smartScrollChat();
                            }



                        } else if (jsonData.type === 'log') {
                            addLog(`[Log] ${jsonData.message}`, 'info');

                            
                        } else if (jsonData.type === 'status') {
                            addLog(`[Status] ${jsonData.message}`, 'info');
                        } else if (jsonData.type === 'research_plan_viz') {
                            // Display research plan visualization
                            addLog('[AGM] Research plan visualization ready', 'success');
                            if (jsonData.viz_id) {
                                displayResearchPlanViz(jsonData.viz_id);
                            }
                        } else if (jsonData.type === 'geoprocessing_workflow_viz') {
                            addLog('[AGM] Geoprocessing workflow visualization ready', 'success');
                            if (jsonData.viz_id) {
                                spatial_analysis_displayWorkflowViz(jsonData.viz_id);
                            }
                        } else if (jsonData.type === 'result') {
                            resultData = jsonData;
                        } else if (jsonData.type === 'complete') {
                            addLog('[System] Code generation complete', 'success');
                        } else if (jsonData.type === 'error') {
                            addLog(`[Error] ${jsonData.error}`, 'error');
                            addChatMessage(`❌ Error: ${jsonData.error}`, 'agm');
                        }
                    } catch (parseError) {
                        console.error('Error parsing SSE:', parseError, msg);
                    }
                }
            }
        }

        // Update status
        if (statusDot) statusDot.className = 'status-dot completed';
        if (statusText) statusText.textContent = 'Ready';

        if (resultData) {
            addLog(`[AGM] Code generated! Operations: ${resultData.operation_count}`, 'success');

            if (streamingChatMessage && streamingMessageContent) {
                // Clear the streaming content
                streamingMessageContent.innerHTML = '';

                // Get the parent bubble to append code display to
                const bubble = streamingMessageContent.parentElement;

                // Add title
                const titleElement = document.createElement('h4');
                titleElement.textContent = 'Generated Code';
                titleElement.style.marginTop = '0';
                bubble.appendChild(titleElement);

                // Code info
                const codeInfo = document.createElement('div');
                codeInfo.style.marginBottom = '10px';
                const codeFileName = resultData.code_file ? getDisplayName(resultData.code_file.split(/[\\/]/).pop()) : 'workflow.py';
                codeInfo.innerHTML = `
                    <p><strong>Operations:</strong> ${resultData.operation_count}</p>
                    <p><strong>Code File:</strong> ${codeFileName}</p>
                `;
                bubble.appendChild(codeInfo);

                // Code display area
                const codeContainer = document.createElement('div');
                codeContainer.id = `code-container-${taskId}`;  // Add ID for overlay management
                codeContainer.style.marginTop = '10px';
                codeContainer.style.marginBottom = '10px';
                codeContainer.style.border = '1px solid #ddd';
                codeContainer.style.borderRadius = '8px';
                codeContainer.style.background = '#f8f9fa';
                codeContainer.style.overflow = 'hidden';
                codeContainer.style.position = 'relative';  // For overlay positioning

                const codeHeader = document.createElement('div');
                codeHeader.style.padding = '10px';
                codeHeader.style.background = '#e9ecef';
                codeHeader.style.borderBottom = '1px solid #ddd';
                codeHeader.style.fontWeight = 'bold';
                codeHeader.textContent = '📄 Generated Python Code';

                const codeDisplay = document.createElement('pre');
                codeDisplay.id = `code-display-${taskId}`;  // Add ID for execution overlay
                codeDisplay.style.margin = '0';
                codeDisplay.style.padding = '15px';
                codeDisplay.style.maxHeight = '400px';
                codeDisplay.style.overflow = 'auto';
                codeDisplay.style.fontSize = '0.85em';
                codeDisplay.style.lineHeight = '1.5';
                codeDisplay.style.background = '#ffffff';
                codeDisplay.textContent = resultData.generated_code;

                codeContainer.appendChild(codeHeader);
                codeContainer.appendChild(codeDisplay);
                bubble.appendChild(codeContainer);

                // Interactive code controls
                const codeControls = document.createElement('div');
                codeControls.className = 'code-controls';
                codeControls.style.marginTop = '15px';
                codeControls.style.padding = '15px';
                codeControls.style.background = '#f9f9f9';
                codeControls.style.borderRadius = '8px';
                codeControls.style.border = '1px solid #e0e0e0';

                const codeControlsTitle = document.createElement('h4');
                codeControlsTitle.textContent = '🔧 Code Actions';
                codeControlsTitle.style.marginTop = '0';
                codeControlsTitle.style.marginBottom = '10px';
                codeControls.appendChild(codeControlsTitle);

                const codeButtonContainer = document.createElement('div');
                codeButtonContainer.style.display = 'flex';
                codeButtonContainer.style.gap = '10px';
                codeButtonContainer.style.marginBottom = '10px';
                codeButtonContainer.style.flexWrap = 'wrap';

                // Download button
                const downloadBtn = document.createElement('button');
                downloadBtn.textContent = '⬇ Download Code';
                downloadBtn.style.padding = '8px 16px';
                downloadBtn.style.background = '#28a745';
                downloadBtn.style.color = 'white';
                downloadBtn.style.border = 'none';
                downloadBtn.style.borderRadius = '4px';
                downloadBtn.style.cursor = 'pointer';
                downloadBtn.style.fontSize = '0.9em';
                downloadBtn.onclick = () => {
                    const blob = new Blob([resultData.generated_code], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `workflow_${taskId}.py`;
                    a.click();
                    URL.revokeObjectURL(url);
                };
                codeButtonContainer.appendChild(downloadBtn);

                // Refine code button
                const refineCodeBtn = document.createElement('button');
                refineCodeBtn.textContent = '✎ Refine Code';
                refineCodeBtn.style.padding = '8px 16px';
                refineCodeBtn.style.background = '#ffc107';
                refineCodeBtn.style.color = '#333';
                refineCodeBtn.style.border = 'none';
                refineCodeBtn.style.borderRadius = '4px';
                refineCodeBtn.style.cursor = 'pointer';
                refineCodeBtn.style.fontSize = '0.9em';
                refineCodeBtn.onclick = () => activateFeedbackMode('code', taskId, null, {
                    code: resultData.generated_code
                });
                codeButtonContainer.appendChild(refineCodeBtn);

                // Copy button
                const copyBtn = document.createElement('button');
                copyBtn.textContent = '📋 Copy Code';
                copyBtn.style.padding = '8px 16px';
                copyBtn.style.background = '#17a2b8';
                copyBtn.style.color = 'white';
                copyBtn.style.border = 'none';
                copyBtn.style.borderRadius = '4px';
                copyBtn.style.cursor = 'pointer';
                copyBtn.style.fontSize = '0.9em';
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(resultData.generated_code);
                    copyBtn.textContent = '✓ Copied!';
                    setTimeout(() => { copyBtn.textContent = '📋 Copy Code'; }, 2000);
                };
                codeButtonContainer.appendChild(copyBtn);

                // Status message area (create before execute button so we can reference it)
                const statusArea = document.createElement('div');
                statusArea.id = `code-status-${taskId}`;
                statusArea.style.marginTop = '10px';
                statusArea.style.padding = '8px';
                statusArea.style.borderRadius = '4px';
                statusArea.style.display = 'none';

                // Execute button
                const executeBtn = document.createElement('button');
                executeBtn.textContent = '▶ Execute Code';
                executeBtn.style.padding = '8px 16px';
                executeBtn.style.background = '#6f42c1';
                executeBtn.style.color = 'white';
                executeBtn.style.border = 'none';
                executeBtn.style.borderRadius = '4px';
                executeBtn.style.cursor = 'pointer';
                executeBtn.style.fontSize = '0.9em';
                executeBtn.onclick = () => executeWorkflowCode(taskId, resultData.generated_code, statusArea);
                codeButtonContainer.appendChild(executeBtn);

                codeControls.appendChild(codeButtonContainer);
                codeControls.appendChild(statusArea);

                bubble.appendChild(codeControls);

                // Success message
                addChatMessage(resultData.message || 'Code generated and executed successfully!', 'agm');

            } else {
                // Fallback if no streaming message exists
                addRichChatMessage(`Generated Code`, {
                    _task_id: taskId,
                    code: resultData.generated_code,
                    operation_count: resultData.operation_count,
                    artifacts: resultData.artifacts
                }, 'agm', 'code');

                addChatMessage(resultData.message || 'Code generated and executed successfully!', 'agm');
            }

            if (resultData.artifacts && resultData.artifacts.length > 0) {
                addLog(`[AGM] Generated ${resultData.artifacts.length} artifact(s)`, 'success');
            }
        }

    } catch (error) {
        addLog(`[Error] ${error.message}`, 'error');
        addChatMessage(`Error: ${error.message}`, 'agm');
        if (statusDot) statusDot.className = 'status-dot error';
        if (statusText) statusText.textContent = 'Error';
    }
}

async function refineWorkflowCode(taskId, feedback, codeDisplay, feedbackInputArea, feedbackTextarea) {
    if (!feedback || feedback.trim() === '') {
        alert('Please enter feedback before submitting');
        return;
    }

    addLog(`[User] Submitting code feedback for workflow: ${taskId}`, 'info');
    addLog(`[User] Feedback: ${feedback}`, 'info');

    // Show loading state
    const statusArea = document.getElementById(`code-status-${taskId}`);
    if (statusArea) {
        statusArea.style.display = 'block';
        statusArea.style.background = '#fff3cd';
        statusArea.style.color = '#856404';
        statusArea.style.border = '1px solid #ffeaa7';
        statusArea.innerHTML = '<strong>⏳ Processing feedback...</strong><br>Refining the code based on your input. This may take a moment.';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/workflow/refine-code/${taskId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ feedback: feedback })
        });

        const data = await response.json();

        if (data.success) {
            addLog(`[AGM] Code refined successfully!`, 'success');

            // Update the code display
            if (codeDisplay) {
                codeDisplay.textContent = data.refined_code;
            }

            // Show success message
            if (statusArea) {
                statusArea.style.background = '#d4edda';
                statusArea.style.color = '#155724';
                statusArea.style.border = '1px solid #c3e6cb';
                statusArea.innerHTML = `<strong>✅ Code Updated!</strong><br>The code has been refined based on your feedback. Review the updated code above.`;
            }

            // Clear and hide feedback input
            feedbackTextarea.value = '';
            feedbackInputArea.style.display = 'none';

            // Add a message to chat
            addChatMessage(`Code refined based on your feedback. Please review the updated code.`, 'agm');

        } else {
            addLog(`[Error] Failed to refine code: ${data.error}`, 'error');
            if (statusArea) {
                statusArea.style.background = '#f8d7da';
                statusArea.style.color = '#721c24';
                statusArea.style.border = '1px solid #f5c6cb';
                statusArea.innerHTML = `<strong>❌ Error</strong><br>${data.error}`;
            }
        }

    } catch (error) {
        addLog(`[Error] ${error.message}`, 'error');
        if (statusArea) {
            statusArea.style.background = '#f8d7da';
            statusArea.style.color = '#721c24';
            statusArea.style.border = '1px solid #f5c6cb';
            statusArea.innerHTML = `<strong>❌ Connection Error</strong><br>${error.message}`;
        }
    }
}

async function executeWorkflowCode(taskId, code, statusArea) {
    addLog(`[User] Executing code for workflow: ${taskId}`, 'info');
    addChatMessage('Executing the generated code. This may take a moment...', 'agm');

    // Find the code display container
    const codeDisplay = document.getElementById(`code-display-${taskId}`);

    // Create or get execution streaming overlay
    let executionOverlay = document.getElementById(`execution-stream-${taskId}`);
    if (!executionOverlay && codeDisplay) {
        executionOverlay = document.createElement('div');
        executionOverlay.id = `execution-stream-${taskId}`;
        executionOverlay.style.cssText = `
            width: 100%;
            height: 100%;
            min-height: 400px;
            background: #f8f9fa;
            border: 2px solid #6f42c1;
            border-radius: 4px;
            padding: 20px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            white-space: pre-wrap;
            word-wrap: break-word;
            box-sizing: border-box;
        `;

        // Insert in the same container as code display
        if (codeDisplay.parentElement) {
            codeDisplay.parentElement.insertBefore(executionOverlay, codeDisplay);
        }
    }

    // Hide code display and show execution overlay
    if (codeDisplay) {
        codeDisplay.style.display = 'none';
    }
    if (executionOverlay) {
        executionOverlay.style.display = 'block';
        executionOverlay.innerHTML = '<div style="color: #6f42c1; font-weight: bold; margin-bottom: 15px; font-size: 1.1em;">⏳ Executing Workflow Code</div><div style="color: #666; font-style: italic;">Running code execution...</div>';
    }

    // Show loading state in status area (secondary)
    if (statusArea) {
        statusArea.style.display = 'block';
        statusArea.style.background = '#fff3cd';
        statusArea.style.color = '#856404';
        statusArea.style.border = '1px solid #ffeaa7';
        statusArea.innerHTML = '<strong>⏳ Executing code...</strong><br>Running the workflow. Please wait.';
    }

    // Set LLM streaming status
    const statusDot = document.getElementById('llm-status-dot');
    const statusText = document.getElementById('llm-status-text');
    const gptStatusDot = document.getElementById('gpt-stream-status-dot');
    const gptStatusText = document.getElementById('gpt-stream-status-text');
    if (statusDot) statusDot.className = 'status-dot running';
    if (statusText) statusText.textContent = 'Executing...';
    if (gptStatusDot) gptStatusDot.className = 'status-dot running';
    if (gptStatusText) gptStatusText.textContent = 'Executing code...';

    // Variables to track streaming content
    let currentStreamContent = '';

    try {
        const streamUrl = `${API_BASE_URL}/api/workflow/execute-code-stream/${taskId}`;
        const response = await fetch(streamUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code: code })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let resultData = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const messages = buffer.split('\n\n');
            buffer = messages.pop() || '';

            for (const msg of messages) {
                if (msg.startsWith('data: ')) {
                    try {
                        const jsonData = JSON.parse(msg.slice(6));

                        if (jsonData.type === 'llm_stream') {
                            // Accumulate streaming content
                            currentStreamContent += jsonData.content;

                            // PRIMARY: Update execution overlay
                            if (executionOverlay) {
                                executionOverlay.innerHTML = `<div style="color: #6f42c1; font-weight: bold; margin-bottom: 15px; font-size: 1.1em;">⏳ ${jsonData.step === 'debugging' ? 'Debugging Code' : 'Executing Code'}</div>${currentStreamContent}`;
                                executionOverlay.scrollTop = executionOverlay.scrollHeight;
                            }

                            // SECONDARY: Also stream to sidebar panels
                            // addLLMResponse(jsonData.content, true);
                        } else if (jsonData.type === 'llm_update') {
                            addLLMResponse(jsonData.content, true);
                            // addLog(`[LLM] ${jsonData.content}`, 'info');

                            // Update execution overlay with status
                            if (executionOverlay) {
                                const streamSection = currentStreamContent ? `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #dee2e6;">${currentStreamContent}</div>` : '';
                                executionOverlay.innerHTML = `<div style="color: #17a2b8; font-weight: bold; margin-bottom: 10px; font-size: 1.05em;">${jsonData.content}</div>${streamSection}`;
                            }
                        } else if (jsonData.type === 'log') {
                            addLog(`[Log] ${jsonData.message}`, 'info');

                        } else if (jsonData.type === 'status') {
                            addLog(`[Status] ${jsonData.message}`, 'info');
                        } else if (jsonData.type === 'research_plan_viz') {
                            // Display research plan visualization
                            addLog('[AGM] Research plan visualization ready', 'success');
                            if (jsonData.viz_id) {
                                displayResearchPlanViz(jsonData.viz_id);
                            }
                        } else if (jsonData.type === 'geoprocessing_workflow_viz') {
                            addLog('[AGM] Geoprocessing workflow visualization ready', 'success');
                            if (jsonData.viz_id) {
                                spatial_analysis_displayWorkflowViz(jsonData.viz_id);
                            }
                        } else if (jsonData.type === 'result') {
                            console.log('[DEBUG] Received result:', jsonData);  // ADD THIS LINE
                            resultData = jsonData;
                        } else if (jsonData.type === 'complete') {
                            addLog('[System] Code execution complete', 'success');
                        } else if (jsonData.type === 'error') {
                            addLog(`[Error] ${jsonData.error}`, 'error');
                            addChatMessage(`❌ Error: ${jsonData.error}`, 'agm');
                        }
                    } catch (parseError) {
                        console.error('Error parsing SSE:', parseError, msg);
                    }
                }
            }
        }

        // Update status
        if (statusDot) statusDot.className = 'status-dot completed';
        if (statusText) statusText.textContent = 'Ready';
        if (gptStatusDot) gptStatusDot.className = 'status-dot success';
        if (gptStatusText) gptStatusText.textContent = 'Complete';

        console.log('[DEBUG] resultData:', resultData);
        console.log('[DEBUG] resultData.success:', resultData?.success);
        if (resultData && resultData.success) {
            console.log('[DEBUG] Entering success block');  // ADD THIS LINE
            addLog(`[AGM] Code executed successfully!`, 'success');

            // Show success message in execution overlay
            if (executionOverlay) {
                executionOverlay.innerHTML = '<div style="color: #28a745; font-weight: bold; font-size: 1.2em; text-align: center; margin-top: 50px;">✅ Code executed successfully!<br><br><span style="font-size: 0.9em;">Showing results...</span></div>';

                // Hide overlay and show code display after a brief moment
                setTimeout(() => {
                    if (executionOverlay) {
                        executionOverlay.style.display = 'none';
                    }
                    if (codeDisplay) {
                        codeDisplay.style.display = 'block';
                    }
                }, 1000);
            }

            // Show success message in status area
            if (statusArea) {
                statusArea.style.background = '#d4edda';
                statusArea.style.color = '#155724';
                statusArea.style.border = '1px solid #c3e6cb';
                statusArea.innerHTML = `<strong>✅ Execution Complete!</strong><br>${resultData.message}`;
            }

            addChatMessage(resultData.message || 'Code executed successfully!', 'agm');

            // Display artifacts if any were generated
            console.log('[DEBUG] Checking artifacts:', resultData.artifacts);  // ADD THIS LINE
            if (resultData.artifacts && resultData.artifacts.length > 0) {
                console.log('[DEBUG] Calling displayArtifacts with', resultData.artifacts.length, 'items');  // ADD THIS LINE
                displayArtifacts(resultData.artifacts);
            }

            // Continue to next step after successful execution
            console.log('[AGM] Code execution complete, continuing to next step...');
            addLog('[AGM] Continuing to next step...', 'info');
            
            // Call continue endpoint to get next step
            const continueUrl = `${API_BASE_URL}/api/workflow/continue/${taskId}`;

            // Variables for streaming chat message
            let continueStreamingContent = '';
            let continueStreamingMessage = null;
            let continueStreamingMessageContent = null;

            // Create EventSource for streaming
            const continueEventSource = new EventSource(continueUrl);

            continueEventSource.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    console.log('[Continue Stream]', data);

                    if (data.type === 'result') {
                        // Next step graph is ready
                        continueEventSource.close();
                        addLog('[AGM] Next step graph ready for review', 'success');

                        // Display the new graph using the same pattern as first step
                        if (data.solution) {
                            const solution = data.solution;
                            const chatMessages = document.getElementById('chat-messages');

                            // If we had a streaming message, convert it to the graph display
                            let bubble;
                            if (continueStreamingMessage && continueStreamingMessageContent) {
                                // Clear streaming content and use that message
                                continueStreamingMessageContent.innerHTML = '';
                                bubble = continueStreamingMessageContent.parentElement;
                            } else {
                                // Create new message for graph
                                const agmMessage = document.createElement('div');
                                agmMessage.className = 'chat-message agm';

                                const avatar = document.createElement('div');
                                avatar.className = 'message-avatar';
                                avatar.innerHTML = '<img src="icon/AGM.png" alt="AGM" class="avatar-img">';

                                const wrapper = document.createElement('div');
                                wrapper.className = 'message-wrapper full-width';

                                const header = document.createElement('div');
                                header.className = 'message-header';
                                const now = new Date();
                                header.innerHTML = `
                                    <span class="message-sender">AGM</span>
                                    <span class="message-time">${now.toLocaleTimeString('en-US', { hour12: false })}</span>
                                `;

                                bubble = document.createElement('div');
                                bubble.className = 'message-bubble';

                                wrapper.appendChild(header);
                                wrapper.appendChild(bubble);
                                agmMessage.appendChild(avatar);
                                agmMessage.appendChild(wrapper);
                                chatMessages.appendChild(agmMessage);
                            }

                            // Create solution info
                            const solutionInfo = document.createElement('div');
                            solutionInfo.innerHTML = `
                                <h4 style="margin-top: 0;">Workflow Graph</h4>
                                <p><strong>Nodes:</strong> ${solution.graph_data.nodes.length}</p>
                                <p><strong>Edges:</strong> ${solution.graph_data.edges.length}</p>
                            `;
                            bubble.appendChild(solutionInfo);

                            // Create graph iframe
                            const graphContainer = document.createElement('div');
                            graphContainer.style.width = '100%';
                            graphContainer.style.height = '500px';
                            graphContainer.style.border = '1px solid #ddd';
                            graphContainer.style.borderRadius = '8px';
                            graphContainer.style.marginTop = '10px';

                            const iframe = document.createElement('iframe');
                            iframe.src = `${API_BASE_URL}/api/graph/${solution._task_id}?v=${Date.now()}`;
                            iframe.style.width = '100%';
                            iframe.style.height = '100%';
                            iframe.style.border = 'none';
                            iframe.id = `graph-iframe-${solution._task_id}`;
                            graphContainer.appendChild(iframe);
                            bubble.appendChild(graphContainer);

                            // Add workflow controls
                            const workflowControls = document.createElement('div');
                            workflowControls.className = 'workflow-controls';
                            workflowControls.style.marginTop = '15px';
                            workflowControls.style.padding = '15px';
                            workflowControls.style.background = '#f9f9f9';
                            workflowControls.style.borderRadius = '8px';
                            workflowControls.style.border = '1px solid #e0e0e0';

                            const controlsTitle = document.createElement('h4');
                            controlsTitle.textContent = '🔧 Interactive Workflow Review';
                            controlsTitle.style.marginTop = '0';
                            controlsTitle.style.marginBottom = '10px';
                            workflowControls.appendChild(controlsTitle);

                            const controlsDescription = document.createElement('p');
                            controlsDescription.textContent = 'Review the workflow above and take action:';
                            controlsDescription.style.fontSize = '0.9em';
                            controlsDescription.style.color = '#666';
                            controlsDescription.style.marginBottom = '10px';
                            workflowControls.appendChild(controlsDescription);

                            const buttonContainer = document.createElement('div');
                            buttonContainer.style.display = 'flex';
                            buttonContainer.style.gap = '10px';
                            buttonContainer.style.marginBottom = '10px';
                            buttonContainer.style.flexWrap = 'wrap';

                            // Approve button
                            const approveBtn = document.createElement('button');
                            approveBtn.textContent = '✓ Approve Workflow';
                            approveBtn.className = 'btn-workflow-approve';
                            approveBtn.style.padding = '8px 16px';
                            approveBtn.style.background = '#28a745';
                            approveBtn.style.color = 'white';
                            approveBtn.style.border = 'none';
                            approveBtn.style.borderRadius = '4px';
                            approveBtn.style.cursor = 'pointer';
                            approveBtn.style.fontSize = '0.9em';
                            approveBtn.onclick = () => approveWorkflow(solution._task_id, workflowControls);
                            buttonContainer.appendChild(approveBtn);

                            // Feedback button
                            const feedbackBtn = document.createElement('button');
                            feedbackBtn.textContent = '✎ Provide Feedback';
                            feedbackBtn.className = 'btn-workflow-feedback';
                            feedbackBtn.style.padding = '8px 16px';
                            feedbackBtn.style.background = '#ffc107';
                            feedbackBtn.style.color = '#333';
                            feedbackBtn.style.border = 'none';
                            feedbackBtn.style.borderRadius = '4px';
                            feedbackBtn.style.cursor = 'pointer';
                            feedbackBtn.style.fontSize = '0.9em';
                            feedbackBtn.onclick = () => activateFeedbackMode('workflow', solution._task_id, iframe, {
                                graph_data: solution.graph_data
                            });
                            buttonContainer.appendChild(feedbackBtn);

                            workflowControls.appendChild(buttonContainer);
                            bubble.appendChild(workflowControls);

                            smartScrollChat();
                        }

                        // Show message to user if provided
                        if (data.response) {
                            addChatMessage(data.response, 'agm');
                        }
                    }
                    else if (data.type === 'llm_stream') {
                        // Show streaming LLM response in chat panel only (not in LLM Live Response)
                        continueStreamingContent += data.content;

                        if (!continueStreamingMessage) {
                            // Create streaming chat message on first chunk
                            const chatMessages = document.getElementById('chat-messages');
                            continueStreamingMessage = document.createElement('div');
                            continueStreamingMessage.className = 'chat-message agm rich-content';

                            const avatar = document.createElement('div');
                            avatar.className = 'message-avatar';
                            avatar.innerHTML = '<img src="icon/AGM.png" alt="AGM" class="avatar-img">';

                            const wrapper = document.createElement('div');
                            wrapper.className = 'message-wrapper full-width';

                            const bubble = document.createElement('div');
                            bubble.className = 'message-bubble';

                            continueStreamingMessageContent = document.createElement('pre');
                            continueStreamingMessageContent.className = 'message-content';
                            continueStreamingMessageContent.style.cssText = 'white-space: pre-wrap; word-wrap: break-word; font-family: monospace; font-size: 0.9em; margin: 0; background: transparent;';

                            bubble.appendChild(continueStreamingMessageContent);
                            wrapper.appendChild(bubble);
                            continueStreamingMessage.appendChild(avatar);
                            continueStreamingMessage.appendChild(wrapper);
                            chatMessages.appendChild(continueStreamingMessage);
                        }

                        // Update streaming content with proper formatting
                        if (continueStreamingMessageContent) {
                            continueStreamingMessageContent.textContent = continueStreamingContent;
                            smartScrollChat();
                        }
                    }
                    else if (data.type === 'llm_update') {
                        addLog(`[AGM] ${data.content}`, 'info');
                        addLLMResponse(data.content, true);
                    }
                    else if (data.type === 'status') {
                        addLog(`[Status] ${data.message}`, 'info');
                    }
                    else if (data.type === 'error') {
                        continueEventSource.close();
                        addLog(`[Error] ${data.message}`, 'error');
                        addChatMessage(`Error continuing workflow: ${data.message}`, 'agm');
                    }

                } catch (parseError) {
                    console.error('Error parsing continue stream:', parseError);
                }
            };
            
            continueEventSource.onerror = function(error) {
                // Only log error if connection wasn't intentionally closed
                if (continueEventSource.readyState !== EventSource.CLOSED) {
                    console.error('[Continue Stream] Error:', error);
                    addLog('[AGM] Error continuing to next step', 'error');
                }
                continueEventSource.close();
            };
        } else if (resultData && !resultData.success) {
            // Execution failed
            addLog(`[AGM] Code execution failed: ${resultData.error}`, 'error');

            // Show error message in execution overlay
            if (executionOverlay) {
                const errorMessage = resultData.error || 'Code execution failed';
                const debugInfo = currentStreamContent ? `<div style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 5px; font-size: 0.9em;"><strong>Debug Information:</strong><br><br>${currentStreamContent}</div>` : '';

                executionOverlay.innerHTML = `<div style="color: #dc3545; font-weight: bold; font-size: 1.2em; text-align: center; margin-top: 30px;">❌ Execution Failed</div>
                    <div style="margin-top: 20px; padding: 15px; background: rgba(220, 53, 69, 0.1); border: 1px solid rgba(220, 53, 69, 0.3); border-radius: 5px;">
                        <strong>Error:</strong><br>
                        <pre style="white-space: pre-wrap; margin-top: 10px;">${errorMessage}</pre>
                    </div>
                    ${debugInfo}
                    <div style="text-align: center; margin-top: 20px; font-size: 0.9em; color: #6c757d;">Showing code in 3 seconds...</div>`;

                // Keep overlay visible longer for errors so user can read them
                setTimeout(() => {
                    if (executionOverlay) {
                        executionOverlay.style.display = 'none';
                    }
                    if (codeDisplay) {
                        codeDisplay.style.display = 'block';
                    }
                }, 3000);
            }

            // Show error message in status area
            if (statusArea) {
                statusArea.style.background = '#f8d7da';
                statusArea.style.color = '#721c24';
                statusArea.style.border = '1px solid #f5c6cb';
                statusArea.innerHTML = `<strong>❌ Execution Failed</strong><br>${resultData.error || 'Unknown error'}`;
            }

            addChatMessage(`Execution failed: ${resultData.error || 'Unknown error'}`, 'agm');

            // ADD THIS: Display artifacts even if execution failed
            console.log('[DEBUG] Checking artifacts after failure:', resultData.artifacts);
            if (resultData.artifacts && resultData.artifacts.length > 0) {
                console.log('[DEBUG] Displaying artifacts despite failure:', resultData.artifacts.length, 'items');
                addChatMessage('⚠️ Files were generated despite the error:', 'agm');
                displayArtifacts(resultData.artifacts);
            }

            
            // Update status indicators
            if (statusDot) statusDot.className = 'status-dot error';
            if (statusText) statusText.textContent = 'Failed';

            // Continue to next step even after failure
            console.log('[AGM] Code execution failed, but attempting to continue to next step...');
            addLog('[AGM] Attempting to continue despite failure...', 'warning');
            addChatMessage('⚠️ Code failed, but continuing to next step...', 'agm');
            
            // Call continue endpoint to get next step
            const continueUrl = `${API_BASE_URL}/api/workflow/continue/${taskId}`;

            // Variables for streaming chat message
            let continueStreamingContent = '';
            let continueStreamingMessage = null;
            let continueStreamingMessageContent = null;

            // Create EventSource for streaming
            const continueEventSource = new EventSource(continueUrl);

            continueEventSource.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    console.log('[Continue Stream]', data);

                    if (data.type === 'result') {
                        // Next step graph is ready
                        continueEventSource.close();
                        addLog('[AGM] Next step graph ready for review', 'success');

                        // Display the new graph using the same pattern as first step
                        if (data.solution) {
                            const solution = data.solution;
                            const chatMessages = document.getElementById('chat-messages');

                            // If we had a streaming message, convert it to the graph display
                            let bubble;
                            if (continueStreamingMessage && continueStreamingMessageContent) {
                                // Clear streaming content and use that message
                                continueStreamingMessageContent.innerHTML = '';
                                bubble = continueStreamingMessageContent.parentElement;
                            } else {
                                // Create new message for graph
                                const agmMessage = document.createElement('div');
                                agmMessage.className = 'chat-message agm';

                                const avatar = document.createElement('div');
                                avatar.className = 'message-avatar';
                                avatar.innerHTML = '<img src="icon/AGM.png" alt="AGM" class="avatar-img">';

                                const wrapper = document.createElement('div');
                                wrapper.className = 'message-wrapper full-width';

                                const header = document.createElement('div');
                                header.className = 'message-header';
                                const now = new Date();
                                header.innerHTML = `
                                    <span class="message-sender">AGM</span>
                                    <span class="message-time">${now.toLocaleTimeString('en-US', { hour12: false })}</span>
                                `;

                                bubble = document.createElement('div');
                                bubble.className = 'message-bubble';

                                wrapper.appendChild(header);
                                wrapper.appendChild(bubble);
                                agmMessage.appendChild(avatar);
                                agmMessage.appendChild(wrapper);
                                chatMessages.appendChild(agmMessage);
                            }

                            // Create solution info
                            const solutionInfo = document.createElement('div');
                            solutionInfo.innerHTML = `
                                <h4 style="margin-top: 0;">Workflow Graph</h4>
                                <p><strong>Nodes:</strong> ${solution.graph_data.nodes.length}</p>
                                <p><strong>Edges:</strong> ${solution.graph_data.edges.length}</p>
                            `;
                            bubble.appendChild(solutionInfo);

                            // Create graph iframe
                            const graphContainer = document.createElement('div');
                            graphContainer.style.width = '100%';
                            graphContainer.style.height = '500px';
                            graphContainer.style.border = '1px solid #ddd';
                            graphContainer.style.borderRadius = '8px';
                            graphContainer.style.marginTop = '10px';

                            const iframe = document.createElement('iframe');
                            iframe.src = `${API_BASE_URL}/api/graph/${solution._task_id}?v=${Date.now()}`;
                            iframe.style.width = '100%';
                            iframe.style.height = '100%';
                            iframe.style.border = 'none';
                            iframe.id = `graph-iframe-${solution._task_id}`;
                            graphContainer.appendChild(iframe);
                            bubble.appendChild(graphContainer);

                            // Add workflow controls
                            const workflowControls = document.createElement('div');
                            workflowControls.className = 'workflow-controls';
                            workflowControls.style.marginTop = '15px';
                            workflowControls.style.padding = '15px';
                            workflowControls.style.background = '#f9f9f9';
                            workflowControls.style.borderRadius = '8px';
                            workflowControls.style.border = '1px solid #e0e0e0';

                            const controlsTitle = document.createElement('h4');
                            controlsTitle.textContent = '🔧 Interactive Workflow Review';
                            controlsTitle.style.marginTop = '0';
                            controlsTitle.style.marginBottom = '10px';
                            workflowControls.appendChild(controlsTitle);

                            const controlsDescription = document.createElement('p');
                            controlsDescription.textContent = 'Review the workflow above and take action:';
                            controlsDescription.style.fontSize = '0.9em';
                            controlsDescription.style.color = '#666';
                            controlsDescription.style.marginBottom = '10px';
                            workflowControls.appendChild(controlsDescription);

                            const buttonContainer = document.createElement('div');
                            buttonContainer.style.display = 'flex';
                            buttonContainer.style.gap = '10px';
                            buttonContainer.style.marginBottom = '10px';
                            buttonContainer.style.flexWrap = 'wrap';

                            // Approve button
                            const approveBtn = document.createElement('button');
                            approveBtn.textContent = '✓ Approve Workflow';
                            approveBtn.className = 'btn-workflow-approve';
                            approveBtn.style.padding = '8px 16px';
                            approveBtn.style.background = '#28a745';
                            approveBtn.style.color = 'white';
                            approveBtn.style.border = 'none';
                            approveBtn.style.borderRadius = '4px';
                            approveBtn.style.cursor = 'pointer';
                            approveBtn.style.fontSize = '0.9em';
                            approveBtn.onclick = () => approveWorkflow(solution._task_id, workflowControls);
                            buttonContainer.appendChild(approveBtn);

                            // Feedback button
                            const feedbackBtn = document.createElement('button');
                            feedbackBtn.textContent = '✎ Provide Feedback';
                            feedbackBtn.className = 'btn-workflow-feedback';
                            feedbackBtn.style.padding = '8px 16px';
                            feedbackBtn.style.background = '#ffc107';
                            feedbackBtn.style.color = '#333';
                            feedbackBtn.style.border = 'none';
                            feedbackBtn.style.borderRadius = '4px';
                            feedbackBtn.style.cursor = 'pointer';
                            feedbackBtn.style.fontSize = '0.9em';
                            feedbackBtn.onclick = () => activateFeedbackMode('workflow', solution._task_id, iframe, {
                                graph_data: solution.graph_data
                            });
                            buttonContainer.appendChild(feedbackBtn);

                            workflowControls.appendChild(buttonContainer);
                            bubble.appendChild(workflowControls);

                            smartScrollChat();
                        }

                        // Show message to user if provided
                        if (data.response) {
                            addChatMessage(data.response, 'agm');
                        }
                    }
                    else if (data.type === 'llm_stream') {
                        // Show streaming LLM response in chat panel only (not in LLM Live Response)
                        continueStreamingContent += data.content;

                        if (!continueStreamingMessage) {
                            // Create streaming chat message on first chunk
                            const chatMessages = document.getElementById('chat-messages');
                            continueStreamingMessage = document.createElement('div');
                            continueStreamingMessage.className = 'chat-message agm rich-content';

                            const avatar = document.createElement('div');
                            avatar.className = 'message-avatar';
                            avatar.innerHTML = '<img src="icon/AGM.png" alt="AGM" class="avatar-img">';

                            const wrapper = document.createElement('div');
                            wrapper.className = 'message-wrapper full-width';

                            const bubble = document.createElement('div');
                            bubble.className = 'message-bubble';

                            continueStreamingMessageContent = document.createElement('div');
                            continueStreamingMessageContent.className = 'message-content streaming-content';
                            continueStreamingMessageContent.style.cssText = 'white-space: pre-wrap; word-wrap: break-word; font-family: monospace; font-size: 0.9em; margin: 0; background: transparent;';

                            continueStreamingMessageContent.style.fontFamily = 'monospace';
                            continueStreamingMessageContent.style.fontSize = '0.9em';

                            bubble.appendChild(continueStreamingMessageContent);
                            wrapper.appendChild(bubble);
                            continueStreamingMessage.appendChild(avatar);
                            continueStreamingMessage.appendChild(wrapper);
                            chatMessages.appendChild(continueStreamingMessage);
                        }

                        // Update streaming content with proper formatting
                        if (continueStreamingMessageContent) {
                            continueStreamingMessageContent.textContent = continueStreamingContent;
                            smartScrollChat();
                        }
                    }
                    else if (data.type === 'llm_update') {
                        addLog(`[AGM] ${data.content}`, 'info');
                        addLLMResponse(data.content, true);
                    }
                    else if (data.type === 'status') {
                        addLog(`[Status] ${data.message}`, 'info');
                    }
                    else if (data.type === 'error') {
                        continueEventSource.close();
                        addLog(`[Error] ${data.message}`, 'error');
                        addChatMessage(`Error continuing workflow: ${data.message}`, 'agm');
                    }

                } catch (parseError) {
                    console.error('Error parsing continue stream:', parseError);
                }
            };
            
            continueEventSource.onerror = function(error) {
                // Only log error if connection wasn't intentionally closed
                if (continueEventSource.readyState !== EventSource.CLOSED) {
                    console.error('[Continue Stream] Error:', error);
                    addLog('[AGM] Error continuing to next step', 'error');
                }
                continueEventSource.close();
            };
        }  // End of failure branch


    } catch (error) {
        addLog(`[Error] ${error.message}`, 'error');

        // Show error in execution overlay
        if (executionOverlay) {
            const debugInfo = currentStreamContent ? `<div style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 5px; font-size: 0.9em;"><strong>Debug Information:</strong><br><br>${currentStreamContent}</div>` : '';

            executionOverlay.innerHTML = `<div style="color: #dc3545; font-weight: bold; font-size: 1.2em; text-align: center; margin-top: 30px;">❌ Error</div>
                <div style="margin-top: 20px; padding: 15px; background: rgba(220, 53, 69, 0.1); border: 1px solid rgba(220, 53, 69, 0.3); border-radius: 5px;">
                    <strong>Error:</strong><br>
                    <pre style="white-space: pre-wrap; margin-top: 10px;">${error.message}</pre>
                </div>
                ${debugInfo}
                <div style="text-align: center; margin-top: 20px; font-size: 0.9em; color: #6c757d;">Showing code in 3 seconds...</div>`;

            // Keep overlay visible longer for errors so user can read them
            setTimeout(() => {
                if (executionOverlay) {
                    executionOverlay.style.display = 'none';
                }
                if (codeDisplay) {
                    codeDisplay.style.display = 'block';
                }
            }, 3000);
        }

        if (statusArea) {
            statusArea.style.background = '#f8d7da';
            statusArea.style.color = '#721c24';
            statusArea.style.border = '1px solid #f5c6cb';
            statusArea.innerHTML = `<strong>❌ Error</strong><br>${error.message}`;
        }
        addChatMessage(`Error: ${error.message}`, 'agm');
        if (statusDot) statusDot.className = 'status-dot error';
        if (statusText) statusText.textContent = 'Error';
        if (gptStatusDot) gptStatusDot.className = 'status-dot error';
        if (gptStatusText) gptStatusText.textContent = 'Error';
    }
}

function displayArtifacts(artifacts) {
    // Store artifacts globally so shapefile components can be found
    window.currentArtifacts = artifacts;

    // Count only visible artifacts (excluding shapefile components)
    const visibleArtifacts = artifacts.filter(a => !a.is_shapefile_component);
    addLog(`[AGM] Displaying ${visibleArtifacts.length} artifact(s)`, 'info');

    // Create artifacts bubble
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble agm-bubble';
    bubble.style.maxWidth = '90%';

    // Create collapsible section wrapper
    const collapsibleSection = document.createElement('div');
    collapsibleSection.className = 'collapsible-section';

    // Create header with toggle button
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'collapsible-section-header';

    const titleElement = document.createElement('h4');
    titleElement.innerHTML = '📦 Task Outputs & Files';
    titleElement.style.color = '#28a745';
    titleElement.style.marginTop = '0';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn-collapse-section';
    toggleBtn.innerHTML = '<span class="section-toggle-icon">▼</span> Collapse';
    toggleBtn.onclick = () => {
        collapsibleSection.classList.toggle('collapsed');
        if (collapsibleSection.classList.contains('collapsed')) {
            toggleBtn.innerHTML = '<span class="section-toggle-icon">▼</span> Expand';
        } else {
            toggleBtn.innerHTML = '<span class="section-toggle-icon">▼</span> Collapse';
        }
    };

    sectionHeader.appendChild(titleElement);
    sectionHeader.appendChild(toggleBtn);

    // Create collapsible content wrapper
    const collapsibleContent = document.createElement('div');
    collapsibleContent.className = 'collapsible-section-content';

    // Artifacts container
    const container = document.createElement('div');
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
    container.style.gap = '15px';

    artifacts.forEach(artifact => {
        // Skip shapefile component files from display (they're auto-loaded with .shp files)
        if (artifact.is_shapefile_component) {
            return;
        }

        const card = document.createElement('div');
        card.style.padding = '12px';
        card.style.border = '1px solid #ddd';
        card.style.borderRadius = '8px';
        card.style.background = '#f8f9fa';
        card.style.cursor = 'pointer';
        card.style.transition = 'all 0.2s';

        card.onmouseover = () => {
            card.style.background = '#e9ecef';
            card.style.transform = 'translateY(-2px)';
            card.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        };
        card.onmouseout = () => {
            card.style.background = '#f8f9fa';
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = 'none';
        };

        // Icon based on file type
        let icon = '📄';
        if (artifact.type === 'png' || artifact.type === 'jpg' || artifact.type === 'jpeg') {
            icon = '🖼️';
        } else if (artifact.type === 'csv') {
            icon = '📊';
        } else if (artifact.type === 'html') {
            icon = '🌐';
        } else if (artifact.type === 'json' || artifact.type === 'geojson') {
            icon = '📋';
        } else if (artifact.type === 'shp' || artifact.type === 'shx' || artifact.type === 'dbf' ||
                   artifact.type === 'prj' || artifact.type === 'cpg' || artifact.type === 'gpkg') {
            icon = '🗺️';
        }

        const iconDiv = document.createElement('div');
        iconDiv.textContent = icon;
        iconDiv.style.fontSize = '2em';
        iconDiv.style.textAlign = 'center';
        iconDiv.style.marginBottom = '8px';
        card.appendChild(iconDiv);

        const filename = document.createElement('div');
        filename.textContent = getDisplayName(artifact.filename);
        filename.style.fontWeight = 'bold';
        filename.style.fontSize = '0.9em';
        filename.style.marginBottom = '5px';
        filename.style.wordBreak = 'break-word';
        card.appendChild(filename);

        const size = document.createElement('div');
        const sizeKB = (artifact.size / 1024).toFixed(1);
        size.textContent = `${sizeKB} KB`;
        size.style.fontSize = '0.8em';
        size.style.color = '#666';
        card.appendChild(size);

        // Click to preview in results section
        card.onclick = () => {
            previewArtifact(artifact);
        };

        container.appendChild(card);
    });

    collapsibleContent.appendChild(container);
    collapsibleSection.appendChild(sectionHeader);
    collapsibleSection.appendChild(collapsibleContent);
    bubble.appendChild(collapsibleSection);

    const chatMessages = document.getElementById('chat-messages');
    chatMessages.appendChild(bubble);
    smartScrollChat();
}

function showImagePreview(filename, url) {
    // Create image preview in chat
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble agm-bubble';
    bubble.style.maxWidth = '90%';

    const title = document.createElement('div');
    title.innerHTML = `<strong>🖼️ ${filename}</strong>`;
    title.style.marginBottom = '10px';
    bubble.appendChild(title);

    const img = document.createElement('img');
    img.src = url;
    img.style.maxWidth = '100%';
    img.style.borderRadius = '8px';
    img.style.border = '1px solid #ddd';
    bubble.appendChild(img);

    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = '⬇ Download';
    downloadBtn.style.marginTop = '10px';
    downloadBtn.style.padding = '8px 16px';
    downloadBtn.style.background = '#28a745';
    downloadBtn.style.color = 'white';
    downloadBtn.style.border = 'none';
    downloadBtn.style.borderRadius = '4px';
    downloadBtn.style.cursor = 'pointer';
    downloadBtn.onclick = () => window.open(url, '_blank');
    bubble.appendChild(downloadBtn);

    const chatMessages = document.getElementById('chat-messages');
    chatMessages.appendChild(bubble);
    smartScrollChat();
}

// Helper function to parse CSV line handling quoted fields
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++; // Skip next quote
            } else {
                // Toggle quote state
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // End of field
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    // Add last field
    result.push(current.trim());

    return result;
}

/**
 * Show step execution output in the Results & Artifacts panel.
 */
function showOutputInResultsPanel(stepIdx, stepDesc, output, status, errorMsg) {
    addLog(`[User] Viewing output for Step ${stepIdx}`, 'info');

    const resultsContent = document.getElementById('results-content-main');
    resultsContent.innerHTML = '';

    const container = document.createElement('div');
    container.style.padding = '15px';
    container.style.height = '100%';
    container.style.overflow = 'auto';

    // Header
    const header = document.createElement('div');
    header.style.marginBottom = '12px';
    header.style.borderBottom = '2px solid #ddd';
    header.style.paddingBottom = '10px';

    const title = document.createElement('h3');
    title.style.margin = '0 0 4px 0';
    title.textContent = `Step ${stepIdx}: ${stepDesc}`;
    header.appendChild(title);

    const badge = document.createElement('span');
    badge.className = `step-result-status ${status === 'completed' ? 'success' : 'error'}`;
    badge.textContent = status === 'completed' ? 'Completed' : 'Error';
    header.appendChild(badge);

    container.appendChild(header);

    // Error if present
    if (errorMsg) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'step-result-error';
        errorDiv.style.marginBottom = '10px';
        errorDiv.textContent = errorMsg;
        container.appendChild(errorDiv);
    }

    // Full output
    const outputPre = document.createElement('pre');
    outputPre.style.background = '#1e1e1e';
    outputPre.style.color = '#d4d4d4';
    outputPre.style.padding = '12px';
    outputPre.style.borderRadius = '6px';
    outputPre.style.fontSize = '0.82em';
    outputPre.style.lineHeight = '1.5';
    outputPre.style.whiteSpace = 'pre-wrap';
    outputPre.style.wordWrap = 'break-word';
    outputPre.style.margin = '0';
    outputPre.textContent = output;
    container.appendChild(outputPre);

    resultsContent.appendChild(container);
}

function previewArtifact(artifact) {
    addLog(`[User] Previewing artifact: ${getDisplayName(artifact.filename)}`, 'info');

    const url = _artifactUrl(artifact);
    const resultsContent = document.getElementById('results-content-main');

    // Clear previous content
    resultsContent.innerHTML = '';

    // Create preview container
    const previewContainer = document.createElement('div');
    previewContainer.style.padding = '20px';
    previewContainer.style.height = '100%';
    previewContainer.style.overflow = 'auto';

    // Header with filename and actions
    const header = document.createElement('div');
    header.style.marginBottom = '15px';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.borderBottom = '2px solid #ddd';
    header.style.paddingBottom = '10px';

    const title = document.createElement('h3');
    title.textContent = artifact.display_title || getDisplayName(artifact.filename);
    title.style.margin = '0';
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '10px';

    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = '⬇ Download';
    downloadBtn.className = 'btn-secondary';
    downloadBtn.onclick = () => window.open(url, '_blank');
    actions.appendChild(downloadBtn);

    header.appendChild(actions);
    previewContainer.appendChild(header);

    // Check if it's a geospatial file
    const geospatialTypes = ['geojson', 'gpkg', 'shp', 'kml'];
    const isGeospatial = geospatialTypes.includes(artifact.type.toLowerCase());

    if (isGeospatial) {
        // Add to map button for geospatial files
        const addToMapBtn = document.createElement('button');
        addToMapBtn.textContent = '🗺️ Add to Map';
        addToMapBtn.className = 'btn-primary';
        addToMapBtn.onclick = () => addArtifactToMap(artifact, url, window.currentArtifacts);
        actions.insertBefore(addToMapBtn, downloadBtn);

        // Show geospatial file info
        const geoInfo = document.createElement('div');
        geoInfo.style.padding = '20px';
        geoInfo.style.background = '#e7f3ff';
        geoInfo.style.borderRadius = '8px';
        geoInfo.style.textAlign = 'center';

        const icon = document.createElement('div');
        icon.textContent = '🗺️';
        icon.style.fontSize = '4em';
        icon.style.marginBottom = '10px';
        geoInfo.appendChild(icon);

        const message = document.createElement('p');
        message.innerHTML = `<strong>Geospatial File Detected</strong><br>Click "Add to Map" to visualize this layer in the map viewer.`;
        geoInfo.appendChild(message);

        previewContainer.appendChild(geoInfo);

    } else if (artifact.type === 'png' || artifact.type === 'jpg' || artifact.type === 'jpeg') {
        // Image preview
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '100%';
        img.style.maxHeight = 'calc(100vh - 200px)';
        img.style.objectFit = 'contain';
        img.style.border = '1px solid #ddd';
        img.style.borderRadius = '8px';
        previewContainer.appendChild(img);

    } else if (artifact.type === 'csv') {
        // CSV preview with data table
        const csvContainer = document.createElement('div');
        csvContainer.style.padding = '0';

        // Loading message
        const loadingMsg = document.createElement('div');
        loadingMsg.textContent = '📊 Loading CSV data...';
        loadingMsg.style.textAlign = 'center';
        loadingMsg.style.padding = '20px';
        loadingMsg.style.color = '#666';
        csvContainer.appendChild(loadingMsg);
        previewContainer.appendChild(csvContainer);

        // Fetch and display CSV data
        fetch(url)
            .then(response => response.text())
            .then(csvText => {
                csvContainer.removeChild(loadingMsg);

                // Parse CSV
                const lines = csvText.trim().split('\n');
                if (lines.length === 0) {
                    csvContainer.innerHTML = '<p style="text-align: center; color: #999;">Empty CSV file</p>';
                    return;
                }

                // Create info section
                const infoDiv = document.createElement('div');
                infoDiv.style.padding = '10px 15px';
                infoDiv.style.background = '#e7f3ff';
                infoDiv.style.borderBottom = '1px solid #ddd';
                infoDiv.innerHTML = `
                    <strong>📊 CSV Data Preview</strong><br>
                    <small style="color: #666;">Rows: ${lines.length - 1} | Size: ${(artifact.size / 1024).toFixed(1)} KB</small>
                `;
                csvContainer.appendChild(infoDiv);

                // Create scrollable table container
                const tableContainer = document.createElement('div');
                tableContainer.style.overflowX = 'auto';
                tableContainer.style.overflowY = 'auto';
                tableContainer.style.maxHeight = 'calc(100vh - 280px)';

                // Create table
                const table = document.createElement('table');
                table.style.width = '100%';
                table.style.borderCollapse = 'collapse';
                table.style.fontSize = '0.9em';

                // Parse header
                const headers = parseCSVLine(lines[0]);
                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');
                headerRow.style.background = '#f8f9fa';
                headerRow.style.position = 'sticky';
                headerRow.style.top = '0';
                headerRow.style.zIndex = '10';

                headers.forEach(header => {
                    const th = document.createElement('th');
                    th.textContent = header;
                    th.style.padding = '10px';
                    th.style.textAlign = 'left';
                    th.style.borderBottom = '2px solid #dee2e6';
                    th.style.background = '#f8f9fa';
                    th.style.fontWeight = 'bold';
                    th.style.whiteSpace = 'nowrap';
                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);
                table.appendChild(thead);

                // Parse data rows (limit to first 1000 rows for performance)
                const tbody = document.createElement('tbody');
                const maxRows = Math.min(lines.length - 1, 1000);

                for (let i = 1; i <= maxRows; i++) {
                    const cells = parseCSVLine(lines[i]);
                    const row = document.createElement('tr');
                    row.style.borderBottom = '1px solid #dee2e6';

                    // Alternate row colors
                    if (i % 2 === 0) {
                        row.style.background = '#f8f9fa';
                    }

                    row.onmouseover = () => row.style.background = '#e9ecef';
                    row.onmouseout = () => row.style.background = i % 2 === 0 ? '#f8f9fa' : 'white';

                    cells.forEach(cell => {
                        const td = document.createElement('td');
                        td.textContent = cell;
                        td.style.padding = '8px 10px';
                        td.style.borderBottom = '1px solid #dee2e6';
                        td.style.whiteSpace = 'nowrap';
                        row.appendChild(td);
                    });
                    tbody.appendChild(row);
                }
                table.appendChild(tbody);

                tableContainer.appendChild(table);
                csvContainer.appendChild(tableContainer);

                // Add note if rows were truncated
                if (lines.length - 1 > 1000) {
                    const note = document.createElement('div');
                    note.style.padding = '10px';
                    note.style.textAlign = 'center';
                    note.style.background = '#fff3cd';
                    note.style.borderTop = '1px solid #ddd';
                    note.style.fontSize = '0.9em';
                    note.style.color = '#856404';
                    note.innerHTML = `⚠️ Showing first 1,000 rows of ${lines.length - 1} total. Download file to see all data.`;
                    csvContainer.appendChild(note);
                }
            })
            .catch(error => {
                csvContainer.innerHTML = `<p style="text-align: center; color: #dc3545; padding: 20px;">Error loading CSV: ${error.message}</p>`;
            });

    } else if (artifact.type === 'html') {
        // HTML preview in iframe
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.width = '100%';
        iframe.style.height = 'calc(100vh - 200px)';
        iframe.style.border = '1px solid #ddd';
        iframe.style.borderRadius = '8px';
        previewContainer.appendChild(iframe);

    } else if (['txt', 'log', 'md', 'json', 'py', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'sh', 'xml', 'js', 'ts', 'css', 'r'].includes((artifact.type || '').toLowerCase())) {
        // Plain-text preview (scripts, logs, configs, etc.)
        const TEXT_PREVIEW_LIMIT = 200 * 1024; // 200 KB

        const loadingMsg = document.createElement('div');
        loadingMsg.textContent = '📄 Loading file...';
        loadingMsg.style.cssText = 'text-align:center;padding:20px;color:#666;';
        previewContainer.appendChild(loadingMsg);

        fetch(url)
            .then(resp => resp.text())
            .then(text => {
                previewContainer.removeChild(loadingMsg);

                const totalBytes = new Blob([text]).size;
                const truncated = totalBytes > TEXT_PREVIEW_LIMIT;
                let display = text;
                if (truncated) {
                    // Truncate by characters as a close proxy for bytes
                    display = text.slice(0, TEXT_PREVIEW_LIMIT) + '\n\n… (truncated)';
                }

                // Pretty-print JSON when possible
                if ((artifact.type || '').toLowerCase() === 'json') {
                    try { display = JSON.stringify(JSON.parse(display), null, 2); } catch (_) { /* leave as-is */ }
                }

                const infoDiv = document.createElement('div');
                infoDiv.style.cssText = 'padding:10px 15px;background:#e7f3ff;border-bottom:1px solid #ddd;';
                infoDiv.innerHTML = `
                    <strong>📄 ${(artifact.type || 'text').toUpperCase()} Preview</strong><br>
                    <small style="color:#666;">Size: ${(artifact.size / 1024).toFixed(1)} KB</small>
                `;
                previewContainer.appendChild(infoDiv);

                const pre = document.createElement('pre');
                pre.textContent = display;
                pre.style.cssText = 'margin:0;padding:14px;background:#f8f9fa;border:1px solid #dee2e6;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:1.45;white-space:pre-wrap;word-break:break-word;max-height:calc(100vh - 260px);overflow:auto;';
                previewContainer.appendChild(pre);

                if (truncated) {
                    const note = document.createElement('div');
                    note.style.cssText = 'padding:10px;text-align:center;background:#fff3cd;border:1px solid #ffeaa7;border-radius:4px;margin-top:10px;font-size:0.9em;color:#856404;';
                    note.innerHTML = `⚠️ Showing first ${(TEXT_PREVIEW_LIMIT / 1024).toFixed(0)} KB of ${(totalBytes / 1024).toFixed(1)} KB. Download to see full file.`;
                    previewContainer.appendChild(note);
                }
            })
            .catch(err => {
                previewContainer.removeChild(loadingMsg);
                const errDiv = document.createElement('div');
                errDiv.style.cssText = 'text-align:center;color:#dc3545;padding:20px;';
                errDiv.textContent = `Error loading file: ${err.message}`;
                previewContainer.appendChild(errDiv);
            });

    } else {
        // Generic file preview
        const fileInfo = document.createElement('div');
        fileInfo.style.padding = '20px';
        fileInfo.style.background = '#f8f9fa';
        fileInfo.style.borderRadius = '8px';
        fileInfo.style.textAlign = 'center';
        fileInfo.innerHTML = `
            <div style="font-size: 3em;">📄</div>
            <p><strong>${getDisplayName(artifact.filename)}</strong></p>
            <p>Type: ${artifact.type.toUpperCase()}</p>
            <p>Size: ${(artifact.size / 1024).toFixed(1)} KB</p>
            <p>Click download to view this file.</p>
        `;
        previewContainer.appendChild(fileInfo);
    }

    resultsContent.appendChild(previewContainer);
}

async function addArtifactToMap(artifact, url, allArtifacts = null) {
    const displayName = getDisplayName(artifact.filename);
    addLog(`[User] Adding ${displayName} to map viewer`, 'info');

    // Ensure map is open and ready
    ensureMapWindowOpen();

    const fileExtension = artifact.type.toLowerCase();

    // Handle different geospatial formats
    if (fileExtension === 'gpkg') {
        // For GeoPackage, fetch as ArrayBuffer and send directly to map
        try {
            addLog(`[Map] Fetching GeoPackage artifact: ${displayName}`, 'info');

            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();

            sendLayerToMapWhenReady({
                id: 'artifact_' + Date.now(),
                name: displayName,
                type: 'geopackage',
                fileType: 'gpkg',
                data: arrayBuffer
            });

            addLog(`[Map] GeoPackage layer added: ${displayName}`, 'success');
            addChatMessage(`Added ${displayName} to map viewer`, 'agm');

        } catch (error) {
            addLog(`[Map] Error loading GeoPackage: ${error.message}`, 'error');
            addChatMessage(`Error loading GeoPackage to map: ${error.message}`, 'agm');
        }
    }
    else if (fileExtension === 'geojson' || fileExtension === 'json') {
        // For GeoJSON, fetch and parse
        try {
            addLog(`[Map] Fetching GeoJSON artifact: ${displayName}`, 'info');

            const response = await fetch(url);
            const geoJSON = await response.json();

            sendLayerToMapWhenReady({
                id: 'artifact_' + Date.now(),
                name: displayName,
                type: 'geojson',
                geoJSON: geoJSON
            });

            addLog(`[Map] GeoJSON layer added: ${displayName}`, 'success');
            addChatMessage(`Added ${displayName} to map viewer`, 'agm');

        } catch (error) {
            addLog(`[Map] Error loading GeoJSON: ${error.message}`, 'error');
            addChatMessage(`Error loading GeoJSON to map: ${error.message}`, 'agm');
        }
    }
    else if (fileExtension === 'shp') {
        // For Shapefile, need to load all component files (.shp, .shx, .dbf, .prj)
        try {
            addLog(`[Map] Preparing shapefile with all components...`, 'info');

            // Find base name (without extension)
            const baseName = artifact.filename.replace(/\.[^/.]+$/, '');

            // Find all related shapefile components if allArtifacts is available
            let componentArtifacts = [];
            if (allArtifacts && Array.isArray(allArtifacts)) {
                const shapefileExtensions = ['shp', 'shx', 'dbf', 'prj', 'cpg'];
                componentArtifacts = allArtifacts.filter(a => {
                    const artifactBaseName = a.filename.replace(/\.[^/.]+$/, '');
                    const artifactExt = a.type.toLowerCase();
                    return artifactBaseName === baseName && shapefileExtensions.includes(artifactExt);
                });
            } else {
                // Fallback: just use the single .shp file
                componentArtifacts = [artifact];
            }

            if (componentArtifacts.length === 0) {
                componentArtifacts = [artifact];
            }

            addLog(`[Map] Loading shapefile with ${componentArtifacts.length} component file(s)`, 'info');

            // Fetch all component files
            const filePromises = componentArtifacts.map(async (compArtifact) => {
                const compUrl = _artifactUrl(compArtifact);
                const response = await fetch(compUrl);
                const arrayBuffer = await response.arrayBuffer();

                // Create File object from ArrayBuffer
                const blob = new Blob([arrayBuffer]);
                return new File([blob], compArtifact.filename, {
                    type: 'application/octet-stream'
                });
            });

            const files = await Promise.all(filePromises);

            // Use the existing shapefile loading function
            loadShapefileComponents(files, baseName);

        } catch (error) {
            addLog(`[Map] Error loading shapefile: ${error.message}`, 'error');
            addChatMessage(`Error loading shapefile to map: ${error.message}`, 'agm');
        }
    }
    else if (fileExtension === 'zip') {
        // For ZIP, fetch as ArrayBuffer
        try {
            addLog(`[Map] Fetching ZIP artifact: ${displayName}`, 'info');

            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();

            sendLayerToMapWhenReady({
                id: 'artifact_' + Date.now(),
                name: displayName,
                type: fileExtension,
                fileType: fileExtension,
                data: arrayBuffer
            });

            addLog(`[Map] ZIP layer added: ${displayName}`, 'success');
            addChatMessage(`Added ${displayName} to map viewer`, 'agm');

        } catch (error) {
            addLog(`[Map] Error loading ZIP: ${error.message}`, 'error');
            addChatMessage(`Error loading ZIP to map: ${error.message}`, 'agm');
        }
    }
    else {
        addLog(`[Map] Unsupported format for map display: ${fileExtension}`, 'warning');
        addChatMessage(`Cannot display ${fileExtension.toUpperCase()} files on map`, 'agm');
    }
}

// Convert artifact GeoPackage via backend
async function convertArtifactGeoPackage(file, layerName) {
    addLog(`[Map] Converting GeoPackage artifact: ${layerName}`, 'info');

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE_URL}/api/convert-geopackage`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Failed to convert GeoPackage');
        }

        if (result.success && result.geojson) {
            addLog(`[Map] GeoPackage converted. Features: ${result.feature_count}`, 'success');

            // Send GeoJSON to map
            sendLayerToMapWhenReady({
                id: 'artifact_' + Date.now(),
                name: layerName,
                type: 'geojson',
                geoJSON: result.geojson
            });

            addChatMessage(`Added ${layerName} to map viewer (${result.feature_count} features)`, 'agm');
        } else {
            throw new Error(result.error || 'Unknown error');
        }

    } catch (error) {
        addLog(`[Map] Error converting GeoPackage: ${error.message}`, 'error');
        addChatMessage(`Error loading GeoPackage: ${error.message}`, 'agm');
        throw error;
    }
}

function downloadWorkflowCode(taskId) {
    addLog(`[User] Downloading code for workflow: ${taskId}`, 'info');

    // Create a hidden link and trigger download
    const downloadUrl = `${API_BASE_URL}/api/workflow/download-code/${taskId}`;
    window.open(downloadUrl, '_blank');

    addLog(`[AGM] Code download started`, 'success');
}

function toggleCodeFeedbackInput(taskId, feedbackInputArea) {
    if (feedbackInputArea.style.display === 'none') {
        feedbackInputArea.style.display = 'block';
        addLog(`[User] Opening code feedback input for workflow: ${taskId}`, 'info');
    } else {
        feedbackInputArea.style.display = 'none';
    }
}

// ==================== End Interactive Workflow Functions ====================


// Resizable Left Sidebar Functionality
(function initResizableLeftSidebar() {
    const divider = document.getElementById("resize-divider-left");
    const leftSidebar = document.getElementById("sidebar-left");
    const mainLayout = document.querySelector(".main-layout");
    const mapIframe = document.getElementById("map-iframe");

    if (!divider || !leftSidebar || !mainLayout) {
        console.warn("Left resize elements not found");
        return;
    }

    let isResizing = false;
    let startX = 0;
    let startSidebarWidth = 0;

    // Function to stop resizing
    const stopResize = function() {
        if (isResizing) {
            isResizing = false;
            document.body.style.userSelect = "";
            document.body.style.cursor = "";

            // Re-enable pointer events on iframe
            if (mapIframe) {
                mapIframe.style.pointerEvents = "";
            }
        }
    };

    divider.addEventListener("mousedown", function(e) {
        isResizing = true;
        startX = e.clientX;
        startSidebarWidth = leftSidebar.offsetWidth;

        // Prevent text selection during drag
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";

        // Disable pointer events on iframe to prevent it from capturing mouse events
        if (mapIframe) {
            mapIframe.style.pointerEvents = "none";
        }

        e.preventDefault();
    });

    document.addEventListener("mousemove", function(e) {
        if (!isResizing) return;

        const deltaX = e.clientX - startX;
        const newSidebarWidth = startSidebarWidth + deltaX;
        const minSidebarWidth = 200; // Minimum left sidebar width
        const maxSidebarWidth = 500; // Maximum left sidebar width

        // Clamp the value to stay within bounds (always update for smooth resizing)
        const clampedWidth = Math.max(minSidebarWidth, Math.min(maxSidebarWidth, newSidebarWidth));
        leftSidebar.style.flex = "0 0 " + clampedWidth + "px";
    });

    // Listen on both document and window to catch all mouseup events
    document.addEventListener("mouseup", stopResize);
    window.addEventListener("mouseup", stopResize);

    // Also stop on mouse leaving the window
    document.addEventListener("mouseleave", stopResize);
})();


// ==================== Map Functions (Embedded) ====================

// Refresh the embedded map
function refreshMap() {
    const mapIframe = document.getElementById('map-iframe');

    if (!mapIframe) {
        addLog('[Map] Map iframe not found', 'error');
        return;
    }

    // Reload the map
    addLog('[Map] Refreshing map viewer...', 'info');
    mapIframe.src = 'map.html';

    // Mark iframe as loading
    mapIframe.dataset.loading = 'true';

    // Wait for iframe to load, then send all current layers
    mapIframe.onload = function() {
        mapIframe.dataset.loading = 'false';
        addLog('[Map] Map refreshed successfully', 'success');

        // Wait a bit for map to fully initialize, then send layers
        setTimeout(() => {
            loadAllLayersToMap();
        }, 500);
    };

    addLog('[User] Refreshed map', 'info');
}

// Initialize embedded map on page load
function initEmbeddedMap() {
    const mapIframe = document.getElementById('map-iframe');

    if (!mapIframe) {
        console.warn('[Map] Map iframe not found during initialization');
        return;
    }

    // Map is already loaded via src attribute in HTML
    // Just set up the onload handler
    mapIframe.onload = function() {
        if (mapIframe.dataset.loading === 'true') {
            return; // Skip if it's a refresh
        }

        addLog('[Map] Map loaded successfully', 'success');

        // Wait a bit for map to fully initialize, then send layers
        setTimeout(() => {
            loadAllLayersToMap();
        }, 500);
    };
}

// Load all current layers from data panel to map
function loadAllLayersToMap() {
    console.log('[DEBUG] loadAllLayersToMap called');
    console.log('[DEBUG] window.loadedLayers:', window.loadedLayers);

    const mapIframe = document.getElementById('map-iframe');

    // First, clear all existing layers from the map
    if (mapIframe && mapIframe.contentWindow) {
        try {
            mapIframe.contentWindow.postMessage({
                type: 'CLEAR_ALL_LAYERS'
            }, '*');
            addLog('[Map] Cleared old layers from map', 'info');
        } catch (error) {
            console.error('Error clearing layers:', error);
        }
    }

    if (!window.loadedLayers || window.loadedLayers.length === 0) {
        addLog('[Map] No layers in data panel to display', 'info');
        return;
    }

    addLog(`[Map] Sending ${window.loadedLayers.length} layer(s) to map...`, 'info');

    // Send each layer to the map by processing the files
    window.loadedLayers.forEach((layerData, index) => {
        const file = layerData.file;
        const layerName = layerData.name;
        const fileExtension = (layerData.fileType || '').toLowerCase();

        console.log(`[DEBUG] Processing layer: ${layerName}, type: ${fileExtension}`);
        addLog(`[Map] Processing layer: ${layerName} (${fileExtension})`, 'info');

        // Determine file type and load accordingly
        // Check if it's a GeoJSON file
        if (fileExtension === 'geojson' || fileExtension === 'json' || fileExtension === 'application/json') {
            // Load GeoJSON
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const content = e.target.result;
                    const geoJSON = JSON.parse(content);

                    addLog(`[Map] Sending GeoJSON layer: ${layerName}`, 'success');
                    sendLayerToMapWhenReady({
                        id: 'layer_' + layerName + '_' + index,
                        name: layerName,
                        type: 'geojson',
                        geoJSON: geoJSON
                    });
                } catch (error) {
                    addLog(`[Map] Error loading layer ${layerName}: ${error.message}`, 'error');
                }
            };
            reader.readAsText(file);
        }
        // Check if it's a ZIP file (including all ZIP mime types and shapefiles)
        else if (fileExtension === 'zip' ||
                 fileExtension === 'shp' ||
                 fileExtension === 'application/zip' ||
                 fileExtension === 'application/x-zip-compressed' ||
                 fileExtension.includes('zip')) {
            // Load as zip/binary file (will be processed as shapefile)
            const reader = new FileReader();
            reader.onload = function(e) {
                const arrayBuffer = e.target.result;

                addLog(`[Map] Sending ZIP/Shapefile layer: ${layerName}`, 'success');
                sendLayerToMapWhenReady({
                    id: 'layer_' + layerName + '_' + index,
                    name: layerName,
                    type: 'zip',
                    fileType: 'zip',
                    data: arrayBuffer
                });
            };
            reader.readAsArrayBuffer(file);
        }
        // Check if it's a GeoPackage file
        else if (fileExtension === 'gpkg' ||
                 fileExtension === 'geopackage' ||
                 fileExtension.includes('geopackage')) {
            // Read GeoPackage as ArrayBuffer and send to map for client-side processing
            const reader = new FileReader();
            reader.onload = function(e) {
                const arrayBuffer = e.target.result;

                addLog(`[Map] Sending GeoPackage layer: ${layerName}`, 'success');
                sendLayerToMapWhenReady({
                    id: 'layer_' + layerName + '_' + index,
                    name: layerName,
                    type: 'geopackage',
                    fileType: 'gpkg',
                    data: arrayBuffer
                });
            };
            reader.readAsArrayBuffer(file);
        }
        // Check if it's a shapefile with components
        else if (fileExtension === 'shapefile' && layerData.shapefileData) {
            addLog(`[Map] Sending shapefile components layer: ${layerName}`, 'success');
            sendLayerToMapWhenReady({
                id: 'layer_' + layerName + '_' + index,
                name: layerName,
                type: 'shapefile-components',
                shapefileData: layerData.shapefileData
            });
        }
        else {
            addLog(`[Map] Skipping unsupported file type for layer ${layerName}: ${fileExtension}`, 'warning');
        }
    });
}

// closeMapWindow - No longer needed (map is now embedded)

// Send layer data to map window
function sendLayerToMap(layerData) {
    const mapIframe = document.getElementById('map-iframe');

    if (mapIframe && mapIframe.contentWindow) {
        mapIframe.contentWindow.postMessage({
            type: 'ADD_LAYER',
            layer: layerData
        }, '*');

        addLog(`[Map] Layer sent to map: ${layerData.name || 'Unnamed'}`, 'info');
    }
}

// ==================== End Map Functions ====================

// Map modal resize and drag functionality removed (map is now embedded)
// Initialize embedded map on page load
document.addEventListener('DOMContentLoaded', () => {
    initEmbeddedMap();

    // Sync settings intent-mode radios with inline pill label
    document.querySelectorAll('input[name="intent-mode"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const modeLabel = getModeDisplayName(this.value);
            const pillLabel = document.getElementById('mode-selector-label');
            if (pillLabel) pillLabel.textContent = modeLabel;
            const dropdownName = document.getElementById('mode-dropdown-mode-name');
            if (dropdownName) dropdownName.textContent = modeLabel;
        });
    });

    // Sync settings model-select with model button label and reasoning effort
    const modelSelect = document.getElementById('model-select');
    if (modelSelect) {
        modelSelect.addEventListener('change', function() {
            const modelBtnLabel = document.getElementById('model-selector-label');
            if (modelBtnLabel) modelBtnLabel.textContent = this.options[this.selectedIndex].text;
            updateReasoningEffortOptions(this.value);
        });
        // Initialize reasoning effort on page load
        updateReasoningEffortOptions(modelSelect.value);
    }

    // Initialize autonomous toggle state based on current mode
    const currentMode = document.querySelector('input[name="intent-mode"]:checked');
    updateAutonomousToggleState(currentMode ? currentMode.value : 'research');
});

// Old map modal resize code removed - no longer needed
/*
document.addEventListener('DOMContentLoaded', () => {
    const mapModalContent = document.getElementById('map-modal-content');
    if (!mapModalContent) return;

    const resizeHandles = mapModalContent.querySelectorAll('.map-resize-handle');

    let isResizing = false;
    let currentHandle = null;
    let startX, startY, startWidth, startHeight, startLeft, startTop;

    resizeHandles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            isResizing = true;
            currentHandle = handle;

            startX = e.clientX;
            startY = e.clientY;

            const rect = mapModalContent.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            startLeft = rect.left;
            startTop = rect.top;

            // Ensure modal is positioned absolutely
            if (!mapModalContent.style.left) {
                mapModalContent.style.left = startLeft + 'px';
                mapModalContent.style.top = startTop + 'px';
            }

            document.body.style.cursor = window.getComputedStyle(handle).cursor;
            document.body.style.userSelect = 'none';
        });
    });

    const handleMouseMove = (e) => {
        if (!isResizing || !currentHandle) return;

        e.preventDefault();
        e.stopPropagation();

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        const handleClass = currentHandle.className.replace('map-resize-handle ', '').trim();
        const appContainer = document.querySelector('.app-container');

        let newWidth = startWidth;
        let newHeight = startHeight;
        let newLeft = parseFloat(mapModalContent.style.left) || startLeft;
        let newTop = parseFloat(mapModalContent.style.top) || startTop;

        // Check if docked
        const isDockedLeft = mapModalContent.classList.contains('docked-left');
        const isDockedRight = mapModalContent.classList.contains('docked-right');
        const isDockedBottom = mapModalContent.classList.contains('docked-bottom');

        // Handle horizontal resizing
        if (handleClass.includes('right')) {
            if (isDockedLeft) {
                // Resizing docked-left map: adjust width and app-container margin
                const currentWidthPx = startWidth + deltaX;
                const newWidthVw = Math.max(15, Math.min(80, (currentWidthPx / window.innerWidth) * 100));
                mapModalContent.style.width = newWidthVw + 'vw';
                if (appContainer) {
                    appContainer.style.marginLeft = newWidthVw + 'vw';
                }
            } else {
                newWidth = Math.max(400, Math.min(window.innerWidth * 0.98, startWidth + deltaX));
            }
        } else if (handleClass.includes('left')) {
            if (isDockedRight) {
                // Resizing docked-right map: adjust width and app-container margin
                // Calculate new width: dragging left increases width, dragging right decreases width
                const currentWidthPx = startWidth - deltaX;
                const newWidthVw = Math.max(15, Math.min(80, (currentWidthPx / window.innerWidth) * 100));
                mapModalContent.style.width = newWidthVw + 'vw';
                if (appContainer) {
                    appContainer.style.marginRight = newWidthVw + 'vw';
                }
            } else {
                const widthChange = startWidth - deltaX;
                if (widthChange >= 400 && widthChange <= window.innerWidth * 0.98) {
                    newWidth = widthChange;
                    newLeft = startLeft + deltaX;
                }
            }
        }

        // Handle vertical resizing
        if (handleClass.includes('bottom')) {
            newHeight = Math.max(300, Math.min(window.innerHeight * 0.98, startHeight + deltaY));
        } else if (handleClass.includes('top')) {
            if (isDockedBottom) {
                // Resizing docked-bottom map: adjust height and app-container height
                const newHeightVh = Math.max(20, Math.min(80, ((startHeight - deltaY) / window.innerHeight) * 100));
                newHeight = (newHeightVh / 100) * window.innerHeight;
                mapModalContent.style.height = newHeightVh + 'vh';
                if (appContainer) {
                    const appHeightVh = 100 - newHeightVh;
                    appContainer.style.height = appHeightVh + 'vh';
                    appContainer.style.maxHeight = appHeightVh + 'vh';
                }
            } else {
                const heightChange = startHeight - deltaY;
                if (heightChange >= 300 && heightChange <= window.innerHeight * 0.98) {
                    newHeight = heightChange;
                    newTop = startTop + deltaY;
                }
            }
        }

        // Only update width/height if not docked (docked uses vw/vh set above)
        if (!isDockedLeft && !isDockedRight && !isDockedBottom) {
            mapModalContent.style.width = newWidth + 'px';
            mapModalContent.style.height = newHeight + 'px';
            mapModalContent.style.left = newLeft + 'px';
            mapModalContent.style.top = newTop + 'px';
        }
    };

    const stopResizing = () => {
        if (isResizing) {
            isResizing = false;
            currentHandle = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);

    // Also stop resizing when mouse leaves the window
    document.addEventListener('mouseleave', stopResizing);
    window.addEventListener('blur', stopResizing);
});

// Make map window draggable by header
document.addEventListener('DOMContentLoaded', () => {
    const mapModal = document.getElementById('map-modal-content');
    const mapHeader = document.querySelector('.map-modal-header');

    let isDragging = false;
    let currentX, currentY, initialX, initialY;

    mapHeader.addEventListener('mousedown', (e) => {
        // Don't drag if clicking the close button or dock buttons
        if (e.target.classList.contains('map-close-btn') || e.target.closest('.map-close-btn') ||
            e.target.classList.contains('map-dock-btn') || e.target.closest('.map-dock-btn')) {
            return;
        }

        // Don't drag if docked
        if (mapModal.classList.contains('docked')) {
            return;
        }

        isDragging = true;
        initialX = e.clientX - (parseInt(mapModal.style.left) || 0);
        initialY = e.clientY - (parseInt(mapModal.style.top) || 0);

        mapHeader.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        mapModal.style.position = 'absolute';
        mapModal.style.left = currentX + 'px';
        mapModal.style.top = currentY + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            mapHeader.style.cursor = 'grab';
        }
    });

    // Set initial cursor
    mapHeader.style.cursor = 'grab';
});

// Dock map window to sides
function dockMap(position) {
    const mapModal = document.getElementById('map-modal');
    const mapModalContent = document.getElementById('map-modal-content');
    const appContainer = document.querySelector('.app-container');
    if (!mapModalContent || !mapModal || !appContainer) return;

    // Remove all docking classes from map
    mapModalContent.classList.remove('docked', 'docked-left', 'docked-right', 'docked-bottom');

    // Remove all docking classes from app container
    appContainer.classList.remove('map-docked-left', 'map-docked-right', 'map-docked-bottom');

    if (position === 'undock') {
        // Reset to floating/centered state
        mapModalContent.style.left = '';
        mapModalContent.style.top = '';
        mapModalContent.style.right = '';
        mapModalContent.style.bottom = '';
        mapModalContent.style.width = '55vw';
        mapModalContent.style.height = '55vh';

        // Reset app container inline styles
        appContainer.style.marginLeft = '';
        appContainer.style.marginRight = '';
        appContainer.style.height = '';
        appContainer.style.maxHeight = '';

        // Remove docked mode from backdrop (restore overlay)
        mapModal.classList.remove('docked-mode');

        addLog('[Map] Map window undocked (floating)', 'info');
    } else {
        // Apply docking class to map
        mapModalContent.classList.add('docked', `docked-${position}`);

        // Set initial sizes and positions with inline styles for resizability
        if (position === 'left') {
            mapModalContent.style.left = '0';
            mapModalContent.style.top = '0';
            mapModalContent.style.width = '20vw';
            mapModalContent.style.height = '100vh';
            appContainer.style.marginLeft = '40vw';
        } else if (position === 'right') {
            mapModalContent.style.right = '0';
            mapModalContent.style.left = 'auto';
            mapModalContent.style.top = '0';
            mapModalContent.style.width = '20vw';
            mapModalContent.style.height = '100vh';
            appContainer.style.marginRight = '20vw';
        } else if (position === 'bottom') {
            mapModalContent.style.left = '0';
            mapModalContent.style.right = '0';
            mapModalContent.style.bottom = '0';
            mapModalContent.style.top = 'auto';
            mapModalContent.style.width = '100vw';
            mapModalContent.style.height = '40vh';
            appContainer.style.height = '60vh';
            appContainer.style.maxHeight = '60vh';
        }

        // Add docked mode to backdrop (make it transparent and non-blocking)
        mapModal.classList.add('docked-mode');

        // Adjust app container layout to make room for docked map
        appContainer.classList.add(`map-docked-${position}`);

        addLog(`[Map] Map window docked to ${position}`, 'info');
    }
}
*/

// ==================== Figure Catalog Display ====================

function displayFigureCatalog(figures, stepTag) {
    addLog(`[AGM] Figure catalog ready: ${figures.length} figure(s)`, 'info');

    const phase = stepTag ? _getPhase(stepTag) : 'ra_figures';
    const cardPhase = phase || 'ra_figures';

    // Find the card
    let card = _wfCardsContainer
        ? _wfCardsContainer.querySelector(`#wf-card-${cardPhase}`)
        : null;
    if (!card) {
        card = document.getElementById(`wf-card-${cardPhase}`);
    }
    if (!card) return;

    // Update card heading to "Figure Catalog Completed"
    const statusEl = card.querySelector('.wf-card-status');
    if (statusEl) statusEl.textContent = 'Figure Catalog Completed';

    // Mark card as completed
    card.classList.remove('active');
    card.classList.add('completed');
    const spinner = card.querySelector('.step-spinner');
    if (spinner) spinner.style.display = 'none';
    const check = card.querySelector('.step-check');
    if (check) check.style.display = '';

    // Get or create body
    let body = card.querySelector('.wf-card-body');
    if (!body) {
        body = document.createElement('div');
        body.className = 'wf-card-body';
        card.appendChild(body);
        _makeCardCollapsible(card);
    }

    // Keep expanded so user sees the figures
    card.dataset.keepExpanded = 'true';

    // Clear any streaming text AND any previously-rendered catalog so a rerun
    // replaces the grid instead of stacking a duplicate underneath.
    body.querySelectorAll('.wf-stream-log, .step-result-artifacts-grid, .figure-catalog-empty').forEach(el => el.remove());

    if (figures.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'figure-catalog-empty';
        msg.style.cssText = 'color: var(--text-secondary); font-style: italic; margin: 8px 0;';
        msg.textContent = 'No figures generated.';
        body.appendChild(msg);
        return;
    }

    // Build small artifact tiles (same style as step result tiles)
    const grid = document.createElement('div');
    grid.className = 'step-result-artifacts-grid';

    figures.forEach(fig => {
        const tile = document.createElement('div');
        tile.className = 'step-artifact-card';

        const filename = fig.relative_path.split('/').pop();
        const displayName = filename.length > 18 ? filename.substring(0, 15) + '...' : filename;

        // Pick icon + preview type from v2 `kind` (figure | table | data_to_viz).
        // Fall back to the file extension when kind is missing (legacy payloads).
        const ext = (filename.split('.').pop() || '').toLowerCase();
        const kind = fig.kind || (
            ['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp', 'tif', 'tiff'].includes(ext) ? 'figure' :
            ['csv', 'tsv', 'xlsx', 'xls', 'parquet'].includes(ext) ? 'table' :
            ['gpkg', 'shp', 'geojson'].includes(ext) ? 'data_to_viz' : 'figure'
        );
        const icon = kind === 'table' ? '📊'
                   : kind === 'data_to_viz' ? '🗺️'
                   : '🖼️';
        const label = kind === 'table' ? 'Table'
                    : 'Figure';
        const previewType = ext || (kind === 'table' ? 'csv' : 'png');

        tile.innerHTML = `
            <span class="artifact-icon">${icon}</span>
            <span class="artifact-name" title="${label} ${fig.figure_number}: ${fig.caption || fig.description || filename}">${displayName}</span>
            <span class="artifact-size">${label === 'Table' ? 'Tbl' : 'Fig'} ${fig.figure_number}</span>
        `;

        tile.addEventListener('click', () => {
            previewArtifact({
                filename: filename,
                relative_path: fig.relative_path,
                type: previewType,
                size: 0,
                display_title: `${label} ${fig.figure_number}: ${fig.caption || fig.description || filename}`,
            });
        });

        grid.appendChild(tile);
    });

    body.appendChild(grid);

    // Expand card
    card.classList.remove('collapsed');
    const toggleEl = card.querySelector('.wf-card-toggle');
    if (toggleEl) toggleEl.innerHTML = '&#9660;';

    smartScrollChat();
}

// ==================== Execution Flowchart Display ====================

function displayExecutionFlowchart(relativePath, stepTag) {
    addLog('[AGM] Displaying execution flowchart...', 'info');
    console.log('[displayExecutionFlowchart] relativePath:', relativePath, 'stepTag:', stepTag);

    // Find the workflow card for this step
    const phase = stepTag ? _getPhase(stepTag) : _wfCurrentPhase;
    const cardPhase = phase || _wfCurrentPhase;
    console.log('[displayExecutionFlowchart] phase:', phase, 'cardPhase:', cardPhase, '_wfCardsContainer:', !!_wfCardsContainer);
    if (!cardPhase) {
        console.warn('[displayExecutionFlowchart] EARLY RETURN: no cardPhase');
        return;
    }
    // Try the live container first, then fall back to DOM-wide search
    // (handles the case where finalizeAllWorkflowCards already cleared _wfCardsContainer)
    let card = _wfCardsContainer
        ? _wfCardsContainer.querySelector(`#wf-card-${cardPhase}`)
        : null;
    if (!card) {
        card = document.getElementById(`wf-card-${cardPhase}`);
    }
    if (!card) {
        console.warn('[displayExecutionFlowchart] EARLY RETURN: card not found for phase', cardPhase);
        return;
    }
    console.log('[displayExecutionFlowchart] card found, adding iframe');

    let body = card.querySelector('.wf-card-body');
    if (!body) {
        body = document.createElement('div');
        body.className = 'wf-card-body';
        card.appendChild(body);
        _makeCardCollapsible(card);
    }
    body.classList.add('step-result-body');

    // Keep this card expanded — it has visual content the user should see
    card.dataset.keepExpanded = 'true';

    // Wrap any raw streaming text first
    const rawText = body.textContent.trim();
    if (rawText && !body.querySelector('.wf-stream-log') && !body.querySelector('.wf-stream-status')) {
        const pre = document.createElement('pre');
        pre.className = 'wf-stream-log';
        pre.textContent = rawText;
        body.innerHTML = '';
        body.appendChild(pre);
    }

    // Embed container
    const container = document.createElement('div');
    container.className = 'ra-embed-section';

    // Iframe
    const iframeContainer = document.createElement('div');
    iframeContainer.style.cssText = 'width: 100%; height: 500px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; margin-top: 6px;';

    const url = `${API_BASE_URL}/api/artifacts/${_encodeArtifactPath(_normalizeRelPath(relativePath))}?v=${Date.now()}`;
    console.log('[displayExecutionFlowchart] iframe url:', url);
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
    iframeContainer.appendChild(iframe);
    container.appendChild(iframeContainer);

    // Action buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.style.cssText = 'margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap;';

    const openBtn = document.createElement('button');
    openBtn.textContent = '↗ Open in New Tab';
    openBtn.className = 'btn-secondary';
    openBtn.style.padding = '6px 12px';
    openBtn.style.fontSize = '0.82em';
    openBtn.onclick = () => window.open(url, '_blank');
    actionsDiv.appendChild(openBtn);

    const fullViewBtn = document.createElement('button');
    fullViewBtn.innerHTML = '&#11036; Full View';
    fullViewBtn.className = 'btn-secondary';
    fullViewBtn.style.padding = '6px 12px';
    fullViewBtn.style.fontSize = '0.82em';
    fullViewBtn.onclick = () => openIframeFullView(url, 'Execution Flowchart');
    actionsDiv.appendChild(fullViewBtn);

    const viewInPanelBtn = document.createElement('button');
    viewInPanelBtn.textContent = '📋 Results Panel';
    viewInPanelBtn.className = 'btn-secondary';
    viewInPanelBtn.style.padding = '6px 12px';
    viewInPanelBtn.style.fontSize = '0.82em';
    viewInPanelBtn.onclick = () => {
        previewArtifact({
            filename: 'execution_flowchart.html',
            relative_path: relativePath,
            type: 'html',
            size: 0,
        });
    };
    actionsDiv.appendChild(viewInPanelBtn);

    container.appendChild(actionsDiv);
    body.appendChild(container);

    // Expand card
    card.classList.remove('collapsed');
    const toggleEl = card.querySelector('.wf-card-toggle');
    if (toggleEl) toggleEl.innerHTML = '&#9660;';

    // Iframe is now attached — the card's work is done. Finalize it so
    // the header spinner stops and the check mark replaces it. Without
    // this, "Generating execution flowchart..." keeps spinning forever.
    try { if (typeof _finalizeCard === 'function') _finalizeCard(cardPhase); } catch {}

    const chatMessages = document.getElementById('chat-messages');
    smartScrollChat();
}

// ==================== Result Presentation & Discussion Display ====================

/**
 * Display a markdown result document (presentation or discussion) in the chat.
 * @param {string} title - Display title (e.g. "Result Presentation")
 * @param {string} icon - Emoji icon
 * @param {string} markdownContent - Raw markdown string
 * @param {string} relativePath - Relative path for download (optional)
 */

/**
 * Rewrite image src attributes in rendered HTML so local/filename-only
 * paths are served through the /api/artifacts/ endpoint.
 */
function _fixResultImages(container) {
    const tid = window._completedTaskId || '';
    container.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || '';
        if (!src || src.startsWith('http') || src.startsWith('data:') || src.startsWith('/api/')) return;

        // Absolute Windows path: C:/Users/.../Outputs/task_id/figures/file.png
        // Extract everything after the Outputs/ folder
        const outputsMatch = src.match(/[Oo]utputs?[/\\](.+)/);
        if (outputsMatch) {
            img.src = `${API_BASE_URL}/api/artifacts/${outputsMatch[1].replace(/\\/g, '/')}`;
            return;
        }

        // Filename only (e.g. "obj4_s7_map.png") — resolve via task_id/figures/
        if (!src.includes('/') && !src.includes('\\')) {
            const prefix = tid ? `${tid}/figures/` : 'figures/';
            img.src = `${API_BASE_URL}/api/artifacts/${prefix}${src}`;
            return;
        }

        // Relative path — serve as-is through artifacts API
        img.src = `${API_BASE_URL}/api/artifacts/${src.replace(/\\/g, '/')}`;
    });
}

function displayMarkdownResult(title, icon, markdownContent, relativePath, stepTag) {
    addLog(`[AGM] Displaying ${title}...`, 'info');

    // Find the workflow card for this step
    const phase = stepTag ? _getPhase(stepTag) : _wfCurrentPhase;
    const cardPhase = phase || _wfCurrentPhase;
    if (!cardPhase) return;
    // Ensure the cards container exists, and create the target card on the
    // fly if it wasn't pre-created by a streaming event. This happens for
    // ms_assemble during manuscript rerun when `manuscript_complete`
    // arrives before any ms_assemble-tagged stream/status event.
    _ensureCardsContainer();
    let card = _wfCardsContainer.querySelector(`#wf-card-${cardPhase}`);
    if (!card) {
        updateWorkflowCard(_prettyPhaseLabel(cardPhase, title) || title, cardPhase);
        card = _wfCardsContainer.querySelector(`#wf-card-${cardPhase}`);
        if (!card) return;
    }

    // Reset the header status to the pretty label when a manuscript section
    // finishes rendering (clears any "Rerunning X..." status left by
    // _focusRerunSection).
    if (_MS_PHASE_LABELS[cardPhase]) {
        const statusEl = card.querySelector('.wf-card-status');
        if (statusEl) statusEl.textContent = _MS_PHASE_LABELS[cardPhase];
    }

    let body = card.querySelector('.wf-card-body');
    if (!body) {
        body = document.createElement('div');
        body.className = 'wf-card-body';
        card.appendChild(body);
        _makeCardCollapsible(card);
    }
    body.classList.add('step-result-body');

    // The raw markdown was streamed token-by-token into this body (showing ## etc as plain text).
    // Now that we have the full rendered version, clear out the raw streaming text entirely.
    body.innerHTML = '';

    // Embed container
    const container = document.createElement('div');
    container.className = 'ra-embed-section';

    // Title + collapse toggle
    const titleSection = document.createElement('div');
    titleSection.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; margin-top: 8px;';
    titleSection.innerHTML = `
        <h4 style="margin: 0; display: flex; align-items: center; gap: 8px; font-size: 0.95em;">
            <span>${icon}</span> ${title}
        </h4>
    `;
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = 'Collapse';
    toggleBtn.className = 'btn-secondary';
    toggleBtn.style.cssText = 'padding: 3px 10px; font-size: 0.78em;';
    titleSection.appendChild(toggleBtn);
    container.appendChild(titleSection);

    // Rendered markdown content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'result-markdown-content';
    contentDiv.style.cssText = 'max-height: 500px; overflow: auto; border: 1px solid #ddd; border-radius: 8px; padding: 12px;';
    if (window.marked) {
        contentDiv.innerHTML = marked.parse(markdownContent);
        _fixResultImages(contentDiv);
        contentDiv.querySelectorAll('pre code').forEach(block => {
            if (window.hljs) hljs.highlightElement(block);
        });
    } else {
        const pre = document.createElement('pre');
        pre.style.cssText = 'white-space: pre-wrap; word-wrap: break-word; font-size: 0.9em;';
        pre.textContent = markdownContent;
        contentDiv.appendChild(pre);
    }
    container.appendChild(contentDiv);

    // Action buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.style.cssText = 'margin-top: 6px; display: flex; gap: 8px; flex-wrap: wrap;';

    if (relativePath) {
        // Determine report type from the title
        const lowerTitle = title.toLowerCase();
        const reportType = lowerTitle.includes('manuscript') ? 'manuscript'
            : lowerTitle.includes('discussion') ? 'discussion' : 'presentation';

        // Download dropdown container
        const downloadWrapper = document.createElement('div');
        downloadWrapper.style.cssText = 'position: relative; display: inline-block;';

        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = '⬇ Download ▾';
        downloadBtn.className = 'btn-secondary';
        downloadBtn.style.cssText = 'padding: 6px 12px; font-size: 0.82em;';

        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'download-format-dropdown';
        dropdownMenu.style.cssText = 'display: none; position: absolute; bottom: 100%; left: 0; margin-bottom: 4px; background: #fff; border: 1px solid #ddd; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 100; min-width: 150px; overflow: hidden;';

        const formats = [
            { label: 'Markdown (.md)', fmt: 'md', icon: '📝' },
            { label: 'Word (.docx)', fmt: 'docx', icon: '📄' },
            // PDF disabled for the manuscript report (per user preference);
            // presentation/discussion reports keep it.
            ...(reportType === 'manuscript' ? [] : [{ label: 'PDF (.pdf)', fmt: 'pdf', icon: '📕' }]),
        ];

        formats.forEach(({ label, fmt, icon }) => {
            const item = document.createElement('div');
            item.textContent = `${icon} ${label}`;
            item.style.cssText = 'padding: 8px 14px; cursor: pointer; font-size: 0.85em; transition: background 0.15s;';
            item.onmouseenter = () => { item.style.background = '#f0f4ff'; };
            item.onmouseleave = () => { item.style.background = ''; };
            item.onclick = (e) => {
                e.stopPropagation();
                dropdownMenu.style.display = 'none';
                const _tid = _activeTaskId();
                window.open(`${API_BASE_URL}/api/report-download/${reportType}/${fmt}${_tid ? '?task_id=' + _tid : ''}`, '_blank');
            };
            dropdownMenu.appendChild(item);
        });

        downloadBtn.onclick = (e) => {
            e.stopPropagation();
            dropdownMenu.style.display = dropdownMenu.style.display === 'none' ? 'block' : 'none';
        };

        // Close dropdown on outside click
        document.addEventListener('click', () => { dropdownMenu.style.display = 'none'; });

        downloadWrapper.appendChild(downloadBtn);
        downloadWrapper.appendChild(dropdownMenu);
        actionsDiv.appendChild(downloadWrapper);
    }

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Copy';
    copyBtn.className = 'btn-secondary';
    copyBtn.style.cssText = 'padding: 6px 12px; font-size: 0.82em;';
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(markdownContent).then(() => {
            copyBtn.textContent = '✓ Copied!';
            setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
        });
    };
    actionsDiv.appendChild(copyBtn);

    const viewPanelBtn = document.createElement('button');
    viewPanelBtn.textContent = '📋 Results Panel';
    viewPanelBtn.className = 'btn-secondary';
    viewPanelBtn.style.cssText = 'padding: 6px 12px; font-size: 0.82em;';
    viewPanelBtn.onclick = () => {
        showMarkdownInResultsPanel(title, markdownContent);
    };
    actionsDiv.appendChild(viewPanelBtn);

    // (Rerun Manuscript button lives on the mother manuscript card; see
    // _ensureRerunManuscriptBtn. We do not duplicate it on section cards.)

    container.appendChild(actionsDiv);

    // Collapse toggle
    toggleBtn.addEventListener('click', () => {
        if (contentDiv.style.display === 'none') {
            contentDiv.style.display = '';
            actionsDiv.style.display = '';
            toggleBtn.textContent = 'Collapse';
        } else {
            contentDiv.style.display = 'none';
            actionsDiv.style.display = 'none';
            toggleBtn.textContent = 'Expand';
        }
    });

    body.appendChild(container);

    // Expand card
    card.classList.remove('collapsed');
    const toggleEl = card.querySelector('.wf-card-toggle');
    if (toggleEl) toggleEl.innerHTML = '&#9660;';

    const chatMessages = document.getElementById('chat-messages');
    smartScrollChat();
}

/**
 * Inject a single "🔁 Rerun Manuscript" button into the mother manuscript
 * workflow card header. Idempotent: does nothing if the button already
 * exists. Clicking triggers a smart rerun — the backend auto-detects which
 * sections are stale (via input fingerprints) and only rewrites those,
 * without tool calls.
 */
function _ensureRerunManuscriptBtn(card) {
    if (!card) return;
    if (card.querySelector('.wf-rerun-manuscript-btn')) return;
    const header = card.querySelector('.wf-card-header');
    if (!header) return;

    const btn = document.createElement('button');
    btn.className = 'btn-secondary wf-rerun-manuscript-btn';
    btn.textContent = '\u{1F501} Rerun Manuscript';
    btn.style.cssText = 'margin-left: auto; padding: 4px 10px; font-size: 0.78em;';
    btn.onclick = (e) => {
        e.stopPropagation();
        _runRerunManuscript(null, btn);
    };
    header.appendChild(btn);
}

/**
 * Scroll to a section card during a manuscript rerun, expand it, briefly
 * flash its border, clear any previously-rendered markdown body, and reset
 * the header spinner so streaming content has a clean target.
 */
function _focusRerunSection(stepTag, displayName) {
    if (!stepTag || !_wfCardsContainer) return;
    const card = _wfCardsContainer.querySelector(`#wf-card-${stepTag}`);
    if (!card) return;

    card.classList.remove('collapsed', 'completed');
    card.classList.add('active');

    const label = _MS_PHASE_LABELS[stepTag] || displayName || stepTag;
    const statusEl = card.querySelector('.wf-card-status');
    if (statusEl) statusEl.textContent = `Rerunning ${label}...`;
    const spinner = card.querySelector('.step-spinner');
    if (spinner) spinner.style.display = '';
    const check = card.querySelector('.step-check');
    if (check) check.style.display = 'none';

    // Clear any previous rendered markdown so streaming writes into a fresh body
    const body = card.querySelector('.wf-card-body');
    if (body) body.innerHTML = '';

    // Track as the live phase so llm_stream / llm_update append here
    _wfCurrentPhase = stepTag;

    // Scroll into view inside the chat panel — "start" feels less jumpy
    // than "center" when consecutive sections are large.
    try {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { /* older browsers */ }

    // Flash highlight
    const prev = card.style.boxShadow;
    card.style.transition = 'box-shadow 0.4s ease';
    card.style.boxShadow = '0 0 0 3px #4f8ef7';
    setTimeout(() => { card.style.boxShadow = prev || ''; }, 1200);
}

/**
 * (Kept for backwards-compat — no longer used. Single-click smart rerun
 * replaces the section picker.)
 */
function _openRerunManuscriptPicker(anchorBtn) {
    // Close any existing picker first
    document.querySelectorAll('.rerun-manuscript-picker').forEach(el => el.remove());

    const picker = document.createElement('div');
    picker.className = 'rerun-manuscript-picker';
    picker.style.cssText = 'position: absolute; background: #fff; border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.18); padding: 12px; z-index: 10000; min-width: 240px; font-size: 0.85em;';

    const rect = anchorBtn.getBoundingClientRect();
    picker.style.top = `${window.scrollY + rect.bottom + 6}px`;
    picker.style.left = `${window.scrollX + rect.left}px`;

    const header = document.createElement('div');
    header.style.cssText = 'font-weight: 600; margin-bottom: 8px;';
    header.textContent = 'Sections to regenerate';
    picker.appendChild(header);

    const sections = [
        { key: 'title_abstract', label: 'Title & Abstract' },
        { key: 'introduction', label: 'Introduction' },
        { key: 'methodology', label: 'Methodology' },
        { key: 'results', label: 'Results' },
        { key: 'discussion', label: 'Discussion' },
        { key: 'conclusion', label: 'Conclusion' },
    ];

    const checkboxes = {};
    sections.forEach(({ key, label }) => {
        const row = document.createElement('label');
        row.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 3px 0; cursor: pointer;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = key;
        checkboxes[key] = cb;
        row.appendChild(cb);
        row.appendChild(document.createTextNode(label));
        picker.appendChild(row);
    });

    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top: 8px; color: #666; font-size: 0.9em;';
    hint.textContent = 'Leave all unchecked to regenerate the full manuscript.';
    picker.appendChild(hint);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'margin-top: 10px; display: flex; gap: 8px; justify-content: flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.style.cssText = 'padding: 5px 12px; font-size: 0.85em;';
    cancelBtn.onclick = (e) => { e.stopPropagation(); picker.remove(); };

    const runBtn = document.createElement('button');
    runBtn.textContent = '🔁 Rerun';
    runBtn.className = 'btn-primary';
    runBtn.style.cssText = 'padding: 5px 12px; font-size: 0.85em;';
    runBtn.onclick = (e) => {
        e.stopPropagation();
        const selected = Object.values(checkboxes).filter(c => c.checked).map(c => c.value);
        picker.remove();
        _runRerunManuscript(selected.length ? selected : null, anchorBtn);
    };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(runBtn);
    picker.appendChild(btnRow);

    document.body.appendChild(picker);

    // Close on outside click
    const closeOnOutside = (ev) => {
        if (!picker.contains(ev.target) && ev.target !== anchorBtn) {
            picker.remove();
            document.removeEventListener('click', closeOnOutside, true);
        }
    };
    setTimeout(() => document.addEventListener('click', closeOnOutside, true), 0);
}

/**
 * Stream the rerun-manuscript SSE endpoint and dispatch events through the
 * standard display handlers so existing cards are updated in place.
 */
async function _runRerunManuscript(sectionsOrNull, anchorBtn) {
    const tid = _activeTaskId();
    if (!tid) {
        addLog('[Error] No active task_id — cannot rerun manuscript.', 'error');
        return;
    }

    const label = sectionsOrNull ? sectionsOrNull.join(', ') : 'auto-detect';
    addLog(`[User] Rerunning manuscript (${label})...`, 'info');
    if (anchorBtn) {
        anchorBtn.disabled = true;
        anchorBtn._origText = anchorBtn.textContent;
        anchorBtn.textContent = '⏳ Rerunning...';
    }

    // Suppress competing auto-scrolls for the duration of the rerun so the
    // view doesn't flicker between chat-bottom and target cards.
    window._msRerunActive = true;

    // Start a fresh bubble for this rerun so the previous manuscript bubble
    // stays intact above. _ensureCardsContainer() will create a new bubble
    // appended at the bottom of chat-messages, and all rerun events will
    // resolve against it (cards are queried scoped to _wfCardsContainer).
    _wfCardsContainer = null;
    _wfCurrentPhase = null;

    // Immediate feedback on the new mother manuscript card + scroll once.
    updateWorkflowCard('Rerunning manuscript — detecting stale sections...', 'manuscript');
    try {
        const motherCard = _wfCardsContainer && _wfCardsContainer.querySelector('#wf-card-manuscript');
        if (motherCard) motherCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) { /* ignore */ }

    try {
        const abortCtrl = startInterruptableStream();
        const res = await fetch(`${API_BASE_URL}/api/workflow/rerun-manuscript/${tid}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversation_id: (typeof currentConversationId !== 'undefined') ? currentConversationId : null,
                sections: sectionsOrNull,
            }),
            signal: abortCtrl.signal,
        });
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const update = JSON.parse(line.substring(6));
                    if (update.type === 'status') {
                        updateWorkflowCard(update.message || update.content, update.step || 'manuscript');
                        addLog(`[AGM] ${update.message || update.content}`, 'info');
                    } else if (update.type === 'llm_update') {
                        updateWorkflowCard(update.content, update.step);
                    } else if (update.type === 'llm_stream') {
                        appendToWorkflowCard(update.content, update.step);
                    } else if (update.type === 'manuscript_section_start') {
                        _focusRerunSection(update.step, update.display_name || update.section);
                    } else if (update.type === 'manuscript_section') {
                        displayMarkdownResult(`Manuscript: ${update.section}`, '\u{1F4DD}', update.content, update.relative_path, update.step);
                    } else if (update.type === 'manuscript_complete') {
                        displayMarkdownResult('Full Manuscript', '\u{1F4D6}', update.content, update.relative_path, update.step);
                    } else if (update.type === 'result') {
                        addLog('[AGM] Manuscript rerun complete', 'success');
                        addChatMessage(update.response || 'Manuscript rerun complete.', 'agm');
                    } else if (update.type === 'error') {
                        addLog(`[Error] ${update.error}`, 'error');
                        addChatMessage(`Error: ${update.error}`, 'agm');
                    }
                } catch (e) { /* skip malformed */ }
            }
        }
        stopInterruptableStream();
    } catch (e) {
        stopInterruptableStream();
        if (e.name !== 'AbortError') {
            addLog(`[Error] Manuscript rerun failed: ${e.message}`, 'error');
            addChatMessage(`Error during manuscript rerun: ${e.message}`, 'agm');
        }
    } finally {
        window._msRerunActive = false;
        if (anchorBtn) {
            anchorBtn.disabled = false;
            anchorBtn.textContent = anchorBtn._origText || '🔁 Rerun Manuscript';
        }
    }
}

/**
 * Show markdown content in the Results & Artifacts panel.
 */
function showMarkdownInResultsPanel(title, markdownContent) {
    addLog(`[User] Viewing ${title} in Results panel`, 'info');

    const resultsContent = document.getElementById('results-content-main');
    resultsContent.innerHTML = '';

    const container = document.createElement('div');
    container.style.cssText = 'padding: 15px; height: 100%; overflow: auto;';

    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom: 12px; border-bottom: 2px solid #ddd; padding-bottom: 10px;';
    const h3 = document.createElement('h3');
    h3.style.margin = '0';
    h3.textContent = title;
    header.appendChild(h3);
    container.appendChild(header);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'result-markdown-content';
    if (window.marked) {
        contentDiv.innerHTML = marked.parse(markdownContent);
        _fixResultImages(contentDiv);
        contentDiv.querySelectorAll('pre code').forEach(block => {
            if (window.hljs) hljs.highlightElement(block);
        });
    } else {
        const pre = document.createElement('pre');
        pre.style.cssText = 'white-space: pre-wrap; word-wrap: break-word;';
        pre.textContent = markdownContent;
        contentDiv.appendChild(pre);
    }
    container.appendChild(contentDiv);
    resultsContent.appendChild(container);
}

// ==================== Research Plan Full View ====================

/** Ensure full-view overlay styles are injected (once). */
function _ensureFullViewStyles() {
    if (document.getElementById('rp-fullview-styles')) return;
    const style = document.createElement('style');
    style.id = 'rp-fullview-styles';
    style.textContent = `
        @keyframes rpFadeIn { from { opacity: 0; } to { opacity: 1; } }
        #rp-fullview-overlay .fv-toolbar {
            display: flex; align-items: center; gap: 0;
            padding: 8px 16px; background: #2C3E50;
            color: white; flex-shrink: 0;
        }
        #rp-fullview-overlay .fv-toolbar h3 {
            margin: 0; font-size: 15px; flex: 1;
            font-weight: 600; display: flex; align-items: center; gap: 8px;
        }
        #rp-fullview-overlay .fv-tab {
            padding: 6px 18px; border: none; border-radius: 4px;
            cursor: pointer; font-size: 13px; font-weight: 600;
            transition: background 0.15s; margin: 0 2px;
        }
        #rp-fullview-overlay .fv-tab.active {
            background: #667eea; color: white;
        }
        #rp-fullview-overlay .fv-tab:not(.active) {
            background: rgba(255,255,255,0.15); color: #ccc;
        }
        #rp-fullview-overlay .fv-tab:not(.active):hover {
            background: rgba(255,255,255,0.25); color: white;
        }
        #rp-fullview-overlay .fv-close-btn {
            background: none; border: 1px solid rgba(255,255,255,0.3);
            color: white; cursor: pointer; font-size: 18px;
            width: 34px; height: 34px; border-radius: 6px;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.15s; margin-left: 12px;
        }
        #rp-fullview-overlay .fv-close-btn:hover {
            background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.5);
        }
        #rp-fullview-overlay .fv-iframe-container {
            flex: 1; background: #f8f9fa; overflow: hidden;
        }
        #rp-fullview-overlay .fv-iframe-container iframe {
            width: 100%; height: 100%; border: none;
        }
    `;
    document.head.appendChild(style);
}

/** Create a fullscreen overlay shell. Returns { overlay, escHandler }. */
function _createFullViewOverlay() {
    const existing = document.getElementById('rp-fullview-overlay');
    if (existing) existing.remove();
    _ensureFullViewStyles();

    const overlay = document.createElement('div');
    overlay.id = 'rp-fullview-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.7); z-index: 9999;
        display: flex; flex-direction: column;
        animation: rpFadeIn 0.2s ease-out;
    `;

    const escHandler = (e) => {
        if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
    };

    return { overlay, escHandler };
}

/** Attach close behaviors to a full-view overlay. */
function _attachFullViewClose(overlay, escHandler) {
    overlay.querySelector('.fv-close-btn').addEventListener('click', () => overlay.remove());
    document.addEventListener('keydown', escHandler);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

const _fvIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';

/**
 * Full-view for the Research Plan with Plan/Flowchart tab switching.
 */
function openResearchPlanFullView(currentSrc, task_id, options = {}) {
    const { hideFlowchart = false } = options;
    const { overlay, escHandler } = _createFullViewOverlay();
    const isPlan = currentSrc.includes('/api/research-plan/') && !currentSrc.includes('flowchart');

    const flowchartTab = hideFlowchart
        ? ''
        : `<button class="fv-tab ${!isPlan ? 'active' : ''}" data-fv-view="flowchart">Flowchart</button>`;

    overlay.innerHTML = `
        <div class="fv-toolbar">
            <h3>${_fvIcon} Research Plan</h3>
            <button class="fv-tab ${isPlan ? 'active' : ''}" data-fv-view="plan">Plan View</button>
            ${flowchartTab}
            <button class="fv-tab" data-fv-view="geoprocessing">AGM Geoprocessing Workflow</button>
            <button class="fv-close-btn" title="Close full view (Esc)">&times;</button>
        </div>
        <div class="fv-iframe-container">
            <iframe src="${currentSrc}" id="rp-fullview-iframe"></iframe>
        </div>
    `;
    document.body.appendChild(overlay);
    _attachFullViewClose(overlay, escHandler);

    // Tab switching
    overlay.querySelectorAll('.fv-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            overlay.querySelectorAll('.fv-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const fvIframe = document.getElementById('rp-fullview-iframe');
            if (tab.dataset.fvView === 'plan') {
                fvIframe.src = `${API_BASE_URL}/api/research-plan/${task_id}?v=${Date.now()}`;
            } else if (tab.dataset.fvView === 'geoprocessing') {
                fvIframe.src = `${API_BASE_URL}/api/research-plan-geoprocessing/${task_id}?v=${Date.now()}`;
            } else {
                fvIframe.src = `${API_BASE_URL}/api/research-plan-flowchart/${task_id}?v=${Date.now()}`;
            }
        });
    });
}

/**
 * Generic full-view overlay for any iframe content (e.g. execution flowchart).
 */
function openIframeFullView(src, title) {
    const { overlay, escHandler } = _createFullViewOverlay();
    overlay.innerHTML = `
        <div class="fv-toolbar">
            <h3>${_fvIcon} ${title || 'Full View'}</h3>
            <button class="fv-close-btn" title="Close full view (Esc)">&times;</button>
        </div>
        <div class="fv-iframe-container">
            <iframe src="${src}"></iframe>
        </div>
    `;
    document.body.appendChild(overlay);
    _attachFullViewClose(overlay, escHandler);
}

// ==================== Data Download Summary ====================

function displayDataDownloadSummary(jsonData) {
    addLog('[AGM] Data download summary received', 'success');

    // Find the data_download workflow card
    const container = _wfCardsContainer || document.querySelector('.wf-cards-container');
    if (!container) return;
    const card = container.querySelector('#wf-card-data_download');
    if (!card) return;

    // Remove existing summary if present (e.g. from a retry)
    const existing = card.querySelector('.wf-download-summary');
    if (existing) existing.remove();

    // Uncollapse the parent card so the summary is visible
    if (card.classList.contains('collapsed')) {
        card.classList.remove('collapsed');
        const toggle = card.querySelector('.wf-card-toggle');
        if (toggle) toggle.innerHTML = '&#9660;';
    }
    card.dataset.keepExpanded = 'true';

    const files = jsonData.files || [];
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'wf-download-summary';

    let html;
    if (files.length) {
        summaryDiv.style.cssText = 'margin-top:10px; padding:12px 14px; background:#d4edda; border:1px solid #c3e6cb; border-radius:6px; font-size:0.9em; color:#155724;';
        html = `<div style="font-weight:600; margin-bottom:6px;">Downloaded ${files.length} file(s) added to data registry:</div>`;
        html += '<ul style="margin:0; padding-left:18px;">';
        for (const f of files) {
            const shape = Array.isArray(f.shape) ? `${f.shape[0]} rows x ${f.shape[1]} cols` : (f.shape || '');
            html += `<li><strong>${f.file || ''}</strong>${shape ? ` &mdash; ${shape}` : ''}</li>`;
        }
        html += '</ul>';
    } else {
        summaryDiv.style.cssText = 'margin-top:10px; padding:12px 14px; background:#f8d7da; border:1px solid #f5c6cb; border-radius:6px; font-size:0.9em; color:#721c24;';
        html = `<div style="font-weight:600; margin-bottom:6px;">⚠️ No files downloaded</div>`;
        html += `<div>${jsonData.content || ''}</div>`;
    }
    summaryDiv.innerHTML = html;
    card.appendChild(summaryDiv);

    // ── Register each downloaded file as a data layer ──
    // This mirrors the logic for server-backed uploaded files so they
    // appear in the Data Layer panel, Map Viewer, and Results panel.
    if (files.length) {
        if (!window.loadedLayers) window.loadedLayers = [];

        for (const f of files) {
            const fileName = f.fileName || (f.file ? `${f.file}.${f.fileType || ''}` : '');
            const displayName = f.displayName || f.file || fileName;
            const fileType = (f.fileType || '').toLowerCase();
            const convId = f.conversationId || currentConversationId;

            if (!fileName || !convId) continue;

            // Skip if already registered (e.g. from a retry/reload)
            const already = window.loadedLayers.some(
                (ld) => ld && ld.fileName === fileName && ld.conversationId === convId
            );
            if (already) continue;

            // Format file size for display
            let sizeKB = 'Unknown';
            if (typeof f.fileSize === 'number' && f.fileSize > 0) {
                sizeKB = (f.fileSize / 1024).toFixed(2) + ' KB';
            }

            const layerData = {
                name: displayName,
                fileName: fileName,
                filePath: null,
                fileSize: sizeKB,
                fileType: fileType,
                file: null,
                serverBacked: true,
                conversationId: convId,
                loadedAt: new Date().toISOString(),
                source: 'downloaded',
            };

            window.loadedLayers.push(layerData);
            addLayerToUI(layerData, window.loadedLayers.length - 1);

            // Load geospatial files onto the map
            if (f.isGeospatial) {
                try {
                    loadServerBackedGeospatialFile(convId, fileName, displayName, fileType);
                    layerData._mapLoaded = true;
                } catch (err) {
                    addLog(`[Map] Failed to load downloaded layer ${displayName}: ${err.message}`, 'error');
                }
            } else if (f.isTabular && fileType === 'csv') {
                // Preview tabular files in the Results panel
                try {
                    previewServerCSV(convId, fileName, displayName);
                    layerData._tabularPreviewed = true;
                } catch (err) {
                    addLog(`[System] Failed to preview downloaded table ${displayName}: ${err.message}`, 'error');
                }
            }

            addLog(`[System] Downloaded data layer added: ${displayName}`, 'success');
        }
    }

    smartScrollChat();
}

// ==================== Per-Request Download Tiles ====================

function _fileIconForType(fileType) {
    const t = (fileType || '').toLowerCase();
    if (t === 'png' || t === 'jpg' || t === 'jpeg') return '\u{1F5BC}\u{FE0F}'; // 🖼️
    if (t === 'csv' || t === 'xlsx' || t === 'xls' || t === 'parquet') return '\u{1F4CA}'; // 📊
    if (t === 'html') return '\u{1F310}'; // 🌐
    if (t === 'json' || t === 'geojson') return '\u{1F4CB}'; // 📋
    if (t === 'gpkg' || t === 'shp' || t === 'kml' || t === 'gml' || t === 'zip') return '\u{1F5FA}\u{FE0F}'; // 🗺️
    if (t === 'tif' || t === 'tiff' || t === 'nc' || t === 'img' || t === 'vrt') return '\u{1F30D}'; // 🌍
    if (t === 'txt' || t === 'md') return '\u{1F4DD}'; // 📝
    if (t === 'npy') return '\u{1F522}'; // 🔢
    return '\u{1F4C4}'; // 📄
}

function _formatFileSize(bytes) {
    if (typeof bytes !== 'number' || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function _buildDataRequestTile(f) {
    const tile = document.createElement('div');
    tile.className = 'step-artifact-card';

    const icon = _fileIconForType(f.fileType);
    const displayName = f.displayName || f.file || f.fileName || 'file';
    const sizeText = _formatFileSize(f.fileSize) || '';

    tile.innerHTML = `
        <span class="artifact-icon">${icon}</span>
        <span class="artifact-name" title="${f.fileName || displayName}">${displayName}</span>
        <span class="artifact-size">${sizeText}</span>
    `;

    // Click handler: preview geospatial files on the map, tabular files in the
    // Results panel. Idempotent — repeated clicks do NOT add duplicate layers.
    tile.addEventListener('click', () => {
        const convId = f.conversationId || currentConversationId;
        const fileName = f.fileName;
        const fileType = (f.fileType || '').toLowerCase();
        if (!convId || !fileName) {
            addLog(`[System] Cannot preview ${displayName}: missing conversation or file name`, 'warning');
            return;
        }

        // Find the corresponding entry in window.loadedLayers (registered by
        // displayDataDownloadSummary). Use it as the source of truth for
        // "is this file already loaded into the map / results panel".
        if (!window.loadedLayers) window.loadedLayers = [];
        let layerEntry = window.loadedLayers.find(
            (ld) => ld && ld.fileName === fileName && ld.conversationId === convId
        );

        try {
            if (f.isGeospatial) {
                if (layerEntry && layerEntry._mapLoaded) {
                    addLog(`[Map] Layer already on map: ${displayName}`, 'info');
                    return;
                }
                loadServerBackedGeospatialFile(convId, fileName, displayName, fileType);
                if (layerEntry) {
                    layerEntry._mapLoaded = true;
                    // Keep the Data Layers checkbox in sync
                    const idx = window.loadedLayers.indexOf(layerEntry);
                    const itemCb = document.querySelector(
                        `.data-layer-item[data-layer-index="${idx}"] .layer-visibility-checkbox`
                    );
                    if (itemCb && !itemCb.checked) itemCb.checked = true;
                } else {
                    // Summary panel hasn't registered this file yet — create a
                    // minimal entry so subsequent clicks remain idempotent.
                    const newLayer = {
                        name: displayName,
                        fileName: fileName,
                        fileType: fileType,
                        conversationId: convId,
                        serverBacked: true,
                        source: 'downloaded',
                        _mapLoaded: true,
                    };
                    window.loadedLayers.push(newLayer);
                    addLayerToUI(newLayer, window.loadedLayers.length - 1);
                }
            } else if (f.isTabular && fileType === 'csv') {
                // CSV preview replaces the panel content — always re-preview on
                // click so the user can bring it back after clearing the panel
                // or previewing another file.
                previewServerCSV(convId, fileName, displayName);
                if (layerEntry) {
                    layerEntry._tabularPreviewed = true;
                } else {
                    const newLayer = {
                        name: displayName,
                        fileName: fileName,
                        fileType: fileType,
                        conversationId: convId,
                        serverBacked: true,
                        source: 'downloaded',
                        _tabularPreviewed: true,
                    };
                    window.loadedLayers.push(newLayer);
                    addLayerToUI(newLayer, window.loadedLayers.length - 1);
                }
            } else {
                window.open(`${API_BASE_URL}/api/uploads/${encodeURIComponent(convId)}/${encodeURIComponent(fileName)}`, '_blank');
            }
        } catch (err) {
            addLog(`[System] Failed to preview ${displayName}: ${err.message}`, 'error');
        }
    });

    return tile;
}

// Reformat a completed data_download_req_N sub-card so the live view matches
// the reload view: Execution Log (collapsible) → Data Source Review →
// Generated Code (with copy) → (tiles appended afterwards by caller).
// Safe to call multiple times (it's idempotent — re-derives text from DOM).
function _formatDataRequestCardBody(card) {
    if (!card) return;
    const body = card.querySelector('.wf-card-body');
    if (!body) return;

    // Detach the pieces we want to preserve as-is. If a stashed review
    // payload exists (from finalizeReview during the interactive prompt),
    // build the read-only review element now — streaming stayed raw during
    // execution and we're rendering the final layout on completion.
    let reviewEl = body.querySelector('.data-source-select-container');
    if (reviewEl) {
        reviewEl.remove();
    } else if (card._pendingDataSourceReview) {
        const pending = card._pendingDataSourceReview;
        reviewEl = renderDataSourceSelectReviewReadOnly(pending);
        if (pending._decisionText) {
            const decision = document.createElement('div');
            decision.style.cssText = `margin-top:6px; font-size:12px; font-weight:600; color:${pending._decisionColor};`;
            decision.textContent = `Decision: ${pending._decisionText}`;
            reviewEl.appendChild(decision);
        }
    }
    const existingTiles = body.querySelector('.wf-request-tiles');
    if (existingTiles) existingTiles.remove();
    const existingLog = body.querySelector('.wf-result-stream-section');
    const existingCode = body.querySelector('.wf-result-code-section');
    // Gather raw streamed text: includes existing sections' text if we've
    // already formatted once (re-entrant safety).
    let rawText = '';
    if (existingLog || existingCode) {
        const logStatus = body.querySelector('.wf-stream-status');
        const codeBlock = body.querySelector('.wf-result-code-section code');
        const logText = logStatus ? logStatus.textContent : '';
        const codeText = codeBlock ? codeBlock.textContent : '';
        rawText = logText + (codeText ? `\n\`\`\`python\n${codeText}\n\`\`\`` : '');
        if (existingLog) existingLog.remove();
        if (existingCode) existingCode.remove();
    } else {
        rawText = body.textContent || '';
    }
    body.innerHTML = '';
    body.classList.add('step-result-body');

    rawText = rawText.trim();
    const codeMatch = rawText.match(/```python\s*([\s\S]*?)```/);

    if (codeMatch) {
        const beforeCode = rawText.substring(0, codeMatch.index).trim();
        const codeContent = codeMatch[1].trim();
        const afterCode = rawText.substring(codeMatch.index + codeMatch[0].length).trim();
        const statusText = [beforeCode, afterCode].filter(Boolean).join('\n');

        if (statusText) {
            const streamSection = document.createElement('div');
            streamSection.className = 'wf-result-stream-section collapsed';
            const streamHeader = document.createElement('div');
            streamHeader.className = 'wf-section-header';
            streamHeader.innerHTML = '<span class="wf-section-toggle">&#9656;</span> Execution Log';
            streamHeader.style.cursor = 'pointer';
            streamHeader.onclick = () => streamSection.classList.toggle('collapsed');
            streamSection.appendChild(streamHeader);
            const statusDiv = document.createElement('div');
            statusDiv.className = 'wf-stream-status wf-section-content';
            statusDiv.textContent = statusText;
            streamSection.appendChild(statusDiv);
            body.appendChild(streamSection);
        }

        if (reviewEl) body.appendChild(reviewEl);

        const codeSection = document.createElement('div');
        codeSection.className = 'wf-result-code-section';
        const codeHeader = document.createElement('div');
        codeHeader.className = 'wf-section-header';
        codeHeader.innerHTML = '<span class="wf-section-icon">&#128221;</span> Generated Code';
        codeSection.appendChild(codeHeader);
        const codeContainer = document.createElement('pre');
        codeContainer.className = 'wf-stream-code';
        const codeEl = document.createElement('code');
        codeEl.className = 'language-python';
        codeEl.textContent = codeContent;
        codeContainer.appendChild(codeEl);
        codeSection.appendChild(codeContainer);
        if (window.hljs) try { hljs.highlightElement(codeEl); } catch (_) {}
        try { attachCopyCodeButton(codeHeader, () => codeEl.textContent); } catch (_) {}
        body.appendChild(codeSection);
    } else if (rawText) {
        // No code block — wrap everything as Execution Log, then review.
        const streamSection = document.createElement('div');
        streamSection.className = 'wf-result-stream-section collapsed';
        const streamHeader = document.createElement('div');
        streamHeader.className = 'wf-section-header';
        streamHeader.innerHTML = '<span class="wf-section-toggle">&#9656;</span> Execution Log';
        streamHeader.style.cursor = 'pointer';
        streamHeader.onclick = () => streamSection.classList.toggle('collapsed');
        streamSection.appendChild(streamHeader);
        const pre = document.createElement('pre');
        pre.className = 'wf-stream-log wf-section-content';
        pre.textContent = rawText;
        streamSection.appendChild(pre);
        body.appendChild(streamSection);
        if (reviewEl) body.appendChild(reviewEl);
    } else if (reviewEl) {
        body.appendChild(reviewEl);
    }
}

function displayDataRequestTiles(jsonData) {
    const step = jsonData.step || '';
    if (!step.startsWith('data_download_req_')) return;

    const container = _wfCardsContainer || document.querySelector('.workflow-cards-container');
    if (!container) return;
    const card = container.querySelector(`#wf-card-${step}`);
    if (!card) return;

    // Remove any previous tiles panel from a retry
    const existing = card.querySelector('.wf-request-tiles');
    if (existing) existing.remove();

    // Ensure the card has a body to attach tiles to
    let body = card.querySelector('.wf-card-body');
    if (!body) {
        body = document.createElement('div');
        body.className = 'wf-card-body';
        card.appendChild(body);
        _makeCardCollapsible(card);
    }

    // Reformat the streamed content into the same sectioned layout that the
    // reload path produces, so the live "done" state matches post-reload.
    _formatDataRequestCardBody(card);

    const files = jsonData.files || [];
    const tilesWrap = document.createElement('div');
    tilesWrap.className = 'wf-request-tiles';

    if (files.length === 0) {
        tilesWrap.classList.add('wf-request-tiles-empty');
        tilesWrap.textContent = 'No files downloaded for this request.';
    } else {
        const header = document.createElement('div');
        header.className = 'wf-request-tiles-header';
        header.textContent = `Downloaded ${files.length} file(s):`;
        tilesWrap.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'step-result-artifacts-grid';
        for (const f of files) {
            grid.appendChild(_buildDataRequestTile(f));
        }
        tilesWrap.appendChild(grid);
    }

    body.appendChild(tilesWrap);

    // Keep the sub-card expanded so tiles remain visible
    card.classList.remove('collapsed');
    card.dataset.keepExpanded = 'true';
    const toggle = card.querySelector('.wf-card-toggle');
    if (toggle) toggle.innerHTML = '&#9660;';

    smartScrollChat();
}

// ==================== Research Plan Visualization ====================

function displayResearchPlanViz(task_id = 'default') {
    addLog(`[AGM] Displaying research plan visualization...`, 'info');

    const chatMessages = document.getElementById('chat-messages');
    const agmMessage = document.createElement('div');
    agmMessage.className = 'chat-message agm';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = '<img src="icon/AGM.png" alt="AGM" class="avatar-img">';

    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper full-width';

    const header = document.createElement('div');
    header.className = 'message-header';
    const now = new Date();
    header.innerHTML = `
        <span class="message-sender">AGM</span>
        <span class="message-time">${now.toLocaleTimeString('en-US', { hour12: false })}</span>
    `;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Header + toggle tabs
    const headerSection = document.createElement('div');
    headerSection.innerHTML = `
        <h4 style="margin-top: 0; display: flex; align-items: center; gap: 10px;">
            <span>📋</span> Research Plan
        </h4>
        <p style="color: #666; font-size: 0.95em; margin-bottom: 10px;">
            Interactive summary of objectives, methodology, and analysis steps
        </p>
        <div id="rp-tabs-${task_id}" style="display: flex; gap: 0; margin-bottom: 0; align-items: flex-end;">
            <button class="rp-tab active" data-view="plan" style="padding: 8px 20px; border: 1px solid #ddd; border-bottom: none; border-radius: 8px 8px 0 0; background: #667eea; color: white; cursor: pointer; font-weight: 600; font-size: 0.9em;">Plan View</button>
            <button class="rp-tab" data-view="flowchart" style="padding: 8px 20px; border: 1px solid #ddd; border-bottom: none; border-radius: 8px 8px 0 0; background: #f0f0f0; color: #333; cursor: pointer; font-weight: 600; font-size: 0.9em;">Flowchart</button>
            <button class="rp-tab" data-view="geoprocessing" style="padding: 8px 20px; border: 1px solid #ddd; border-bottom: none; border-radius: 8px 8px 0 0; background: #f0f0f0; color: #333; cursor: pointer; font-weight: 600; font-size: 0.9em;">AGM Geoprocessing Workflow</button>
            <button class="rp-fullview-btn" data-taskid="${task_id}" style="margin-left: auto; padding: 6px 14px; border: 1px solid #ddd; border-bottom: none; border-radius: 8px 8px 0 0; background: #f8f9fa; color: #555; cursor: pointer; font-size: 0.85em; display: flex; align-items: center; gap: 5px; transition: background 0.15s;" title="Open in full view">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                Full View
            </button>
        </div>
    `;
    bubble.appendChild(headerSection);

    // Iframe container
    const iframeContainer = document.createElement('div');
    iframeContainer.style.width = '100%';
    iframeContainer.style.height = '800px';
    iframeContainer.style.maxHeight = 'calc(100vh - 200px)';
    iframeContainer.style.border = '1px solid #ddd';
    iframeContainer.style.borderRadius = '0 8px 8px 8px';
    iframeContainer.style.overflow = 'auto';

    const iframe = document.createElement('iframe');
    iframe.src = `${API_BASE_URL}/api/research-plan/${task_id}?v=${Date.now()}`;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.id = `research-plan-iframe-${task_id}`;
    iframeContainer.appendChild(iframe);
    bubble.appendChild(iframeContainer);

    // Tab click handler
    const tabs = headerSection.querySelectorAll('.rp-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.classList.remove('active');
                t.style.background = '#f0f0f0';
                t.style.color = '#333';
            });
            tab.classList.add('active');
            tab.style.background = '#667eea';
            tab.style.color = 'white';

            const view = tab.dataset.view;
            if (view === 'plan') {
                iframe.src = `${API_BASE_URL}/api/research-plan/${task_id}?v=${Date.now()}`;
            } else if (view === 'geoprocessing') {
                iframe.src = `${API_BASE_URL}/api/research-plan-geoprocessing/${task_id}?v=${Date.now()}`;
            } else {
                iframe.src = `${API_BASE_URL}/api/research-plan-flowchart/${task_id}?v=${Date.now()}`;
            }
        });
    });

    // Full View button handler
    const fullViewBtn = headerSection.querySelector('.rp-fullview-btn');
    if (fullViewBtn) {
        fullViewBtn.addEventListener('mouseenter', () => { fullViewBtn.style.background = '#e9ecef'; });
        fullViewBtn.addEventListener('mouseleave', () => { fullViewBtn.style.background = '#f8f9fa'; });
        fullViewBtn.addEventListener('click', () => {
            openResearchPlanFullView(iframe.src, task_id);
        });
    }

    // Disable chat input until user approves or provides feedback
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send');
    chatInput.disabled = true;
    chatInput.placeholder = 'Review the research plan above — Approve or Provide Feedback to continue';
    if (sendBtn) sendBtn.disabled = true;

    // Approve / Feedback buttons
    const controlsDiv = document.createElement('div');
    controlsDiv.id = `rp-controls-${task_id}`;
    controlsDiv.className = 'rp-controls';

    const approveBtn = document.createElement('button');
    approveBtn.textContent = '✓ Approve Plan';
    approveBtn.className = 'rp-btn-approve';
    approveBtn.onclick = async () => {
        try {
            // Reset workflow card container so execution cards appear
            // after the research plan viz, not above it
            finalizeAllWorkflowCards();

            // Show approved banner above the buttons (don't remove them)
            let banner = controlsDiv.querySelector('.rp-approved-banner');
            if (!banner) {
                banner = document.createElement('div');
                banner.className = 'rp-approved-banner';
                banner.style.cssText = 'width:100%; margin-bottom:8px; padding:6px 12px; background:#d4edda; border:1px solid #c3e6cb; border-radius:4px; color:#155724; font-weight:600; font-size:0.9em;';
                banner.textContent = '✅ Research Plan Approved! Executing objectives...';
                controlsDiv.insertBefore(banner, controlsDiv.firstChild);
            }
            // Disable buttons during execution
            approveBtn.disabled = true;
            feedbackBtn.disabled = true;
            addChatMessage('✅ Research plan approved! Starting objective execution...', 'agm');
            addLog('[AGM] Research plan approved, starting execution', 'success');

            // Store task_id for step re-run feature
            window._completedTaskId = task_id;

            // Stream the continuation (objective execution + result analysis)
            const abortCtrl = startInterruptableStream();
            const res = await fetch(`${API_BASE_URL}/api/research-plan/approve/${task_id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation_id: currentConversationId }),
                signal: abortCtrl.signal,
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let streamContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const update = JSON.parse(line.substring(6));

                        if (update.type === 'status') {
                            updateWorkflowCard(update.message || update.content, update.step || 'general');
                            addLog(`[AGM] ${update.message || update.content}`, 'info');
                        } else if (update.type === 'llm_update') {
                            updateWorkflowCard(update.content, update.step);
                            addLog(`[AGM] ${update.content}`, 'info');
                        } else if (update.type === 'llm_stream') {
                            appendToWorkflowCard(update.content, update.step);
                            streamContent += update.content;
                        } else if (update.type === 'log') {
                            addLog(`[AGM] ${update.content}`, 'info');
                        } else if (update.type === 'code_review') {
                            console.log('[approve-stream] code_review event received:', update);
                            displayCodeReview(update);
                        } else if (update.type === 'eda_approval') {
                            console.log('[approve-stream] eda_approval event received:', update);
                            displayEdaApproval(update);
                        } else if (update.type === 'data_download_approval') {
                            console.log('[approve-stream] data_download_approval event received:', update);
                            displayDataDownloadApproval(update);
                        } else if (update.type === 'data_source_select_approval') {
                            console.log('[approve-stream] data_source_select_approval event received:', update);
                            displayDataSourceSelectApproval(update);
                        } else if (update.type === 'step_result') {
                            displayStepResult(update);
                        } else if (update.type === 'execution_checkpoint') {
                            displayExecutionCheckpoint(update);
                        } else if (update.type === 'figure_catalog') {
                            displayFigureCatalog(update.figures || [], update.step);
                        } else if (update.type === 'execution_flowchart') {
                            displayExecutionFlowchart(update.relative_path, update.step);
                        } else if (update.type === 'result_presentation') {
                            displayMarkdownResult('Result Presentation', '📊', update.content, update.relative_path, update.step);
                        } else if (update.type === 'result_discussion') {
                            displayMarkdownResult('Result Discussion', '💬', update.content, update.relative_path, update.step);
                        } else if (update.type === 'manuscript_section') {
                            displayMarkdownResult(`Manuscript: ${update.section}`, '📝', update.content, update.relative_path, update.step);
                        } else if (update.type === 'manuscript_complete') {
                            displayMarkdownResult('Full Manuscript', '📖', update.content, update.relative_path, update.step);
                        } else if (update.type === 'result') {
                            finalizeAllWorkflowCards();
                            addLog('[AGM] Workflow complete', 'success');
                            addChatMessage(update.response || 'Workflow complete.', 'agm');
                        } else if (update.type === 'error') {
                            finalizeAllWorkflowCards();
                            addLog(`[Error] ${update.error}`, 'error');
                            addChatMessage(`Error: ${update.error}`, 'agm');
                        } else if (update.type === 'complete') {
                            addLog('[AGM] Stream complete', 'success');
                        }
                    } catch (parseErr) {
                        console.warn('Could not parse SSE line:', line);
                    }
                }
            }

            // Re-enable chat input and buttons
            stopInterruptableStream();
            chatInput.disabled = false;
            chatInput.placeholder = 'Enter a request here ....';
            if (sendBtn) sendBtn.disabled = false;
            approveBtn.disabled = false;
            feedbackBtn.disabled = false;
        } catch (e) {
            stopInterruptableStream();
            if (e.name === 'AbortError') return;
            addLog(`[Error] Failed to approve: ${e.message}`, 'error');
            addChatMessage(`Error during execution: ${e.message}`, 'agm');
            chatInput.disabled = false;
            chatInput.placeholder = 'Enter a request here ....';
            if (sendBtn) sendBtn.disabled = false;
            approveBtn.disabled = false;
            feedbackBtn.disabled = false;
        }
    };
    controlsDiv.appendChild(approveBtn);

    const feedbackBtn = document.createElement('button');
    feedbackBtn.textContent = '✎ Provide Feedback';
    feedbackBtn.className = 'rp-btn-feedback';
    feedbackBtn.onclick = () => {
        activateFeedbackMode('research_plan', task_id, iframe, {});
        // Enable input for typing feedback
        chatInput.disabled = false;
        chatInput.placeholder = 'Enter your feedback for the research plan...';
        chatInput.focus();
        if (sendBtn) sendBtn.disabled = false;
    };
    controlsDiv.appendChild(feedbackBtn);

    // Re-execute button sits inside the controls row
    const reexecuteBtn = document.createElement('button');
    reexecuteBtn.textContent = '🔄 Re-execute All Steps';
    reexecuteBtn.className = 'rp-btn-reexecute';
    controlsDiv.appendChild(reexecuteBtn);

    bubble.appendChild(controlsDiv);

    reexecuteBtn.onclick = async () => {
        if (!window._completedTaskId) {
            addLog('[AGM] Workflow has not been executed yet — approve and execute the plan first.', 'error');
            addChatMessage('The workflow has not been executed yet. Please approve the plan and execute it before re-executing steps.', 'agm');
            return;
        }
        const activeTaskId = window._completedTaskId;
        reexecuteBtn.disabled = true;
        reexecuteBtn.textContent = '🔄 Re-executing...';
        try {
            // Remove old workflow cards from previous execution
            document.querySelectorAll('.workflow-cards-container').forEach(container => {
                const parentMessage = container.closest('.chat-message');
                if (parentMessage) parentMessage.remove();
            });
            _wfCardsContainer = null;
            _wfCurrentPhase = null;

            addChatMessage('🔄 Re-executing all research plan steps...', 'agm');
            addLog('[AGM] Re-executing all steps', 'info');

            const abortCtrl = startInterruptableStream();
            const res = await fetch(`${API_BASE_URL}/api/research-plan/approve/${activeTaskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation_id: currentConversationId }),
                signal: abortCtrl.signal,
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const update = JSON.parse(line.substring(6));

                        if (update.type === 'status') {
                            updateWorkflowCard(update.message || update.content, update.step || 'general');
                            addLog(`[AGM] ${update.message || update.content}`, 'info');
                        } else if (update.type === 'llm_update') {
                            updateWorkflowCard(update.content, update.step);
                            addLog(`[AGM] ${update.content}`, 'info');
                        } else if (update.type === 'llm_stream') {
                            appendToWorkflowCard(update.content, update.step);
                        } else if (update.type === 'log') {
                            addLog(`[AGM] ${update.content}`, 'info');
                        } else if (update.type === 'code_review') {
                            displayCodeReview(update);
                        } else if (update.type === 'step_result') {
                            displayStepResult(update);
                        } else if (update.type === 'execution_checkpoint') {
                            displayExecutionCheckpoint(update);
                        } else if (update.type === 'figure_catalog') {
                            displayFigureCatalog(update.figures || [], update.step);
                        } else if (update.type === 'execution_flowchart') {
                            displayExecutionFlowchart(update.relative_path, update.step);
                        } else if (update.type === 'result_presentation') {
                            displayMarkdownResult('Result Presentation', '📊', update.content, update.relative_path, update.step);
                        } else if (update.type === 'result_discussion') {
                            displayMarkdownResult('Result Discussion', '💬', update.content, update.relative_path, update.step);
                        } else if (update.type === 'manuscript_section') {
                            displayMarkdownResult(`Manuscript: ${update.section}`, '📝', update.content, update.relative_path, update.step);
                        } else if (update.type === 'manuscript_complete') {
                            displayMarkdownResult('Full Manuscript', '📖', update.content, update.relative_path, update.step);
                        } else if (update.type === 'result') {
                            finalizeAllWorkflowCards();
                            addLog('[AGM] Re-execution complete', 'success');
                            addChatMessage(update.response || 'Re-execution complete.', 'agm');
                        } else if (update.type === 'error') {
                            finalizeAllWorkflowCards();
                            addLog(`[Error] ${update.error}`, 'error');
                            addChatMessage(`Error: ${update.error}`, 'agm');
                        } else if (update.type === 'complete') {
                            addLog('[AGM] Re-execution stream complete', 'success');
                        }
                    } catch (parseErr) {
                        console.warn('Could not parse SSE line:', line);
                    }
                }
            }
            stopInterruptableStream();
        } catch (e) {
            stopInterruptableStream();
            if (e.name === 'AbortError') return;
            addLog(`[Error] Re-execution failed: ${e.message}`, 'error');
            addChatMessage(`Error during re-execution: ${e.message}`, 'agm');
        } finally {
            reexecuteBtn.disabled = false;
            reexecuteBtn.textContent = '🔄 Re-execute All Steps';
        }
    };

    wrapper.appendChild(header);
    wrapper.appendChild(bubble);
    agmMessage.appendChild(avatar);
    agmMessage.appendChild(wrapper);
    chatMessages.appendChild(agmMessage);
    smartScrollChat();

    // Autonomous Mode: auto-approve the research plan after a brief delay
    const autoToggle = document.getElementById('autonomous-mode-toggle');
    if (autoToggle && autoToggle.checked) {
        setTimeout(() => {
            addLog('[AGM] Autonomous mode — auto-approving research plan', 'info');
            approveBtn.click();
        }, 1500);
    }

    // Listen for inline edit saves from the research plan iframe
    window.addEventListener('message', async function _rpEditHandler(e) {
        if (!e.data || e.data.type !== 'research_plan_edit') return;
        const plan = e.data.plan;
        const rpTaskId = plan.task_id || task_id;
        addLog(`[User] Saving edited research plan (${plan.objectives.length} objectives)...`, 'info');
        try {
            const res = await fetch(`${API_BASE_URL}/api/research-plan/update/${rpTaskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ objectives: plan.objectives }),
            });
            const result = await res.json();
            if (result.success) {
                addLog('[AGM] Research plan updated successfully', 'success');
                // Notify iframe of success
                iframe.contentWindow.postMessage({ type: 'plan_save_result', success: true }, '*');
                // Reload the iframe to show regenerated HTML
                setTimeout(() => {
                    iframe.src = `${API_BASE_URL}/api/research-plan/${rpTaskId}?v=${Date.now()}`;
                }, 300);
            } else {
                addLog(`[Error] Plan save failed: ${result.error}`, 'error');
                iframe.contentWindow.postMessage({ type: 'plan_save_result', success: false, error: result.error }, '*');
            }
        } catch (err) {
            addLog(`[Error] Plan save failed: ${err.message}`, 'error');
            iframe.contentWindow.postMessage({ type: 'plan_save_result', success: false, error: err.message }, '*');
        }
    });

    // Listen for "Edit & Re-run" clicks from the research plan iframe
    window.addEventListener('message', async function _rpRerunHandler(e) {
        if (!e.data || e.data.type !== 'research_plan_step_rerun') return;

        const plan = e.data.plan;
        const objIdx = e.data.objective_index;
        const stepIdx = e.data.step_index;
        const rpTaskId = plan.task_id || task_id;
        const objKey = `objective_${objIdx}`;

        // Check if the workflow has been executed
        const activeTaskId = window._completedTaskId || rpTaskId;
        if (!window._completedTaskId) {
            addLog('[AGM] Workflow has not been executed yet — approve and execute the plan first.', 'error');
            addChatMessage('The workflow has not been executed yet. Please approve the plan and execute it before re-running individual steps.', 'agm');
            iframe.contentWindow.postMessage({ type: 'step_rerun_started' }, '*');
            return;
        }

        addLog(`[User] Edit & Re-run: ${objKey} step ${stepIdx}`, 'info');

        // First, save the edited plan to the backend so the step description is updated
        try {
            const saveRes = await fetch(`${API_BASE_URL}/api/research-plan/update/${rpTaskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ objectives: plan.objectives }),
            });
            const saveResult = await saveRes.json();
            if (saveResult.success) {
                addLog('[AGM] Research plan saved before re-run', 'info');
            }
        } catch (err) {
            addLog(`[Error] Could not save plan before re-run: ${err.message}`, 'error');
        }

        // Notify iframe that rerun started (resets button state)
        iframe.contentWindow.postMessage({ type: 'step_rerun_started' }, '*');

        // Trigger step re-run with "regenerate" mode — the LLM will generate
        // fresh code using the updated step description
        await rerunStep(
            activeTaskId,
            objKey,
            stepIdx,
            'regenerate',
            null,
            'The step description in the research plan has been edited. Regenerate the code according to the updated description.',
            null
        );
    });

    // Listen for "Delete & Regenerate Plan" from the research plan iframe
    window.addEventListener('message', async function _rpRegenHandler(e) {
        if (!e.data || e.data.type !== 'research_plan_regen_after_delete') return;

        const plan = e.data.plan;
        const deletionContext = e.data.deletion_context;
        const rpTaskId = plan.task_id || task_id;

        addLog(`[User] Regenerating plan after deleting step ${deletionContext.deleted_step_number} from objective ${deletionContext.deleted_from_objective}`, 'info');

        try {
            const res = await fetch(`${API_BASE_URL}/api/research-plan/regen-after-delete/${rpTaskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    objectives: plan.objectives,
                    deletion_context: deletionContext,
                }),
            });
            const result = await res.json();
            if (result.success) {
                addLog('[AGM] Plan regenerated successfully after step deletion', 'success');
                iframe.contentWindow.postMessage({ type: 'plan_regen_result', success: true }, '*');
            } else {
                addLog(`[Error] Plan regeneration failed: ${result.error}`, 'error');
                iframe.contentWindow.postMessage({ type: 'plan_regen_result', success: false, error: result.error }, '*');
            }
        } catch (err) {
            addLog(`[Error] Plan regeneration failed: ${err.message}`, 'error');
            iframe.contentWindow.postMessage({ type: 'plan_regen_result', success: false, error: err.message }, '*');
        }
    });

    addLog('[AGM] Research plan visualization displayed', 'success');
}


// =====================================================================
//  SPATIAL ANALYSIS: GEOPROCESSING WORKFLOW VISUALIZATION
// =====================================================================

/**
 * Display geoprocessing workflow visualization for the spatial analysis
 * task pipeline.  Two tabs: Plan View and Geoprocessing Workflow.
 */
function spatial_analysis_displayWorkflowViz(task_id = 'default') {
    addLog('[AGM] Displaying geoprocessing workflow visualization...', 'info');

    const chatMessages = document.getElementById('chat-messages');
    const agmMessage = document.createElement('div');
    agmMessage.className = 'chat-message agm';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = '<img src="icon/AGM.png" alt="AGM" class="avatar-img">';

    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper full-width';

    const header = document.createElement('div');
    header.className = 'message-header';
    const now = new Date();
    header.innerHTML = `
        <span class="message-sender">AGM</span>
        <span class="message-time">${now.toLocaleTimeString('en-US', { hour12: false })}</span>
    `;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Header + toggle tabs
    const headerSection = document.createElement('div');
    headerSection.innerHTML = `
        <h4 style="margin-top: 0; display: flex; align-items: center; gap: 10px;">
            <span>\u{1F5FA}</span> Geoprocessing Workflow
        </h4>
        <p style="color: #666; font-size: 0.95em; margin-bottom: 10px;">
            Spatial analysis geoprocessing workflow and operation graph
        </p>
        <div id="sa-tabs-${task_id}" style="display: flex; gap: 0; margin-bottom: 0; align-items: flex-end;">
            <button class="rp-tab active" data-view="geoprocessing" style="padding: 8px 20px; border: 1px solid #ddd; border-bottom: none; border-radius: 8px 8px 0 0; background: #667eea; color: white; cursor: pointer; font-weight: 600; font-size: 0.9em;">Geoprocessing Workflow</button>
            <button class="rp-tab" data-view="plan" style="padding: 8px 20px; border: 1px solid #ddd; border-bottom: none; border-radius: 8px 8px 0 0; background: #f0f0f0; color: #333; cursor: pointer; font-weight: 600; font-size: 0.9em;">Plan View</button>
            <button class="rp-fullview-btn" data-taskid="${task_id}" style="margin-left: auto; padding: 6px 14px; border: 1px solid #ddd; border-bottom: none; border-radius: 8px 8px 0 0; background: #f8f9fa; color: #555; cursor: pointer; font-size: 0.85em; display: flex; align-items: center; gap: 5px; transition: background 0.15s;" title="Open in full view">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                Full View
            </button>
        </div>
    `;
    bubble.appendChild(headerSection);

    // Iframe container
    const iframeContainer = document.createElement('div');
    iframeContainer.style.width = '100%';
    iframeContainer.style.height = '800px';
    iframeContainer.style.maxHeight = 'calc(100vh - 200px)';
    iframeContainer.style.border = '1px solid #ddd';
    iframeContainer.style.borderRadius = '0 8px 8px 8px';
    iframeContainer.style.overflow = 'auto';

    const iframe = document.createElement('iframe');
    iframe.src = `${API_BASE_URL}/api/research-plan-geoprocessing/${task_id}?v=${Date.now()}`;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.id = `sa-workflow-iframe-${task_id}`;
    iframeContainer.appendChild(iframe);
    bubble.appendChild(iframeContainer);

    // Tab click handler
    const tabs = headerSection.querySelectorAll('.rp-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.classList.remove('active');
                t.style.background = '#f0f0f0';
                t.style.color = '#333';
            });
            tab.classList.add('active');
            tab.style.background = '#667eea';
            tab.style.color = 'white';

            const view = tab.dataset.view;
            if (view === 'plan') {
                iframe.src = `${API_BASE_URL}/api/research-plan/${task_id}?v=${Date.now()}`;
            } else {
                iframe.src = `${API_BASE_URL}/api/research-plan-geoprocessing/${task_id}?v=${Date.now()}`;
            }
        });
    });

    // Full View button handler
    const fullViewBtn = headerSection.querySelector('.rp-fullview-btn');
    if (fullViewBtn) {
        fullViewBtn.addEventListener('mouseenter', () => { fullViewBtn.style.background = '#e9ecef'; });
        fullViewBtn.addEventListener('mouseleave', () => { fullViewBtn.style.background = '#f8f9fa'; });
        fullViewBtn.addEventListener('click', () => {
            if (typeof openResearchPlanFullView === 'function') {
                // Spatial Analysis card has no Flowchart tab, so hide it in
                // the full-view overlay too. The Research Plan card's caller
                // omits this option and keeps the Flowchart tab.
                openResearchPlanFullView(iframe.src, task_id, { hideFlowchart: true });
            } else {
                window.open(iframe.src, '_blank');
            }
        });
    }

    // Disable chat input until user approves or provides feedback
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send');
    chatInput.disabled = true;
    chatInput.placeholder = 'Review the geoprocessing workflow above \u2014 Approve or Provide Feedback to continue';
    if (sendBtn) sendBtn.disabled = true;

    // Approve / Feedback buttons
    const controlsDiv = document.createElement('div');
    controlsDiv.id = `sa-controls-${task_id}`;
    controlsDiv.className = 'rp-controls';

    const approveBtn = document.createElement('button');
    approveBtn.textContent = '\u2713 Approve Workflow';
    approveBtn.className = 'rp-btn-approve';
    approveBtn.onclick = async () => {
        try {
            // Reset workflow card container so operation cards appear
            // after the geoprocessing workflow viz, not above it
            finalizeAllWorkflowCards();

            let banner = controlsDiv.querySelector('.rp-approved-banner');
            if (!banner) {
                banner = document.createElement('div');
                banner.className = 'rp-approved-banner';
                banner.style.cssText = 'width:100%; margin-bottom:8px; padding:6px 12px; background:#d4edda; border:1px solid #c3e6cb; border-radius:4px; color:#155724; font-weight:600; font-size:0.9em;';
                banner.textContent = '\u2705 Geoprocessing Workflow Approved! Generating operation code...';
                controlsDiv.insertBefore(banner, controlsDiv.firstChild);
            }
            approveBtn.disabled = true;
            feedbackBtn.disabled = true;
            addChatMessage('\u2705 Geoprocessing workflow approved! Starting operation code generation...', 'agm');
            addLog('[AGM] Geoprocessing workflow approved, starting operation code generation', 'success');

            window._completedTaskId = task_id;

            const abortCtrl = startInterruptableStream();
            const res = await fetch(`${API_BASE_URL}/api/spatial-analysis/approve/${task_id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation_id: currentConversationId }),
                signal: abortCtrl.signal,
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let streamContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const update = JSON.parse(line.substring(6));

                        if (update.type === 'status') {
                            updateWorkflowCard(update.message || update.content, update.step || 'general');
                            addLog(`[AGM] ${update.message || update.content}`, 'info');
                        } else if (update.type === 'llm_update') {
                            updateWorkflowCard(update.content, update.step);
                            addLog(`[AGM] ${update.content}`, 'info');
                        } else if (update.type === 'llm_stream') {
                            appendToWorkflowCard(update.content, update.step);
                            streamContent += update.content;
                        } else if (update.type === 'step_result') {
                            displayStepResult(update);
                        } else if (update.type === 'log') {
                            addLog(`[AGM] ${update.content}`, 'info');
                        } else if (update.type === 'result') {
                            finalizeAllWorkflowCards();
                            addLog('[AGM] Operation code generation complete', 'success');
                            addChatMessage(update.response || 'Operation code generation complete.', 'agm');
                        } else if (update.type === 'error') {
                            finalizeAllWorkflowCards();
                            addLog(`[Error] ${update.error}`, 'error');
                            addChatMessage(`Error: ${update.error}`, 'agm');
                        } else if (update.type === 'complete') {
                            addLog('[AGM] Stream complete', 'success');
                        }
                    } catch (parseErr) {
                        console.warn('Could not parse SSE line:', line);
                    }
                }
            }

            stopInterruptableStream();
            chatInput.disabled = false;
            chatInput.placeholder = 'Enter a request here ....';
            if (sendBtn) sendBtn.disabled = false;
            approveBtn.disabled = false;
            feedbackBtn.disabled = false;
        } catch (e) {
            stopInterruptableStream();
            if (e.name === 'AbortError') return;
            addLog(`[Error] Failed to approve: ${e.message}`, 'error');
            addChatMessage(`Error during operation execution: ${e.message}`, 'agm');
            chatInput.disabled = false;
            chatInput.placeholder = 'Enter a request here ....';
            if (sendBtn) sendBtn.disabled = false;
            approveBtn.disabled = false;
            feedbackBtn.disabled = false;
        }
    };
    controlsDiv.appendChild(approveBtn);

    const feedbackBtn = document.createElement('button');
    feedbackBtn.textContent = '\u270E Provide Feedback';
    feedbackBtn.className = 'rp-btn-feedback';
    feedbackBtn.onclick = () => {
        _showGeoprocessingWorkflowFeedbackUI(task_id, iframe, controlsDiv, approveBtn, feedbackBtn);
    };
    controlsDiv.appendChild(feedbackBtn);

    bubble.appendChild(controlsDiv);

    wrapper.appendChild(header);
    wrapper.appendChild(bubble);
    agmMessage.appendChild(avatar);
    agmMessage.appendChild(wrapper);
    chatMessages.appendChild(agmMessage);
    smartScrollChat();

    // Autonomous Mode: auto-approve after a brief delay
    const autoToggle = document.getElementById('autonomous-mode-toggle');
    if (autoToggle && autoToggle.checked) {
        setTimeout(() => {
            addLog('[AGM] Autonomous mode \u2014 auto-approving geoprocessing workflow', 'info');
            approveBtn.click();
        }, 1500);
    }

    addLog('[AGM] Geoprocessing workflow visualization displayed', 'success');
}


/**
 * Rebuild a geoprocessing workflow visualization as a standalone chat
 * message (for conversation history reload).
 */
function spatial_analysis_rebuildWorkflowVizMessage(taskId, chatMessages) {
    const agmMessage = document.createElement('div');
    agmMessage.className = 'chat-message agm';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = '<img src="icon/AGM.png" alt="AGM" class="avatar-img">';

    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper full-width';

    const msgHeader = document.createElement('div');
    msgHeader.className = 'message-header';
    msgHeader.innerHTML = `
        <span class="message-sender">AGM</span>
        <span class="message-time"></span>
    `;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    const headerSection = document.createElement('div');
    headerSection.innerHTML = `
        <h4 style="margin-top: 0; display: flex; align-items: center; gap: 10px;">
            <span>\u{1F5FA}</span> Geoprocessing Workflow
        </h4>
        <p style="color: #666; font-size: 0.95em; margin-bottom: 10px;">
            Spatial analysis geoprocessing workflow and operation graph
        </p>
    `;
    bubble.appendChild(headerSection);

    // Tabs
    const tabsDiv = document.createElement('div');
    tabsDiv.style.cssText = 'display: flex; gap: 0; margin-bottom: 0; align-items: flex-end;';

    const geoTab = document.createElement('button');
    geoTab.textContent = 'Geoprocessing Workflow';
    geoTab.className = 'rp-tab active';
    geoTab.style.cssText = 'padding: 8px 20px; border: 1px solid #ddd; border-bottom: none; border-radius: 8px 8px 0 0; background: #667eea; color: white; cursor: pointer; font-weight: 600; font-size: 0.9em;';

    const planTab = document.createElement('button');
    planTab.textContent = 'Plan View';
    planTab.className = 'rp-tab';
    planTab.style.cssText = 'padding: 8px 20px; border: 1px solid #ddd; border-bottom: none; border-radius: 8px 8px 0 0; background: #f0f0f0; color: #333; cursor: pointer; font-weight: 600; font-size: 0.9em;';

    const fullViewBtn = document.createElement('button');
    fullViewBtn.className = 'rp-fullview-btn';
    fullViewBtn.style.cssText = 'margin-left: auto; padding: 6px 14px; border: 1px solid #ddd; border-bottom: none; border-radius: 8px 8px 0 0; background: #f8f9fa; color: #555; cursor: pointer; font-size: 0.85em; display: flex; align-items: center; gap: 5px; transition: background 0.15s;';
    fullViewBtn.title = 'Open in full view';
    fullViewBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        Full View
    `;

    tabsDiv.appendChild(geoTab);
    tabsDiv.appendChild(planTab);
    tabsDiv.appendChild(fullViewBtn);
    bubble.appendChild(tabsDiv);

    // Iframe container
    const iframeContainer = document.createElement('div');
    iframeContainer.style.cssText = 'width: 100%; height: 800px; max-height: calc(100vh - 200px); border: 1px solid #ddd; border-radius: 0 8px 8px 8px; overflow: auto;';

    const iframe = document.createElement('iframe');
    iframe.src = `${API_BASE_URL}/api/research-plan-geoprocessing/${taskId}?v=${Date.now()}`;
    iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
    iframe.id = `sa-workflow-iframe-${taskId}`;
    iframeContainer.appendChild(iframe);
    bubble.appendChild(iframeContainer);

    // Tab click handlers
    const allTabs = [planTab, geoTab];
    function activateTab(activeTab, src) {
        allTabs.forEach(t => { t.classList.remove('active'); t.style.background = '#f0f0f0'; t.style.color = '#333'; });
        activeTab.classList.add('active'); activeTab.style.background = '#667eea'; activeTab.style.color = 'white';
        iframe.src = src;
    }
    planTab.onclick = () => activateTab(planTab, `${API_BASE_URL}/api/research-plan/${taskId}?v=${Date.now()}`);
    geoTab.onclick = () => activateTab(geoTab, `${API_BASE_URL}/api/research-plan-geoprocessing/${taskId}?v=${Date.now()}`);

    // Full View button
    fullViewBtn.onmouseenter = () => { fullViewBtn.style.background = '#e9ecef'; };
    fullViewBtn.onmouseleave = () => { fullViewBtn.style.background = '#f8f9fa'; };
    fullViewBtn.onclick = () => {
        if (typeof openResearchPlanFullView === 'function') {
            openResearchPlanFullView(iframe.src, taskId, { hideFlowchart: true });
        } else {
            window.open(iframe.src, '_blank');
        }
    };

    // Controls: Approved banner + Approve/Feedback/Re-execute buttons
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'rp-controls';

    const banner = document.createElement('div');
    banner.className = 'rp-approved-banner';
    banner.style.cssText = 'width:100%; margin-bottom:8px; padding:6px 12px; background:#d4edda; border:1px solid #c3e6cb; border-radius:4px; color:#155724; font-weight:600; font-size:0.9em;';
    banner.textContent = '\u2705 Geoprocessing Workflow Approved';
    controlsDiv.appendChild(banner);

    const approveBtn = document.createElement('button');
    approveBtn.textContent = '\u2713 Approve Workflow';
    approveBtn.className = 'rp-btn-approve';
    approveBtn.onclick = async () => {
        const activeTaskId = window._completedTaskId || taskId;
        if (!activeTaskId) {
            addLog('[AGM] No task ID available.', 'error');
            return;
        }
        approveBtn.disabled = true;
        feedbackBtn.disabled = true;
        banner.textContent = '\u2705 Geoprocessing Workflow Approved! Generating operation code...';
        try {
            document.querySelectorAll('.workflow-cards-container').forEach(c => {
                const p = c.closest('.chat-message'); if (p) p.remove();
            });
            _wfCardsContainer = null;
            _wfCurrentPhase = null;
            addChatMessage('\u2705 Geoprocessing workflow approved! Starting operation code generation...', 'agm');
            addLog('[AGM] Geoprocessing workflow approved, starting operation code generation', 'success');

            const abortCtrl = startInterruptableStream();
            const res = await fetch(`${API_BASE_URL}/api/spatial-analysis/approve/${activeTaskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation_id: currentConversationId }),
                signal: abortCtrl.signal,
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const update = JSON.parse(line.substring(6));
                        if (update.type === 'status') { updateWorkflowCard(update.message || update.content, update.step || 'general'); }
                        else if (update.type === 'llm_update') { updateWorkflowCard(update.content, update.step); }
                        else if (update.type === 'llm_stream') { appendToWorkflowCard(update.content, update.step); }
                        else if (update.type === 'log') { addLog(`[AGM] ${update.content}`, 'info'); }
                        else if (update.type === 'step_result') { displayStepResult(update); }
                        else if (update.type === 'result') { finalizeAllWorkflowCards(); addLog('[AGM] Workflow complete', 'success'); addChatMessage(update.response || 'Workflow complete.', 'agm'); }
                        else if (update.type === 'error') { finalizeAllWorkflowCards(); addLog(`[Error] ${update.error}`, 'error'); addChatMessage(`Error: ${update.error}`, 'agm'); }
                    } catch (_) {}
                }
            }
            stopInterruptableStream();
        } catch (e) {
            stopInterruptableStream();
            if (e.name === 'AbortError') return;
            addLog(`[Error] Failed: ${e.message}`, 'error');
        } finally {
            approveBtn.disabled = false;
            feedbackBtn.disabled = false;
        }
    };
    controlsDiv.appendChild(approveBtn);

    const feedbackBtn = document.createElement('button');
    feedbackBtn.textContent = '\u270E Provide Feedback';
    feedbackBtn.className = 'rp-btn-feedback';
    feedbackBtn.onclick = () => {
        _showGeoprocessingWorkflowFeedbackUI(taskId, iframe, controlsDiv, approveBtn, feedbackBtn);
    };
    controlsDiv.appendChild(feedbackBtn);

    // Re-execute button
    const reexecuteBtn = document.createElement('button');
    reexecuteBtn.textContent = '\u{1F504} Re-execute All Steps';
    reexecuteBtn.className = 'rp-btn-reexecute';
    reexecuteBtn.onclick = async () => {
        const activeTaskId = window._completedTaskId || taskId;
        if (!activeTaskId) {
            addLog('[AGM] No task ID available for re-execution.', 'error');
            return;
        }
        reexecuteBtn.disabled = true;
        reexecuteBtn.textContent = '\u{1F504} Re-executing...';
        try {
            document.querySelectorAll('.workflow-cards-container').forEach(container => {
                const parentMessage = container.closest('.chat-message');
                if (parentMessage) parentMessage.remove();
            });
            _wfCardsContainer = null;
            _wfCurrentPhase = null;
            addChatMessage('\u{1F504} Re-executing all operation steps...', 'agm');
            addLog('[AGM] Re-executing all steps', 'info');

            const abortCtrl = startInterruptableStream();
            const res = await fetch(`${API_BASE_URL}/api/spatial-analysis/approve/${activeTaskId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation_id: currentConversationId }),
                signal: abortCtrl.signal,
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const update = JSON.parse(line.substring(6));
                        if (update.type === 'status') { updateWorkflowCard(update.message || update.content, update.step || 'general'); }
                        else if (update.type === 'llm_update') { updateWorkflowCard(update.content, update.step); }
                        else if (update.type === 'llm_stream') { appendToWorkflowCard(update.content, update.step); }
                        else if (update.type === 'step_result') { displayStepResult(update); }
                        else if (update.type === 'result') { finalizeAllWorkflowCards(); addChatMessage(update.response || 'Re-execution complete.', 'agm'); }
                        else if (update.type === 'error') { finalizeAllWorkflowCards(); addChatMessage(`Error: ${update.error}`, 'agm'); }
                    } catch (_) {}
                }
            }
            stopInterruptableStream();
        } catch (e) {
            stopInterruptableStream();
            if (e.name === 'AbortError') return;
            addChatMessage(`Error during re-execution: ${e.message}`, 'agm');
        } finally {
            reexecuteBtn.disabled = false;
            reexecuteBtn.textContent = '\u{1F504} Re-execute All Steps';
        }
    };
    controlsDiv.appendChild(reexecuteBtn);

    bubble.appendChild(controlsDiv);

    wrapper.appendChild(msgHeader);
    wrapper.appendChild(bubble);
    agmMessage.appendChild(avatar);
    agmMessage.appendChild(wrapper);
    chatMessages.appendChild(agmMessage);
}


// =====================================================================
//  POST-COMPLETION STEP EDITING & RE-RUNNING
// =====================================================================

/**
 * Build a full "Generated Code" section (syntax-highlighted code block +
 * Edit / Save / Re-run / Provide Feedback / Re-execute controls + feedback
 * textarea) and append it to `container`. Wires up the same refs that the
 * live render path sets on the section, so subsequent code_revised events
 * can update the code block in place.
 *
 * Removes any previous minimal-action row (built by _buildMinimalStepActions)
 * from the container first so the two don't stack.
 */
function _buildFullStepCodeSection(container, stepCode, objKey, stepIdx) {
    // Strip any previous minimal-action rows / feedback widgets so we don't
    // end up with duplicate controls after code_revised fires.
    container.querySelectorAll('.step-code-actions, .wf-feedback-textarea, .wf-feedback-actions, .wf-result-code-section').forEach(el => el.remove());

    const codeSection = document.createElement('div');
    codeSection.className = 'wf-result-code-section';
    const codeSectionHeader = document.createElement('div');
    codeSectionHeader.className = 'wf-section-header';
    codeSectionHeader.innerHTML = '<span class="wf-section-icon">&#128221;</span> Generated Code';
    codeSection.appendChild(codeSectionHeader);

    const codePre = document.createElement('pre');
    codePre.className = 'wf-stream-code';
    const codeEl = document.createElement('code');
    codeEl.className = 'language-python';
    codeEl.textContent = stepCode;
    codePre.appendChild(codeEl);
    codeSection.appendChild(codePre);
    if (window.hljs) hljs.highlightElement(codeEl);
    if (typeof attachCopyCodeButton === 'function') {
        attachCopyCodeButton(codeSectionHeader, () => codeEl.textContent);
    }

    const editorArea = document.createElement('textarea');
    editorArea.className = 'wf-stream-code-editor';
    editorArea.value = stepCode;
    editorArea.spellcheck = false;
    editorArea.style.display = 'none';
    codeSection.appendChild(editorArea);

    let currentCode = stepCode;

    const actions = document.createElement('div');
    actions.className = 'step-code-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-edit-code';
    editBtn.textContent = 'Edit Code';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-save-code';
    saveBtn.textContent = 'Save';
    saveBtn.style.display = 'none';

    const runBtn = document.createElement('button');
    runBtn.className = 'btn-run-code';
    runBtn.textContent = 'Re-run';

    const regenBtn = document.createElement('button');
    regenBtn.className = 'btn-regenerate';
    regenBtn.textContent = 'Provide Feedback';

    const reExecBtn = document.createElement('button');
    reExecBtn.className = 'btn-re-execute';
    reExecBtn.textContent = 'Re-execute Step';

    editBtn.onclick = () => {
        editorArea.value = currentCode;
        codePre.style.display = 'none';
        editorArea.style.display = '';
        editBtn.style.display = 'none';
        saveBtn.style.display = '';
    };

    saveBtn.onclick = () => {
        currentCode = editorArea.value;
        editorArea.style.display = 'none';
        codePre.style.display = '';
        codeEl.textContent = currentCode;
        codeEl.classList.remove('hljs');
        if (window.hljs) hljs.highlightElement(codeEl);
        saveBtn.style.display = 'none';
        editBtn.style.display = '';
    };

    runBtn.onclick = () => {
        if (editorArea.style.display !== 'none') {
            currentCode = editorArea.value;
            editorArea.style.display = 'none';
            codePre.style.display = '';
            codeEl.textContent = currentCode;
            codeEl.classList.remove('hljs');
            if (window.hljs) hljs.highlightElement(codeEl);
            saveBtn.style.display = 'none';
            editBtn.style.display = '';
        }
        const tid = (typeof _activeTaskId === 'function') ? _activeTaskId() : null;
        if (!tid) { addLog('[Error] No task ID available for re-run', 'error'); return; }
        if (objKey === 'assembly') {
            rerunAssembly(tid, 'edit', currentCode, '', container);
        } else {
            rerunStep(tid, objKey, stepIdx, 'edit', currentCode, '', container);
        }
    };

    reExecBtn.onclick = () => {
        const tid = (typeof _activeTaskId === 'function') ? _activeTaskId() : null;
        if (!tid) { addLog('[Error] No task ID available for re-execute', 'error'); return; }
        if (objKey === 'assembly') {
            rerunAssembly(tid, 're_execute', null, '', container);
        } else {
            rerunStep(tid, objKey, stepIdx, 're_execute', null, '', container);
        }
    };

    const feedbackArea = document.createElement('textarea');
    feedbackArea.className = 'wf-feedback-textarea';
    feedbackArea.placeholder = 'Describe what you want changed or improved...';
    feedbackArea.spellcheck = true;
    feedbackArea.style.display = 'none';

    const feedbackActions = document.createElement('div');
    feedbackActions.className = 'wf-feedback-actions';
    feedbackActions.style.display = 'none';

    const submitFeedbackBtn = document.createElement('button');
    submitFeedbackBtn.className = 'btn-run-code';
    submitFeedbackBtn.textContent = 'Revise Code';

    const cancelFeedbackBtn = document.createElement('button');
    cancelFeedbackBtn.className = 'btn-edit-code';
    cancelFeedbackBtn.textContent = 'Cancel';

    feedbackActions.appendChild(submitFeedbackBtn);
    feedbackActions.appendChild(cancelFeedbackBtn);

    regenBtn.onclick = () => {
        const isVisible = feedbackArea.style.display !== 'none';
        feedbackArea.style.display = isVisible ? 'none' : '';
        feedbackActions.style.display = isVisible ? 'none' : '';
        if (!isVisible) feedbackArea.focus();
    };

    submitFeedbackBtn.onclick = () => {
        const instructions = feedbackArea.value.trim();
        const tid = (typeof _activeTaskId === 'function') ? _activeTaskId() : null;
        if (!tid) { addLog('[Error] No task ID available for re-run', 'error'); return; }
        if (objKey === 'assembly') {
            rerunAssembly(tid, 'regenerate', null, instructions, container);
        } else {
            rerunStep(tid, objKey, stepIdx, 'regenerate', null, instructions, container);
        }
        feedbackArea.style.display = 'none';
        feedbackActions.style.display = 'none';
        feedbackArea.value = '';
    };

    cancelFeedbackBtn.onclick = () => {
        feedbackArea.style.display = 'none';
        feedbackActions.style.display = 'none';
    };

    actions.appendChild(editBtn);
    actions.appendChild(saveBtn);
    actions.appendChild(runBtn);
    actions.appendChild(regenBtn);
    actions.appendChild(reExecBtn);
    codeSection.appendChild(actions);
    codeSection.appendChild(feedbackArea);
    codeSection.appendChild(feedbackActions);

    container.appendChild(codeSection);

    // Expose refs so rerunStep's code_revised handler can update in place
    container._existingCodePre = codePre;
    container._existingCodeEl = codeEl;
    container._editorArea = editorArea;
    container._setCurrentCode = (c) => { currentCode = c; };
}


/**
 * Build a minimal action row for steps that have no generated code yet
 * (typically status="skipped" due to upstream failure, or error-before-codegen).
 * Offers Re-execute Step (regenerate + run from scratch) and Provide Feedback
 * (regenerate with user instructions). Appended to `container`.
 */
function _buildMinimalStepActions(container, objKey, stepIdx) {
    const actions = document.createElement('div');
    actions.className = 'step-code-actions';

    const reExecBtn = document.createElement('button');
    reExecBtn.className = 'btn-re-execute';
    reExecBtn.textContent = 'Re-execute Step';

    const regenBtn = document.createElement('button');
    regenBtn.className = 'btn-regenerate';
    regenBtn.textContent = 'Provide Feedback';

    const feedbackArea = document.createElement('textarea');
    feedbackArea.className = 'wf-feedback-textarea';
    feedbackArea.placeholder = 'Describe what you want changed or improved...';
    feedbackArea.spellcheck = true;
    feedbackArea.style.display = 'none';

    const feedbackActions = document.createElement('div');
    feedbackActions.className = 'wf-feedback-actions';
    feedbackActions.style.display = 'none';

    const submitFeedbackBtn = document.createElement('button');
    submitFeedbackBtn.className = 'btn-run-code';
    submitFeedbackBtn.textContent = 'Revise Code';

    const cancelFeedbackBtn = document.createElement('button');
    cancelFeedbackBtn.className = 'btn-edit-code';
    cancelFeedbackBtn.textContent = 'Cancel';

    feedbackActions.appendChild(submitFeedbackBtn);
    feedbackActions.appendChild(cancelFeedbackBtn);

    reExecBtn.onclick = () => {
        const tid = (typeof _activeTaskId === 'function') ? _activeTaskId() : null;
        if (!tid) { addLog('[Error] No task ID available for re-execute', 'error'); return; }
        if (objKey === 'assembly') {
            rerunAssembly(tid, 're_execute', null, '', container);
        } else {
            rerunStep(tid, objKey, stepIdx, 're_execute', null, '', container);
        }
    };

    regenBtn.onclick = () => {
        const isVisible = feedbackArea.style.display !== 'none';
        feedbackArea.style.display = isVisible ? 'none' : '';
        feedbackActions.style.display = isVisible ? 'none' : '';
        if (!isVisible) feedbackArea.focus();
    };

    submitFeedbackBtn.onclick = () => {
        const instructions = feedbackArea.value.trim();
        const tid = (typeof _activeTaskId === 'function') ? _activeTaskId() : null;
        if (!tid) { addLog('[Error] No task ID available for re-run', 'error'); return; }
        if (objKey === 'assembly') {
            rerunAssembly(tid, 'regenerate', null, instructions, container);
        } else {
            rerunStep(tid, objKey, stepIdx, 'regenerate', null, instructions, container);
        }
        feedbackArea.style.display = 'none';
        feedbackActions.style.display = 'none';
        feedbackArea.value = '';
    };

    cancelFeedbackBtn.onclick = () => {
        feedbackArea.style.display = 'none';
        feedbackActions.style.display = 'none';
    };

    actions.appendChild(regenBtn);
    actions.appendChild(reExecBtn);
    container.appendChild(actions);
    container.appendChild(feedbackArea);
    container.appendChild(feedbackActions);
}


/**
 * Re-run a single step with edited or regenerated code.
 */
async function rerunStep(taskId, objKey, stepIdx, mode, code, instructions, section) {
    addLog(`[User] Re-running ${objKey} step ${stepIdx} (mode: ${mode})`, 'info');

    // Find the parent card body to stream execution output into
    const cardBody = section ? section.closest('.wf-card-body') : null;

    // Create a streaming area inside the card body for re-run output
    let streamArea = null;
    if (cardBody) {
        // Remove any previous rerun stream area or prompt controls
        const oldStream = cardBody.querySelector('.rerun-stream-area');
        if (oldStream) oldStream.remove();
        const oldPrompt = cardBody.querySelector('.rerun-prompt-controls');
        if (oldPrompt) oldPrompt.remove();

        streamArea = document.createElement('div');
        streamArea.className = 'rerun-stream-area';
        streamArea.innerHTML = `<div class="rerun-stream-header">Re-running Step ${stepIdx}...</div>`;
        // Insert right after the step being re-run so the stream area sits
        // between this step and the downstream (skipped) steps, instead of
        // at the bottom of the card.
        if (section && section.parentNode === cardBody) {
            cardBody.insertBefore(streamArea, section.nextSibling);
        } else {
            cardBody.appendChild(streamArea);
        }
        smartScrollChat();
    }

    try {
        const abortCtrl = startInterruptableStream();
        const res = await fetch(`${API_BASE_URL}/api/workflow/rerun-step/${taskId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                objective_key: objKey,
                step_index: stepIdx,
                mode: mode,
                code: code,
                extra_instructions: instructions,
            }),
            signal: abortCtrl.signal,
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const update = JSON.parse(line.substring(6));

                    if (update.type === 'status' || update.type === 'llm_update') {
                        const msg = update.message || update.content || '';
                        addLog(`[AGM] ${msg}`, 'info');
                        // Stream into the card
                        if (streamArea) {
                            const line = document.createElement('div');
                            line.className = 'rerun-stream-line';
                            line.textContent = msg;
                            streamArea.appendChild(line);
                            smartScrollChat();
                        }
                    } else if (update.type === 'llm_stream') {
                        // Streaming LLM code generation chunks
                        if (streamArea) {
                            let codeArea = streamArea.querySelector('.rerun-stream-code');
                            if (!codeArea) {
                                codeArea = document.createElement('pre');
                                codeArea.className = 'rerun-stream-code';
                                streamArea.appendChild(codeArea);
                            }
                            codeArea.textContent += (update.content || '');
                            smartScrollChat();
                        }
                    } else if (update.type === 'code_revised') {
                        // Revised code returned — update the code display in the same card
                        if (streamArea) {
                            streamArea.innerHTML = `<div class="rerun-stream-line" style="color:#28a745;">✔ Code revised. Review below and click Re-run to execute.</div>`;
                        }
                        if (section) {
                            const codeEl = section._existingCodeEl;
                            const codePre = section._existingCodePre;
                            const editorArea = section._editorArea;
                            const setCode = section._setCurrentCode;

                            if (codeEl) {
                                // An existing code block is already rendered — update in place.
                                codeEl.textContent = update.code;
                                codeEl.classList.remove('hljs');
                                if (window.hljs) hljs.highlightElement(codeEl);
                                if (codePre) codePre.style.display = '';
                                if (editorArea) editorArea.style.display = 'none';
                                if (setCode) setCode(update.code);
                            } else {
                                // No code block existed (skipped / error-before-codegen path).
                                // Build a full Generated Code section + controls now so the
                                // user can review and Re-run.
                                _buildFullStepCodeSection(section, update.code || '', objKey, stepIdx);
                            }
                        }
                        addLog(`[AGM] Code revised for step ${stepIdx}. Review and click Re-run.`, 'info');
                    } else if (update.type === 'step_result') {
                        if (streamArea) {
                            if (update.status === 'error') {
                                const errMsg = update.error || 'Unknown error';
                                streamArea.innerHTML = `<div class="rerun-stream-line" style="color:#dc3545; font-weight:bold;">Re-run failed</div>` +
                                    `<div class="rerun-stream-line" style="color:#dc3545;">${errMsg}</div>`;
                            } else {
                                streamArea.innerHTML = `<div class="rerun-stream-line" style="color:#28a745;">Re-run complete.</div>`;
                            }
                        }
                        updateStepResultSection(section, update);
                        addLog(`[AGM] Step ${stepIdx} re-run: ${update.status}`, update.status === 'completed' ? 'success' : 'error');

                        // Update the parent card header badge
                        const parentCard = section ? section.closest('.wf-card') : null;
                        if (parentCard) {
                            const cardHeader = parentCard.querySelector('.wf-card-header');
                            if (cardHeader) {
                                let badge = cardHeader.querySelector('.wf-card-badge');
                                if (!badge) {
                                    badge = document.createElement('span');
                                    badge.className = 'wf-card-badge';
                                    cardHeader.appendChild(badge);
                                }
                                badge.className = `wf-card-badge ${update.status === 'completed' ? 'success' : 'error'}`;
                                badge.textContent = update.status === 'completed' ? 'Completed' : 'Error';
                            }
                        }

                    } else if (update.type === 'rerun_prompt') {
                        handleRerunPrompt(taskId, update, cardBody);
                    } else if (update.type === 'error') {
                        addLog(`[Error] ${update.error}`, 'error');
                        if (streamArea) {
                            const errLine = document.createElement('div');
                            errLine.className = 'rerun-stream-line';
                            errLine.style.color = '#dc3545';
                            errLine.textContent = `Error: ${update.error}`;
                            streamArea.appendChild(errLine);
                        }
                    }
                } catch (e) {
                    console.warn('Parse error:', e);
                }
            }
        }

        stopInterruptableStream();
    } catch (e) {
        stopInterruptableStream();
        if (e.name === 'AbortError') return;
        addLog(`[Error] Re-run failed: ${e.message}`, 'error');
        if (streamArea) {
            const errLine = document.createElement('div');
            errLine.className = 'rerun-stream-line';
            errLine.style.color = '#dc3545';
            errLine.textContent = `Re-run failed: ${e.message}`;
            streamArea.appendChild(errLine);
        }
    }
}

/**
 * Re-run the assembly program.
 * mode: 're_execute' (run saved code), 'edit' (run user-edited code), 'regenerate' (LLM + feedback)
 */
async function rerunAssembly(taskId, mode, code, instructions, section) {
    addLog(`[User] Re-running assembly program (mode: ${mode})`, 'info');

    const cardBody = section ? section.closest('.wf-card-body') : null;
    let streamArea = null;
    if (cardBody) {
        const oldStream = cardBody.querySelector('.rerun-stream-area');
        if (oldStream) oldStream.remove();
        streamArea = document.createElement('div');
        streamArea.className = 'rerun-stream-area';
        streamArea.innerHTML = `<div class="rerun-stream-header">Re-running Assembly Program...</div>`;
        if (section && section.parentNode === cardBody) {
            cardBody.insertBefore(streamArea, section.nextSibling);
        } else {
            cardBody.appendChild(streamArea);
        }
        smartScrollChat();
    }

    try {
        const abortCtrl = startInterruptableStream();
        const res = await fetch(`${API_BASE_URL}/api/workflow/rerun-assembly/${taskId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode, code, extra_instructions: instructions }),
            signal: abortCtrl.signal,
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const update = JSON.parse(line.substring(6));
                    if (update.type === 'status' || update.type === 'llm_update') {
                        const msg = update.message || update.content || '';
                        addLog(`[AGM] ${msg}`, 'info');
                        if (streamArea) {
                            const el = document.createElement('div');
                            el.className = 'rerun-stream-line';
                            el.textContent = msg;
                            streamArea.appendChild(el);
                            streamArea.scrollTop = streamArea.scrollHeight;
                            smartScrollChat();
                        }
                    } else if (update.type === 'llm_stream') {
                        if (streamArea) {
                            let codeArea = streamArea.querySelector('.rerun-stream-code');
                            if (!codeArea) {
                                codeArea = document.createElement('pre');
                                codeArea.className = 'rerun-stream-code';
                                streamArea.appendChild(codeArea);
                            }
                            codeArea.textContent += (update.content || '');
                            // Both the inner code pre and the outer stream area
                            // have their own overflow — pin both to the bottom.
                            codeArea.scrollTop = codeArea.scrollHeight;
                            streamArea.scrollTop = streamArea.scrollHeight;
                            smartScrollChat();
                        }
                    } else if (update.type === 'step_result') {
                        if (streamArea) {
                            streamArea.innerHTML = update.status === 'error'
                                ? `<div class="rerun-stream-line" style="color:#dc3545;font-weight:bold;">Re-run failed: ${update.error || ''}</div>`
                                : `<div class="rerun-stream-line" style="color:#28a745;">Re-run complete.</div>`;
                        }

                        // Re-resolve the section against the live DOM. The
                        // closure-captured `section` from the first feedback
                        // round can be stale on the second round if anything
                        // re-rendered the card body. Fall back to scanning
                        // by phase/objective so updates always land in a
                        // section that's actually attached.
                        let liveSection = section;
                        if (!liveSection || !document.body.contains(liveSection)) {
                            const card = document.querySelector('#wf-card-assembly_execution')
                                      || document.querySelector('#wf-card-assembly');
                            if (card) {
                                liveSection = card.querySelector('.step-result-section');
                            }
                        }
                        if (liveSection) {
                            updateStepResultSection(liveSection, update);
                        } else if (typeof displayStepResult === 'function') {
                            // Last resort: render a fresh section. The card
                            // creation pathway in displayStepResult will make
                            // one if missing.
                            displayStepResult(update);
                            const card = document.querySelector('#wf-card-assembly_execution')
                                      || document.querySelector('#wf-card-assembly');
                            liveSection = card ? card.querySelector('.step-result-section') : null;
                        } else {
                            addLog('[Warn] Could not locate assembly result section to update.', 'error');
                        }
                        addLog(`[AGM] Assembly re-run: ${update.status}`, update.status === 'completed' ? 'success' : 'error');

                        const parentCard = liveSection ? liveSection.closest('.wf-card') : null;
                        if (parentCard) {
                            const cardHeader = parentCard.querySelector('.wf-card-header');
                            if (cardHeader) {
                                let badge = cardHeader.querySelector('.wf-card-badge');
                                if (!badge) {
                                    badge = document.createElement('span');
                                    badge.className = 'wf-card-badge';
                                    cardHeader.appendChild(badge);
                                }
                                badge.className = `wf-card-badge ${update.status === 'completed' ? 'success' : 'error'}`;
                                badge.textContent = update.status === 'completed' ? 'Completed' : 'Error';
                            }
                        }
                    } else if (update.type === 'error') {
                        addLog(`[Error] ${update.error}`, 'error');
                        if (streamArea) {
                            const el = document.createElement('div');
                            el.className = 'rerun-stream-line';
                            el.style.color = '#dc3545';
                            el.textContent = `Error: ${update.error}`;
                            streamArea.appendChild(el);
                        }
                    }
                } catch (e) { console.warn('Parse error:', e); }
            }
        }
        stopInterruptableStream();
    } catch (e) {
        stopInterruptableStream();
        if (e.name === 'AbortError') return;
        addLog(`[Error] Assembly re-run failed: ${e.message}`, 'error');
        if (streamArea) {
            const el = document.createElement('div');
            el.className = 'rerun-stream-line';
            el.style.color = '#dc3545';
            el.textContent = `Re-run failed: ${e.message}`;
            streamArea.appendChild(el);
        }
    }
}

/**
 * Update an existing step-result-section with new execution results.
 */
function updateStepResultSection(section, stepResult, options) {
    const opts = options || {};
    const isReload = opts.isReload || false;
    if (!section) return;

    // Update status badge
    const badge = section.querySelector('.step-result-status');
    if (badge) {
        const sc = stepResult.status === 'completed' ? 'success' : (stepResult.status === 'skipped' ? 'skipped' : 'error');
        const st = stepResult.status === 'completed' ? 'Completed' : (stepResult.status === 'skipped' ? 'Skipped' : 'Error');
        badge.className = `step-result-status ${sc}`;
        badge.textContent = st;
    }

    // Update code in the existing wf-stream-code block and editor
    if (stepResult.code) {
        if (section._existingCodeEl) {
            section._existingCodeEl.textContent = stepResult.code;
            section._existingCodeEl.classList.remove('hljs');
            if (window.hljs) hljs.highlightElement(section._existingCodeEl);
        }
        if (section._editorArea) {
            section._editorArea.value = stepResult.code;
        }
        if (section._setCurrentCode) {
            section._setCurrentCode(stepResult.code);
        }
    }

    // Update or add error message
    let errorDiv = section.querySelector('.step-result-error');
    if (stepResult.error) {
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.className = 'step-result-error';
            const headerRow = section.querySelector('.step-result-header');
            if (headerRow) headerRow.insertAdjacentElement('afterend', errorDiv);
        }
        errorDiv.innerHTML = `<div style="font-weight:bold;">${stepResult.error}</div>`;
    } else if (errorDiv && !isReload) {
        // Only remove existing error div on actual re-runs, not on reload
        // (reload may return empty error when DB data had the real error)
        errorDiv.remove();
    }

    // Show empty data warning if output files have no data rows
    let emptyWarnDiv = section.querySelector('.step-result-empty-data-warning');
    const emptyDataWarning = stepResult.empty_data_warning || '';
    if (emptyDataWarning) {
        if (!emptyWarnDiv) {
            emptyWarnDiv = document.createElement('div');
            emptyWarnDiv.className = 'step-result-empty-data-warning';
            const headerRow = section.querySelector('.step-result-header');
            if (headerRow) headerRow.insertAdjacentElement('afterend', emptyWarnDiv);
        }
        emptyWarnDiv.textContent = emptyDataWarning;
    } else if (emptyWarnDiv) {
        emptyWarnDiv.remove();
    }

    // Replace artifact tiles with the new ones. Stamp a version on every
    // artifact so _artifactUrl appends a cache-buster — re-runs overwrite
    // files at the same relative_path and the browser would otherwise serve
    // the stale copy until a manual refresh. isReload keeps the original
    // stamp (if any) so clicking a historical tile doesn't force a needless
    // refetch on plain conversation reload.
    const artifacts = stepResult.artifacts || [];
    if (!isReload) {
        const stamp = Date.now();
        artifacts.forEach(a => { a._v = stamp; });
    }
    const visibleArtifacts = artifacts.filter(a => !a.is_shapefile_component);
    const output = stepResult.output || '';

    const oldGrid = section.querySelector('.step-result-artifacts-grid');
    const hasTiles = (output && output.trim()) || visibleArtifacts.length > 0;

    // On reload, if the refresh has no artifacts/output data, keep the existing
    // grid that was already built from DB-saved card data rather than wiping it.
    const skipGridUpdate = isReload && !hasTiles && oldGrid;

    if (!skipGridUpdate && oldGrid) oldGrid.remove();

    if (hasTiles) {
        const grid = document.createElement('div');
        grid.className = 'step-result-artifacts-grid';

        // Output tile
        if (output && output.trim()) {
            const outputTile = document.createElement('div');
            outputTile.className = 'step-artifact-card step-output-tile';
            outputTile.innerHTML = `
                <span class="artifact-icon">📝</span>
                <span class="artifact-name" title="Click to view full output">Console Output</span>
                <span class="artifact-size">${output.length} chars</span>
            `;
            outputTile.addEventListener('click', () => {
                showOutputInResultsPanel(
                    stepResult.step_index, stepResult.step_description,
                    output, stepResult.status, stepResult.error
                );
            });
            grid.appendChild(outputTile);
        }

        // Artifact tiles
        visibleArtifacts.forEach(artifact => {
            const tile = document.createElement('div');
            tile.className = 'step-artifact-card';
            let icon = '📄';
            const t = (artifact.type || '').toLowerCase();
            if (t === 'png' || t === 'jpg' || t === 'jpeg') icon = '🖼️';
            else if (t === 'csv') icon = '📊';
            else if (t === 'html') icon = '🌐';
            else if (t === 'json' || t === 'geojson') icon = '📋';
            else if (t === 'gpkg' || t === 'shp') icon = '🗺️';
            else if (t === 'txt' || t === 'md') icon = '📝';
            else if (t === 'npy') icon = '🔢';

            const sizeKB = (artifact.size / 1024).toFixed(1);
            const displayName = getDisplayName(artifact.filename);
            tile.innerHTML = `
                <span class="artifact-icon">${icon}</span>
                <span class="artifact-name" title="${artifact.filename}">${displayName}</span>
                <span class="artifact-size">${sizeKB} KB</span>
            `;
            tile.addEventListener('click', () => { previewArtifact(artifact); });
            grid.appendChild(tile);
        });

        // Insert grid after the header row (before any edit controls or summaries)
        const headerRow = section.querySelector('.step-result-header');
        if (headerRow) {
            headerRow.insertAdjacentElement('afterend', grid);
        } else {
            section.appendChild(grid);
        }

        // Update global artifacts
        if (visibleArtifacts.length > 0) {
            if (window.currentArtifacts) {
                window.currentArtifacts.push(...artifacts);
            } else {
                window.currentArtifacts = [...artifacts];
            }
        }
    }

    // Show re-run result summary (only on actual re-runs, not on conversation reload)
    if (!isReload) {
        let resultSummary = section.querySelector('.rerun-result-summary');
        if (!resultSummary) {
            resultSummary = document.createElement('div');
            resultSummary.className = 'rerun-result-summary';
            section.appendChild(resultSummary);
        }

        const artifactCount = visibleArtifacts.length;
        const statusClass = stepResult.status === 'completed' ? 'success' : 'error';
        const statusText = stepResult.status === 'completed' ? 'Re-run succeeded' : 'Re-run failed';

        resultSummary.innerHTML = `
            <span class="step-result-status ${statusClass}">${statusText}</span>
            ${artifactCount > 0 ? `<span style="margin-left:8px; font-size:0.85em; color:#666;">${artifactCount} file(s) created</span>` : ''}
        `;
    }
}

/**
 * Show cascade / re-analysis prompt after a step re-run completes.
 * Renders inline in the card body (not as a separate chat message).
 */
function handleRerunPrompt(taskId, promptData, cardBody) {
    // Remove any previous prompt controls in this card
    if (cardBody) {
        const old = cardBody.querySelector('.rerun-prompt-controls');
        if (old) old.remove();
    }

    const container = document.createElement('div');
    container.className = 'rerun-prompt-controls';
    // State flag: if user clicks Skip, suppress the automatic update
    let _skipAutoUpdate = false;

    const msgText = document.createElement('div');
    msgText.className = 'rerun-prompt-message';
    msgText.textContent = promptData.message;
    container.appendChild(msgText);

    // Status line explaining automatic behavior
    const autoStatus = document.createElement('div');
    autoStatus.className = 'rerun-prompt-auto-status';
    autoStatus.style.cssText = 'margin-top:6px; font-size:0.9em; color:#555;';
    container.appendChild(autoStatus);

    const controls = document.createElement('div');
    controls.className = 'rerun-prompt-buttons';

    // Helper to run the auto-update step (honors skip flag)
    const runAutoUpdate = async () => {
        if (_skipAutoUpdate) return;
        autoStatus.textContent = 'Auto-updating result analysis & manuscript...';
        try {
            await updateResultAnalysis(taskId);
            autoStatus.textContent = 'Result analysis & manuscript updated automatically.';
        } catch (e) {
            autoStatus.textContent = `Auto-update failed: ${e && e.message ? e.message : e}`;
        }
    };

    // Cascade button (only if there are dependents) — chains into auto-update
    if (promptData.has_dependents) {
        autoStatus.textContent = 'After cascade finishes, result analysis & manuscript will update automatically.';
        const cascadeBtn = document.createElement('button');
        cascadeBtn.textContent = `Re-run Downstream Steps (${promptData.dependents.join(', ')})`;
        cascadeBtn.className = 'btn-run-code';
        cascadeBtn.onclick = async () => {
            cascadeBtn.disabled = true;
            cascadeBtn.textContent = 'Cascading...';
            await cascadeRerun(taskId, promptData.objective_key, promptData.dependents);
            cascadeBtn.textContent = 'Cascade complete';
            await runAutoUpdate();
        };
        controls.appendChild(cascadeBtn);
    }

    // Skip button — cancels the pending auto-update (or the cascade path too)
    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip';
    skipBtn.className = 'btn-skip-step';
    skipBtn.onclick = () => {
        _skipAutoUpdate = true;
        autoStatus.textContent = '';
        container.innerHTML = '<em class="rerun-prompt-dismissed">No further action taken.</em>';
    };
    controls.appendChild(skipBtn);

    container.appendChild(controls);

    // Append to the card body if available, otherwise fall back to chat
    if (cardBody) {
        cardBody.appendChild(container);
        smartScrollChat();
    } else {
        // Fallback: render as a chat message
        const chatMessages = document.getElementById('chat-messages');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message agm';
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = '<img src="icon/AGM.png" alt="AGM" class="avatar-img">';
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper';
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.appendChild(container);
        wrapper.appendChild(bubble);
        msgDiv.appendChild(avatar);
        msgDiv.appendChild(wrapper);
        chatMessages.appendChild(msgDiv);
        smartScrollChat();
    }

    // If there are no downstream dependents, there's nothing to cascade —
    // kick off the result analysis / manuscript update automatically.
    // The user can still click Skip briefly to abort before it starts.
    if (!promptData.has_dependents) {
        setTimeout(() => { runAutoUpdate(); }, 300);
    }
}

/**
 * Cascade re-run downstream dependent steps.
 */
async function cascadeRerun(taskId, objKey, stepIndices) {
    addLog(`[User] Cascading re-run to steps: ${stepIndices.join(', ')}`, 'info');
    try {
        const abortCtrl = startInterruptableStream();
        const res = await fetch(`${API_BASE_URL}/api/workflow/cascade-rerun/${taskId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ objective_key: objKey, step_indices: stepIndices }),
            signal: abortCtrl.signal,
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const update = JSON.parse(line.substring(6));
                    if (update.type === 'status' || update.type === 'llm_update') {
                        addLog(`[AGM] ${update.message || update.content}`, 'info');
                    } else if (update.type === 'step_result') {
                        addLog(`[AGM] Cascade step ${update.step_index}: ${update.status}`, update.status === 'completed' ? 'success' : 'error');
                        // Update the original step result section if found
                        const allSections = document.querySelectorAll('.step-result-section');
                        allSections.forEach(s => {
                            if (String(s.dataset.stepIndex) === String(update.step_index)) {
                                updateStepResultSection(s, update);
                            }
                        });
                    } else if (update.type === 'error') {
                        addLog(`[Error] ${update.error}`, 'error');
                    }
                } catch (e) { /* skip */ }
            }
        }

        stopInterruptableStream();
        addLog('[AGM] Cascade re-run complete', 'success');
    } catch (e) {
        stopInterruptableStream();
        if (e.name !== 'AbortError') addLog(`[Error] Cascade failed: ${e.message}`, 'error');
    }
}

/**
 * Show a rolling green loading spinner inside a workflow card body.
 * Returns the spinner element so it can be removed later.
 */
function _showCardSpinner(cardId, message) {
    if (!_wfCardsContainer) return null;
    const card = _wfCardsContainer.querySelector(`#wf-card-${cardId}`);
    if (!card) return null;

    let body = card.querySelector('.wf-card-body');
    if (!body) {
        body = document.createElement('div');
        body.className = 'wf-card-body';
        card.appendChild(body);
    }

    // Clear old content
    body.innerHTML = '';
    body.classList.add('step-result-body');

    const spinner = document.createElement('div');
    spinner.className = 'update-analysis-spinner';
    spinner.innerHTML = `
        <div class="spinner-bar"></div>
        <span class="spinner-label">${message || 'Updating...'}</span>
    `;
    body.appendChild(spinner);

    // Expand card
    card.classList.remove('collapsed');
    const toggleEl = card.querySelector('.wf-card-toggle');
    if (toggleEl) toggleEl.innerHTML = '&#9660;';

    return spinner;
}

/**
 * Remove a spinner from a workflow card body.
 */
function _removeCardSpinner(cardId) {
    if (!_wfCardsContainer) return;
    const card = _wfCardsContainer.querySelector(`#wf-card-${cardId}`);
    if (!card) return;
    const body = card.querySelector('.wf-card-body');
    if (!body) return;
    const spinner = body.querySelector('.update-analysis-spinner');
    if (spinner) spinner.remove();
}

/**
 * Stream LLM tokens into a workflow card body, replacing the spinner with
 * live-updating text using the same format as the original workflow streaming.
 */
function _streamToCard(cardId, token) {
    if (!_wfCardsContainer) return;
    const card = _wfCardsContainer.querySelector(`#wf-card-${cardId}`);
    if (!card) return;

    let body = card.querySelector('.wf-card-body');
    if (!body) return;

    // On first token, remove spinner
    const spinner = body.querySelector('.update-analysis-spinner');
    if (spinner) spinner.remove();

    // Use the same streaming pattern as the original workflow cards
    appendToWorkflowCard(token, cardId);
}

/**
 * Update Result Analysis: update flowchart, presentation, and discussion
 * with only the changed sections — shows live streaming in the cards.
 */
async function updateResultAnalysis(taskId) {
    addLog('[User] Updating result analysis...', 'info');

    // Show loading spinners in each result analysis card
    _showCardSpinner('ra_flowchart', 'Updating flowchart...');
    _showCardSpinner('ra_present', 'Updating result presentation...');
    _showCardSpinner('ra_discuss', 'Updating result discussion...');

    // Track which phase is currently streaming so llm_stream tokens go to the right card
    let activeStreamCard = null;

    try {
        const abortCtrl = startInterruptableStream();
        const res = await fetch(`${API_BASE_URL}/api/workflow/update-analysis/${taskId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortCtrl.signal,
        });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const update = JSON.parse(line.substring(6));
                    if (update.type === 'status' || update.type === 'llm_update') {
                        addLog(`[AGM] ${update.message || update.content}`, 'info');
                    } else if (update.type === 'llm_stream') {
                        // Route streaming tokens to the active card
                        const step = update.step || '';
                        if (step.includes('ra_present') || step.includes('present')) {
                            activeStreamCard = 'ra_present';
                        } else if (step.includes('ra_discuss') || step.includes('discuss')) {
                            activeStreamCard = 'ra_discuss';
                        }
                        if (activeStreamCard) {
                            _streamToCard(activeStreamCard, update.content || '');
                        }
                    } else if (update.type === 'figure_catalog') {
                        displayFigureCatalog(update.figures || [], update.step);
                    } else if (update.type === 'execution_flowchart') {
                        // Flowchart ready — remove spinner and display
                        _removeCardSpinner('ra_flowchart');
                        displayExecutionFlowchart(update.relative_path, update.step);
                    } else if (update.type === 'result_presentation') {
                        // Final presentation ready — replace streaming text with rendered markdown
                        activeStreamCard = null;
                        displayMarkdownResult('Result Presentation', '', update.content, update.relative_path, update.step);
                    } else if (update.type === 'result_discussion') {
                        // Final discussion ready — replace streaming text with rendered markdown
                        activeStreamCard = null;
                        displayMarkdownResult('Result Discussion', '', update.content, update.relative_path, update.step);
                    } else if (update.type === 'manuscript_section') {
                        activeStreamCard = null;
                        displayMarkdownResult(`Manuscript: ${update.section}`, '', update.content, update.relative_path, update.step);
                    } else if (update.type === 'manuscript_complete') {
                        activeStreamCard = null;
                        displayMarkdownResult('Full Manuscript', '', update.content, update.relative_path, update.step);
                    } else if (update.type === 'result') {
                        addLog('[AGM] Result analysis updated', 'success');
                    } else if (update.type === 'error') {
                        addLog(`[Error] ${update.error}`, 'error');
                    }
                } catch (e) { /* skip */ }
            }
        }

        // Clean up any remaining spinners (in case some events were not emitted)
        _removeCardSpinner('ra_flowchart');
        _removeCardSpinner('ra_present');
        _removeCardSpinner('ra_discuss');

        stopInterruptableStream();
    } catch (e) {
        // Clean up spinners on error
        _removeCardSpinner('ra_flowchart');
        _removeCardSpinner('ra_present');
        _removeCardSpinner('ra_discuss');
        stopInterruptableStream();
        if (e.name !== 'AbortError') addLog(`[Error] Update analysis failed: ${e.message}`, 'error');
    }
}

// ==================== End Map Resize Functionality (Removed) ====================
