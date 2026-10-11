// DOM for the action bar and the settings panel. All colours come from the
// active SillyTavern theme (see style.css), so it follows whatever theme is in use.

const BAR_ID = 'ggsi_bar';

/**
 * @typedef {object} BarButton
 * @property {string} id
 * @property {string} setting  Settings key that shows/hides the button.
 * @property {string} icon     Font Awesome icon class.
 * @property {string} label
 * @property {string} hint     Tooltip.
 * @property {string} busyText Status shown while it runs.
 * @property {() => void} action
 */

/** @type {BarButton[]} */
let buttons = [];

export function renderBar(barButtons, settings) {
    buttons = barButtons;
    const anchor = document.getElementById('nonQRFormItems');
    if (!anchor) {
        console.error('[Guided Gens SI] Could not find #nonQRFormItems; buttons not added.');
        return;
    }

    let bar = document.getElementById(BAR_ID);
    if (!bar) {
        bar = document.createElement('div');
        bar.id = BAR_ID;
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', 'Guided generations');
        anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    }
    bar.innerHTML = '';
    bar.classList.toggle('ggsi-compact', !!settings.compactButtons);

    const status = document.createElement('div');
    status.className = 'ggsi-status';
    status.setAttribute('aria-live', 'polite');
    bar.appendChild(status);

    const group = document.createElement('div');
    group.className = 'ggsi-group';
    bar.appendChild(group);

    for (const button of buttons) {
        if (!settings[button.setting]) continue;
        const el = document.createElement('button');
        el.type = 'button';
        el.id = button.id;
        el.className = 'ggsi-btn';
        el.title = button.hint;
        el.setAttribute('aria-label', button.label);
        el.innerHTML = `<i class="ggsi-icon fa-solid ${button.icon}"></i><span class="ggsi-label">${button.label}</span>`;
        el.addEventListener('click', () => button.action());
        group.appendChild(el);
    }
    bar.hidden = group.childElementCount === 0;
}

export function setStatus(text = '') {
    const status = document.querySelector(`#${BAR_ID} .ggsi-status`);
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('ggsi-visible', !!text);
}

/** Marks one button as running (spinner) and locks the others; null clears it. */
export function setBusy(buttonId) {
    const bar = document.getElementById(BAR_ID);
    if (!bar) return;
    bar.classList.toggle('ggsi-busy', !!buttonId);
    for (const el of bar.querySelectorAll('.ggsi-btn')) {
        const running = el.id === buttonId;
        el.classList.toggle('ggsi-running', running);
        el.disabled = !!buttonId && !running;
        el.setAttribute('aria-busy', String(running));
    }
    const button = buttons.find(b => b.id === buttonId);
    setStatus(button?.busyText ?? '');
}

/** Swaps the impersonate button to an "undo" look while its result is in the input. */
export function setImpersonateUndo(undo) {
    const el = document.getElementById('ggsi_impersonate');
    const button = buttons.find(b => b.id === 'ggsi_impersonate');
    if (!el || !button || el.classList.contains('ggsi-running')) return;
    el.classList.toggle('ggsi-undo', undo);
    el.querySelector('.ggsi-icon').className = `ggsi-icon fa-solid ${undo ? 'fa-rotate-left' : button.icon}`;
    el.querySelector('.ggsi-label').textContent = undo ? 'Outline' : button.label;
    el.title = undo ? 'Bring back your outline' : button.hint;
}

// --- Settings panel ---------------------------------------------------------

const toggle = (key, title, desc, icon = '') => `
  <label class="ggsi-row ggsi-toggle-row">
    ${icon ? `<i class="ggsi-row-icon fa-solid ${icon}"></i>` : ''}
    <span class="ggsi-row-text"><span class="ggsi-row-title">${title}</span><small>${desc}</small></span>
    <input type="checkbox" class="ggsi-switch" data-ggsi="${key}">
  </label>`;

const slider = (key, title, desc, max) => `
  <div class="ggsi-row ggsi-stack">
    <span class="ggsi-row-text"><span class="ggsi-row-title">${title} <output class="ggsi-value" data-ggsi-out="${key}"></output></span><small>${desc}</small></span>
    <input type="range" class="ggsi-range" min="0" max="${max}" step="1" data-ggsi="${key}">
  </div>`;

const template = (key, title) => `
  <div class="ggsi-template">
    <div class="ggsi-template-head">
      <span class="ggsi-row-title">${title}</span>
      <button type="button" class="ggsi-ghost" data-ggsi-reset="${key}"><i class="fa-solid fa-rotate-left"></i> Reset</button>
    </div>
    <textarea class="text_pole ggsi-code" rows="10" spellcheck="false" data-ggsi-template="${key}"></textarea>
  </div>`;

function settingsHtml() {
    return `
<div id="ggsi_settings" class="ggsi-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b><i class="fa-solid fa-feather-pointed"></i> Guided Gens SI</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content"><div class="ggsi-body">
      <p class="ggsi-intro">Guide the story without breaking voice: your persona in third person, the character as themselves.</p>

      <section class="ggsi-card">
        <h4><i class="fa-solid fa-table-cells-large"></i> Buttons</h4>
        ${toggle('showImpersonate', 'Impersonate', 'Turn an outline into your persona\'s message.', 'fa-user-pen')}
        ${toggle('showResponse', 'Respond', 'Character replies following your direction.', 'fa-comment-dots')}
        ${toggle('showSwipe', 'Swipe', 'New swipe of the last reply following your direction.', 'fa-arrows-rotate')}
        ${toggle('showCorrect', 'Correct', 'Rewrite a message, or a highlighted part of it, from instructions.', 'fa-wand-magic-sparkles')}
        ${toggle('compactButtons', 'Compact', 'Icons only (they switch to icons on narrow screens anyway).', 'fa-compress')}
      </section>

      <section class="ggsi-card">
        <h4><i class="fa-solid fa-user"></i> Your persona <small>Impersonate</small></h4>
        <div class="ggsi-row ggsi-stack">
          <span class="ggsi-row-text"><span class="ggsi-row-title">Pronouns</span><small>Used for third-person narration. Blank = whatever your persona says.</small></span>
          <div class="ggsi-pronouns">
            <input type="text" class="text_pole" data-ggsi="userPronouns" placeholder="e.g. she/her">
            <div class="ggsi-chips">
              <button type="button" class="ggsi-chip" data-ggsi-pronoun="she/her">she/her</button>
              <button type="button" class="ggsi-chip" data-ggsi-pronoun="he/him">he/him</button>
              <button type="button" class="ggsi-chip" data-ggsi-pronoun="they/them">they/them</button>
            </div>
          </div>
        </div>
        ${toggle('includePersona', 'Restate persona', 'Repeat your persona description next to the instruction.')}
        ${toggle('strictImpersonate', 'Strict mode', 'Write from a separate request where the model never plays the character. The strongest fix if it keeps answering as them. Leaves out your preset\'s prompts. Chat Completion only.')}
        ${toggle('strictPrefillName', 'Start with your name', 'Strict mode: begin the message with your persona\'s name, locking in third person. Works best with Claude and other models that accept a prefill.')}
        ${toggle('povRetry', 'Auto-fix slips', 'Retry once if it slips into first person or into the character\'s reply. That retry uses strict mode.')}
        ${slider('userVoiceSamples', 'Voice samples', 'Lines you\'ve spoken in this chat, quoted so it talks like you.', 15)}
      </section>

      <section class="ggsi-card">
        <h4><i class="fa-solid fa-masks-theater"></i> Character <small>Respond &amp; Swipe</small></h4>
        ${slider('charVoiceSamples', 'Voice samples', 'Recent lines of theirs, quoted so they keep their voice.', 15)}
        ${slider('guideDepth', 'Direction depth', 'Where the note sits in the chat. 0 = after the last message.', 10)}
        <div class="ggsi-row ggsi-stack">
          <span class="ggsi-row-text"><span class="ggsi-row-title">Direction role</span><small>Who the note appears to come from.</small></span>
          <div class="ggsi-segmented" role="radiogroup" data-ggsi-segmented="guideRole">
            <button type="button" data-value="system">System</button>
            <button type="button" data-value="user">User</button>
            <button type="button" data-value="assistant">Assistant</button>
          </div>
        </div>
      </section>

      <details class="ggsi-card ggsi-advanced">
        <summary><h4><i class="fa-solid fa-code"></i> Prompts <small>Advanced</small></h4><i class="fa-solid fa-chevron-down ggsi-caret"></i></summary>
        <p class="ggsi-help">Placeholders: <code>{{input}}</code> <code>{{direction}}</code> <code>{{persona}}</code> <code>{{voice}}</code> <code>{{pronouns}}</code>; for corrections <code>{{speaker}}</code> <code>{{instruction}}</code> <code>{{message}}</code> <code>{{selection}}</code> <code>{{about}}</code>; plus normal macros like <code>{{user}}</code> and <code>{{char}}</code>.</p>
        ${template('impersonateTemplate', 'Impersonate prompt')}
        ${template('guideTemplate', 'Respond / Swipe direction')}
        ${template('correctTemplate', 'Correct: whole message')}
        ${template('correctSelectionTemplate', 'Correct: highlighted part')}
      </details>
    </div></div>
  </div>
</div>`;
}

/**
 * @param {object} settings  Live settings object (mutated in place).
 * @param {object} options
 * @param {() => void} options.save
 * @param {(key: string) => void} options.onChange
 * @param {Record<string, string>} options.templateDefaults
 */
export function mountSettings(settings, { save, onChange, templateDefaults }) {
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host) return;
    host.insertAdjacentHTML('beforeend', settingsHtml());
    const root = document.getElementById('ggsi_settings');

    const commit = key => {
        save();
        onChange(key);
    };
    const showValue = key => {
        const out = root.querySelector(`[data-ggsi-out="${key}"]`);
        if (out) out.textContent = key === 'guideDepth' || settings[key] ? String(settings[key]) : 'off';
    };

    for (const el of root.querySelectorAll('[data-ggsi]')) {
        const key = el.dataset.ggsi;
        if (el.type === 'checkbox') el.checked = !!settings[key];
        else el.value = settings[key];
        showValue(key);
        el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
            settings[key] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
            showValue(key);
            commit(key);
        });
    }

    const pronounInput = root.querySelector('[data-ggsi="userPronouns"]');
    const markChips = () => {
        for (const chip of root.querySelectorAll('[data-ggsi-pronoun]')) {
            chip.classList.toggle('ggsi-active', chip.dataset.ggsiPronoun === settings.userPronouns.trim());
        }
    };
    markChips();
    pronounInput.addEventListener('input', markChips);
    for (const chip of root.querySelectorAll('[data-ggsi-pronoun]')) {
        chip.addEventListener('click', () => {
            const value = chip.dataset.ggsiPronoun;
            settings.userPronouns = settings.userPronouns.trim() === value ? '' : value;
            pronounInput.value = settings.userPronouns;
            markChips();
            commit('userPronouns');
        });
    }

    for (const group of root.querySelectorAll('[data-ggsi-segmented]')) {
        const key = group.dataset.ggsiSegmented;
        const mark = () => {
            for (const option of group.querySelectorAll('button')) {
                const active = option.dataset.value === settings[key];
                option.classList.toggle('ggsi-active', active);
                option.setAttribute('aria-checked', String(active));
                option.setAttribute('role', 'radio');
            }
        };
        mark();
        group.addEventListener('click', event => {
            const option = event.target.closest('button');
            if (!option) return;
            settings[key] = option.dataset.value;
            mark();
            commit(key);
        });
    }

    for (const el of root.querySelectorAll('[data-ggsi-template]')) {
        const key = el.dataset.ggsiTemplate;
        el.value = settings[key] || templateDefaults[key];
        el.addEventListener('input', () => {
            // Store blank when unchanged so future default improvements still apply.
            settings[key] = el.value === templateDefaults[key] ? '' : el.value;
            commit(key);
        });
    }

    for (const el of root.querySelectorAll('[data-ggsi-reset]')) {
        const key = el.dataset.ggsiReset;
        el.addEventListener('click', () => {
            settings[key] = '';
            root.querySelector(`[data-ggsi-template="${key}"]`).value = templateDefaults[key];
            commit(key);
        });
    }
}
