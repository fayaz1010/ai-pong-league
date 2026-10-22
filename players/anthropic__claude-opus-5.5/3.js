function createPlayer() {
  const SPEED = 5;
  let lockedOff = null;
  let lastDx = 0;
  let say = "Ready. Angles win rallies.";
  let lastTarget = 250;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // Simulate the ball frame by frame until it reaches a paddle face.
  // Returns the y where it arrives and the number of frames it takes.
  function simTo(x, y, dx, dy, r, H, F, OF, toLeft) {
    let t = 0;
    while (t < 3000) {
      if (toLeft ? (x - r <= F) : (x + r >= OF)) return { y: y, t: t };
      x += dx; y += dy;
      if (y < r) { y = 2 * r - y; dy = -dy; }
      else if (y > H - r) { y = 2 * (H - r) - y; dy = -dy; }
      t++;
    }
    return { y: y, t: t };
  }

  return function move(s) {
    const b = s.ball, H = s.court.h, W = s.court.w;
    const F = s.paddle.faceX, OF = s.paddle.oppFaceX;
    const half = s.paddle.h / 2, r = b.r || 6;
    const me = s.me.y, opp = s.opp.y;
    let target = H / 2;

    if (b.dx < 0) {
      // Ball is coming toward us.
      const ic = simTo(b.x, b.y, b.dx, b.dy, r, H, F, OF, true);
      const iy = ic.y, t = ic.t;
      if (lastDx >= 0) lockedOff = null;

      if (lockedOff === null) {
        // Pick the return angle the opponent is least able to reach.
        const sp = Math.hypot(b.dx, b.dy);
        const ns = Math.min(sp * 1.05, 24);
        let best = null, bestScore = -1e9, bestOy = 250;
        for (let off = -0.85; off <= 0.851; off += 0.05) {
          const p = clamp(iy - off * half, half, H - half);
          if (Math.abs(p - me) > SPEED * t + 1) continue;
          const realOff = clamp((iy - p) / half, -1, 1);
          const ang = realOff * 55 * Math.PI / 180;
          const ndx = ns * Math.cos(ang), ndy = ns * Math.sin(ang);
          const o = simTo(F + r, iy, ndx, ndy, r, H, F, OF, false);
          const dist = Math.min(Math.abs(o.y - opp), Math.abs(o.y - H / 2));
          let score = dist - (SPEED * o.t + half + r);
          score -= 8 * Math.abs(off);
          if (score > bestScore) { bestScore = score; best = off; bestOy = o.y; }
        }
        if (best === null) {
          lockedOff = 0;
          say = "Scramble! Lunging for y=" + Math.round(iy);
        } else {
          lockedOff = best;
          if (bestScore > 0) say = "Kill shot to y=" + Math.round(bestOy) + ": out of reach!";
          else if (Math.abs(best) > 0.5) say = "Sharp angle to y=" + Math.round(bestOy) + ", run!";
          else say = "Safe block, steering to y=" + Math.round(bestOy);
        }
      }

      let p = clamp(iy - lockedOff * half, half, H - half);
      if (Math.abs(p - me) > SPEED * t + 1) {
        p = clamp(iy, half, H - half);
        if (lockedOff !== 0) { lockedOff = 0; say = "Plan scrapped - just get a touch!"; }
      }
      target = p;
      lastTarget = iy;
    } else if (b.dx > 0) {
      // Ball is moving away: recover toward the centre, leaning a little
      // toward where the opponent will meet the ball.
      const o = simTo(b.x, b.y, b.dx, b.dy, r, H, F, OF, false);
      target = H / 2 + (o.y - H / 2) * 0.25;
      if (lastDx <= 0) {
        const diff = s.score.me - s.score.opp;
        say = diff > 0 ? "Up " + diff + ". Recentring, reading return."
            : diff < 0 ? "Down " + (-diff) + ". Recentring, staying calm."
            : "Level game. Back to centre, watching.";
      }
      lastTarget = target;
      lockedOff = null;
    } else {
      target = H / 2;
      lastTarget = target;
    }

    lastDx = b.dx;
    const mv = clamp((target - me) / SPEED, -1, 1);
    if (say.length > 48) say = say.slice(0, 48);
    return { move: isFinite(mv) ? mv : 0, say: say, target: lastTarget };
  };
}