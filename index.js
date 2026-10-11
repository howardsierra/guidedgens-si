import {
    buildTranscript,
    cleanImpersonation,
    collectVoiceSamples,
    countFirstPerson,
    fillTemplate,
    formatSamples,
    hasPovSlip,
    joinPrefill,
    looksLikeCharReply,
    parseDirectionCheck,
    plainForCheck,
} from './src/text.js';
import {
    CHAR_RETRY_NOTE,
    DEFAULT_CORRECT,
    DEFAULT_CORRECT_SELECTION,
    DEFAULT_GUIDE,
    DEFAULT_IMPERSONATE,
    DIRECTION_CHECK,
    DIRECTION_CHECK_SYSTEM,
    DIRECTION_RETRY_NOTE,
    IMPERSONATE_DIRECTION_EMPTY,
    IMPERSONATE_DIRECTION_WITH_INPUT,
    POV_RETRY_NOTE,
    STRICT_STORY,
    STRICT_SYSTEM,
} from './src/prompts.js';
import { openCorrections } from './src/corrections.js';
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
    showCorrect: true,
    compactButtons: false,
    userPronouns: '',
    includePersona: true,
    userVoiceSamples: 5,
    charVoiceSamples: 4,
    povRetry: true,
    strictImpersonate: false,
    strictPrefillName: false,
    guideDepth: 0,
    guideRole: 'system',
    guideAtEnd: true,
    directionCheck: true,
    impersonateTemplate: '',
    guideTemplate: '',
    correctIncludeHistory: true,
    correctTemplate: '',
    correctSelectionTemplate: '',
});

let busy = false;
// Set when the user stops a running generation (our Stop button, Esc, or SillyTavern's own stop).
let aborted = false;
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
    aborted = false;
    setBusy(buttonId);
    try {
        await fn();
    } catch (error) {
        // A stopped request rejects with an abort error; that's expected, not a failure.
        if (!aborted) {
            console.error(LOG, error);
            notify('error', error?.message ?? String(error));
        }
    } finally {
        busy = false;
        setBusy(null);
        syncImpersonateButton();
        if (aborted) notify('info', 'Stopped.');
        aborted = false;
    }
}

const isAborted = () => aborted;

/** Stops whatever the extension is generating. SillyTavern's stop also cancels quiet and raw requests. */
function abortGeneration() {
    if (!busy || aborted) return;
    aborted = true;
    setStatus('Stopping…');
    try {
        ctx().stopGeneration();
    } catch (error) {
        console.warn(LOG, 'stopGeneration failed', error);
    }
}

function syncImpersonateButton() {
    setImpersonateUndo(!!lastImpersonation && textarea()?.value === lastImpersonation);
}

// --- Impersonate (third person) ---------------------------------------------

function buildImpersonatePrompt(input, { reason = null, missed = '' } = {}) {
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
    if (reason === 'pov') prompt += fillTemplate(POV_RETRY_NOTE, { pronouns });
    if (reason === 'char') prompt += CHAR_RETRY_NOTE;
    if (reason === 'direction') prompt += fillTemplate(DIRECTION_RETRY_NOTE, { missed });

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

// Strict mode is only possible with Chat Completion; Text Completion impersonation
// already ends the prompt with "{{user}}:", which keeps the model on the user's side.
const isChatCompletion = () => ctx().mainApi === 'openai';
const canUseStrict = isChatCompletion;

/** Character card, other names and world info, as reference for strict mode. */
async function strictReference() {
    const c = ctx();
    let fields = {};
    try {
        fields = c.getCharacterCardFields?.() ?? {};
    } catch {
        // Older SillyTavern: fall back to the raw card below.
    }
    const character = c.characters[c.characterId];
    const description = fields.description ?? character?.description ?? '';
    const personality = fields.personality ?? character?.personality ?? '';
    const scenario = fields.scenario ?? character?.scenario ?? '';

    const parts = [];
    if (description.trim()) parts.push(`About ${c.name2} (reference only; never write as them):\n${description.trim()}`);
    if (personality.trim()) parts.push(`${c.name2}'s personality: ${personality.trim()}`);
    if (scenario.trim()) parts.push(`Scenario: ${scenario.trim()}`);
    if (c.groupId) parts.push(`Other characters in the story: ${otherSpeakerNames().join(', ')}.`);

    try {
        const chatForWI = c.chat.filter(m => !m.is_system).map(m => `${m.name}: ${m.mes}`).reverse();
        const wi = await c.getWorldInfoPrompt?.(chatForWI, c.maxContext, true, {
            personaDescription: fields.persona ?? '',
            characterDescription: description,
            characterPersonality: personality,
            characterDepthPrompt: '',
            scenario,
            creatorNotes: '',
        });
        if (wi?.worldInfoString?.trim()) parts.push(`World details:\n${wi.worldInfoString.trim()}`);
    } catch (error) {
        console.warn(LOG, 'World info skipped in strict mode', error);
    }
    return parts.length ? `\n${parts.join('\n\n')}\n` : '';
}

/** Impersonation from a separate request where the model never plays {{char}}. */
async function runStrictImpersonation(prompt) {
    const c = ctx();
    const system = substitute(fillTemplate(STRICT_SYSTEM, { card: await strictReference() }));
    const responseTokens = Number(c.chatCompletionSettings?.openai_max_tokens) || 500;
    // About 3.2 characters per token, leaving room for the reply and the instructions.
    const budget = Math.max(4000, ((Number(c.maxContext) || 8192) - responseTokens - 1000) * 3.2 - system.length - prompt.length);
    const story = fillTemplate(STRICT_STORY, { transcript: buildTranscript(c.chat, budget) });
    const prefill = settings().strictPrefillName ? c.name1 : '';

    setInput('');
    const output = await c.generateRaw({
        prompt: [{ role: 'user', content: story + prompt }],
        systemPrompt: system,
        prefill,
    });
    return cleanImpersonation(joinPrefill(prefill, output), c.name1, otherSpeakerNames());
}

function impersonationSlip(text) {
    if (!text) return null;
    if (looksLikeCharReply(text, ctx().name1, otherSpeakerNames())) return 'char';
    if (hasPovSlip(text)) return 'pov';
    return null;
}

function slipScore(text) {
    if (!text) return Infinity;
    return (looksLikeCharReply(text, ctx().name1, otherSpeakerNames()) ? 100 : 0) + countFirstPerson(text);
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
        const s = settings();
        const c = ctx();
        let usedStrict = false;
        const attempt = ({ strict, reason = null, missed = '' }) => {
            usedStrict = strict;
            const prompt = buildImpersonatePrompt(current, { reason, missed });
            return strict ? runStrictImpersonation(prompt) : runImpersonation(prompt);
        };

        try {
            const strict = s.strictImpersonate && canUseStrict();
            let result = await attempt({ strict });
            if (aborted) {
                setInput(outlineBeforeImpersonation);
                return;
            }
            let slip = impersonationSlip(result);

            if (slip && s.povRetry) {
                console.info(LOG, `Impersonation slipped (${slip}); retrying once.`);
                setStatus(slip === 'char' ? `Keeping it as ${c.name1}…` : 'Fixing point of view…');
                // A reply written as {{char}} is retried in strict mode, which is much harder to derail.
                const retryStrict = canUseStrict() && (strict || slip === 'char');
                const retry = await attempt({ strict: retryStrict, reason: slip });
                if (aborted) {
                    setInput(outlineBeforeImpersonation);
                    return;
                }
                if (slipScore(retry) < slipScore(result)) result = retry;
                else usedStrict = strict;
                slip = impersonationSlip(result);
            }

            let directionMissed = '';
            if (result && current.trim() && s.directionCheck) {
                const check = await checkDirection(current, result);
                if (aborted) {
                    setInput(outlineBeforeImpersonation);
                    return;
                }
                if (!check.pass) {
                    console.info(LOG, 'Impersonation missed the direction; redoing once.', check.missed);
                    setStatus('Redoing: part of your direction was missed…');
                    const retry = await attempt({ strict: usedStrict, reason: 'direction', missed: check.missed });
                    if (aborted) {
                        setInput(outlineBeforeImpersonation);
                        return;
                    }
                    const recheck = retry ? await checkDirection(current, retry) : check;
                    if (aborted) {
                        setInput(outlineBeforeImpersonation);
                        return;
                    }
                    // Take the redo if it follows the direction, or at least doesn't slip more than the first try.
                    if (retry && (recheck.pass || slipScore(retry) <= slipScore(result))) {
                        result = retry;
                        directionMissed = recheck.pass ? '' : recheck.missed;
                    } else {
                        directionMissed = check.missed;
                    }
                    slip = impersonationSlip(result);
                }
            }

            if (!result) {
                setInput(outlineBeforeImpersonation);
                notify('warning', 'The model returned an empty message; your outline was restored.');
                return;
            }
            setInput(result);
            lastImpersonation = result;

            if (slip === 'char') {
                notify('warning', canUseStrict() && !strict
                    ? `This still reads like ${c.name2}'s reply. Turn on Strict mode in the settings, or edit and retry.`
                    : `This still reads like ${c.name2}'s reply. You may want to edit or retry.`);
            } else if (slip === 'pov') {
                notify('warning', 'The model kept slipping into first person. You may want to edit or retry.');
            }
            if (directionMissed) notify('warning', `It still misses part of your direction:\n${directionMissed}`);
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

// The direction waiting to be appended to the end of the next Chat Completion prompt.
let pendingGuide = null;

function setGuide(text) {
    const s = settings();
    // In Chat Completion, an in-chat note sits before the preset's post-history instructions,
    // which then override it. Appending it as the very last message (like impersonate's
    // instruction) makes it win. Text Completion has no post-history block, so depth 0 is already last.
    if (s.guideAtEnd && isChatCompletion()) {
        // A trailing assistant message would act as a prefill, so the end only takes system or user.
        pendingGuide = { role: s.guideRole === 'user' ? 'user' : 'system', content: text };
        return;
    }
    const depth = Math.max(0, Number(s.guideDepth) || 0);
    ctx().setExtensionPrompt(GUIDE_KEY, text, IN_CHAT, depth, false, ROLES[s.guideRole] ?? ROLES.system);
}

function clearGuide() {
    pendingGuide = null;
    ctx().setExtensionPrompt(GUIDE_KEY, '', IN_CHAT, 0);
}

/** Asks the model, in a small separate request, whether `passage` carries out `direction`. */
async function checkDirection(direction, passage) {
    setStatus('Checking your direction…');
    const prompt = substitute(fillTemplate(DIRECTION_CHECK, { direction: direction.trim(), reply: plainForCheck(passage) }));
    try {
        const answer = await ctx().generateRaw({ prompt, systemPrompt: DIRECTION_CHECK_SYSTEM });
        const result = parseDirectionCheck(answer);
        console.info(LOG, 'Direction check:', result.pass ? 'pass' : 'fail', answer);
        return result;
    } catch (error) {
        if (aborted) throw error;
        // A failed check must never block the reply itself.
        console.warn(LOG, 'Direction check failed; skipping it.', error);
        return { pass: true, missed: '' };
    }
}

/**
 * After a guided reply or swipe: if the character's latest message missed the
 * direction, redo it once as a new swipe, told exactly what it got wrong.
 */
async function enforceDirection(input) {
    if (!settings().directionCheck || !input.trim() || aborted) return;
    const c = ctx();
    const last = c.chat.at(-1);
    if (!last || last.is_user || last.is_system || !last.mes) return;

    const check = await checkDirection(input, last.mes);
    if (check.pass || aborted) return;

    console.info(LOG, 'Reply missed the direction; redoing once.', check.missed);
    setStatus('Redoing: part of your direction was missed…');
    const guide = buildGuide(input, { speakerName: last.name, skipIndex: c.chat.length - 1 });
    setGuide(guide + substitute(fillTemplate(DIRECTION_RETRY_NOTE, { missed: check.missed })));
    try {
        await swipeToNew();
    } finally {
        clearGuide();
    }
    if (aborted) return;

    const recheck = await checkDirection(input, ctx().chat.at(-1)?.mes ?? '');
    if (aborted) return;
    notify(recheck.pass ? 'info' : 'warning', recheck.pass
        ? 'The first reply missed part of your direction, so it was redone. The first try is one swipe back.'
        : `The redo still misses part of your direction (the first try is one swipe back):\n${recheck.missed}`);
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
            clearGuide();
            await enforceDirection(input);
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
    if (aborted) return;
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
            clearGuide();
            await enforceDirection(input);
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
    {
        id: 'ggsi_correct', setting: 'showCorrect', icon: 'fa-wand-magic-sparkles', label: 'Correct',
        hint: 'Rewrite a message (or just a highlighted part of it) following your instructions, in the speaker\'s voice.',
        busyText: 'Correcting the message…',
        action: () => openCorrections({ settings, save, exclusive, substitute, isAborted }),
    },
];

const TEMPLATE_DEFAULTS = {
    impersonateTemplate: DEFAULT_IMPERSONATE,
    guideTemplate: DEFAULT_GUIDE,
    correctTemplate: DEFAULT_CORRECT,
    correctSelectionTemplate: DEFAULT_CORRECT_SELECTION,
};

function init() {
    const s = settings();
    mountSettings(s, {
        save,
        templateDefaults: TEMPLATE_DEFAULTS,
        onChange: key => {
            if (key.startsWith('show') || key === 'compactButtons') {
                renderBar(BUTTONS, s, { onStop: abortGeneration });
                syncImpersonateButton();
            }
        },
    });
    renderBar(BUTTONS, s, { onStop: abortGeneration });
    textarea()?.addEventListener('input', syncImpersonateButton);

    const { eventSource, event_types } = ctx();
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, data => {
        if (!pendingGuide || data?.dryRun || !Array.isArray(data?.chat)) return;
        data.chat.push({ ...pendingGuide });
    });

    // SillyTavern's own stop button (or its Esc shortcut) also counts as aborting our run.
    eventSource.on(event_types.GENERATION_STOPPED, () => {
        if (busy) aborted = true;
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !busy || event.defaultPrevented) return;
        // Leave Esc alone while a popup (e.g. Corrections) is open; it closes the popup there.
        if (document.querySelector('dialog[open]')) return;
        abortGeneration();
    });

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
