import type { RunRequest, RunResult } from '../../sim/api/runSnapshot';
import type { WorkerReply } from '../../sim/api/worker';

/**
 * Roda um mundo num Web Worker, a partir de um retrato (`sim/api/worker.ts`). A mensagem copia o retrato: o mundo de
 * quem pediu continua intacto. Rejeita se o Worker falhar: quem pede decide o que fazer sem o mundo novo.
 */
export function runInWorker(req: RunRequest, onYear?: (yearsRun: number) => void): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../sim/api/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      if (e.data.kind === 'year') {
        onYear?.(e.data.yearsRun);
        return;
      }
      worker.terminate();
      resolve(e.data.result);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage(req);
  });
}
