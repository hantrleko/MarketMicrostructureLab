import {
  AlphaGridParams,
  AlphaGridResult,
  computeAlphaGrid,
  computeExecutionGrid,
  ExecutionGridParams,
  ExecutionGridResult
} from './quantWorker';

let workerInstance: Worker | null = null;
let reqCounter = 0;
const pending = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

function getWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (!workerInstance) {
    try {
      workerInstance = new Worker(new URL('./quantWorker.ts', import.meta.url), { type: 'module' });
      workerInstance.onmessage = (ev: MessageEvent) => {
        const { id, ok, result, error } = ev.data || {};
        const handler = pending.get(id);
        if (!handler) return;
        pending.delete(id);
        if (ok) handler.resolve(result);
        else handler.reject(new Error(error || 'Worker failed'));
      };
      workerInstance.onerror = (err) => {
        console.warn('QuantWorker fallback triggered:', err);
        workerInstance = null;
      };
    } catch {
      return null;
    }
  }
  return workerInstance;
}

function runWorkerTask<T>(type: string, payload: any, syncFallback: () => T): Promise<T> {
  const w = getWorker();
  if (!w) {
    return Promise.resolve(syncFallback());
  }
  return new Promise<T>((resolve, reject) => {
    const id = ++reqCounter;
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type, payload });
  });
}

export function scanExecutionGridAsync(params: ExecutionGridParams): Promise<ExecutionGridResult> {
  return runWorkerTask('SCAN_OPTIMAL_EXECUTION_GRID', params, () => computeExecutionGrid(params));
}

export function scanAlphaGridAsync(params: AlphaGridParams): Promise<AlphaGridResult> {
  return runWorkerTask('SCAN_MICRO_ALPHA_GRID', params, () => computeAlphaGrid(params));
}
