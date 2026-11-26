import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTsModuleLoader } from './ts-module-loader.mjs';

// Reading MicroPython's raw-REPL replies, as the board sends them when the IDE saves main.py.
// Each transcript below is what a board prints after Ctrl-C, Ctrl-C, Ctrl-A, the code and Ctrl-D.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(scriptDir, '..', 'src');
const loader = createTsModuleLoader(srcRoot);
const { parseRawReplReply, describeMicroPythonError, RAW_REPL_BANNER } = loader.loadModule(
  path.join(srcRoot, 'lib', 'serial', 'rawRepl.ts'),
);

const STOPPED_SERVER = 'Client connected from: (\'192.168.1.20\', 51234)\r\nLED turned ON\r\n'
  + 'Traceback (most recent call last):\r\n  File "main.py", line 40, in <module>\r\nKeyboardInterrupt: \r\n'
  + 'MicroPython v1.29.0 on 2026-08-24; Raspberry Pi Pico 2 W with RP2350\r\nType "help()" for more information.\r\n>>> \r\n>>> ';

/** Feeds a transcript in small chunks, the way the serial port delivers it, and returns the first complete reply. */
function readInChunks(transcript, size) {
  let buffer = '';
  for (let index = 0; index < transcript.length; index += size) {
    buffer += transcript.slice(index, index + size);
    const reply = parseRawReplReply(buffer);
    if (reply) return { reply, consumed: Math.min(index + size, transcript.length) };
  }
  return { reply: null, consumed: transcript.length };
}

// 1. A file saved cleanly, after stopping a running web server. Its last lines are not the reply.
{
  const transcript = `${STOPPED_SERVER}${RAW_REPL_BANNER}OKOK\r\n\x04\x04>`;
  for (const size of [1, 3, 16, transcript.length]) {
    const { reply } = readInChunks(transcript, size);
    assert.deepEqual(reply, { output: 'OK\r\n', error: '' }, `clean save, chunks of ${size}`);
  }
}

// 2. The reply is not complete until both end markers have arrived.
{
  const partial = `${RAW_REPL_BANNER}OKREADY\r\n\x04`;
  assert.equal(parseRawReplReply(partial), null, 'waits for the error section');
  assert.equal(parseRawReplReply(`${RAW_REPL_BANNER}OKREA`), null, 'waits for the output');
  assert.equal(parseRawReplReply(`${STOPPED_SERVER}raw REPL; CTRL-B`), null, 'waits for the banner');
}

// 3. "OK" printed by the stopped program, before the banner, is not the start of the reply.
{
  const transcript = `Server says OK\r\n\x04 stray\r\n${RAW_REPL_BANNER}OKhello\r\n\x04\x04>`;
  assert.deepEqual(parseRawReplReply(transcript), { output: 'hello\r\n', error: '' }, 'ignores text before the banner');
}

// 4. A failed save: the error comes back, and its last line says what went wrong.
{
  const traceback = 'Traceback (most recent call last):\r\n  File "<stdin>", line 3, in <module>\r\nOSError: [Errno 28] ENOSPC\r\n';
  const transcript = `${STOPPED_SERVER}${RAW_REPL_BANNER}OK\x04${traceback}\x04>`;
  const { reply } = readInChunks(transcript, 5);
  assert.equal(reply?.output, '', 'nothing printed');
  assert.equal(reply?.error, traceback, 'the traceback is returned');
  assert.equal(describeMicroPythonError(reply.error), 'OSError: [Errno 28] ENOSPC');
}

// 5. Output that runs over several lines and contains the prompt character.
{
  const transcript = `${RAW_REPL_BANNER}OK[{"name":"main.py","isDir":false}]\r\n> not a prompt\r\n\x04\x04>`;
  assert.deepEqual(
    parseRawReplReply(transcript),
    { output: '[{"name":"main.py","isDir":false}]\r\n> not a prompt\r\n', error: '' },
    'keeps the whole output',
  );
}

// 6. Recorded from a real Pico 2 W (MicroPython 1.29): a web server's port 80 is still taken when
//    the same code runs again without a restart, which is why Upload soft-reboots the board.
{
  const transcript = '\r\n>>> \r\n>>> \r\nraw REPL; CTRL-B to exit\r\n>OK\x04Traceback (most recent call last):\r\n'
    + '  File "<stdin>", line 3, in <module>\r\nOSError: [Errno 98] EADDRINUSE\r\n\x04>';
  const { reply } = readInChunks(transcript, 7);
  assert.equal(reply?.output, '');
  assert.equal(describeMicroPythonError(reply.error), 'OSError: [Errno 98] EADDRINUSE');
  const saved = '\r\n>>> \r\n>>> \r\nraw REPL; CTRL-B to exit\r\n>OKOK\r\n\x04\x04>';
  assert.deepEqual(parseRawReplReply(saved), { output: 'OK\r\n', error: '' }, 'a real file save');
}

assert.equal(describeMicroPythonError('\r\n'), 'The board reported an error.');

console.log('Validated MicroPython raw-REPL replies (clean saves, partial replies, stopped programs, errors and a real Pico 2 W).');
