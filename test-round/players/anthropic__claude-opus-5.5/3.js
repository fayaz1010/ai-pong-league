function createPlayer() {
  var H = 500, PH = 80, SPD = 5, FACE = 30, OFACE = 770;
  var prevOff = 0;
  var prevDir = 0;

  function sim(x, y, dx, dy, r) {
    var steps = 0;
    for (var i = 0; i < 3000; i++) {
      if (dx < 0 && x - r <= FACE) break;
      if (dx > 0 && x + r >= OFACE) break;
      x += dx; y += dy;
      if (y < r) { y = 2 * r - y; dy = -dy; }
      else if (y > H - r) { y = 2 * (H - r) - y; dy = -dy; }
      steps++;
    }
    return { y: y, t: steps };
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  return function move(s) {
    try {
      var b = s.ball, me = s.me.y, opp = s.opp.y;
      var r = b.r || 6;
      var target = H / 2;
      var dir = b.dx < 0 ? -1 : 1;

      if (b.dx < 0) {
        var p = sim(b.x, b.y, b.dx, b.dy, r);
        var yi = p.y, t = p.t;
        var speed = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
        var ns = Math.min(speed * 1.05, 24);
        var best = -1e9, bestCenter = clamp(yi, PH / 2, H - PH / 2), bestOff = 0;
        for (var k = -20; k <= 20; k++) {
          var off = k * 1.9; // up to ~38 px
          var center = clamp(yi - off, PH / 2, H - PH / 2);
          var actual = yi - center;
          if (Math.abs(actual) > 40) continue;
          var reach = Math.abs(center - me) <= SPD * t - 1;
          if (!reach) continue;
          var o = clamp(actual / 40, -1, 1);
          var ang = o * 55 * Math.PI / 180;
          var ndx = ns * Math.cos(ang), ndy = ns * Math.sin(ang);
          var q = sim(FACE + r, yi, ndx, ndy, r);
          var need = Math.abs(q.y - opp) - (PH / 2 + r);
          var sc = need - SPD * q.t;
          // safety: prefer not extreme edges slightly, hysteresis
          sc -= Math.abs(actual) > 34 ? 3 : 0;
          if (prevDir === -1 && Math.abs(off - prevOff) < 4) sc += 8;
          if (sc > best) { best = sc; bestCenter = center; bestOff = off; }
        }
        if (best === -1e9) {
          bestCenter = clamp(yi, PH / 2, H - PH / 2);
          bestOff = 0;
        }
        prevOff = bestOff;
        target = bestCenter;
      } else {
        // ball moving away: estimate where opponent hits it, hedge toward mirrored region
        var p2 = sim(b.x, b.y, b.dx, b.dy, r);
        target = H / 2 + (p2.y - H / 2) * 0.25;
      }
      prevDir = dir;
      var mv = (target - me) / SPD;
      if (!(mv === mv)) return 0;
      return clamp(mv, -1, 1);
    } catch (e) {
      return 0;
    }
  };
}