import {
    cleanImpersonation,
    collectVoiceSamples,
    countFirstPerson,
    fillTemplate,
    formatSamples,
    hasPovSlip,
} from './src/text.js';
import {
    DEFAULT_GUIDE,
    DEFAULT_IMPERSONATE,
    IMPERSONATE_DIRECTION_EMPTY,
    IMPERSONATE_DIRECTION_WITH_INPUT,
    POV_RETRY_NOTE,
} from './src/prompts.js';
import { mountSettings, renderBar, setBusy, setImpersonateUndo, setStatus } from './src/ui.js';

const MODULE = 'guidedgens_si';
const LOG = '[Guided Gens SI]';
const GUIDE_KEY = 'ggsi_guide';

// SillyTavern's extension_prompt_types.IN_CHAT and extension_prompt_roles.
const IN_CHAT = 1;
const ROLES = { system: 0, user: 1, assistant: 2 };

const DEFAULTS = Object.freeze({
    showImpersonate: true,
    showResponse: true,
    showSwipe: true,
    compactButtons: false,
    userPronouns: '',
    includePersona: true,
    userVoiceSamples: 5,
    charVoiceSamples: 4,
    povRetry: true,
    guideDepth: 0,
    guideRole: 'system',
    impersonateTemplate: '',
    guideTemplate: '',
});

let busy = false;
let lastImpersonation = '';
let outlineBeforeImpersonation = '';

const ctx = () => SillyTavern.getContext();

function settings() {
    const all = ctx().extensionSettings;
    // Fill in missing keys in place; replacing the object would orphan the one the settings panel edits.
    all[MODULE] ??= {};
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (!(key in all[MODULE])) all[MODULE][key] = value;
    }
    return all[MODULE];
}

function save() {
    ctx().saveSettingsDebounced();
}

function textarea() {
    return /** @type {HTMLTextAreaElement} */ (document.getElementById('send_textarea'));
}

function setInput(value) {
    const ta = textarea();
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
}

function substitute(text) {
    return ctx().substituteParams(text);
}

function notify(type, message) {
    if (typeof toastr !== 'undefined') toastr[type](message, 'Guided Gens SI');
    else console[type === 'error' ? 'error' : 'log'](LOG, message);
}

async function exclusive(buttonId, fn) {
    if (busy) {
        notify('info', 'Already generating, please wait.');
        return;
    }
    busy = true;
    setBusy(buttonId);
    try {
        await fn();
    } catch (error) {
        console.error(LOG, error);
        notify('error', error?.message ?? String(error));
    } finally {
        busy = false;
        setBusy(null);
        syncImpersonateButton();
    }
}

function syncImpersonateButton() {
    setImpersonateUndo(!!lastImpersonation && textarea()?.value === lastImpersonation);
}

// --- Impersonate (third person) ---------------------------------------------

function buildImpersonatePrompt(input, { retry = false } = {}) {
    const s = settings();
    const c = ctx();

    const persona = s.includePersona ? substitute('{{persona}}').trim() : '';
    const samples = collectVoiceSamples(c.chat, m => m.is_user, Number(s.userVoiceSamples) || 0);
    const pronouns = s.userPronouns.trim() || 'the pronouns established for them';

    const direction = input.trim()
        ? fillTemplate(IMPERSONATE_DIRECTION_WITH_INPUT, { input: input.trim() })
        : IMPERSONATE_DIRECTION_EMPTY;

    let prompt = fillTemplate(s.impersonateTemplate || DEFAULT_IMPERSONATE, {
        persona: persona ? `\nWho {{user}} is:\n${persona}\n` : '',
        voice: samples.length
            ? `\nThings {{user}} has said so far (for their voice only; don't repeat them):\n${formatSamples(samples)}\n`
            : '',
        direction,
        pronouns,
        input: input.trim(),
    });
    if (retry) prompt += fillTemplate(POV_RETRY_NOTE, { pronouns });

    return substitute(prompt);
}

function otherSpeakerNames() {
    const c = ctx();
    const names = new Set([c.name2]);
    for (const message of c.chat.slice(-30)) {
        if (!message.is_user && message.name) names.add(message.name);
    }
    if (c.groupId) {
        const group = c.groups?.find(g => g.id === c.groupId);
        for (const avatar of group?.members ?? []) {
            const character = c.characters.find(ch => ch.avatar === avatar);
            if (character?.name) names.add(character.name);
        }
    }
    names.delete(c.name1);
    return [...names];
}

async function runImpersonation(prompt) {
    const c = ctx();
    // Generate('impersonate') writes its result into the input box, so clear it first.
    setInput('');
    if (typeof c.generate === 'function') {
        await c.generate('impersonate', { quiet_prompt: prompt, quietToLoud: true });
    } else {
        await c.executeSlashCommandsWithOptions(`/impersonate await=true ${prompt.replace(/\|/g, '\\|')}`);
    }
    return cleanImpersonation(textarea().value, c.name1, otherSpeakerNames());
}

async function guidedImpersonate() {
    const current = textarea().value;

    // Pressing the button again on an unedited result brings the outline back.
    if (lastImpersonation && current === lastImpersonation) {
        setInput(outlineBeforeImpersonation);
        lastImpersonation = '';
        syncImpersonateButton();
        return;
    }

    await exclusive('ggsi_impersonate', async () => {
        outlineBeforeImpersonation = current;
        try {
            let result = await runImpersonation(buildImpersonatePrompt(current));

            if (result && settings().povRetry && hasPovSlip(result)) {
                console.info(LOG, 'Impersonation slipped into first person; retrying once.');
                setStatus('Fixing point of view…');
                const retry = await runImpersonation(buildImpersonatePrompt(current, { retry: true }));
                if (retry && countFirstPerson(retry) < countFirstPerson(result)) result = retry;
                if (hasPovSlip(result)) {
                    notify('warning', 'The model kept slipping into first person. You may want to edit or retry.');
                }
            }

            if (!result) {
                setInput(outlineBeforeImpersonation);
                notify('warning', 'The model returned an empty message; your outline was restored.');
                return;
            }
            setInput(result);
            lastImpersonation = result;
        } catch (error) {
            setInput(outlineBeforeImpersonation);
            throw error;
        }
    });
}

// --- Guided response / swipe (in {{char}}'s voice) --------------------------

function buildGuide(input, { speakerName = null, skipIndex = -1 } = {}) {
    const s = settings();
    const c = ctx();

    let samples = [];
    if (speakerName) {
        samples = collectVoiceSamples(
            c.chat,
            m => !m.is_user && m.name === speakerName,
            Number(s.charVoiceSamples) || 0,
            { skipIndex },
        );
    }

    const guide = fillTemplate(s.guideTemplate || DEFAULT_GUIDE, {
        input: input.trim(),
        voice: samples.length
            ? `How {{char}} talks (recent lines, for voice only; don't repeat them):\n${formatSamples(samples)}\n`
            : '',
    });
    // Resolve {{char}} ourselves: in groups ST's {{char}} may not be the one replying.
    return substitute(fillTemplate(guide, { char: speakerName ?? 'the character who replies' }));
}

function setGuide(text) {
    const s = settings();
    const depth = Math.max(0, Number(s.guideDepth) || 0);
    ctx().setExtensionPrompt(GUIDE_KEY, text, IN_CHAT, depth, false, ROLES[s.guideRole] ?? ROLES.system);
}

function clearGuide() {
    ctx().setExtensionPrompt(GUIDE_KEY, '', IN_CHAT, 0);
}

async function guidedResponse() {
    await exclusive('ggsi_response', async () => {
        const c = ctx();
        const input = textarea().value;
        // In a group we don't know who will answer, so only anchor the voice in 1:1 chats.
        const speakerName = c.groupId ? null : (c.characters[c.characterId]?.name ?? c.name2);

        if (input.trim()) setGuide(buildGuide(input, { speakerName }));
        try {
            setInput('');
            await c.executeSlashCommandsWithOptions('/trigger await=true');
        } finally {
            clearGuide();
            setInput(input);
        }
    });
}

async function swipeToNew() {
    const c = ctx();
    if (typeof c.swipe?.right !== 'function') {
        throw new Error('Guided swipe needs SillyTavern 1.13.0 or newer.');
    }
    // Swiping right on the last swipe generates a new one; before that it only navigates.
    for (let guard = 0; guard < 500; guard++) {
        const message = ctx().chat.at(-1);
        const count = message?.swipes?.length ?? 1;
        if ((message?.swipe_id ?? 0) >= count - 1) break;
        await ctx().swipe.right();
    }
    await ctx().swipe.right();
}

async function guidedSwipe() {
    await exclusive('ggsi_swipe', async () => {
        const c = ctx();
        const last = c.chat.at(-1);
        if (!last || last.is_user || last.is_system) {
            notify('warning', "Guided swipe needs the last message to be the character's.");
            return;
        }

        const input = textarea().value;
        if (input.trim()) {
            setGuide(buildGuide(input, { speakerName: last.name, skipIndex: c.chat.length - 1 }));
        }
        try {
            await swipeToNew();
        } finally {
            clearGuide();
            setInput(input);
        }
    });
}

// --- UI ---------------------------------------------------------------------

const BUTTONS = [
    {
        id: 'ggsi_impersonate', setting: 'showImpersonate', icon: 'fa-user-pen', label: 'Impersonate',
        hint: 'Turn your outline into your persona\'s message, in third person. Click again to get the outline back.',
        busyText: 'Writing as you…', action: guidedImpersonate,
    },
    {
        id: 'ggsi_response', setting: 'showResponse', icon: 'fa-comment-dots', label: 'Respond',
        hint: 'The character replies following your direction, in their own voice.',
        busyText: 'Character is replying…', action: guidedResponse,
    },
    {
        id: 'ggsi_swipe', setting: 'showSwipe', icon: 'fa-arrows-rotate', label: 'Swipe',
        hint: 'A new swipe of the character\'s last message, following your direction. Empty box = plain swipe.',
        busyText: 'Rewriting the reply…', action: guidedSwipe,
    },
];

const TEMPLATE_DEFAULTS = { impersonateTemplate: DEFAULT_IMPERSONATE, guideTemplate: DEFAULT_GUIDE };

function init() {
    const s = settings();
    mountSettings(s, {
        save,
        templateDefaults: TEMPLATE_DEFAULTS,
        onChange: key => {
            if (key.startsWith('show') || key === 'compactButtons') {
                renderBar(BUTTONS, s);
                syncImpersonateButton();
            }
        },
    });
    renderBar(BUTTONS, s);
    textarea()?.addEventListener('input', syncImpersonateButton);

    const { eventSource, event_types } = ctx();
    eventSource.on(event_types.CHAT_CHANGED, () => {
        lastImpersonation = '';
        outlineBeforeImpersonation = '';
        clearGuide();
        syncImpersonateButton();
    });
}

jQuery(() => {
    try {
        init();
    } catch (error) {
        console.error(LOG, 'Failed to initialise', error);
    }
});
