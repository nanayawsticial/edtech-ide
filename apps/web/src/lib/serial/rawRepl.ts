// MicroPython's raw REPL, as the IDE uses it to save files on a board and run code there.
//
// The IDE sends Ctrl-C (stop whatever is running), Ctrl-A (enter the raw REPL), the code and Ctrl-D.
// The board prints its banner and a ">" prompt, then answers with
//
//     OK <what the code printed> \x04 <the error, if it failed> \x04 >
//
// Anything before the banner (a stopped program's last lines, a KeyboardInterrupt) is not part of
// the reply.

export const RAW_REPL_BANNER = 'raw REPL; CTRL-B to exit\r\n>';

export const CTRL_A = 0x01; // enter the raw REPL
export const CTRL_B = 0x02; // leave it (back to the normal ">>>" prompt)
export const CTRL_C = 0x03; // stop the running program
export const CTRL_D = 0x04; // run the code (raw REPL), or soft-reboot the board (normal prompt)

export interface RawReplReply {
  /** What the code printed. */
  output: string;
  /** The traceback when the code failed; empty when it ran cleanly. */
  error: string;
}

/** The reply in a raw-REPL exchange captured so far, or null while it is still arriving. */
export function parseRawReplReply(buffer: string): RawReplReply | null {
  const banner = buffer.indexOf(RAW_REPL_BANNER);
  const from = banner >= 0 ? banner + RAW_REPL_BANNER.length : 0;
  const ok = buffer.indexOf('OK', from);
  if (ok < 0) return null;
  const outputEnd = buffer.indexOf('\x04', ok + 2);
  if (outputEnd < 0) return null;
  const errorEnd = buffer.indexOf('\x04', outputEnd + 1);
  if (errorEnd < 0) return null;
  return {
    output: buffer.slice(ok + 2, outputEnd),
    error: buffer.slice(outputEnd + 1, errorEnd),
  };
}

/** The line of a MicroPython traceback that says what went wrong, e.g. "OSError: [Errno 28] ENOSPC". */
export function describeMicroPythonError(traceback: string): string {
  const lines = traceback.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : 'The board reported an error.';
}
