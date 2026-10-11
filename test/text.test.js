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
