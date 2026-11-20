// High-frequency Quantitative Computation Web Worker
// Offloads 2D parameter grid sweeps and simulation workloads off the UI main thread

export interface ExecutionGridParams {
  orderSizeBtc: number;
  tempImpactEta: number;
  permImpactGamma: number;
  volatilityBps: number;
  initialPrice: number;
}

export interface ExecutionGridResult {
  lambdas: number[];
  horizons: number[];
  // [horizonIdx, lambdaIdx, costBps]
  heatmapData: [number, number, number][];
  bestCell: {
    lambda: number;
    horizon: number;
    costBps: number;
  };
}

export interface AlphaObsLite {
  ofiZ: number;
  mpiZ: number;
  cvdZ: number;
  hwkZ: number;
  fwdRet5: number;
  fwdRet10: number;
  fwdRet20: number;
  fwdRet50: number;
}

export interface AlphaGridParams {
  dataset: AlphaObsLite[];
  wMpi: number;
  wCvd: number;
  wHawkes: number;
  thresholdScore: number;
}

export interface AlphaGridResult {
  wOfiValues: number[];
  horizons: number[];
  // [horizonIdx, wOfiIdx, sharpeProxy]
  heatmapData: [number, number, number][];
  bestCell: {
    wOfi: number;
    horizon: number;
    sharpeProxy: number;
    ic: number;
  };
}

export function computeExecutionGrid(params: ExecutionGridParams): ExecutionGridResult {
  const { orderSizeBtc, tempImpactEta, permImpactGamma, volatilityBps, initialPrice } = params;
  const lambdas = [0.0001, 0.0005, 0.001, 0.0025, 0.005, 0.01];
  const horizons = [10, 20, 30, 45, 60, 90];

  const sigma = initialPrice * (volatilityBps / 10000);
  const X0 = orderSizeBtc;
  const notional = X0 * initialPrice;
  const permUsd = 0.5 * permImpactGamma * X0 * X0;

  const heatmapData: [number, number, number][] = [];
  let bestCell = { lambda: lambdas[0], horizon: horizons[0], costBps: Infinity };

  horizons.forEach((T, hIdx) => {
    lambdas.forEach((lam, lIdx) => {
      const kappa = Math.sqrt((lam * sigma * sigma) / Math.max(1e-6, tempImpactEta));
      const sinhDen = Math.sinh(kappa * T);

      let remPrev = X0;
      let tempUsd = 0;
      let varSum = 0;

      for (let t = 1; t <= T; t++) {
        const remCurr = t === T ? 0 : sinhDen > 0 ? X0 * (Math.sinh(kappa * (T - t)) / sinhDen) : X0 * (1 - t / T);
        const slice = Math.max(0, remPrev - remCurr);
        tempUsd += tempImpactEta * slice * slice;
        varSum += remPrev * remPrev * (sigma * sigma) / T;
        remPrev = remCurr;
      }

      // Risk-adjusted expected implementation shortfall in bps (IS + 0.5 * risk penalty)
      const stdUsd = Math.sqrt(varSum);
      const totalRiskAdjUsd = permUsd + tempUsd + 0.5 * stdUsd * Math.min(1.5, Math.sqrt(lam * 1000));
      const costBps = Number(((totalRiskAdjUsd / notional) * 10000).toFixed(2));

      heatmapData.push([hIdx, lIdx, costBps]);
      if (costBps < bestCell.costBps) {
        bestCell = { lambda: lam, horizon: T, costBps };
      }
    });
  });

  return { lambdas, horizons, heatmapData, bestCell };
}

export function computeAlphaGrid(params: AlphaGridParams): AlphaGridResult {
  const { dataset, wMpi, wCvd, wHawkes, thresholdScore } = params;
  const wOfiValues = [0.0, 0.15, 0.30, 0.45, 0.60, 0.75];
  const horizons: Array<5 | 10 | 20 | 50> = [5, 10, 20, 50];

  const heatmapData: [number, number, number][] = [];
  let bestCell = { wOfi: 0.35, horizon: 10, sharpeProxy: -999, ic: 0 };

  if (!dataset || dataset.length < 60) {
    return { wOfiValues, horizons, heatmapData, bestCell: { wOfi: 0.35, horizon: 10, sharpeProxy: 0, ic: 0 } };
  }

  const validLen = dataset.length - 50;

  horizons.forEach((h, hIdx) => {
    const retKey = h === 5 ? 'fwdRet5' : h === 10 ? 'fwdRet10' : h === 20 ? 'fwdRet20' : 'fwdRet50';

    wOfiValues.forEach((wOfi, wIdx) => {
      const wSum = Math.abs(wOfi) + Math.abs(wMpi) + Math.abs(wCvd) + Math.abs(wHawkes) || 1;
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumX2 = 0;
      let sumY2 = 0;

      const rets: number[] = [];

      for (let i = 0; i < validLen; i++) {
        const d = dataset[i];
        const score = (wOfi * d.ofiZ + wMpi * d.mpiZ + wCvd * d.cvdZ + wHawkes * d.hwkZ) / wSum;
        const y = d[retKey];

        sumX += score;
        sumY += y;
        sumXY += score * y;
        sumX2 += score * score;
        sumY2 += y * y;

        if (score > thresholdScore) {
          rets.push(y);
        } else if (score < -thresholdScore) {
          rets.push(-y);
        }
      }

      const num = validLen * sumXY - sumX * sumY;
      const den = Math.sqrt((validLen * sumX2 - sumX * sumX) * (validLen * sumY2 - sumY * sumY)) || 1;
      const ic = num / den;

      let sharpeProxy = 0;
      if (rets.length >= 10) {
        const meanR = rets.reduce((a, b) => a + b, 0) / rets.length;
        const stdR = Math.sqrt(rets.reduce((a, b) => a + Math.pow(b - meanR, 2), 0) / rets.length) || 1;
        sharpeProxy = Number(((meanR / stdR) * Math.sqrt(rets.length)).toFixed(2));
      }

      heatmapData.push([hIdx, wIdx, sharpeProxy]);
      if (sharpeProxy > bestCell.sharpeProxy) {
        bestCell = { wOfi, horizon: h, sharpeProxy, ic: Number(ic.toFixed(4)) };
      }
    });
  });

  return { wOfiValues, horizons, heatmapData, bestCell };
}

self.onmessage = (ev: MessageEvent) => {
  const { id, type, payload } = ev.data || {};
  try {
    if (type === 'SCAN_OPTIMAL_EXECUTION_GRID') {
      const result = computeExecutionGrid(payload);
      self.postMessage({ id, ok: true, result });
    } else if (type === 'SCAN_MICRO_ALPHA_GRID') {
      const result = computeAlphaGrid(payload);
      self.postMessage({ id, ok: true, result });
    } else {
      self.postMessage({ id, ok: false, error: `Unknown worker task: ${type}` });
    }
  } catch (err: any) {
    self.postMessage({ id, ok: false, error: err?.message || 'Worker computation error' });
  }
};
