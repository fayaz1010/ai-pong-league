function createPlayer() {
  const DEG = Math.PI / 180;
  let chosenOff = null;
  let lastDx = 0;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function simTo(x, y, dx, dy, limitX, r, h) {
    let t = 0;
    while (t < 4000) {
      if (dx < 0 && x <= limitX) break;
      if (dx > 0 && x >= limitX) break;
      if (dx === 0) break;
      x += dx; y += dy;
      if (y < r) { y = 2 * r - y; dy = -dy; }
      else if (y > h - r) { y = 2 * (h - r) - y; dy = -dy; }
      t++;
    }
    return { y: y, t: t };
  }

  return function move(s) {
    const b = s.ball, h = s.court.h, r = b.r || 6;
    const half = s.paddle.h / 2, spd = s.paddle.speed;
    const leftX = s.paddle.faceX + r, rightX = s.paddle.oppFaceX - r;
    const me = s.me.y, opp = s.opp.y;
    const minP = half, maxP = h - half;
    let target = h / 2;
    const sp = Math.hypot(b.dx, b.dy);
    const ns = Math.min(sp * 1.05, 24);

    if (b.dx < 0) {
      if (lastDx >= 0) chosenOff = null;
      const p = simTo(b.x, b.y, b.dx, b.dy, leftX, r, h);
      const hy = p.y, t = p.t;
      const reach = spd * t + 0.5;

      const evalOff = function (off) {
        const py = clamp(hy - off, minP, maxP);
        const a = hy - py;
        if (Math.abs(a) > 36) return null;
        if (Math.abs(py - me) > reach) return null;
        const ang = clamp(a / 40, -1, 1) * 55 * DEG;
        const q = simTo(leftX, hy, ns * Math.cos(ang), ns * Math.sin(ang), rightX, r, h);
        const score = Math.abs(q.y - opp) - spd * (q.t + t * 0.5) - 0.2 * Math.abs(a - 30 * Math.sign(a || 1));
        return { py: py, score: score };
      };

      if (chosenOff !== null) {
        const e = evalOff(chosenOff);
        if (!e) chosenOff = null; else target = e.py;
      }
      if (chosenOff === null) {
        let best = null, bestOff = 0;
        for (let off = -34; off <= 34; off += 2) {
          const e = evalOff(off);
          if (e && (!best || e.score > best.score)) { best = e; bestOff = off; }
        }
        if (best) { chosenOff = bestOff; target = best.py; }
        else target = clamp(hy, minP, maxP);
      }
    } else if (b.dx > 0) {
      chosenOff = null;
      const p = simTo(b.x, b.y, b.dx, b.dy, rightX, r, h);
      const oy = p.y;
      let lo = Infinity, hi = -Infinity;
      for (let k = -10; k <= 10; k++) {
        const ang = (k / 10) * 55 * DEG;
        const q = simTo(rightX, oy, -ns * Math.cos(ang), ns * Math.sin(ang), leftX, r, h);
        if (q.y < lo) lo = q.y;
        if (q.y > hi) hi = q.y;
      }
      target = isFinite(lo) ? (lo + hi) / 2 : h / 2;
    } else {
      target = h / 2;
    }

    lastDx = b.dx;
    target = clamp(target, minP, maxP);
    const m = (target - me) / spd;
    return clamp(m, -1, 1);
  };
}