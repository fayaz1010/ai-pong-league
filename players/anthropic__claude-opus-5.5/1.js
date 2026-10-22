function createPlayer() {
  var H = 500, W = 800;
  var lastScoreMe = 0, lastScoreOpp = 0;
  var mood = "";
  var moodTimer = 0;
  var plan = "";
  var sayLine = "Booting up. Geometry is my weapon.";

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function fold(y, r) {
    var L = H - 2 * r;
    var p = y - r;
    var m = ((p % (2 * L)) + 2 * L) % (2 * L);
    if (m > L) m = 2 * L - m;
    return m + r;
  }

  return function move(s) {
    var b = s.ball, me = s.me, opp = s.opp;
    var r = b.r || 6;
    H = s.court.h; W = s.court.w;
    var myX = s.paddle.faceX + r;
    var oppX = s.paddle.oppFaceX - r;
    var half = s.paddle.h / 2;
    var spd = s.paddle.speed;
    var minC = half, maxC = H - half;

    // Score reactions
    if (s.score.me !== lastScoreMe) {
      mood = "Point to me! Nobody covers that corner.";
      moodTimer = 120;
      lastScoreMe = s.score.me;
    }
    if (s.score.opp !== lastScoreOpp) {
      mood = "Ouch. Recalculating... adjusting margins.";
      moodTimer = 120;
      lastScoreOpp = s.score.opp;
    }

    var target = H / 2;
    var newPlan;
    var predY = null;

    if (b.dx < 0 && b.x > myX - 1) {
      // Ball coming to us
      var T = (b.x - myX) / (-b.dx);
      var Y = fold(b.y + b.dy * T, r);
      predY = Y;
      var sp = Math.sqrt(b.dx * b.dx + b.dy * b.dy);
      var ns = Math.min(24, sp * 1.05);
      var reach = spd * T - 3;

      var best = null, bestScore = -Infinity, bestOff = 0;
      for (var i = -20; i <= 20; i++) {
        var off = i / 20;
        var pc = clamp(Y - off * half, minC, maxC);
        var d = Y - pc;
        if (Math.abs(d) > half - 6) continue;
        if (Math.abs(pc - me.y) > reach) continue;
        var ao = clamp(d / half, -1, 1);
        var ang = ao * 55 * Math.PI / 180;
        var ndx = ns * Math.cos(ang), ndy = ns * Math.sin(ang);
        var t2 = (oppX - myX) / ndx;
        var Y2 = fold(Y + ndy * t2, r);
        var oppAtHit = opp.y + clamp(Y - opp.y, -spd * T, spd * T) * 0; // assume static
        var s1 = (Math.abs(Y2 - opp.y) - (half + r)) - spd * t2;
        var s2 = (Math.abs(Y2 - H / 2) - (half + r)) - spd * t2;
        var sc = Math.min(s1, s2);
        // slight preference for safer (less extreme) contact
        sc -= Math.abs(d) * 0.02;
        if (sc > bestScore) { bestScore = sc; best = pc; bestOff = ao; }
      }
      if (best === null) {
        target = clamp(Y, minC, maxC);
        newPlan = "Scrambling! Full sprint to the ball!";
      } else {
        target = best;
        if (bestScore > 0) {
          newPlan = bestOff > 0.1 ? "Kill shot DOWN - opponent can't get there"
                  : bestOff < -0.1 ? "Kill shot UP - opponent can't get there"
                  : "Flat rocket straight past them";
        } else if (Math.abs(bestOff) > 0.3) {
          newPlan = "Angling it " + (bestOff > 0 ? "down" : "up") + " to stretch them";
        } else {
          newPlan = "Safe block, keep the rally alive";
        }
      }
    } else {
      // Ball going away: recover toward centre, biased slightly toward
      // where opponent will meet the ball.
      var T2 = b.dx > 0 ? (oppX - b.x) / b.dx : 0;
      var Yo = fold(b.y + b.dy * T2, r);
      target = H / 2 + (Yo - H / 2) * 0.25;
      newPlan = "Recovering to centre, reading their angle";
    }

    if (newPlan !== plan) {
      plan = newPlan;
      sayLine = plan;
    }
    var line = sayLine;
    if (moodTimer > 0) { moodTimer--; line = mood; }
    if (line.length > 48) line = line.slice(0, 48);

    var mv = clamp((target - me.y) / spd, -1, 1);
    if (Math.abs(target - me.y) < 0.5) mv = 0;
    return { move: mv, say: line, target: predY !== null ? predY : target };
  };
}