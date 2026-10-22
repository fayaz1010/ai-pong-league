function createPlayer() {
  const H = 500, R = 6, HALF = 40, SPD = 5, FACE = 30, OFACE = 770;
  const DEG = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // calibration state (learned from observed arena behaviour)
  let hitModes = [0, 1, 2, 3];   // 0 discrete edge, 1 discrete centre, 2 continuous edge, 3 continuous centre
  let wallModes = [R, 0];        // wall reflection line for ball centre
  let angleSign = 1;
  let prev = null, prevMe = null, prevOpp = null, prevScore = null;
  let trackScore = 0, predScore = 0, lastYo = null;

  function trigFor(mode, side) {
    const edge = mode === 0 || mode === 2;
    return side < 0 ? (edge ? FACE + R : FACE) : (edge ? OFACE - R : OFACE);
  }

  function simD(x, y, dx, dy, trigX, lo, hi, padY) {
    const left = dx < 0;
    let t = 0, nb = 0;
    if (left ? x <= trigX : x >= trigX) return { y, t, dy, nb, pad: padY };
    for (let i = 0; i < 1200; i++) {
      x += dx; y += dy; t++;
      if (y < lo) { y = 2 * lo - y; dy = -dy; nb++; }
      else if (y > hi) { y = 2 * hi - y; dy = -dy; nb++; }
      if (padY !== undefined) {
        const d = y - padY;
        padY = clamp(padY + (d > SPD ? SPD : d < -SPD ? -SPD : d), HALF, H - HALF);
      }
      if (left ? x <= trigX : x >= trigX) break;
    }
    return { y, t, dy, nb, pad: padY };
  }

  function simC(x, y, dx, dy, trigX, lo, hi) {
    const tf = (trigX - x) / dx;
    if (!(tf > 0)) return { y, t: 0, dy, nb: 0 };
    const span = hi - lo, period = 2 * span;
    const yEnd = y + dy * tf;
    const k0 = Math.floor((y - lo) / span), k1 = Math.floor((yEnd - lo) / span);
    let m = (yEnd - lo) % period; if (m < 0) m += period;
    if (m > span) m = period - m;
    const nb = Math.abs(k1 - k0);
    const dyF = ((k1 - k0) % 2 === 0) ? dy : -dy;
    return { y: lo + m, t: Math.ceil(tf - 1e-9), dy: dyF, nb };
  }

  function calibrate(s) {
    const b = s.ball, EPS = 1e-6;
    const xp = prev.x + prev.dx, yp = prev.y + prev.dy;
    if (prev.dx * b.dx < 0) {
      const mine = prev.dx < 0;
      const face = mine ? FACE : OFACE, edgeX = mine ? FACE + R : OFACE - R;
      const yClean = yp > 12 && yp < H - 12;
      if (Math.abs(b.x - xp) < EPS) {
        if (mine) {
          if (b.x > FACE + EPS) hitModes = [0];
          else if (prev.x <= FACE + R + EPS) hitModes = [1];
        } else {
          if (b.x < OFACE - EPS) hitModes = [0];
          else if (prev.x >= OFACE - R - EPS) hitModes = [1];
        }
      } else if (Math.abs(b.x - edgeX) < EPS) {
        if (yClean) hitModes = Math.abs(b.y - yp) < EPS ? [0] : [2];
        else if (hitModes.length > 2) hitModes = [0, 2];
      } else if (Math.abs(b.x - face) < EPS) {
        if (yClean) hitModes = Math.abs(b.y - yp) < EPS ? [1] : [3];
        else if (hitModes.length > 2) hitModes = [1, 3];
      } else if (hitModes.length > 2) {
        hitModes = [2, 3];
      }
      if (mine && prevMe !== null) {
        const off = (b.y - (prevMe + s.me.y) / 2) / HALF;
        if (Math.abs(off) > 0.4 && Math.abs(b.dy) > 0.5 && (b.dy > 0) !== (off * angleSign > 0)) angleSign = -angleSign;
      }
    } else if (prev.dy * b.dy < 0) {
      let pr = null, p0 = null;
      if (yp < R) pr = 2 * R - yp; else if (yp > H - R) pr = 2 * (H - R) - yp;
      if (yp < 0) p0 = -yp; else if (yp > H) p0 = 2 * H - yp;
      if (pr !== null && Math.abs(b.y - pr) < EPS) wallModes = [R];
      else if (p0 !== null && Math.abs(b.y - p0) < EPS) wallModes = [0];
    }
  }

  return function move(s) {
    try {
      const b = s.ball, me = s.me.y, opp = s.opp.y;
      let isServe = false;
      if (prevScore && (prevScore.me !== s.score.me || prevScore.opp !== s.score.opp)) isServe = true;
      if (prev && Math.abs(b.x - (prev.x + prev.dx)) > 60) isServe = true;
      if (prev && !isServe) {
        calibrate(s);
        if (prevOpp !== null && prev.dx > 0 && lastYo !== null) {
          const v = opp - prevOpp;
          if (Math.abs(v) > 1) {
            const dBall = prev.y - prevOpp, dPred = lastYo - prevOpp;
            if (Math.abs(dBall) > 10 && Math.abs(dPred) > 10 && (dBall > 0) !== (dPred > 0)) {
              if ((v > 0) === (dBall > 0)) trackScore++; else predScore++;
            }
          }
        }
      }
      prev = { x: b.x, y: b.y, dx: b.dx, dy: b.dy };
      prevScore = { me: s.score.me, opp: s.score.opp };

      const sp = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
      const lo = wallModes[0], hi = H - lo;
      const w = (trackScore + 1) / (trackScore + predScore + 2);
      let target;

      if (!(sp > 0) || b.dx === 0) {
        target = H / 2; lastYo = null;
      } else if (b.dx < 0) {
        lastYo = null;
        // predict my intercept under all plausible arena models
        let yMean = 0, tMin = Infinity, yMin = Infinity, yMax = -Infinity, n = 0;
        for (let i = 0; i < hitModes.length; i++) {
          for (let j = 0; j < wallModes.length; j++) {
            const hm = hitModes[i], wl = wallModes[j], trig = trigFor(hm, -1);
            const r = hm < 2 ? simD(b.x, b.y, b.dx, b.dy, trig, wl, H - wl) : simC(b.x, b.y, b.dx, b.dy, trig, wl, H - wl);
            yMean += r.y; n++;
            if (r.t < tMin) tMin = r.t;
            if (r.y < yMin) yMin = r.y;
            if (r.y > yMax) yMax = r.y;
          }
        }
        yMean /= n;
        const spread = yMax - yMin;
        const avail = SPD * Math.max(0, tMin - 1);
        const sp2 = Math.min(sp * 1.05, 24);
        const oppEst = opp + clamp(H / 2 - opp, -SPD * tMin, SPD * tMin);
        const oLo = Math.min(opp, oppEst), oHi = Math.max(opp, oppEst);
        const maxOff = Math.min(38, 44 - spread / 2);
        let best = null, bestScore = -Infinity;
        if (maxOff > 0) {
          const steps = 20;
          for (let i = -steps; i <= steps; i++) {
            const p = clamp(yMean - maxOff * i / steps, HALF, H - HALF);
            if (Math.abs(yMin - p) > 44 || Math.abs(yMax - p) > 44) continue;
            if (Math.abs(p - me) > avail + 1e-9) continue;
            const off = clamp((yMean - p) / HALF, -1, 1);
            const ang = off * 55 * DEG * angleSign;
            const dx2 = sp2 * Math.cos(ang), dy2 = sp2 * Math.sin(ang);
            const r = simD(FACE + R, yMean, dx2, dy2, OFACE - R, lo, hi, opp);
            const ya = r.y, ta = r.t;
            const d = ya < oLo ? oLo - ya : ya > oHi ? ya - oHi : 0;
            const slack = d - 46 - SPD * ta;
            const lag = Math.abs(ya - r.pad);
            const corner = 0.6 * Math.abs(ya - H / 2) + 12 * r.nb;
            const heur = w * lag + (1 - w) * corner;
            const score = slack > -30 ? 1000 + slack + 0.01 * heur : heur + 0.01 * slack;
            if (score > bestScore) { bestScore = score; best = p; }
          }
        }
        const hold = clamp(yMean, HALF, H - HALF);
        if (best === null) target = hold;
        else {
          const need = Math.abs(best - me);
          target = (avail - need > 25) ? hold : best;
        }
      } else {
        // ball moving away: minimax positioning against all possible returns
        const trigO = trigFor(hitModes[0], 1);
        const ro = simD(b.x, b.y, b.dx, b.dy, trigO, lo, hi);
        lastYo = ro.y;
        const sp2 = Math.min(sp * 1.05, 24);
        let L = HALF, U = H - HALF;
        for (let a = -55; a <= 55; a += 5) {
          const ang = a * DEG;
          const dx2 = -sp2 * Math.cos(ang), dy2 = sp2 * Math.sin(ang);
          const r = simD(trigO, ro.y, dx2, dy2, FACE + R, lo, hi);
          const reach = SPD * Math.max(0, r.t - 1) + 46 - 8;
          if (r.y - reach > L) L = r.y - reach;
          if (r.y + reach < U) U = r.y + reach;
        }
        target = clamp((L + U) / 2, HALF, H - HALF);
      }

      let mv = clamp((target - me) / SPD, -1, 1);
      prevMe = me; prevOpp = opp;
      return isFinite(mv) ? mv : 0;
    } catch (e) {
      return 0;
    }
  };
}