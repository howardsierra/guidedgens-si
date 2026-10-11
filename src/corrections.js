// Corrections: pick a message (and swipe), optionally highlight part of it,
// describe the change, and get it rewritten in the speaker's voice.
// The character's latest reply gets the result as a new swipe; any other
// message is edited in place with an Undo toast.

import { DEFAULT_CORRECT, DEFAULT_CORRECT_SELECTION } from './prompts.js';
import { cleanRewrite, fillTemplate, replaceRange } from './text.js';

const QUICK_FIXES = [
    'Fix spelling and grammar.',
    'Make it shorter.',
    'Stay more in character.',
    'Don\'t act or speak for {{user}}.',
    'Cut the repetition.',
];

let lastInstruction = '';

const ctx = () => SillyTavern.getContext();

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function swipesOf(message) {
    return Array.isArray(message?.swipes) && message.swipes.length ? message.swipes : [message?.mes ?? ''];
}

/** Messages that can be corrected: everything except hidden/system notes. */
function correctableIndexes(chat) {
    return chat.map((m, i) => (m && !m.is_system ? i : -1)).filter(i => i >= 0);
}

/** The character's latest reply gets a new swipe; everything else is edited in place. */
function getsNewSwipe(chat, index) {
    const message = chat[index];
    return index === chat.length - 1 && !message.is_user && !message.is_system;
}

function dialogHtml() {
    return `
<div class="ggsi-correct">
  <div class="ggsi-correct-title"><i class="fa-solid fa-wand-magic-sparkles"></i> Correct a message</div>

  <div class="ggsi-msg-nav">
    <button type="button" class="ggsi-nav-btn" data-nav="older" title="Older message"><i class="fa-solid fa-chevron-left"></i></button>
    <div class="ggsi-msg-meta">
      <span class="ggsi-msg-name"></span>
      <small class="ggsi-msg-pos"></small>
    </div>
    <button type="button" class="ggsi-nav-btn" data-nav="newer" title="Newer message"><i class="fa-solid fa-chevron-right"></i></button>
  </div>

  <div class="ggsi-swipe-nav">
    <button type="button" class="ggsi-ghost" data-nav="prev-swipe"><i class="fa-solid fa-angle-left"></i></button>
    <small class="ggsi-swipe-pos"></small>
    <button type="button" class="ggsi-ghost" data-nav="next-swipe"><i class="fa-solid fa-angle-right"></i></button>
  </div>

  <textarea class="text_pole ggsi-msg-text" readonly rows="6"></textarea>

  <div class="ggsi-selection">
    <span class="ggsi-selection-hint"><i class="fa-regular fa-hand-pointer"></i> Highlight part of the message to rewrite only that part.</span>
    <span class="ggsi-selection-active"><i class="fa-solid fa-highlighter"></i> Only rewriting: <q class="ggsi-selection-text"></q>
      <button type="button" class="ggsi-ghost ggsi-selection-clear" title="Rewrite the whole message instead"><i class="fa-solid fa-xmark"></i></button>
    </span>
  </div>

  <label class="ggsi-field-label" for="ggsi_correct_instruction">What should change?</label>
  <textarea id="ggsi_correct_instruction" class="text_pole ggsi-instruction" rows="3"
    placeholder="e.g. She wouldn't apologise here. Make her defensive instead."></textarea>
  <div class="ggsi-chips ggsi-quick">
    ${QUICK_FIXES.map(fix => `<button type="button" class="ggsi-chip" data-fix="${escapeHtml(fix)}">${escapeHtml(fix.replace('{{user}}', ctx().name1))}</button>`).join('')}
  </div>

  <label class="ggsi-row ggsi-toggle-row ggsi-correct-history">
    <span class="ggsi-row-text"><span class="ggsi-row-title">Include chat history</span><small>Better context and voice, but uses more tokens.</small></span>
    <input type="checkbox" class="ggsi-switch">
  </label>

  <div class="ggsi-outcome"><i class="fa-solid fa-circle-info"></i> <span></span></div>
</div>`;
}

/**
 * Opens the dialog and resolves with the user's choice, or null if cancelled.
 * @param {object} settings
 */
async function chooseCorrection(settings) {
    const c = ctx();
    const indexes = correctableIndexes(c.chat);
    if (!indexes.length) {
        toastr.info('There are no messages to correct yet.', 'Guided Gens SI');
        return null;
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = dialogHtml();
    const root = wrapper.firstElementChild;
    const $ = selector => root.querySelector(selector);

    const state = {
        index: indexes.at(-1),
        swipe: 0,
        selection: null, // { start, end }
    };
    state.swipe = c.chat[state.index].swipe_id ?? 0;

    const text = $('.ggsi-msg-text');
    const instruction = $('.ggsi-instruction');
    const history = $('.ggsi-correct-history input');
    instruction.value = lastInstruction;
    history.checked = !!settings.correctIncludeHistory;

    const renderSelection = () => {
        const has = !!state.selection;
        root.classList.toggle('ggsi-has-selection', has);
        if (has) {
            const selected = text.value.slice(state.selection.start, state.selection.end).trim();
            $('.ggsi-selection-text').textContent = selected.length > 120 ? `${selected.slice(0, 117)}…` : selected;
        }
    };

    const render = () => {
        const chat = ctx().chat;
        const message = chat[state.index];
        const swipes = swipesOf(message);
        const pos = indexes.indexOf(state.index);
        const newSwipe = getsNewSwipe(chat, state.index);

        $('.ggsi-msg-name').textContent = message.name ?? (message.is_user ? ctx().name1 : ctx().name2);
        $('.ggsi-msg-name').classList.toggle('ggsi-is-user', !!message.is_user);
        $('.ggsi-msg-pos').textContent = pos === indexes.length - 1 ? 'Latest message' : `${indexes.length - 1 - pos} message${indexes.length - 1 - pos === 1 ? '' : 's'} back`;
        $('[data-nav="older"]').disabled = pos <= 0;
        $('[data-nav="newer"]').disabled = pos >= indexes.length - 1;

        // Only the latest reply can be corrected from another swipe, since the result becomes a new swipe.
        const showSwipes = newSwipe && swipes.length > 1;
        $('.ggsi-swipe-nav').hidden = !showSwipes;
        if (!showSwipes) state.swipe = message.swipe_id ?? 0;
        $('.ggsi-swipe-pos').textContent = `Swipe ${state.swipe + 1} of ${swipes.length}`;
        $('[data-nav="prev-swipe"]').disabled = state.swipe <= 0;
        $('[data-nav="next-swipe"]').disabled = state.swipe >= swipes.length - 1;

        text.value = newSwipe ? (swipes[state.swipe] ?? message.mes) : message.mes;
        // Size the box to the message: roughly 70 characters per line, 3 to 12 rows.
        const lines = text.value.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 70)), 0);
        text.rows = Math.min(12, Math.max(3, lines));
        text.scrollTop = 0;
        state.selection = null;
        renderSelection();

        $('.ggsi-outcome span').textContent = newSwipe
            ? 'The correction is added as a new swipe, so the original stays one swipe back.'
            : 'The message is edited in place. You can undo it from the notification.';
    };

    root.addEventListener('click', event => {
        const nav = event.target.closest('[data-nav]')?.dataset.nav;
        const pos = indexes.indexOf(state.index);
        if (nav === 'older' && pos > 0) state.index = indexes[pos - 1];
        else if (nav === 'newer' && pos < indexes.length - 1) state.index = indexes[pos + 1];
        else if (nav === 'prev-swipe') state.swipe = Math.max(0, state.swipe - 1);
        else if (nav === 'next-swipe') state.swipe = Math.min(swipesOf(ctx().chat[state.index]).length - 1, state.swipe + 1);
        else return;
        if (nav === 'older' || nav === 'newer') state.swipe = ctx().chat[state.index].swipe_id ?? 0;
        render();
    });

    // Remember the highlighted range; on touch devices only selectionchange is reliable.
    const recordSelection = () => {
        const { selectionStart: start, selectionEnd: end } = text;
        if (end > start && text.value.slice(start, end).trim()) {
            state.selection = { start, end };
            renderSelection();
        }
    };
    for (const type of ['select', 'mouseup', 'keyup']) text.addEventListener(type, recordSelection);
    text.addEventListener('touchend', () => setTimeout(recordSelection, 50), { passive: true });
    const onSelectionChange = () => {
        if (document.activeElement === text) recordSelection();
    };
    document.addEventListener('selectionchange', onSelectionChange);

    $('.ggsi-selection-clear').addEventListener('click', () => {
        state.selection = null;
        text.setSelectionRange(0, 0);
        renderSelection();
    });

    for (const chip of root.querySelectorAll('[data-fix]')) {
        chip.addEventListener('click', () => {
            const fix = chip.dataset.fix;
            const current = instruction.value.trim();
            instruction.value = current ? `${current} ${fix}` : fix;
            instruction.focus();
        });
    }

    render();

    const { Popup, POPUP_TYPE, POPUP_RESULT } = ctx();
    const popup = new Popup(root, POPUP_TYPE.CONFIRM, '', {
        okButton: 'Apply correction',
        cancelButton: 'Cancel',
        wide: true,
        allowVerticalScrolling: true,
        leftAlign: true,
        onClosing: p => {
            if (p.result !== POPUP_RESULT.AFFIRMATIVE || instruction.value.trim()) return true;
            toastr.warning('Describe what should change first.', 'Guided Gens SI');
            instruction.focus();
            return false;
        },
    });
    instruction.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            popup.complete(POPUP_RESULT.AFFIRMATIVE);
        }
    });

    const resultPromise = popup.show();
    setTimeout(() => instruction.focus(), 50);
    const result = await resultPromise;
    document.removeEventListener('selectionchange', onSelectionChange);

    settings.correctIncludeHistory = history.checked;
    lastInstruction = instruction.value.trim();
    if (result !== POPUP_RESULT.AFFIRMATIVE) return null;

    return {
        index: state.index,
        baseText: text.value,
        selection: state.selection,
        instruction: lastInstruction,
        includeHistory: history.checked,
        newSwipe: getsNewSwipe(ctx().chat, state.index),
    };
}

function buildPrompt(choice, settings, substitute) {
    const c = ctx();
    const message = c.chat[choice.index];
    const speaker = message.name ?? (message.is_user ? c.name1 : c.name2);

    // Without chat history the model has no character card, so describe the speaker briefly.
    let about = '';
    if (!choice.includeHistory) {
        const description = message.is_user
            ? substitute('{{persona}}')
            : (() => {
                const character = c.characters.find(ch => ch.name === speaker);
                return [character?.description, character?.personality].filter(Boolean).join('\n');
            })();
        if (description?.trim()) about = `\nAbout ${speaker}:\n${description.trim()}\n`;
    }

    const selected = choice.selection ? choice.baseText.slice(choice.selection.start, choice.selection.end) : '';
    const template = choice.selection
        ? (settings.correctSelectionTemplate || DEFAULT_CORRECT_SELECTION)
        : (settings.correctTemplate || DEFAULT_CORRECT);

    const prompt = fillTemplate(template, {
        speaker,
        about,
        instruction: choice.instruction,
        message: choice.baseText,
        selection: selected.trim(),
    });
    return { prompt: substitute(prompt), speaker, selected };
}

async function generate(prompt, includeHistory) {
    const c = ctx();
    if (includeHistory) {
        return c.generateQuietPrompt({ quietPrompt: prompt, removeReasoning: true });
    }
    return c.generateRaw({ prompt });
}

function syncSwipeCounter(index, message) {
    const total = message.swipes.length;
    for (const el of document.querySelectorAll(`#chat .mes[mesid="${index}"] .swipes-counter`)) {
        el.textContent = `${message.swipe_id + 1}/${total}`;
    }
    try {
        ctx().swipe?.refresh?.(true, false);
    } catch {
        // Older SillyTavern: the counter above is enough.
    }
}

async function addSwipe(index, text) {
    const c = ctx();
    const message = c.chat[index];
    if (!Array.isArray(message.swipes) || !message.swipes.length) {
        message.swipes = [message.mes];
        message.swipe_id = 0;
    }
    if (!Array.isArray(message.swipe_info)) message.swipe_info = message.swipes.map(() => ({}));
    while (message.swipe_info.length < message.swipes.length) message.swipe_info.push({});

    // Keep the current swipe's metadata before switching away from it.
    const current = message.swipe_id ?? 0;
    if (message.extra && message.swipe_info[current]) message.swipe_info[current].extra = structuredClone(message.extra);

    const extra = { api: 'manual', model: 'Guided Gens SI correction', gen_id: Date.now() };
    message.swipes.push(text);
    message.swipe_info.push({ send_date: new Date().toISOString(), gen_started: null, gen_finished: null, extra });
    message.swipe_id = message.swipes.length - 1;
    message.mes = text;
    message.extra = structuredClone(extra);

    c.updateMessageBlock(index, message);
    syncSwipeCounter(index, message);
    await c.eventSource.emit(c.event_types.MESSAGE_SWIPED, index);
    await c.saveChat();
}

async function editInPlace(index, text) {
    const c = ctx();
    const message = c.chat[index];
    const before = message.mes;
    const setText = async value => {
        message.mes = value;
        if (Array.isArray(message.swipes) && message.swipes.length) message.swipes[message.swipe_id ?? 0] = value;
        c.updateMessageBlock(index, message);
        await c.eventSource.emit(c.event_types.MESSAGE_EDITED, index);
        await c.saveChat();
    };
    await setText(text);

    toastr.success('Correction applied. Click here to undo.', 'Guided Gens SI', {
        timeOut: 12000,
        extendedTimeOut: 6000,
        onclick: async () => {
            if (ctx().chat[index] !== message || message.mes !== text) {
                toastr.warning('The message changed since, so it was left as is.', 'Guided Gens SI');
                return;
            }
            await setText(before);
            toastr.info('Correction undone.', 'Guided Gens SI');
        },
    });
}

/**
 * @param {object} deps
 * @param {() => object} deps.settings
 * @param {() => void} deps.save
 * @param {(buttonId: string, fn: () => Promise<void>) => Promise<void>} deps.exclusive
 * @param {(text: string) => string} deps.substitute
 */
export async function openCorrections({ settings, save, exclusive, substitute }) {
    const s = settings();
    const choice = await chooseCorrection(s);
    save();
    if (!choice) return;

    await exclusive('ggsi_correct', async () => {
        const c = ctx();
        const message = c.chat[choice.index];
        const { prompt, speaker, selected } = buildPrompt(choice, s, substitute);

        const raw = await generate(prompt, choice.includeHistory);
        const rewrite = cleanRewrite(raw, selected || choice.baseText, speaker);
        if (!rewrite) {
            toastr.warning('The model returned nothing, so the message was left unchanged.', 'Guided Gens SI');
            return;
        }
        if (ctx().chat[choice.index] !== message) {
            toastr.warning('The chat changed while correcting, so nothing was applied.', 'Guided Gens SI');
            return;
        }

        const corrected = choice.selection
            ? replaceRange(choice.baseText, choice.selection.start, choice.selection.end, rewrite)
            : rewrite;

        if (choice.newSwipe) {
            await addSwipe(choice.index, corrected);
            toastr.success('Added as a new swipe. Swipe left to see the original.', 'Guided Gens SI');
        } else {
            await editInPlace(choice.index, corrected);
        }
    });
}
