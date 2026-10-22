function createPlayer() {
  var W = 800, H = 500, R = 6;
  var MY_X = 36, OPP_X = 764;
  var HALF = 40, REACH = 46, SPEED = 5;
  var MAXA = 55 * Math.PI / 180;

  function sim(x, y, dx, dy, tx, r) {
    var t = 0;
    var lo = r, hi = H - r;
    if (dx === 0) return { y: y, t: 99999 };
    while ((dx < 0 ? x > tx : x < tx) && t < 3000) {
      x += dx; y += dy;
      if (y < lo) { y = 2 * lo - y; dy = -dy; }
      else if (y > hi) { y = 2 * hi - y; dy = -dy; }
      t++;
    }
    return { y: y, t: t };
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  return function move(s) {
    try {
      var b = s.ball, me = s.me.y, opp = s.opp.y;
      var r = (b && b.r) || R;
      if (s.court) { W = s.court.w || W; H = s.court.h || H; }
      if (s.paddle) {
        HALF = (s.paddle.h || 80) / 2;
        SPEED = s.paddle.speed || 5;
        MY_X = (s.paddle.faceX || 30) + r;
        OPP_X = (s.paddle.oppFaceX || 770) - r;
      }
      REACH = HALF + r;
      var target = H / 2;

      if (b.dx < 0 && b.x > MY_X - 2) {
        var p = sim(b.x, b.y, b.dx, b.dy, MY_X, r);
        var iy = p.y, t = p.t;
        var sp = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
        var ns = Math.min(24, sp * 1.05);
        var best = null, bestScore = -1e9;
        var avail = SPEED * t;
        for (var k = -19; k <= 19; k++) {
          var off = k * 0.05;
          var pc = iy - off * HALF;
          if (pc < HALF || pc > H - HALF) continue;
          var need = Math.abs(pc - me);
          var myMargin = avail - need;
          if (myMargin < 3) continue;
          var a = off * MAXA;
          var ndx = ns * Math.cos(a), ndy = ns * Math.sin(a);
          var q = sim(MY_X, iy, ndx, ndy, OPP_X, r);
          var gap = Math.abs(q.y - opp) - REACH - SPEED * q.t;
          var score = gap + 0.1 * Math.min(myMargin, 50) - 0.02 * q.t;
          if (score > bestScore) { bestScore = score; best = pc; }
        }
        if (best === null) target = iy;
        else target = best;
      } else {
        target = H / 2;
      }

      target = clamp(target, HALF, H - HALF);
      var mv = (target - me) / SPEED;
      if (!(mv === mv)) return 0;
      return clamp(mv, -1, 1);
    } catch (e) {
      return 0;
    }
  };
}