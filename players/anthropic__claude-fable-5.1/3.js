function createPlayer() {
  const H = 500, R = 6, FACE = 30, OPPFACE = 770, HALF = 40, PS = 5, MAXS = 24;
  const PMIN = HALF, PMAX = H - HALF, REACH = HALF + R, DIST = (OPPFACE - R) - (FACE + R);
  const DEG = Math.PI / 180;

  let model = 0, confirmed = false;   // 0: x-r<=face, 1: x<=face, 2: continuous
  let prev = null, prevMyY = null, oppPrevY = null, oppVel = 0;
  let say = "Warming up. Let's see what he's got.", lastKey = "";

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function fold(y) {
    const lo = R, span = H - 2 * R;
    let v = (y - lo) % (2 * span);
    if (v < 0) v += 2 * span;
    if (v > span) v = 2 * span - v;
    return lo + v;
  }

  function predictMine(b) {
    if (model === 2) {
      const t = (b.x - (FACE + R)) / (-b.dx);
      return { y: fold(b.y + b.dy * t), k: Math.max(1, Math.ceil(t)), dy: Math.abs(b.dy) };
    }
    const off = model === 1 ? 0 : R;
    let x = b.x, y = b.y, dy = b.dy;
    for (let i = 1; i <= 2000; i++) {
      x += b.dx; y += dy;
      if (y < R) { y = 2 * R - y; dy = -dy; }
      else if (y > H - R) { y = 2 * (H - R) - y; dy = -dy; }
      if (x - off <= FACE) return { y: y, k: i, dy: Math.abs(dy) };
    }
    return { y: fold(y), k: 2000, dy: Math.abs(dy) };
  }

  function shot(yb, speed, p) {
    const off = clamp((yb - p) / HALF, -1, 1);
    const sp = Math.min(speed * 1.05, MAXS);
    const ang = off * 55 * DEG;
    const ndx = sp * Math.cos(ang), ndy = sp * Math.sin(ang);
    const t = DIST / ndx;
    return { y: fold(yb + ndy * t), t: t, off: off };
  }

  function deficit(yArr, t, oppPos) {
    const need = Math.max(0, Math.abs(yArr - oppPos) - REACH);
    return need - PS * t;
  }

  const LINES = {
    def: "Back to the middle, hedging every angle he has",
    killtop: "Cross-court to the top. He can't get there!",
    killbot: "Cross-court to the bottom. He can't get there!",
    flat: "Flat and fast down the middle. Speed kills.",
    runup: "He's sitting low, so I'm pulling him up top",
    rundown: "He's up high, so I'm dragging him down low",
    chase: "Stretching for it... this one might get away",
    gone: "Too quick. Resetting for the next point.",
    mp: "Match point. Same plan, no mercy.",
    danger: "He's one away. Lock in, no mistakes."
  };

  return function move(s) {
    const b = s.ball, myY = s.me.y, oppY = s.opp.y;
    if (oppPrevY !== null) oppVel = oppY - oppPrevY;
    oppPrevY = oppY;

    if (prev) {
      if (prev.dx < 0 && b.dx > 0 && b.x < 200) {
        const x1 = prev.x + prev.dx;
        if (x1 > FACE + R + 1e-6) { model = 2; confirmed = true; }
        else if (x1 > FACE + 1e-6) { model = 0; confirmed = true; }
      } else if (prev.dx < 0 && b.dx < 0 && prev.x - R > FACE && b.x - R <= FACE && b.x > FACE) {
        if (prevMyY !== null && Math.abs(b.y - prevMyY) <= REACH - 2) { model = 1; confirmed = true; }
      }
    }
    prev = { x: b.x, y: b.y, dx: b.dx, dy: b.dy };
    prevMyY = myY;

    const speed = Math.hypot(b.dx, b.dy);
    let tgt = myY, key = "def", lineY = null;

    if (b.dx < 0) {
      if (b.x - R <= FACE) {
        tgt = clamp(b.y, PMIN, PMAX); key = b.x < FACE - 20 ? "gone" : "chase"; lineY = b.y;
      } else {
        const pr = predictMine(b);
        const yb = pr.y, k = pr.k;
        lineY = yb;
        const margin = confirmed ? 3 : 3 + Math.min(pr.dy, 20);
        const frames = Math.max(0, k - 1);
        const lo = Math.max(PMIN, myY - PS * frames, yb - REACH + margin);
        const hi = Math.min(PMAX, myY + PS * frames, yb + REACH - margin);
        if (lo > hi) {
          tgt = clamp(yb, PMIN, PMAX); key = "chase";
        } else {
          const oppAt = clamp(oppY + oppVel * Math.min(frames, 10), PMIN, PMAX);
          const N = Math.max(1, Math.ceil(hi - lo));
          let best = -Infinity, bestP = (lo + hi) / 2, bestRes = null;
          for (let i = 0; i <= N; i++) {
            const p = lo + (hi - lo) * i / N;
            const r = shot(yb, speed, p);
            const sc = Math.min(deficit(r.y, r.t, oppY), deficit(r.y, r.t, oppAt)) - 0.001 * Math.abs(r.off);
            if (sc > best) { best = sc; bestP = p; bestRes = r; }
          }
          tgt = bestP;
          if (best > 2) key = bestRes.y < 250 ? "killtop" : "killbot";
          else if (Math.abs(bestRes.off) < 0.25) key = "flat";
          else key = bestRes.y < oppY ? "runup" : "rundown";
        }
      }
    } else {
      if (b.x + R >= OPPFACE || b.dx === 0) {
        tgt = 250; key = "def";
      } else {
        const t0 = ((OPPFACE - R) - b.x) / b.dx;
        const y0 = fold(b.y + b.dy * t0);
        const sp = Math.min(speed * 1.05, MAXS);
        const ys = [], ts = [];
        for (let i = 0; i <= 16; i++) {
          const off = -1 + i / 8;
          const ang = off * 55 * DEG;
          const ndx = sp * Math.cos(ang), ndy = sp * Math.sin(ang);
          const t = DIST / ndx;
          ys.push(fold(y0 + ndy * t));
          ts.push(t0 + t);
        }
        let bestP = 250, bestC = Infinity;
        for (let p = PMIN; p <= PMAX; p += 2) {
          let worst = -Infinity;
          for (let i = 0; i < ys.length; i++) {
            const c = Math.abs(ys[i] - p) - PS * ts[i];
            if (c > worst) worst = c;
          }
          if (worst < bestC) { bestC = worst; bestP = p; }
        }
        tgt = bestP; key = "def"; lineY = bestP;
      }
    }

    const mv = clamp((tgt - myY) / PS, -1, 1);

    let k2 = key;
    if (s.score && s.score.me === 6 && key === "def") k2 = "mp";
    else if (s.score && s.score.opp === 6 && s.score.me < 6 && key === "def") k2 = "danger";
    if (k2 !== lastKey) { lastKey = k2; say = LINES[k2] || LINES.def; }

    const out = { move: mv, say: say };
    if (lineY !== null) out.target = lineY;
    return out;
  };
}