package io.rootdeck;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;

/**
 * One long-lived {@code su} process. Commands are serialised, run in a subshell so
 * {@code exit} or a failed {@code cd} can't break the session, and delimited with a
 * unique end marker that also carries the exit code. A watchdog kills the shell if a
 * command outlives its timeout; the next call starts a fresh one.
 */
final class RootShell {

    static final class Result {
        final int code;
        final String out;

        Result(int code, String out) {
            this.code = code;
            this.out = out;
        }
    }

    private volatile Process proc;
    private OutputStream stdin;
    private BufferedReader stdout;

    synchronized Result run(String cmd, final int timeoutSec) {
        try {
            if (proc == null) start();
            final String mark = "__RD_END_" + Long.toHexString(System.nanoTime()) + "__";
            String wrapped = "(\n" + cmd + "\n) </dev/null 2>&1; printf '\\n" + mark + ":%d\\n' $?\n";
            stdin.write(wrapped.getBytes("UTF-8"));
            stdin.flush();

            final Process p = proc;
            Thread dog = new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Thread.sleep(Math.max(1, timeoutSec) * 1000L);
                        p.destroy();
                    } catch (InterruptedException ignored) {
                    }
                }
            });
            dog.setDaemon(true);
            dog.start();

            StringBuilder sb = new StringBuilder();
            Integer code = null;
            try {
                String line;
                while ((line = stdout.readLine()) != null) {
                    if (line.startsWith(mark)) {
                        code = parseCode(line.substring(mark.length() + 1));
                        break;
                    }
                    sb.append(line).append('\n');
                }
            } finally {
                dog.interrupt();
            }

            if (code == null) {
                close();
                String partial = sb.toString();
                return new Result(-1, partial.isEmpty()
                        ? "Root shell closed: su was denied or the command timed out" : partial);
            }
            // The marker is preceded by one newline we added; drop it to return the exact output.
            if (sb.length() > 0) sb.setLength(sb.length() - 1);
            return new Result(code, sb.toString());
        } catch (Exception e) {
            close();
            return new Result(-1, "Root error: " + e.getMessage());
        }
    }

    /** Safe to call from any thread, even while a command is running. */
    void kill() {
        Process p = proc;
        if (p != null) p.destroy();
    }

    private void start() throws Exception {
        proc = new ProcessBuilder("su").redirectErrorStream(true).start();
        stdin = proc.getOutputStream();
        stdout = new BufferedReader(new InputStreamReader(proc.getInputStream(), "UTF-8"));
    }

    private void close() {
        Process p = proc;
        proc = null;
        if (p == null) return;
        try {
            stdin.close();
        } catch (Exception ignored) {
        }
        p.destroy();
    }

    private static int parseCode(String s) {
        try {
            return Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            return -1;
        }
    }
}
