function createPlayer() {
  const R = 6, HALF = 40, SPD = 5, MAXV = 24, ANG = 55 * Math.PI / 180;
  const LO = R, HI = 500 - R, L = HI - LO, L2 = 2 * L;
  const PMIN = 40, PMAX = 460, CEN = 250;
  const MYX = 30 + R, OPX = 770 - R, SPAN = OPX - MYX;
  const TOL = HALF + R;
  const MAXOFF = 0.85;

  let prevOpp = null, oppVel = 0, lastOff = null, lastSign = 0;
  let prevBall = null, dirVotes = 0, dirSign = 1;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function fold(y) {
    let m = (y - LO) % L2;
    if (m < 0) m += L2;
    if (m > L) m = L2 - m;
    return LO + m;
  }

  function move(s) {
    const b = s.ball, me = s.me.y, op = s.opp.y;

    if (prevOpp !== null) {
      const dv = clamp(op - prevOpp, -SPD, SPD);
      oppVel = 0.6 * oppVel + 0.4 * dv;
    }
    prevOpp = op;

    // learn return-angle sign convention from observed hits
    if (prevBall) {
      if (prevBall.dx < 0 && b.dx > 0 && b.x < 200) {
        const off = b.y - me;
        if (Math.abs(off) > 20 && Math.abs(b.dy) > 1) dirVotes += off * b.dy > 0 ? 1 : -1;
      } else if (prevBall.dx > 0 && b.dx < 0 && b.x > 600) {
        const off = b.y - op;
        if (Math.abs(off) > 20 && Math.abs(b.dy) > 1) dirVotes += off * b.dy > 0 ? 1 : -1;
      }
      dirSign = dirVotes < 0 ? -1 : 1;
    }
    prevBall = { x: b.x, y: b.y, dx: b.dx, dy: b.dy };

    const sign = b.dx < 0 ? -1 : 1;
    if (sign !== lastSign) { lastOff = null; lastSign = sign; }

    let target = CEN;
    if (Math.abs(b.dx) < 1e-6) {
      target = CEN;
    } else {
      const v = Math.sqrt(b.dx * b.dx + b.dy * b.dy) || 6;
      const v2 = Math.min(MAXV, v * 1.05);

      if (b.dx < 0) {
        // ---- ball coming to me: choose return ----
        const n = Math.max(1, Math.ceil((b.x - MYX) / -b.dx));
        const yH = fold(b.y + b.dy * n);
        const reach = SPD * (n - 0.5);
        let maxOff = MAXOFF;
        if (s.score.me > s.score.opp && 36000 - s.frame < 2400) maxOff = 0.6;

        const hz = Math.min(n, 15);
        let oppEst = op + oppVel * hz;
        if ((op - CEN) * (oppEst - CEN) < 0) oppEst = CEN;
        oppEst = clamp(oppEst, PMIN, PMAX);

        let bestScore = Infinity, bestOff = null, lastScore = Infinity;
        const steps = 34;
        for (let i = 0; i <= steps; i++) {
          const o = -maxOff + (2 * maxOff * i) / steps;
          const tp = yH - HALF * o;
          if (tp < PMIN || tp > PMAX) continue;
          if (Math.abs(tp - me) > reach) continue;
          const a = dirSign * o * ANG;
          const dx2 = v2 * Math.cos(a), dy2 = v2 * Math.sin(a);
          const T = SPAN / dx2;
          const yA = fold(yH + dy2 * T);
          const slack = SPD * T + TOL - Math.abs(yA - oppEst);
          const score = slack - 15 * Math.abs(o);
          if (score < bestScore) { bestScore = score; bestOff = o; }
          if (lastOff !== null && Math.abs(o - lastOff) < 1e-9) lastScore = score;
        }
        if (bestOff === null) {
          target = clamp(yH, PMIN, PMAX);
          lastOff = null;
        } else {
          if (lastOff !== null && lastScore <= bestScore + 10) bestOff = lastOff;
          lastOff = bestOff;
          target = yH - HALF * bestOff;
        }
      } else {
        // ---- ball going away: minimax waiting position ----
        const k = Math.max(1, Math.ceil((OPX - b.x) / b.dx));
        const yO = fold(b.y + b.dy * k);
        const pyMin = Math.max(PMIN, yO - TOL, op - SPD * k);
        const pyMax = Math.min(PMAX, yO + TOL, op + SPD * k);
        if (pyMin > pyMax) {
          target = CEN;
        } else {
          const oLo = clamp((yO - pyMax) / HALF, -1, 1);
          const oHi = clamp((yO - pyMin) / HALF, -1, 1);
          const m = 24;
          const ys = new Array(m + 1), ts = new Array(m + 1);
          for (let i = 0; i <= m; i++) {
            const o = oLo + ((oHi - oLo) * i) / m;
            const a = dirSign * o * ANG;
            const T = SPAN / (v2 * Math.cos(a));
            ys[i] = fold(yO + v2 * Math.sin(a) * T);
            ts[i] = SPD * T + TOL;
          }
          const pLo = Math.max(PMIN, me - SPD * k), pHi = Math.min(PMAX, me + SPD * k);
          let best = -Infinity;
          for (let p = pLo; p <= pHi + 1e-9; p += 2) {
            let mn = Infinity;
            for (let i = 0; i <= m; i++) {
              const sl = ts[i] - Math.abs(ys[i] - p);
              if (sl < mn) mn = sl;
            }
            const sc = mn - 0.02 * Math.abs(p - CEN);
            if (sc > best) { best = sc; target = p; }
          }
        }
      }
    }

    const mv = clamp((target - me) / SPD, -1, 1);
    if (!(mv >= -1 && mv <= 1)) return 0;
    return mv;
  }
  return move;
}