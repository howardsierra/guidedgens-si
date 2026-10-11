// Pure text helpers. No SillyTavern dependencies, so they can be unit tested in Node.

const QUOTE_RE = /"([^"\n]{2,400})"|“([^”\n]{2,400})”|«([^»\n]{2,400})»/g;

const FIRST_PERSON_RE = /\b(?:I|I['’](?:m|d|ve|ll)|[Mm]e|[Mm]y|[Mm]ine|[Mm]yself)\b/g;

export function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replaces {{key}} placeholders for the given keys only, leaving every other
 * macro (e.g. {{char}}) for SillyTavern to substitute.
 */
export function fillTemplate(template, vars) {
    return Object.entries(vars).reduce(
        (out, [key, value]) => out.split(`{{${key}}}`).join(value ?? ''),
        String(template ?? ''),
    );
}

/** Returns the quoted dialogue lines found in a message. */
export function extractDialogue(text) {
    const lines = [];
    for (const match of String(text ?? '').matchAll(QUOTE_RE)) {
        const line = (match[1] ?? match[2] ?? match[3] ?? '').trim();
        if (line) lines.push(line);
    }
    return lines;
}

/** Removes quoted dialogue so only narration is left. */
export function stripDialogue(text) {
    return String(text ?? '').replace(QUOTE_RE, ' ');
}

/**
 * Collects recent spoken lines from messages matching `isTarget`, newest messages
 * first, at most `perMessage` lines from any single message. Returned oldest first.
 */
export function collectVoiceSamples(chat, isTarget, count, { skipIndex = -1, minLength = 12, perMessage = 2 } = {}) {
    const samples = [];
    const seen = new Set();
    if (!Array.isArray(chat) || count <= 0) return samples;

    for (let i = chat.length - 1; i >= 0 && samples.length < count; i--) {
        const message = chat[i];
        if (i === skipIndex || !message || message.is_system || !isTarget(message)) continue;

        const lines = extractDialogue(message.mes);
        let taken = 0;
        for (let j = lines.length - 1; j >= 0 && taken < perMessage && samples.length < count; j--) {
            const line = lines[j];
            const key = line.toLowerCase();
            if (line.length < minLength || seen.has(key)) continue;
            seen.add(key);
            samples.push(line);
            taken++;
        }
    }
    return samples.reverse();
}

/** Counts first-person pronouns in the narration (dialogue excluded). */
export function countFirstPerson(text) {
    return (stripDialogue(text).match(FIRST_PERSON_RE) ?? []).length;
}

export function hasPovSlip(text, threshold = 3) {
    return countFirstPerson(text) >= threshold;
}

/**
 * Cleans an impersonation: drops a leading "{{user}}:" prefix and cuts the text
 * where the model starts writing a line for someone else ("Name: ...").
 */
export function cleanImpersonation(text, userName, otherNames = []) {
    let out = String(text ?? '').trim();
    if (userName) {
        out = out.replace(new RegExp(`^${escapeRegex(userName)}\\s*:\\s*`, 'i'), '');
    }
    const names = otherNames.filter(Boolean).map(escapeRegex);
    if (names.length) {
        const cut = out.search(new RegExp(`(^|\\n)\\s*(?:\\*\\*)?(?:${names.join('|')})(?:\\*\\*)?\\s*:`, 'i'));
        if (cut > 0) out = out.slice(0, cut);
    }
    return out.trim();
}

export function formatSamples(samples) {
    return samples.map(line => `- "${line}"`).join('\n');
}
