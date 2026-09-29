import { execFile } from "node:child_process";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "../../application/ports/process-runner.js";

export class ExecFileProcessRunner implements ProcessRunner {
  run(request: ProcessRequest): Promise<ProcessResult> {
    const isWindowsScript = process.platform === "win32" && /\.(?:c|m)?js$/i.test(request.command);
    const command = isWindowsScript ? process.execPath : request.command;
    const args = isWindowsScript ? [request.command, ...request.args] : request.args;
    return new Promise((resolve) => {
      execFile(
        command,
        args,
        {
          cwd: request.cwd,
          shell: false,
          timeout: request.timeoutMs,
          maxBuffer: request.maxOutputBytes,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          const code = error?.code;
          const outputLimitExceeded = code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
          const timedOut = Boolean(error?.killed) || error?.signal === "SIGTERM";
          const exitCode = typeof code === "number" ? code : error ? 127 : 0;
          resolve({
            exitCode,
            stdout: String(stdout),
            stderr: String(stderr),
            timedOut,
            outputLimitExceeded,
          });
        },
      );
    });
  }
}
