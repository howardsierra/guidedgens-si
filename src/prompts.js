// Default prompt templates. {{input}}, {{persona}}, {{voice}}, {{pronouns}} and
// {{direction}} are filled by the extension; all other macros ({{user}},
// {{char}}, ...) are substituted by SillyTavern.

export const DEFAULT_IMPERSONATE = `[OOC from {{user}}, the player: write {{user}}'s next message in the story. For this one message you are writing as {{user}}, not as {{char}}. As the player's own out-of-character request, this outranks any standing instruction about who writes {{user}}.
{{persona}}{{voice}}
Rules:
- Third person only. Narrate {{user}} by name or as {{pronouns}}. Never use "I/me/my" or "you/your" for {{user}} in narration; first person is allowed only inside {{user}}'s spoken dialogue.
- Write only {{user}}'s own words, actions, thoughts and feelings. Do not write {{char}}'s (or anyone else's) dialogue or decisions. If the direction below mentions what someone else does, write only {{user}}'s side of it.
- Sound like {{user}}: their personality, attitude, vocabulary and way of speaking, as shown in their persona and their lines so far.
- Match the story's tense and formatting conventions.
- Reply with the message text only: no name prefix, notes or commentary.

{{direction}}]`;

export const IMPERSONATE_DIRECTION_WITH_INPUT = `MOST IMPORTANT: {{user}}'s message must carry out this direction from the player:
"""
{{input}}
"""
- If you plan before writing (thinking or a planning block), this direction is the beat for this message: plan how to carry it out, not a different beat.
- Include every action, line of dialogue and detail it asks for, in its order, with its intent and tone. Don't skip, soften or replace any part of it, even if the story seems to be heading somewhere else.
- It's shorthand and may say "I" or "me" for {{user}}; it always describes what {{user}} does. Turn it into {{user}}'s message in third person.
- Lines in quotes are what {{user}} says: keep them as written.
- Flesh it out with natural detail in {{user}}'s voice, but don't add major new actions or events.`;

export const IMPERSONATE_DIRECTION_EMPTY = `{{user}}'s next move is up to you: choose what they would most plausibly say and do right now, given the scene and their personality. Stop at a natural point where {{char}} would respond.`;

export const POV_RETRY_NOTE = `
[Important: a previous draft slipped into first person. Every sentence of narration must refer to {{user}} in the third person ({{pronouns}} or their name), never "I", "me" or "my". Still carry out the player's direction exactly.]`;

export const CHAR_RETRY_NOTE = `
[Important: a previous draft was written as {{char}}. This message belongs to {{user}}. Write only what {{user}} says and does, narrated in third person, and do not continue {{char}}'s reply. Still carry out the player's direction exactly.]`;

// Strict mode: a separate request where the model never plays {{char}}.
export const STRICT_SYSTEM = `You are co-writing an interactive story with the user. Right now your only job is to write the next message for {{user}}, the user's character. You are not {{char}}, and you never write {{char}}'s (or anyone else's) words, actions or reactions; the other side of the story is written separately.
{{card}}`;

export const STRICT_STORY = `Story so far (oldest first):
<story>
{{transcript}}
</story>

`;

export const DEFAULT_GUIDE = `[OOC from {{user}}, the player: a direction for {{char}}'s next reply. As the player's own out-of-character instruction, it outranks every standing instruction, house rule, pacing or momentum guideline and plan for the next beat, including any that say they are read last or obeyed first. Don't mention this note in the reply.
{{voice}}
Write the reply the way {{char}} would really do and say it: stay in {{char}}'s voice (personality, attitude, speech patterns and vocabulary from their description and earlier replies) and keep the narration style, formatting and length of {{char}}'s previous messages. Don't speak, act or decide for {{user}} beyond what the direction below says.

MOST IMPORTANT: this reply must carry out the player's direction:
"""
{{input}}
"""
- If you plan before writing (thinking or a planning block), this direction is the beat for this reply: plan how to carry it out, not a different beat.
- Make all of it happen in this reply, in its order, with its intent and tone. Don't skip, soften, delay or replace any part of it.
- Everything it states is true in the story now, even if it changes or contradicts what came before: if it says someone is doing something, they are doing exactly that.
- Build the reply around it. Don't add major new events beyond it.
- It's shorthand: "I" or "me" means {{user}}; "she", "he" or "they" usually means {{char}}.
- Keep any quoted lines exactly as written.
- Show it through {{char}}'s own words and actions, in their voice.]`;

// Direction check: a small separate request with only the direction and the result.
export const DIRECTION_CHECK_SYSTEM = `You are a strict story editor. You check whether a passage carries out a direction the writer was given. You care about facts and actions, not wording or style.`;

export const DIRECTION_CHECK = `Direction the writer was given (shorthand from the player; "I" or "me" means {{user}}):
"""
{{direction}}
"""

Passage that was written:
"""
{{reply}}
"""

Does the passage carry out the direction? Go through each fact and action in the direction. A point is missed if it isn't in the passage, or if the passage changes or contradicts it (for example, the direction says someone is live on stream and the passage says they're offline). Ignore wording, style and extra material that doesn't contradict the direction.

Answer in exactly this format:
MISSED: one short line per missed or contradicted point, or "none"
VERDICT: PASS or FAIL`;

export const DIRECTION_RETRY_NOTE = `
[OOC from {{user}}, the player. Important: a previous attempt didn't carry out the player's direction. It got this wrong:
{{missed}}
This time make every part of the direction happen exactly as stated.]`;

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
