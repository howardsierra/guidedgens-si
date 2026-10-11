import test from 'node:test';
import assert from 'node:assert/strict';
import {
    cleanImpersonation,
    collectVoiceSamples,
    countFirstPerson,
    extractDialogue,
    fillTemplate,
    hasPovSlip,
} from '../src/text.js';

test('fillTemplate only fills the given keys', () => {
    assert.equal(fillTemplate('{{input}} for {{char}} $1', { input: 'a $& b' }), 'a $& b for {{char}} $1');
});

test('extractDialogue handles straight, curly and guillemet quotes', () => {
    assert.deepEqual(extractDialogue('She said "hello there" and “bye now”, «salut»'), ['hello there', 'bye now', 'salut']);
});

test('countFirstPerson ignores dialogue', () => {
    assert.equal(countFirstPerson('Mara smiled. "I think my plan works," she said.'), 0);
    assert.equal(countFirstPerson("I walk over and I'm grinning at my friend."), 3);
    assert.equal(hasPovSlip('Mara walks over, grinning. "Me? Never."'), false);
    assert.equal(hasPovSlip('I walk over. My hands shake. I sit down.'), true);
});

test('collectVoiceSamples takes recent, unique, non-hidden lines from the target', () => {
    const chat = [
        { is_user: true, mes: '"An old line from the user."' },
        { is_user: false, name: 'Bob', mes: '"A line from Bob that is long."' },
        { is_user: true, is_system: true, mes: '"A hidden user line here."' },
        { is_user: true, mes: '"Short." "Second user line here." "Third user line here."' },
        { is_user: true, mes: '"An old line from the user."' },
    ];
    const samples = collectVoiceSamples(chat, m => m.is_user, 3);
    assert.deepEqual(samples, ['Second user line here.', 'Third user line here.', 'An old line from the user.']);
    assert.deepEqual(collectVoiceSamples(chat, m => m.name === 'Bob', 5, { skipIndex: 1 }), []);
});

test('cleanImpersonation strips the user prefix and cuts other speakers', () => {
    assert.equal(cleanImpersonation('Mara: Mara waves.', 'Mara', ['Bob']), 'Mara waves.');
    assert.equal(cleanImpersonation('Mara waves.\n\nBob: "Hi!"', 'Mara', ['Bob']), 'Mara waves.');
    assert.equal(cleanImpersonation('Mara waves.\n**Bob:** hi', 'Mara', ['Bob']), 'Mara waves.');
    assert.equal(cleanImpersonation('Mara tells Bob: "go."', 'Mara', ['Bob']), 'Mara tells Bob: "go."');
});

test('cleanRewrite strips wrapping the original did not have', async () => {
    const { cleanRewrite } = await import('../src/text.js');
    assert.equal(cleanRewrite('```\nShe sighs.\n```', 'She smiles.'), 'She sighs.');
    assert.equal(cleanRewrite('"""\nShe sighs.\n"""', 'She smiles.'), 'She sighs.');
    assert.equal(cleanRewrite('Seraphina: She sighs.', 'x', 'Seraphina'), 'She sighs.');
    assert.equal(cleanRewrite('"She sighs."', 'She smiles.'), 'She sighs.');
    assert.equal(cleanRewrite('"Go away."', '"Hello."'), '"Go away."');
    assert.equal(cleanRewrite('"Go," she said, "now."', 'x'), '"Go," she said, "now."');
});

test('replaceRange keeps the selection whitespace', async () => {
    const { replaceRange } = await import('../src/text.js');
    const text = 'One. Two three. Four.';
    assert.equal(replaceRange(text, 4, 16, 'Changed.'), 'One. Changed. Four.');
});

test('looksLikeCharReply spots replies written as the character', async () => {
    const { looksLikeCharReply } = await import('../src/text.js');
    const chars = ['Seraphina'];
    // Proper third-person user messages.
    assert.equal(looksLikeCharReply('Mara steps forward. "I am fine," she says.', 'Mara', chars), false);
    assert.equal(looksLikeCharReply('*She shrugs and looks at Seraphina.* "Whatever."', 'Mara', chars), false);
    assert.equal(looksLikeCharReply('Mara glances at Seraphina. Seraphina is smiling; Seraphina always smiles.', 'Mara', chars), false);
    // Slid into the character's reply.
    assert.equal(looksLikeCharReply('*Seraphina tilts her head.* "Are you sure?" She takes your hand.', 'Mara', chars), true);
    assert.equal(looksLikeCharReply('She smiles at you and squeezes your hand.', 'Mara', chars), true);
    assert.equal(looksLikeCharReply('Seraphina sighs. "Fine."', 'Mara', chars), true);
    assert.equal(looksLikeCharReply('', 'Mara', chars), false);
    // A message about the character, narrated with the user's pronouns, is still the user's.
    assert.equal(looksLikeCharReply('She throws her arms around Seraphina. Seraphina stiffens, but she holds Seraphina tighter.', 'Mara', chars), false);
    assert.equal(looksLikeCharReply('Seraphina tilts her head at you. Seraphina smiles. Seraphina waits.', 'Mara', chars), true);
});

test('buildTranscript keeps the newest messages within budget', async () => {
    const { buildTranscript } = await import('../src/text.js');
    const chat = [
        { name: 'A', mes: 'x'.repeat(50) },
        { name: 'B', mes: 'hidden', is_system: true },
        { name: 'A', mes: 'second' },
        { name: 'C', mes: 'third' },
    ];
    assert.equal(buildTranscript(chat, 30), 'A: second\n\nC: third');
    assert.equal(buildTranscript(chat, 1), 'C: third');
});

test('joinPrefill avoids doubling the name', async () => {
    const { joinPrefill } = await import('../src/text.js');
    assert.equal(joinPrefill('Mara', ' steps forward.'), 'Mara steps forward.');
    assert.equal(joinPrefill('Mara', "'s eyes narrow."), "Mara's eyes narrow.");
    assert.equal(joinPrefill('Mara', 'Mara steps forward.'), 'Mara steps forward.');
    assert.equal(joinPrefill('Mara', 'steps forward.'), 'Mara steps forward.');
    assert.equal(joinPrefill('', ' steps.'), 'steps.');
});

test('parseDirectionCheck reads the verdict and missed points', async () => {
    const { parseDirectionCheck } = await import('../src/text.js');
    assert.deepEqual(parseDirectionCheck('MISSED: none\nVERDICT: PASS'), { pass: true, missed: '' });
    assert.deepEqual(
        parseDirectionCheck('MISSED:\n- Slater is offline instead of live on stream\n- his chat is a Discord server, not his stream chat\nVERDICT: FAIL'),
        { pass: false, missed: '- Slater is offline instead of live on stream\n- his chat is a Discord server, not his stream chat' },
    );
    assert.deepEqual(parseDirectionCheck('MISSED: 1. He never plays Valorant\n**VERDICT:** FAIL'), { pass: false, missed: '- He never plays Valorant' });
    // Unparseable or contradictory answers never trigger a redo.
    assert.equal(parseDirectionCheck('I cannot help with that.').pass, true);
    assert.equal(parseDirectionCheck('MISSED: none\nVERDICT: FAIL').pass, true);
});

test('plainForCheck strips markup', async () => {
    const { plainForCheck } = await import('../src/text.js');
    assert.equal(plainForCheck('<div style="x">#general</div><span>hi</span>\n\n\n<b>yo</b>'), '#general hi\n\nyo');
    assert.equal(plainForCheck('abcdef', 3), 'abc…');
});
