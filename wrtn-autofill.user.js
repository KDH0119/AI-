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

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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

    function findCardRoot(field) {
        let node = field;
        for (let i = 0; i < 6 && node; i += 1) {
            if (node.querySelector) {
                const text = (node.textContent || '');
                if (text.includes('이미지 변경') || text.includes('코드 복사')) {
                    return node;
                }
            }
            node = node.parentElement;
        }
        return field.closest('section,article,li,div') || field.parentElement;
    }

    function findEditButton(card) {
        const buttons = Array.from(card.querySelectorAll('button'));
        const isDelete = (value) => /(삭제|지우기|remove|delete|trash|bin)/i.test(value);
        const isEdit = (value) => /(수정|편집|edit|pencil|pen|rename|제목|title)/i.test(value);

        for (const btn of buttons) {
            const text = (btn.textContent || '').trim();
            const aria = btn.getAttribute('aria-label') || '';
            const title = btn.getAttribute('title') || '';
            const data = `${btn.dataset.icon || ''} ${btn.dataset.testid || ''} ${btn.className || ''}`.trim();
            const combined = `${text} ${aria} ${title} ${data}`.trim();
            if (isDelete(combined)) continue;
            if (isEdit(combined)) return btn;
        }

        for (const btn of buttons) {
            const aria = btn.getAttribute('aria-label') || '';
            const title = btn.getAttribute('title') || '';
            const data = `${btn.dataset.icon || ''} ${btn.dataset.testid || ''} ${btn.className || ''}`.trim();
            const svgTitle = btn.querySelector('svg title')?.textContent || '';
            const combined = `${aria} ${title} ${data} ${svgTitle}`.trim();
            if (isDelete(combined)) continue;
            if (isEdit(combined)) return btn;
        }

        return null;
    }

    function findTitleDisplay(card) {
        const candidates = card.querySelectorAll('[contenteditable], [class*="title"], h1, h2, h3');
        for (const node of candidates) {
            const text = (node.textContent || '').trim();
            if (!text) continue;
            if (text.length > 0 && text.length < 80) return node;
        }
        return null;
    }

    async function openTitleEditor(card) {
        const editBtn = findEditButton(card);
        if (editBtn) {
            editBtn.click();
            await sleep(120);
            return true;
        }
        const titleDisplay = findTitleDisplay(card);
        if (titleDisplay) {
            titleDisplay.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            await sleep(120);
            return true;
        }
        return false;
    }

    function findTitleField(card) {
        const candidates = findFields(card, LABELS.title, 'input,textarea');
        if (candidates.length) return candidates[0];
        const fallback = card.querySelector('input[type="text"], input:not([type])');
        return fallback || null;
    }

    function findSituationField(card) {
        const candidates = findFields(card, LABELS.situation, 'textarea,input');
        return candidates[0] || null;
    }

    function findHintField(card) {
        const candidates = findFields(card, LABELS.hint, 'textarea,input');
        return candidates[0] || null;
    }

    function getMaxLength(el, card, fallback) {
        const attr = parseInt(el.getAttribute('maxlength') || el.getAttribute('maxLength') || el.maxLength, 10);
        if (Number.isFinite(attr) && attr > 0 && attr < 10000) return attr;
        const describedBy = el.getAttribute('aria-describedby');
        if (describedBy) {
            const node = document.getElementById(describedBy);
            if (node) {
                const match = node.textContent.match(/\/\s*(\d+)/);
                if (match) return parseInt(match[1], 10);
            }
        }
        if (card) {
            const counters = Array.from(card.querySelectorAll('span,div'));
            for (const node of counters) {
                const match = (node.textContent || '').match(/0\s*\/\s*(\d{1,3})/);
                if (match) return parseInt(match[1], 10);
            }
        }
        return fallback;
    }

    function collectCards() {
        const scope = findSectionRoot();
        const situationFields = findFields(scope, LABELS.situation, 'textarea,input');
        const cards = [];
        const seen = new Set();
        situationFields.forEach((field) => {
            const card = findCardRoot(field);
            if (card && !seen.has(card)) {
                seen.add(card);
                cards.push(card);
            }
        });
        return cards;
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

    function splitByComma(text, maxLen) {
        if (!text) return { chunk: '', rest: '' };
        if (text.length <= maxLen) return { chunk: text, rest: '' };

        const separators = [',', '，', '、'];
        const findLastSeparator = (value) => {
            let lastIndex = -1;
            for (const sep of separators) {
                const idx = value.lastIndexOf(sep);
                if (idx > lastIndex) lastIndex = idx;
            }
            return lastIndex;
        };

        const boundaryRegex = /[,，、]\s*\d+\s*=/g;
        let boundaryIndex = -1;
        let match;
        while ((match = boundaryRegex.exec(text)) !== null) {
            if (match.index >= maxLen) break;
            boundaryIndex = match.index;
        }
        if (boundaryIndex > -1) {
            const chunk = text.slice(0, boundaryIndex).trimEnd();
            const rest = text.slice(boundaryIndex + 1).trimStart();
            if (chunk) return { chunk, rest };
        }

        const slice = text.slice(0, maxLen);
        const lastIndex = findLastSeparator(slice);
        const restRaw = text.slice(slice.length);

        const trailingDigits = slice.match(/(\d+)\s*$/);
        const restStartsWithEquals = restRaw.trimStart().startsWith('=');
        if (trailingDigits && restStartsWithEquals && lastIndex > -1) {
            const chunk = slice.slice(0, lastIndex).trimEnd();
            const rest = text.slice(lastIndex + 1).trimStart();
            if (chunk) return { chunk, rest };
        }

        const quoteCount = (slice.match(/"/g) || []).length;
        if (quoteCount % 2 === 1 && lastIndex > -1) {
            const chunk = slice.slice(0, lastIndex).trimEnd();
            const rest = text.slice(lastIndex + 1).trimStart();
            if (chunk) return { chunk, rest };
        }

        if (lastIndex > -1) {
            const hasTrailing = slice.slice(lastIndex + 1).trim().length > 0;
            if (hasTrailing) {
                const chunk = slice.slice(0, lastIndex).trimEnd();
                const rest = text.slice(lastIndex + 1).trimStart();
                if (chunk) return { chunk, rest };
            }
        }

        return { chunk: slice, rest: text.slice(slice.length) };
    }

    async function runAutofill() {
        if (!state.enabled) {
            alert('Autofill is disabled.');
            return;
        }
        const payload = parsePromptInput(state.prompt);
        if (payload.mode === 'empty') {
            alert('Please enter a prompt in the autofill panel first.');
            return;
        }

        const cards = collectCards();
        if (!cards.length) {
            alert('No matching fields found. You may need to adjust selectors.');
            return;
        }

        const targets = [];
        for (const card of cards) {
            let titleEl = findTitleField(card);
            if (!titleEl) {
                await openTitleEditor(card);
                titleEl = findTitleField(card);
            }
            const situationEl = findSituationField(card);
            if (titleEl) targets.push({ kind: 'title', el: titleEl, card });
            if (situationEl) targets.push({ kind: 'situation', el: situationEl, card });
            const hintEl = findHintField(card);
            if (hintEl) setNativeValue(hintEl, '');
        }

        if (payload.mode === 'list') {
            const limit = Math.min(cards.length, 50);
            for (let i = 0; i < limit; i += 1) {
                const item = payload.items[i] || {};
                const card = cards[i];
                const titleEl = findTitleField(card);
                const situationEl = findSituationField(card);
                const titleText = item.title || item.name || item.prompt || '';
                const situationText = item.situation || item.prompt || item.text || '';
                if (titleEl && titleText) setNativeValue(titleEl, titleText);
                if (situationEl && situationText) setNativeValue(situationEl, situationText);
            }
            alert(`Autofill done: ${limit} items.`);
            return;
        }

        let remaining = payload.text || '';
        const filledTargets = [];
        for (const target of targets) {
            if (!remaining) break;
            const fallback = target.kind === 'title' ? 20 : 50;
            const maxLen = getMaxLength(target.el, target.card, fallback);
            const split = splitByComma(remaining, maxLen);
            const chunk = split.chunk;
            remaining = split.rest;
            if (chunk) {
                setNativeValue(target.el, chunk);
                filledTargets.push(target);
            }
        }

        if (remaining) {
            alert('모든 칸을 채웠지만 아직 텍스트가 남았습니다. 이미지/칸을 더 추가해주세요.');
        } else if (filledTargets.length) {
            alert(`Autofill done: ${filledTargets.length} fields.`);
        } else {
            alert('채울 수 있는 칸을 찾지 못했습니다.');
        }
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
            runAutofill().catch((err) => {
                console.error(err);
                alert('Autofill 오류가 발생했습니다.');
            });
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
