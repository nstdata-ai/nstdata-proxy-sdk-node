import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { shellCommands, codeBlocks, checkMarkdown, markdownFiles } from '../scripts/documentation.mjs';

test('documentation shell commands preserve literal arguments and command boundaries', () => {
    assert.deepEqual(shellCommands('```sh\nnpm install @nstdata-ai/proxy\nnode --env-file=.env quickstart.mjs\n```'), [
        ['npm', 'install', '@nstdata-ai/proxy'], ['node', '--env-file=.env', 'quickstart.mjs'],
    ]);
    assert.deepEqual(shellCommands('> ```sh\n> npm install "@nstdata-ai/proxy"\n> ```'), [
        ['npm', 'install', '@nstdata-ai/proxy'],
    ]);
});

test('documentation commands reject shell evaluation and unsupported executables', () => {
    for (const line of ['npm install $(command)', 'npm install `command`', 'npm install "${TOKEN}"',
        'npm install "unfinished', 'npm install a; command', 'npm install a && command',
        'npm install a | command', 'npm install a > output', 'curl https://example.com/']) {
        assert.throws(() => shellCommands('```sh\n' + line + '\n```'));
    }
});

test('rendered Markdown rejects literal emphasis, duplicate headings and unreadable code lines', () => {
    assert.throws(() => checkMarkdown('**正文不可信。**交给调用方', 'fixture.md'), /unrendered emphasis/);
    assert.throws(() => checkMarkdown('# Repeated\n\n# Repeated\n', 'fixture.md'), /duplicate heading/);
    assert.throws(() => checkMarkdown('```js\n' + 'x'.repeat(101) + '\n```', 'fixture.md'), /needs scrolling/);
    checkMarkdown('**正文不可信。** 交给调用方', 'fixture.md');
    for (const file of markdownFiles) {
        checkMarkdown(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), file);
    }
});

test('bilingual quick starts specify matching programs, dotenv and exact runnable commands', () => {
    const readmes = ['README.md', 'README_zh.md'].map(file =>
        fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
    assert.deepEqual(...readmes.map(shellCommands));
    assert.deepEqual(shellCommands(readmes[0]), [
        ['npm', 'install', '@nstdata-ai/proxy'], ['node', '--env-file=.env', 'quickstart.mjs'],
    ]);
    for (const language of ['js', 'dotenv']) {
        const blocks = readmes.map(text => codeBlocks(text).filter(block => block.lang === language));
        assert.equal(blocks[0].length, 1);
        assert.deepEqual(blocks[0].map(block => block.text), blocks[1].map(block => block.text));
    }
    for (const readme of readmes) assert.ok(readme.includes('`quickstart.mjs`'));
});

test('bilingual guide fragments retain the same five independent operations', () => {
    const programs = ['docs/guide.md', 'docs/guide_zh.md'].map(file => codeBlocks(
        fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'),
    ).filter(block => block.lang === 'js').map(block => block.text));
    assert.deepEqual(...programs);
    assert.equal(programs[0].length, 5);
    for (const [index, method] of ['generateProxies', 'getChannel', 'createChannel',
        'updateChannel', 'deleteChannel'].entries()) assert.ok(programs[0][index].includes('client.' + method));
});
