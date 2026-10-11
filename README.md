# Guided Gens SI

A small, focused SillyTavern extension based on the idea behind
[Guided Generations](https://github.com/Samueras/GuidedGenerations-Extension) by Samueras.
It has only three buttons, and they're built to stay in character.

![The Guided Gens SI button bar above the chat input](docs/bar.png)

| Button | What it does |
| --- | --- |
| **Impersonate** | Turns the outline in your input box into **your persona's** next message, always in **third person**. Afterwards the button becomes **Outline**: click it to get your outline back. |
| **Respond** | The character replies following the direction in your input box, **in their own voice**. |
| **Swipe** | A new swipe of the character's last message, following your direction, **in their own voice**. Leave the box empty for a plain swipe. |

While one runs, it shows a spinner and a short status, and the other buttons are locked so you can't start two generations at once. On narrow screens (or with **Compact** on) the bar shows icons only.

![Busy state](docs/bar-busy.png)
![After impersonating, the button offers your outline back](docs/bar-outline.png)

## How it differs from the original

**Impersonate sounds like you, and only in third person**
- The prompt gives the model your persona description plus a few lines you've actually spoken in this chat, so it copies how *you* talk instead of a generic voice.
- It has strict rules: third-person narration only, only your persona's own words and actions, and nothing written for the character.
- The result is checked. If the narration slips into "I/me/my", it retries once automatically (you can turn this off). It also removes a leading `YourName:` and cuts off anything after the model starts a `CharName:` line.
- Set your pronouns in the settings (e.g. `she/her`) so the model never has to guess.

**Response and swipe sound like the character**
- The original sent your text as a bare instruction (`[Take the following into special consideration…]`) right after the last message, so models often answered the note, or switched into an assistant voice.
- This version sends it as a private author's note. The note says it describes *what happens*, not *how to word it*, and tells the model to keep the character's personality, speech patterns, formatting and length.
- It includes a few of the character's own recent lines as a voice anchor. For swipes, the message being replaced is left out.
- The note goes in through SillyTavern's extension-prompt API rather than `/inject` slash commands, so `|` or other special characters in your text can't break it. It's always removed afterwards, even if generation fails or you press stop.

## Installation

1. In SillyTavern open **Extensions → Install extension**.
2. Paste `https://github.com/howardsierra/guidedgens-si` and install.
3. The three buttons appear above the chat input. Settings are under **Extensions → Guided Gens SI**.

Requires a recent SillyTavern (1.13.0+ for Guided Swipe). It can run alongside the original Guided Generations extension.

## Settings

Under **Extensions → Guided Gens SI**. Everything follows your SillyTavern theme colours.

<img src="docs/settings.png" alt="Settings panel" width="320">

- **Buttons**: show or hide each button; **Compact** for icons only.
- **Your persona**
  - **Pronouns**: type them or tap a chip (she/her, he/him, they/them). They're used in the third-person rule.
  - **Restate persona**: repeats your persona description right next to the instruction (turn it off to save tokens).
  - **Fix point of view**: one automatic retry if the narration uses I/me/my.
  - **Voice samples**: how many of your spoken lines to quote (0 = off).
- **Character**
  - **Voice samples**: how many of the character's recent lines to quote (0 = off).
  - **Direction depth**: where the author's note goes in the chat (0 = after the last message).
  - **Direction role**: System, User or Assistant.
- **Prompts (Advanced)**: edit both prompts; **Reset** restores the defaults.

## Tips

- In Chat Completion presets, SillyTavern's own *Impersonation prompt* (under Utility Prompts) is also sent. If it conflicts with your style (for example "internet RP style"), edit it or clear it.
- Groups: Guided Response lets SillyTavern pick who replies, so it skips the voice samples. Guided Swipe uses the voice of whoever wrote the last message.

## Development

`npm test` runs the unit tests for the text helpers (`src/text.js`).

## License

GPL-3.0, the same as the original Guided Generations extension.
