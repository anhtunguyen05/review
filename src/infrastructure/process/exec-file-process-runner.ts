import { execFile } from "node:child_process";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "../../application/ports/process-runner.js";

export class ExecFileProcessRunner implements ProcessRunner {
  run(request: ProcessRequest): Promise<ProcessResult> {
    return new Promise((resolve) => {
      execFile(
        request.command,
        request.args,
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
