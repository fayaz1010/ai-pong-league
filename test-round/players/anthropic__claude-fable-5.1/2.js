function createPlayer() {
  const H = 500, R = 6, HALF = 40, SPD = 5, MYX = 30, OPX = 770;
  const PMIN = 40, PMAX = 460, MAXV = 24;
  const ANG = 55 * Math.PI / 180;
  const VANG = [-55, -40, -20, 0, 20, 40, 55].map(a => a * Math.PI / 180);
  let TOP = R, BOT = H - R;

  let wallModel = 0, wallCal = false;
  const wallVotes = [0, 0, 0];
  const hitVotes = [0, 0, 0];
  let prev = null, lastTargetP = null, lastDecoyP = null, lastScoreSum = -1;

  function clampP(p) { return p < PMIN ? PMIN : p > PMAX ? PMAX : p; }
  function toward(pos, my) { const d = (pos - my) / SPD; return d > 1 ? 1 : d < -1 ? -1 : d; }

  function fold(y) {
    const span = BOT - TOP, per = 2 * span;
    let t = (y - TOP) % per; if (t < 0) t += per;
    if (t > span) t = per - t;
    return t + TOP;
  }

  function sim(x, y, dx, dy, dir, m) {
    if (dir < 0 ? (x - R <= MYX) : (x + R >= OPX)) return { y: y, yc: y, ycen: y, n: 0, b: 0, ncen: 0 };
    let n = 0, b = 0;
    for (let i = 0; i < 5000; i++) {
      const px = x, py = y, pdy = dy;
      x += dx; y += dy;
      if (m === 0) {
        if (y < TOP) { y = 2 * TOP - y; dy = -dy; b++; } else if (y > BOT) { y = 2 * BOT - y; dy = -dy; b++; }
      } else if (m === 1) {
        if ((y < TOP && dy < 0) || (y > BOT && dy > 0)) { dy = -dy; b++; }
      } else {
        if (y < TOP) { y = TOP; dy = -dy; b++; } else if (y > BOT) { y = BOT; dy = -dy; b++; }
      }
      n++;
      if (dir < 0 ? (x - R <= MYX) : (x + R >= OPX)) {
        const f = dir < 0 ? (px - R - MYX) / (-dx) : (OPX - R - px) / dx;
        const yc = fold(py + f * pdy);
        let ycen = y, ncen = n;
        if (dir < 0 ? x > MYX : x < OPX) { ycen = fold(y + dy); ncen = n + 1; }
        return { y: y, yc: yc, ycen: ycen, n: n, b: b, ncen: ncen };
      }
    }
    return { y: y, yc: y, ycen: y, n: n, b: b, ncen: n };
  }

  function hitModel() {
    let bi = 0;
    for (let i = 1; i < 3; i++) if (hitVotes[i] > hitVotes[bi]) bi = i;
    return bi;
  }
  function hitConfident() {
    const m = hitModel();
    let sec = -Infinity;
    for (let i = 0; i < 3; i++) if (i !== m && hitVotes[i] > sec) sec = hitVotes[i];
    return hitVotes[m] >= 2 && hitVotes[m] - sec >= 2;
  }
  function pickY(r) { const m = hitModel(); return m === 0 ? r.y : m === 1 ? r.yc : r.ycen; }

  function calibrate(p, s) {
    const b = s.ball;
    // wall extent detection (walls at radius or at court edge)
    if (b.dx * p.bdx > 0) {
      if ((b.y < 6 - 0.01 && b.dy < 0) || (b.y > 494.01 && b.dy > 0)) { TOP = 0; BOT = H; }
    }
    if (p.bdx * b.dx < 0) {
      const mine = p.bdx < 0;
      const faceX = mine ? MYX + R : OPX - R;
      if (Math.abs(b.x - faceX) > 40) return;
      const sp0 = Math.hypot(p.bdx, p.bdy), sp1 = Math.hypot(b.dx, b.dy);
      if (Math.abs(sp1 - Math.min(sp0 * 1.05, MAXV)) > 0.3) return;
      const o = mine ? Math.atan2(b.dy, b.dx) / ANG : Math.atan2(b.dy, -b.dx) / ANG;
      if (Math.abs(o) > 0.97) return;
      const py = mine ? p.my : p.oy, cy = mine ? s.me.y : s.opp.y;
      if (Math.abs(cy - py) > 0.01) return;
      const r = sim(p.bx, p.by, p.bdx, p.bdy, mine ? -1 : 1, wallModel);
      if (r.n !== 1) return;
      const hy = py + HALF * o;
      const es = [Math.abs(hy - r.y), Math.abs(hy - r.yc), r.ncen === 1 ? Math.abs(hy - r.ycen) : Infinity];
      if (r.ncen !== 1) hitVotes[2] -= 1;
      let bi = 0;
      for (let i = 1; i < 3; i++) if (es[i] < es[bi]) bi = i;
      let sec = Infinity;
      for (let i = 0; i < 3; i++) if (i !== bi && es[i] < sec) sec = es[i];
      if (es[bi] < 6 && sec - es[bi] > 0.8) hitVotes[bi] += 1;
    } else if (p.bdy * b.dy < 0 && Math.abs(b.dx - p.bdx) < 1e-9 && Math.abs(b.dy + p.bdy) < 1e-9) {
      const yN = p.by + p.bdy;
      if (yN >= TOP && yN <= BOT) return;
      const yRef = yN < TOP ? 2 * TOP - yN : 2 * BOT - yN;
      const yCl = yN < TOP ? TOP : BOT;
      if (Math.abs(yN - yRef) < 0.3) return;
      const es = [Math.abs(b.y - yRef), Math.abs(b.y - yN), Math.abs(b.y - yCl)];
      let bi = 0;
      for (let i = 1; i < 3; i++) if (es[i] < es[bi]) bi = i;
      let sec = Infinity;
      for (let i = 0; i < 3; i++) if (i !== bi && es[i] < sec) sec = es[i];
      if (es[bi] < 1.5 && sec - es[bi] > 0.2) {
        wallVotes[bi]++; wallCal = true;
        let wm = 0;
        for (let i = 1; i < 3; i++) if (wallVotes[i] > wallVotes[wm]) wm = i;
        wallModel = wm;
      }
    }
  }

  function incoming(s) {
    const b = s.ball, my = s.me.y, oy = s.opp.y;
    if (b.x - R <= MYX + 0.0001) return toward(clampP(fold(b.y)), my);
    const r = sim(b.x, b.y, b.dx, b.dy, -1, wallModel);
    const F = r.n;
    const conf = hitConfident();
    const hitY = pickY(r);
    const v = Math.hypot(b.dx, b.dy);
    const v2 = Math.min(v * 1.05, MAXV), v3 = Math.min(v2 * 1.05, MAXV);
    const wallUnc = !wallCal && r.b > 0;
    const maxO = wallUnc ? 0.7 : (conf ? 0.9 : 0.8);
    const buffer = wallUnc ? 7 : 4;
    if (F <= 2) {
      let p = lastTargetP;
      if (p === null || Math.abs(p - hitY) > 42) p = hitY;
      return toward(clampP(p), my);
    }
    const cands = [];
    let best = null, bestS = -Infinity;
    for (let i = -18; i <= 18; i++) {
      const o = i / 20;
      if (Math.abs(o) > maxO + 1e-9) continue;
      const p = hitY - HALF * o;
      if (p < PMIN || p > PMAX) continue;
      if (!conf && (Math.abs(r.y - p) > 44 || Math.abs(r.yc - p) > 44 || Math.abs(r.ycen - p) > 44)) continue;
      const ndx = v2 * Math.cos(o * ANG), ndy = v2 * Math.sin(o * ANG);
      const t = sim(MYX + R, hitY, ndx, ndy, 1, wallModel);
      const yO = t.y, TO = t.n;
      const margin = Math.abs(yO - oy) - 46 - SPD * TO;
      const needed = Math.ceil(Math.abs(p - my) / SPD - 1e-9);
      let va = -Infinity;
      for (let k = 0; k < VANG.length; k++) {
        const a = VANG[k];
        const yR = fold(yO + 728 * Math.tan(a));
        const TR = 728 / (v3 * Math.cos(a));
        const vv = Math.abs(yR - p) - 46 - SPD * (TO + TR);
        if (vv > va) va = vv;
      }
      let score = margin - (margin > 0 ? 0.3 : 1) * Math.max(0, va) + 2 * t.b - 2 * needed;
      if (lastTargetP !== null && Math.abs(p - lastTargetP) < 2.6) score += 6;
      const feasible = needed <= F - 2;
      const c = { o: o, p: p, score: score, yO: yO, TO: TO, needed: needed, feasible: feasible };
      cands.push(c);
      if (feasible && score > bestS) { bestS = score; best = c; }
    }
    if (!best) {
      lastTargetP = null; lastDecoyP = null;
      return toward(clampP(hitY), my);
    }
    if (F <= best.needed + buffer) {
      lastTargetP = best.p; lastDecoyP = null;
      return toward(best.p, my);
    }
    let dec = best, decS = -Infinity;
    for (let k = 0; k < cands.length; k++) {
      const c = cands[k];
      let sc = Math.abs(c.yO - best.yO);
      if (lastDecoyP !== null && Math.abs(c.p - lastDecoyP) < 2.6) sc += 15;
      if (sc > decS) { decS = sc; dec = c; }
    }
    lastTargetP = best.p; lastDecoyP = dec.p;
    return toward(dec.p, my);
  }

  function outgoing(s) {
    const b = s.ball, my = s.me.y, oy = s.opp.y;
    const r = sim(b.x, b.y, b.dx, b.dy, 1, wallModel);
    const TO = r.n;
    const yO = pickY(r);
    const v = Math.hypot(b.dx, b.dy), v2 = Math.min(v * 1.05, MAXV);
    const reach = SPD * TO + 8;
    const lo = Math.max(PMIN, oy - reach), hi = Math.min(PMAX, oy + reach);
    const os = [];
    for (let i = -20; i <= 20; i++) {
      const o = i / 20, p = yO - HALF * o;
      if (p >= lo && p <= hi) os.push(o);
    }
    const ends = [lo, hi];
    for (let k = 0; k < 2; k++) {
      const d = yO - ends[k];
      if (Math.abs(d) <= 46) os.push(Math.max(-1, Math.min(1, d / HALF)));
    }
    if (!os.length) return toward(250, my);
    const arr = [];
    for (let k = 0; k < os.length; k++) {
      const o = os[k];
      const ndx = -v2 * Math.cos(o * ANG), ndy = v2 * Math.sin(o * ANG);
      const t = sim(OPX - R, yO, ndx, ndy, -1, wallModel);
      arr.push([pickY(t), t.n]);
    }
    const plo = Math.max(PMIN, my - SPD * TO), phi = Math.min(PMAX, my + SPD * TO);
    let bestPos = my, bestObj = Infinity;
    for (let pos = plo; pos <= phi + 1e-9; pos += 2) {
      let obj = -Infinity;
      for (let k = 0; k < arr.length; k++) {
        const vv = Math.abs(arr[k][0] - pos) - SPD * arr[k][1];
        if (vv > obj) obj = vv;
      }
      obj += 0.002 * Math.abs(pos - my) + 0.001 * Math.abs(pos - 250);
      if (obj < bestObj) { bestObj = obj; bestPos = pos; }
    }
    return toward(bestPos, my);
  }

  return function move(s) {
    try {
      const b = s.ball, my = s.me.y, oy = s.opp.y;
      const sum = s.score.me + s.score.opp;
      if (sum !== lastScoreSum) { lastScoreSum = sum; lastTargetP = null; lastDecoyP = null; prev = null; }
      if (prev) calibrate(prev, s);
      prev = { bx: b.x, by: b.y, bdx: b.dx, bdy: b.dy, my: my, oy: oy };
      let out = b.dx < 0 ? incoming(s) : outgoing(s);
      if (typeof out !== "number" || out !== out) out = 0;
      return out > 1 ? 1 : out < -1 ? -1 : out;
    } catch (e) {
      const d = (s.ball.y - s.me.y) / 5;
      return d > 1 ? 1 : d < -1 ? -1 : (d === d ? d : 0);
    }
  };
}