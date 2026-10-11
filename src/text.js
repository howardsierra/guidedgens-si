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

/**
 * Removes wrapping the model sometimes adds around a rewrite: code fences,
 * triple quotes, a "Name:" prefix, or quotes the original didn't have.
 */
export function cleanRewrite(text, original = '', speaker = '') {
    let out = String(text ?? '').trim();
    const fenced = out.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
    if (fenced) out = fenced[1].trim();
    out = out.replace(/^"""\s*/, '').replace(/\s*"""$/, '').trim();
    if (speaker) out = out.replace(new RegExp(`^${escapeRegex(speaker)}\\s*:\\s*`, 'i'), '');
    const source = String(original).trim();
    if (/^"[^"]*"$/.test(out) && !source.startsWith('"')) out = out.slice(1, -1).trim();
    return out;
}

/** Splices `replacement` over [start, end), keeping the selection's outer whitespace. */
export function replaceRange(text, start, end, replacement) {
    const selected = text.slice(start, end);
    const lead = selected.match(/^\s*/)[0];
    const trail = selected.slice(lead.length).match(/\s*$/)[0];
    return text.slice(0, start) + lead + replacement + trail + text.slice(end);
}

function countName(text, name) {
    if (!name) return 0;
    return (text.match(new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi')) ?? []).length;
}

/**
 * Heuristic: does an impersonation read like {{char}}'s reply instead of
 * {{user}}'s message? Looks at the narration only (dialogue removed).
 */
export function looksLikeCharReply(text, userName, charNames = []) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return false;
    const narration = stripDialogue(trimmed).replace(/[*_~]/g, ' ');
    const opening = trimmed.replace(/^[\s*_"“'(]+/, '');
    const startsWith = name => !!name && new RegExp(`^${escapeRegex(name)}\\b`, 'i').test(opening);

    if (startsWith(userName)) return false;

    // Character replies address the user as "you" in narration; a third-person user message doesn't.
    const secondPerson = (narration.match(/\b(?:you|your|yours|yourself)\b/gi) ?? []).length;
    if (secondPerson >= 2) return true;

    const names = charNames.filter(n => n && n.toLowerCase() !== String(userName ?? '').toLowerCase());
    const userHits = countName(narration, userName);
    const charHits = names.reduce((sum, name) => sum + countName(narration, name), 0);
    if (userHits === 0 && names.some(startsWith)) return true;
    if (userHits === 0 && charHits >= 3) return true;
    return false;
}

/**
 * Takes chat messages newest-first until roughly `maxChars` is used and returns
 * them oldest-first as "Name: text" lines. Hidden/system messages are skipped.
 */
export function buildTranscript(chat, maxChars) {
    const lines = [];
    let used = 0;
    for (let i = chat.length - 1; i >= 0; i--) {
        const message = chat[i];
        if (!message || message.is_system || !message.mes) continue;
        const line = `${message.name}: ${message.mes.trim()}`;
        if (used + line.length > maxChars && lines.length) break;
        lines.push(line);
        used += line.length + 2;
    }
    return lines.reverse().join('\n\n');
}

/** Joins a prefill and the model's continuation without doubling the prefill. */
export function joinPrefill(prefill, output) {
    const out = String(output ?? '');
    if (!prefill) return out.trim();
    if (out.trimStart().toLowerCase().startsWith(prefill.toLowerCase())) return out.trim();
    const glue = /^[\s,.;:!?'’-]/.test(out) ? '' : ' ';
    return `${prefill}${glue}${out}`.trim();
}
