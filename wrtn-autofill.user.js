// ==UserScript==
// @name         WRTN Story Situation Autofill
// @namespace    local
// @version      0.1.0
// @description  Autofill title/situation fields after you upload images on the WRTN story builder page.
// @match        https://crack.wrtn.ai/builder/story*
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const log = (...args) => console.log('[WRTN Autofill]', ...args);

    const STORE_ENABLED = 'wrtn_autofill_enabled';
    const STORE_PROMPT = 'wrtn_autofill_prompt';

    const DEFAULT_ENABLED = true;
    const DEFAULT_PROMPT = '';

    const state = {
        enabled: loadBool(STORE_ENABLED, DEFAULT_ENABLED),
        prompt: loadText(STORE_PROMPT, DEFAULT_PROMPT)
    };

    const LABELS = {
        section: ['상황 이미지', 'Situation Image'],
        title: ['제목', 'Title'],
        situation: ['상황', 'Situation'],
        hint: ['이미지 힌트', 'Image Hint']
    };

    function loadBool(key, fallback) {
        const value = localStorage.getItem(key);
        if (value === null) return fallback;
        return value === 'true';
    }

    function loadText(key, fallback) {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
    }

    function saveState() {
        localStorage.setItem(STORE_ENABLED, String(state.enabled));
        localStorage.setItem(STORE_PROMPT, state.prompt);
    }

    function setNativeValue(el, value) {
        const proto = Object.getPrototypeOf(el);
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
            descriptor.set.call(el, value);
        } else {
            el.value = value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function textMatches(text, keywords) {
        if (!text) return false;
        return keywords.some(keyword => text.includes(keyword));
    }

    function findSectionRoot() {
        const candidates = Array.from(document.querySelectorAll('h1,h2,h3,h4,div,span'));
        for (const node of candidates) {
            const text = (node.textContent || '').trim();
            if (textMatches(text, LABELS.section)) {
                return node.closest('section') || node.closest('div') || document.body;
            }
        }
        return document.body;
    }

    function findFields(scope, keywords, selector) {
        const nodes = Array.from(scope.querySelectorAll(selector));
        return nodes.filter((node) => {
            const placeholder = node.getAttribute('placeholder') || '';
            const aria = node.getAttribute('aria-label') || '';
            const name = node.getAttribute('name') || '';
            const id = node.getAttribute('id') || '';
            const label = id ? document.querySelector(`label[for="${id}"]`) : null;
            const labelText = label ? label.textContent || '' : '';
            return textMatches(placeholder, keywords) ||
                textMatches(aria, keywords) ||
                textMatches(name, keywords) ||
                textMatches(id, keywords) ||
                textMatches(labelText, keywords);
        });
    }

    function collectFields() {
        const scope = findSectionRoot();
        const titleFields = findFields(scope, LABELS.title, 'input,textarea');
        const situationFields = findFields(scope, LABELS.situation, 'textarea,input');
        const hintFields = findFields(scope, LABELS.hint, 'textarea,input');
        return { titleFields, situationFields, hintFields };
    }

    function parsePromptInput(rawText) {
        const trimmed = (rawText || '').trim();
        if (!trimmed) return { mode: 'empty' };
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                const data = JSON.parse(trimmed);
                if (Array.isArray(data)) {
                    return { mode: 'list', items: data };
                }
                return { mode: 'single', text: data.final_prompt || data.prompt || data.text || trimmed };
            } catch {
                return { mode: 'single', text: trimmed };
            }
        }
        return { mode: 'single', text: trimmed };
    }

    function runAutofill() {
        if (!state.enabled) {
            alert('Autofill is disabled.');
            return;
        }
        const payload = parsePromptInput(state.prompt);
        if (payload.mode === 'empty') {
            alert('Please enter a prompt in the autofill panel first.');
            return;
        }

        const { titleFields, situationFields, hintFields } = collectFields();
        const total = Math.max(titleFields.length, situationFields.length);
        if (!total) {
            alert('No matching fields found. You may need to adjust selectors.');
            return;
        }

        const limit = Math.min(total, 50);
        for (let i = 0; i < limit; i += 1) {
            const titleEl = titleFields[i] || null;
            const situationEl = situationFields[i] || null;
            const hintEl = hintFields[i] || null;

            let titleText = '';
            let situationText = '';
            if (payload.mode === 'list') {
                const item = payload.items[i] || {};
                titleText = item.title || item.name || item.prompt || '';
                situationText = item.situation || item.prompt || item.text || '';
            } else {
                titleText = payload.text;
                situationText = payload.text;
            }

            if (titleEl && titleText) setNativeValue(titleEl, titleText);
            if (situationEl && situationText) setNativeValue(situationEl, situationText);
            if (hintEl) setNativeValue(hintEl, '');
        }

        alert(`Autofill done: ${limit} items.`);
    }

    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'wrtn-autofill-panel';
        panel.setAttribute('data-wrtn-autofill', 'true');
        panel.innerHTML = `
            <div class="wrtn-header">
                <strong>Autofill</strong>
                <button id="wrtn-toggle" type="button">${state.enabled ? 'ON' : 'OFF'}</button>
            </div>
            <textarea id="wrtn-prompt" placeholder="Paste prompt or JSON here..."></textarea>
            <div class="wrtn-actions">
                <button id="wrtn-run" type="button">Run</button>
                <button id="wrtn-save" type="button">Save</button>
            </div>
            <div class="wrtn-help">
                Upload images first, then click Run.
            </div>
        `;
        (document.body || document.documentElement).appendChild(panel);

        const promptEl = panel.querySelector('#wrtn-prompt');
        const toggleBtn = panel.querySelector('#wrtn-toggle');
        const runBtn = panel.querySelector('#wrtn-run');
        const saveBtn = panel.querySelector('#wrtn-save');

        if (promptEl) promptEl.value = state.prompt;

        toggleBtn.addEventListener('click', () => {
            state.enabled = !state.enabled;
            toggleBtn.textContent = state.enabled ? 'ON' : 'OFF';
            saveState();
        });

        runBtn.addEventListener('click', () => {
            state.prompt = promptEl.value;
            saveState();
            runAutofill();
        });

        saveBtn.addEventListener('click', () => {
            state.prompt = promptEl.value;
            saveState();
            alert('Saved.');
        });
    }

    function ensurePanel() {
        const existing = document.getElementById('wrtn-autofill-panel');
        if (existing) {
            existing.style.display = 'block';
            existing.style.visibility = 'visible';
            return true;
        }
        if (!document.body) return false;
        buildPanel();
        return true;
    }

    function removePanel() {
        const existing = document.getElementById('wrtn-autofill-panel');
        if (existing) existing.remove();
    }

    function keepPanelAlive() {
        const observer = new MutationObserver(() => {
            ensurePanel();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        const timer = setInterval(() => {
            if (document.readyState === 'complete') {
                ensurePanel();
            }
        }, 1000);
        return () => {
            observer.disconnect();
            clearInterval(timer);
        };
    }

    function init() {
        log('init');
        if (!ensurePanel()) {
            const timer = setInterval(() => {
                if (ensurePanel()) {
                    clearInterval(timer);
                    log('panel added');
                }
            }, 300);
        } else {
            log('panel added');
        }
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('Autofill: Run', runAutofill);
            GM_registerMenuCommand('Autofill: Toggle', () => {
                state.enabled = !state.enabled;
                saveState();
                alert(`Autofill ${state.enabled ? 'enabled' : 'disabled'}.`);
            });
            GM_registerMenuCommand('Autofill: Show Panel', () => {
                ensurePanel();
                alert('Panel shown.');
            });
            GM_registerMenuCommand('Autofill: Hide Panel', () => {
                removePanel();
                alert('Panel hidden.');
            });
        }
        keepPanelAlive();
    }

    const css = `
        #wrtn-autofill-panel {
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 2147483647;
            width: 260px;
            background: #ffffff;
            border: 1px solid #d0d0d0;
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            padding: 10px;
            font-family: Arial, sans-serif;
            color: #111111;
            display: block !important;
            visibility: visible !important;
            pointer-events: auto;
        }
        #wrtn-autofill-panel .wrtn-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 6px;
        }
        #wrtn-autofill-panel textarea {
            width: 100%;
            min-height: 90px;
            resize: vertical;
            margin-bottom: 6px;
            font-size: 12px;
            padding: 6px;
            border: 1px solid #cfcfcf;
            border-radius: 6px;
        }
        #wrtn-autofill-panel .wrtn-actions {
            display: flex;
            gap: 6px;
        }
        #wrtn-autofill-panel button {
            cursor: pointer;
            border: 1px solid #cfcfcf;
            background: #f5f5f5;
            padding: 4px 8px;
            border-radius: 6px;
            font-size: 12px;
        }
        #wrtn-autofill-panel #wrtn-toggle {
            font-weight: 700;
        }
        #wrtn-autofill-panel .wrtn-help {
            margin-top: 6px;
            font-size: 11px;
            color: #666666;
        }
    `;

    if (typeof GM_addStyle === 'function') {
        GM_addStyle(css);
    } else {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
