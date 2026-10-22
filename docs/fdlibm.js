// Bit-exact Math.sin, cos, asin, atan, atan2 and exp in plain JavaScript, matching Node.js on
// Apple Silicon, where the league was played. Node (V8) uses fdlibm, and clang compiles it for arm64
// with multiply-adds fused (-ffp-contract=on), so this port uses a correctly rounded fma() at exactly
// the places clang fuses: wherever the C source writes a*b + c or c - a*b in one expression.
// Why bother: browsers do not agree on the last bit of these functions (recent Chrome is correctly
// rounded, Node is not), and one bit is enough to change a Pong match 20,000 frames later.
// Based on fdlibm 5.3 (Copyright (C) 1993-2004 by Sun Microsystems, Inc. Permission to use, copy,
// modify, and distribute this software is freely granted, provided that this notice is preserved).
(function (root) {
  'use strict';
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  const LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1; const HI = LE ? 1 : 0, LO = LE ? 0 : 1;
  const hiw = (x) => { f64[0] = x; return u32[HI] | 0; };
  const low = (x) => { f64[0] = x; return u32[LO]; };
  const words = (h, l) => { u32[HI] = h; u32[LO] = l; return f64[0]; };
  const withLow = (x, l) => { f64[0] = x; u32[LO] = l; return f64[0]; };
  const nativeSin = Math.sin, nativeCos = Math.cos;

  // ---- correctly rounded fused multiply-add (Boldo & Melquiond 2008: exact product and sum, then
  // round-to-odd for the low part, then one round-to-nearest). Valid away from overflow/underflow,
  // which is all a Pong court needs; it falls back to a*b + c outside that range.
  const SPLIT = 134217729; // 2^27 + 1
  let e0 = 0;
  function twoProd(a, b) { const p = a * b; let t = SPLIT * a; const ah = t - (t - a), al = a - ah; t = SPLIT * b; const bh = t - (t - b), bl = b - bh;
    e0 = ((ah * bh - p) + ah * bl + al * bh) + al * bl; return p; }
  function twoSum(a, b) { const s = a + b, bb = s - a; e0 = (a - (s - bb)) + (b - bb); return s; }
  function addOdd(a, b) { // a + b rounded to odd
    const s = twoSum(a, b), e = e0; if (e === 0) return s;
    f64[0] = s; if (u32[LO] & 1) return s;
    if ((e > 0) === (s > 0)) { if (u32[LO] === 0xffffffff) { u32[LO] = 0; u32[HI]++; } else u32[LO]++; }
    else { if (u32[LO] === 0) { u32[LO] = 0xffffffff; u32[HI]--; } else u32[LO]--; }
    return f64[0];
  }
  function fma(a, b, c) {
    const ab = a * b;
    if (a === 0 || b === 0 || !isFinite(ab) || !isFinite(c) || Math.abs(ab) < 1e-290 || Math.abs(a) > 1e290 || Math.abs(b) > 1e290) return ab + c;
    if (c === 0) return ab;
    const uh = twoProd(a, b), ul = e0; const th = twoSum(c, uh), tl = e0;
    return th + addOdd(tl, ul);
  }
  const F = fma;

  // ---- sin / cos kernels (k_sin.c, k_cos.c) ----
  const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
    S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
  function kSin(x, y, iy) {
    const ix = hiw(x) & 0x7fffffff;
    if (ix < 0x3e400000 && (x | 0) === 0) return x;
    const z = x * x, v = z * x, r = F(z, F(z, F(z, F(z, S6, S5), S4), S3), S2);
    if (iy === 0) return F(v, F(z, r, S1), x);
    return x - F(-v, S1, F(z, F(0.5, y, -(v * r)), -y));
  }
  const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
    C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
  function kCos(x, y) {
    const ix = hiw(x) & 0x7fffffff;
    if (ix < 0x3e400000 && (x | 0) === 0) return 1;
    const z = x * x, r = z * F(z, F(z, F(z, F(z, F(z, C6, C5), C4), C3), C2), C1);
    if (ix < 0x3FD33333) return 1 - F(0.5, z, -F(z, r, -(x * y)));
    const qx = ix > 0x3fe90000 ? 0.28125 : words(ix - 0x00200000, 0);
    const hz = F(0.5, z, -qx), a = 1 - qx;
    return a - (hz - F(z, r, -(x * y)));
  }

  // ---- argument reduction (e_rem_pio2.c, without the huge-argument path) ----
  const invpio2 = 6.36619772367581382433e-01, pio2_1 = 1.57079632673412561417e+00, pio2_1t = 6.07710050650619224932e-11,
    pio2_2 = 6.07710050630396597660e-11, pio2_2t = 2.02226624879595063154e-21, pio2_3 = 2.02226624871116645580e-21,
    pio2_3t = 8.47842766036889956997e-32;
  const npio2_hw = [0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A,
    0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A, 0x40407E4C,
    0x4041475C, 0x4042106C, 0x4042D97C, 0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB, 0x404858EB, 0x404921FB];
  const Y = [0, 0];
  // returns n, with the reduced argument in Y[0] + Y[1]; returns null for |x| > 2^19 * pi/2
  function remPio2(x) {
    const hx = hiw(x), ix = hx & 0x7fffffff; let z;
    if (ix < 0x4002d97c) { // |x| < 3pi/4
      if (hx > 0) {
        z = x - pio2_1;
        if (ix !== 0x3ff921fb) { Y[0] = z - pio2_1t; Y[1] = (z - Y[0]) - pio2_1t; } else { z -= pio2_2; Y[0] = z - pio2_2t; Y[1] = (z - Y[0]) - pio2_2t; }
        return 1;
      }
      z = x + pio2_1;
      if (ix !== 0x3ff921fb) { Y[0] = z + pio2_1t; Y[1] = (z - Y[0]) + pio2_1t; } else { z += pio2_2; Y[0] = z + pio2_2t; Y[1] = (z - Y[0]) + pio2_2t; }
      return -1;
    }
    if (ix <= 0x413921fb) {
      let t = Math.abs(x); const n = F(t, invpio2, 0.5) | 0; const fn = n;
      let r = F(-fn, pio2_1, t), w = fn * pio2_1t;
      if (n < 32 && ix !== npio2_hw[n - 1]) Y[0] = r - w;
      else {
        const j = ix >> 20; Y[0] = r - w; let i = j - ((hiw(Y[0]) >> 20) & 0x7ff);
        if (i > 16) {
          t = r; w = fn * pio2_2; r = t - w; w = F(fn, pio2_2t, -((t - r) - w)); Y[0] = r - w; i = j - ((hiw(Y[0]) >> 20) & 0x7ff);
          if (i > 49) { t = r; w = fn * pio2_3; r = t - w; w = F(fn, pio2_3t, -((t - r) - w)); Y[0] = r - w; }
        }
      }
      Y[1] = (r - Y[0]) - w;
      if (hx < 0) { Y[0] = -Y[0]; Y[1] = -Y[1]; return -n; }
      return n;
    }
    return null;
  }
  function sin(x) {
    x = +x; const ix = hiw(x) & 0x7fffffff;
    if (ix <= 0x3fe921fb) return kSin(x, 0, 0);
    if (ix >= 0x7ff00000) return x - x;
    const n = remPio2(x); if (n === null) return nativeSin(x);
    switch (n & 3) { case 0: return kSin(Y[0], Y[1], 1); case 1: return kCos(Y[0], Y[1]); case 2: return -kSin(Y[0], Y[1], 1); default: return -kCos(Y[0], Y[1]); }
  }
  function cos(x) {
    x = +x; const ix = hiw(x) & 0x7fffffff;
    if (ix <= 0x3fe921fb) return kCos(x, 0);
    if (ix >= 0x7ff00000) return x - x;
    const n = remPio2(x); if (n === null) return nativeCos(x);
    switch (n & 3) { case 0: return kCos(Y[0], Y[1]); case 1: return -kSin(Y[0], Y[1], 1); case 2: return -kCos(Y[0], Y[1]); default: return kSin(Y[0], Y[1], 1); }
  }

  // ---- atan (s_atan.c) and atan2 (e_atan2.c) ----
  const atanhi = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
  const atanlo = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
  const aT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
    9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
    4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
  function atan(x) {
    x = +x; const hx = hiw(x), ix = hx & 0x7fffffff; let id;
    if (ix >= 0x44100000) { if (x !== x) return x + x; return hx > 0 ? atanhi[3] + atanlo[3] : -atanhi[3] - atanlo[3]; }
    if (ix < 0x3fdc0000) { if (ix < 0x3e400000) return x; id = -1; }
    else {
      x = Math.abs(x);
      if (ix < 0x3ff30000) { if (ix < 0x3fe60000) { id = 0; x = F(2.0, x, -1.0) / (2.0 + x); } else { id = 1; x = (x - 1.0) / (x + 1.0); } }
      else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / F(1.5, x, 1.0); } else { id = 3; x = -1.0 / x; }
    }
    const z = x * x, w = z * z;
    const s1 = z * F(w, F(w, F(w, F(w, F(w, aT[10], aT[8]), aT[6]), aT[4]), aT[2]), aT[0]);
    const s2 = w * F(w, F(w, F(w, F(w, aT[9], aT[7]), aT[5]), aT[3]), aT[1]);
    if (id < 0) return F(-x, s1 + s2, x);
    const r = atanhi[id] - (F(x, s1 + s2, -atanlo[id]) - x);
    return hx < 0 ? -r : r;
  }
  const tiny = 1.0e-300, pi_o_4 = 7.8539816339744827900e-01, pi_o_2 = 1.57079632679489655800e+00, pi = 3.14159265358979311600e+00, pi_lo = 1.2246467991473531772e-16;
  function atan2(y, x) {
    y = +y; x = +x;
    if (x !== x || y !== y) return x + y;
    const hx = hiw(x), ix = hx & 0x7fffffff, lx = low(x), hy = hiw(y), iy = hy & 0x7fffffff, ly = low(y);
    if (hx === 0x3ff00000 && lx === 0) return atan(y);
    let m = ((hy >>> 31) & 1) | ((hx >>> 30) & 2);
    if ((iy | ly) === 0) { switch (m) { case 0: case 1: return y; case 2: return pi + tiny; default: return -pi - tiny; } }
    if ((ix | lx) === 0) return hy < 0 ? -pi_o_2 - tiny : pi_o_2 + tiny;
    if (ix === 0x7ff00000) {
      if (iy === 0x7ff00000) { switch (m) { case 0: return pi_o_4 + tiny; case 1: return -pi_o_4 - tiny; case 2: return F(3.0, pi_o_4, tiny); default: return F(-3.0, pi_o_4, -tiny); } }
      switch (m) { case 0: return 0; case 1: return -0; case 2: return pi + tiny; default: return -pi - tiny; }
    }
    if (iy === 0x7ff00000) return hy < 0 ? -pi_o_2 - tiny : pi_o_2 + tiny;
    const k = (iy - ix) >> 20; let z;
    if (k > 60) { z = F(0.5, pi_lo, pi_o_2); m &= 1; }
    else if (hx < 0 && k < -60) z = 0.0;
    else z = atan(Math.abs(y / x));
    switch (m) { case 0: return z; case 1: return -z; case 2: return pi - (z - pi_lo); default: return (z - pi_lo) - pi; }
  }

  // ---- asin (e_asin.c) ----
  const pio2_hi = 1.57079632679489655800e+00, pio2_lo = 6.12323399573676603587e-17, pio4_hi = 7.85398163397448278999e-01,
    pS0 = 1.66666666666666657415e-01, pS1 = -3.25565818622400915405e-01, pS2 = 2.01212532134862925881e-01, pS3 = -4.00555345006794114027e-02,
    pS4 = 7.91534994289814532176e-04, pS5 = 3.47933107596021167570e-05, qS1 = -2.40339491173441421878e+00, qS2 = 2.02094576023350569471e+00,
    qS3 = -6.88283971605453293030e-01, qS4 = 7.70381505559019352791e-02;
  function asin(x) {
    x = +x; const hx = hiw(x), ix = hx & 0x7fffffff; let t, w, p, q;
    if (ix >= 0x3ff00000) { if (((ix - 0x3ff00000) | low(x)) === 0) return F(x, pio2_hi, x * pio2_lo); return (x - x) / (x - x); }
    if (ix < 0x3fe00000) {
      if (ix < 0x3e500000) return x;
      t = x * x; p = t * F(t, F(t, F(t, F(t, F(t, pS5, pS4), pS3), pS2), pS1), pS0); q = F(t, F(t, F(t, F(t, qS4, qS3), qS2), qS1), 1);
      return F(x, p / q, x);
    }
    w = 1 - Math.abs(x); t = w * 0.5;
    p = t * F(t, F(t, F(t, F(t, F(t, pS5, pS4), pS3), pS2), pS1), pS0); q = F(t, F(t, F(t, F(t, qS4, qS3), qS2), qS1), 1);
    const s = Math.sqrt(t);
    if (ix >= 0x3FEF3333) { w = p / q; t = pio2_hi - F(2.0, F(s, w, s), -pio2_lo); }
    else { w = withLow(s, 0); const c = F(-w, w, t) / (s + w), r = p / q; p = F(2.0 * s, r, -F(-2.0, c, pio2_lo)); q = F(-2.0, w, pio4_hi); t = pio4_hi - (p - q); }
    return hx > 0 ? t : -t;
  }

  // ---- exp (e_exp.c) ----
  const halF = [0.5, -0.5], o_threshold = 7.09782712893383973096e+02, u_threshold = -7.45133219101941108420e+02,
    ln2HI = [6.93147180369123816490e-01, -6.93147180369123816490e-01], ln2LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10],
    invln2 = 1.44269504088896338700e+00, P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
    P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08, twom1000 = 9.33263618503218878990e-302, two1023 = 8.988465674311579539e307;
  function exp(x) {
    x = +x; let hx = hiw(x); const xsb = (hx >>> 31) & 1; hx &= 0x7fffffff; let hi = 0, lo = 0, k = 0;
    if (hx >= 0x40862E42) {
      if (hx >= 0x7ff00000) { if (((hx & 0xfffff) | low(x)) !== 0) return x + x; return xsb === 0 ? x : 0.0; }
      if (x > o_threshold) return Infinity; if (x < u_threshold) return 0;
    }
    if (hx > 0x3fd62e42) {
      if (hx < 0x3FF0A2B2) { hi = x - ln2HI[xsb]; lo = ln2LO[xsb]; k = 1 - xsb - xsb; }
      else { k = F(invln2, x, halF[xsb]) | 0; const t = k; hi = F(-t, ln2HI[0], x); lo = t * ln2LO[0]; }
      x = hi - lo;
    } else if (hx < 0x3e300000) return 1 + x;
    else k = 0;
    const t = x * x;
    const twopk = k >= -1021 ? words((0x3ff00000 + (k << 20)) | 0, 0) : words((0x3ff00000 + ((k + 1000) << 20)) | 0, 0);
    const c = F(-t, F(t, F(t, F(t, F(t, P5, P4), P3), P2), P1), x);
    if (k === 0) return 1 - ((x * c) / (c - 2.0) - x);
    const y = 1 - ((lo - (x * c) / (2.0 - c)) - hi);
    if (k >= -1021) { if (k === 1024) return y * 2.0 * two1023; return y * twopk; }
    return y * twopk * twom1000;
  }

  // ---- hypot, as V8 computes it: scale by the largest value, Kahan-summed squares, sqrt ----
  function hypot(...args) {
    let max = 0, nan = false; const abs = [];
    for (const a of args) { const v = Math.abs(+a); if (v !== v) nan = true; else if (v > max) max = v; abs.push(v); }
    if (max === Infinity) return Infinity; if (nan) return NaN; if (max === 0) return 0;
    let sum = 0, comp = 0;
    for (const v of abs) { const n = v / max; const summand = n * n - comp; const pre = sum + summand; comp = (pre - sum) - summand; sum = pre; }
    return Math.sqrt(sum) * max;
  }

  root.FdlibmMath = {sin, cos, atan, atan2, asin, exp, hypot, fma};
})(typeof window !== 'undefined' ? window : globalThis);
