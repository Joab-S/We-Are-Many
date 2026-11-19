import { buffersOf, runSnapshot, type RunRequest, type RunResult } from './runSnapshot';

/** O que o Worker responde: o andamento, ano a ano, e o resultado no fim. */
export type WorkerReply = { kind: 'year'; yearsRun: number } | { kind: 'done'; result: RunResult };

/** O motor num Worker: recebe um retrato, roda os anos pedidos e devolve o retrato novo, com os buffers transferidos. */
self.onmessage = (e: MessageEvent<RunRequest>) => {
  const post = (reply: WorkerReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(reply, transfer);
  const result = runSnapshot(e.data, () => performance.now(), (yearsRun) => post({ kind: 'year', yearsRun }));
  post({ kind: 'done', result }, buffersOf(result.snapshot));
};
