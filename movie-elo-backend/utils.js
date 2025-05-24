// utils.js
// Approximation of inverse normal CDF (z-score) from percentile
function normInv(p) {
  // Abramowitz and Stegun approximation
  if (p <= 0 || p >= 1) throw new Error('Percentile must be between 0 and 1');

  const a1 = -39.6968302866538,
        a2 = 220.946098424521,
        a3 = -275.928510446969;
  const a4 = 138.357751867269,
        a5 = -30.6647980661472,
        a6 = 2.50662827745924;

  const b1 = -54.4760987982241,
        b2 = 161.585836858041,
        b3 = -155.698979859887;
  const b4 = 66.8013118877197,
        b5 = -13.2806815528857;

  const c1 = -0.00778489400243029,
        c2 = -0.322396458041136,
        c3 = -2.40075827716184;
  const c4 = -2.54973253934373,
        c5 = 4.37466414146497,
        c6 = 2.93816398269878;

  const d1 = 0.00778469570904146,
        d2 = 0.32246712907004,
        d3 = 2.445134137143;
  const d4 = 3.75440866190742;

  const plow = 0.02425;
  const phigh = 1 - plow;
  let q, r;

  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
           ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  } else if (phigh < p) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
             ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  } else {
    q = p - 0.5;
    r = q * q;
    return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
           (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
  }
}

module.exports = { normInv };