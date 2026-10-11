// Default prompt templates. {{input}}, {{persona}}, {{voice}}, {{pronouns}} and
// {{direction}} are filled by the extension; all other macros ({{user}},
// {{char}}, ...) are substituted by SillyTavern.

export const DEFAULT_IMPERSONATE = `[Out of character: write {{user}}'s next message in the story. For this one message you are writing as {{user}}, not as {{char}}.
{{persona}}{{voice}}
{{direction}}

Rules:
- Third person only. Narrate {{user}} by name or as {{pronouns}}. Never use "I/me/my" or "you/your" for {{user}} in narration; first person is allowed only inside {{user}}'s spoken dialogue.
- Write only what {{user}} says, does, thinks and feels. Do not write {{char}}'s (or anyone else's) dialogue, actions, reactions or decisions. Stop at a natural point where {{char}} would respond.
- Sound like {{user}}: their personality, attitude, vocabulary and way of speaking, as shown in their persona and their lines so far. Keep {{user}} consistent with what they know and want right now.
- Match the story's tense and formatting conventions.
- Reply with the message text only: no name prefix, notes or commentary.]`;

export const IMPERSONATE_DIRECTION_WITH_INPUT = `What {{user}} does next. Expand this into the full message, keeping every beat and its intent, without adding major new actions or events:
{{input}}`;

export const IMPERSONATE_DIRECTION_EMPTY = `{{user}}'s next move is up to you: choose what they would most plausibly say and do right now, given the scene and their personality.`;

export const POV_RETRY_NOTE = `
[Important: a previous draft slipped into first person. Every sentence of narration must refer to {{user}} in the third person ({{pronouns}} or their name), never "I", "me" or "my".]`;

export const CHAR_RETRY_NOTE = `
[Important: a previous draft was written as {{char}}. This message belongs to {{user}}. Write only what {{user}} says and does, narrated in third person, and do not continue {{char}}'s reply.]`;

// Strict mode: a separate request where the model never plays {{char}}.
export const STRICT_SYSTEM = `You are co-writing an interactive story with the user. Right now your only job is to write the next message for {{user}}, the user's character. You are not {{char}}, and you never write {{char}}'s (or anyone else's) words, actions or reactions; the other side of the story is written separately.
{{card}}`;

export const STRICT_STORY = `Story so far (oldest first):
<story>
{{transcript}}
</story>

`;

export const DEFAULT_GUIDE = `[Author's note for {{char}}'s next reply. This is private direction: never mention, quote or reply to it.
What should happen: {{input}}
{{voice}}
Write it the way {{char}} would really do and say it. Stay fully in {{char}}'s voice (personality, attitude, speech patterns and vocabulary from their description and earlier replies) and keep the same narration style, formatting and length as {{char}}'s previous messages. Treat the direction as what happens, not as wording to copy. Do not speak, act or decide for {{user}}.]`;

// Corrections. {{speaker}}, {{instruction}}, {{message}}, {{selection}} and
// {{about}} are filled by the extension.

export const DEFAULT_CORRECT = `[Out of character: you are editing one message from this story, written by {{speaker}}. Rewrite it so it follows the correction below.
{{about}}
Correction: {{instruction}}

Message to edit:
"""
{{message}}
"""

Rules:
- Change only what the correction asks for. Keep everything else (events, details, wording, formatting and length) as close to the original as possible.
- Keep {{speaker}}'s voice: their personality, speech patterns and vocabulary, and the message's point of view and tense.
- Reply with the full corrected message only: no notes, labels, quotes around it or code fences.]`;

export const DEFAULT_CORRECT_SELECTION = `[Out of character: you are editing one passage of a message from this story, written by {{speaker}}. Rewrite only that passage so it follows the correction below.
{{about}}
Correction: {{instruction}}

Full message, for context only:
"""
{{message}}
"""

Passage to rewrite:
"""
{{selection}}
"""

Rules:
- Your reply replaces the passage word for word, so it must fit seamlessly with the text before and after it.
- Change only what the correction asks for and keep the rest of the passage as it is.
- Keep {{speaker}}'s voice: their personality, speech patterns and vocabulary, and the message's point of view and tense.
- Reply with the rewritten passage only: no notes, labels, quotes around it or code fences.]`;
