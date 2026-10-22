function createPlayer() {
  var phys = {
    top: 6,
    bot: 494,
    reflect: true,
    wallLocked: false
  };
  var mem = {
    inited: false,
    last: null,
    models: null,
    inset: 6,
    angleSign: 1,
    angleConfirmed: false,
    yBias: 0,
    trusted: false,
    goodFrames: 0,
    say: "Eyes up. Let's see what they've got.",
    plan: "init",
    pending: null,
    expectHit: false,
    misses: 0,
    hits: 0,
    insetFlips: 0,
    lastScoreMe: 0,
    lastScoreOpp: 0,
    lastCorner: "",
    committedOffset: null,
    H: 500,
    r: 6
  };

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function hypot(x, y) {
    return Math.sqrt(x * x + y * y);
  }

  function initFrom(s) {
    if (mem.inited) return;
    mem.H = s.court.h;
    mem.r = s.ball.r;
    mem.inset = s.ball.r;
    phys.top = s.ball.r;
    phys.bot = s.court.h - s.ball.r;
    phys.reflect = true;
    mem.models = [
      { top: s.ball.r, bot: s.court.h - s.ball.r, reflect: true },
      { top: s.ball.r, bot: s.court.h - s.ball.r, reflect: false },
      { top: 0, bot: s.court.h, reflect: true },
      { top: 0, bot: s.court.h, reflect: false }
    ];
    mem.inited = true;
  }

  function modelStep(m, y, dy) {
    var ny = y + dy;
    var ndy = dy;
    if (ny < m.top) {
      ny = m.reflect ? (2 * m.top - ny) : m.top;
      ndy = -dy;
    } else if (ny > m.bot) {
      ny = m.reflect ? (2 * m.bot - ny) : m.bot;
      ndy = -dy;
    }
    return { y: ny, dy: ndy };
  }

  function contacts(s) {
    return {
      myX: s.paddle.faceX + mem.inset,
      oppX: s.paddle.oppFaceX - mem.inset
    };
  }

  // Discrete ball flight until center crosses contactX.
  // dir -1: decreasing x, dir +1: increasing x.
  function predictToX(x, y, dx, dy, contactX, dir) {
    if (dx === 0) return null;
    if (dir < 0 && dx >= 0) return null;
    if (dir > 0 && dx <= 0) return null;
    var top = phys.top;
    var bot = phys.bot;
    var reflect = phys.reflect;
    var bounces = 0;
    var sinceBounce = 999;
    var f;
    for (f = 1; f <= 900; f++) {
      var nx = x + dx;
      var ny = y + dy;
      var ndy = dy;
      var bounced = false;
      if (ny < top) {
        ny = reflect ? (2 * top - ny) : top;
        ndy = -dy;
        bounced = true;
      } else if (ny > bot) {
        ny = reflect ? (2 * bot - ny) : bot;
        ndy = -dy;
        bounced = true;
      }
      if (bounced) {
        bounces++;
        sinceBounce = 0;
      } else {
        sinceBounce++;
      }
      var crossed = dir < 0 ? (x > contactX && nx <= contactX) : (x < contactX && nx >= contactX);
      if (crossed) {
        return { frames: f, y: ny, bounces: bounces, sinceBounce: sinceBounce, dx: dx, dy: ndy };
      }
      x = nx;
      y = ny;
      dy = ndy;
      if (dir < 0 && dx >= 0) return null;
      if (dir > 0 && dx <= 0) return null;
    }
    return null;
  }

  function launch(hitY, paddleY, speed, dir, half) {
    var offset = (hitY - paddleY) / half;
    if (offset > 1) offset = 1;
    if (offset < -1) offset = -1;
    var angle = offset * 55 * Math.PI / 180;
    var spd = speed >= 24 ? 24 : Math.min(24, speed * 1.05);
    var dx = dir * Math.cos(angle) * spd;
    var dy = Math.sin(angle) * spd * mem.angleSign;
    return { dx: dx, dy: dy, offset: offset, spd: spd };
  }

  function setPlan(id, text) {
    if (id !== mem.plan) {
      mem.plan = id;
      if (text.length > 48) text = text.slice(0, 48);
      mem.say = text;
    }
  }

  function oppWords(oy, H) {
    if (oy < H * 0.36) return "They're up high";
    if (oy > H * 0.64) return "They're sunk low";
    return "They're mid-court";
  }

  function onMyHit(s) {
    if (!mem.pending) return;
    var ang = Math.atan2(s.ball.dy, Math.abs(s.ball.dx));
    var deg = Math.abs(ang) * 180 / Math.PI;
    if (!mem.angleConfirmed && mem.pending.offset > 0.2 && deg > 8 && deg < 48) {
      mem.angleSign = ang > 0 ? 1 : -1;
      mem.angleConfirmed = true;
    }
    if (mem.angleConfirmed) {
      var trueOffset = ang / ((55 * Math.PI / 180) * mem.angleSign);
      var yErr = (trueOffset - mem.pending.offset) * (s.paddle.h / 2);
      if (Math.abs(trueOffset) <= 1.25 && Math.abs(yErr) < 28) {
        mem.yBias = clamp(mem.yBias * 0.55 + yErr * 0.45, -18, 18);
      }
    }
    mem.hits++;
    if (mem.hits >= 2 && phys.wallLocked) mem.trusted = true;
    if (Math.abs(s.ball.x - (s.paddle.faceX + s.ball.r)) < 0.2) mem.inset = s.ball.r;
    else if (Math.abs(s.ball.x - s.paddle.faceX) < 0.2) mem.inset = 0;
  }

  function onOppHit(s) {
    if (Math.abs(s.ball.x - (s.paddle.oppFaceX - s.ball.r)) < 0.2) mem.inset = s.ball.r;
    else if (Math.abs(s.ball.x - s.paddle.oppFaceX) < 0.2) mem.inset = 0;
    var ang = Math.atan2(s.ball.dy, -s.ball.dx);
    var off = clamp((s.ball.y - s.opp.y) / (s.paddle.h / 2), -1, 1);
    if (Math.abs(off) < 0.18 || Math.abs(ang) < 0.12) return;
    var maxA = 55 * Math.PI / 180;
    var errSame = Math.abs(ang - off * maxA * mem.angleSign);
    var errFlip = Math.abs(ang - off * maxA * -mem.angleSign);
    var best = errSame < errFlip ? errSame : errFlip;
    if (best > 0.32) return;
    if (errFlip + 0.06 < errSame) {
      mem.angleSign = -mem.angleSign;
      mem.angleConfirmed = true;
    } else if (errSame + 0.06 < errFlip) {
      mem.angleConfirmed = true;
    }
  }

  function observe(s) {
    initFrom(s);
    if (s.score.me !== mem.lastScoreMe || s.score.opp !== mem.lastScoreOpp) {
      mem.lastScoreMe = s.score.me;
      mem.lastScoreOpp = s.score.opp;
      mem.committedOffset = null;
      mem.pending = null;
      mem.expectHit = false;
      mem.last = null;
      return;
    }
    if (!mem.last || s.frame !== mem.last.frame + 1) {
      mem.last = null;
      mem.expectHit = false;
      return;
    }
    var last = mem.last;
    var jumped = Math.abs(s.ball.x - (last.x + last.dx)) > 36;
    if (jumped) {
      mem.last = null;
      mem.expectHit = false;
      mem.pending = null;
      return;
    }
    var dxFlip = last.dx * s.ball.dx < 0;
    if (mem.expectHit) {
      if (dxFlip && s.ball.dx > 0) onMyHit(s);
      else if (s.ball.x < s.paddle.faceX - 1) {
        mem.misses++;
        if (mem.pending && Math.abs(mem.pending.offset) < 0.25 && mem.insetFlips < 1) {
          mem.inset = mem.inset === 0 ? s.ball.r : 0;
          mem.insetFlips++;
          mem.yBias = 0;
          mem.trusted = false;
        }
      }
      mem.expectHit = false;
    }
    if (dxFlip && last.dx > 0 && s.ball.dx < 0) onOppHit(s);

    if (!dxFlip) {
      var xMatch = Math.abs(s.ball.x - (last.x + last.dx)) < 0.45;
      if (xMatch) {
        var freeY = last.y + last.dy;
        var freeMatch = Math.abs(s.ball.y - freeY) < 0.45 && Math.abs(s.ball.dy - last.dy) < 0.45;
        if (!freeMatch && mem.models && mem.models.length) {
          var still = [];
          var i;
          for (i = 0; i < mem.models.length; i++) {
            var p = modelStep(mem.models[i], last.y, last.dy);
            if (Math.abs(p.y - s.ball.y) < 0.45 && Math.abs(p.dy - s.ball.dy) < 0.45) still.push(mem.models[i]);
          }
          if (still.length > 0) {
            mem.models = still;
            phys.top = still[0].top;
            phys.bot = still[0].bot;
            phys.reflect = still[0].reflect;
            if (still.length === 1) phys.wallLocked = true;
          }
        }
        var pred = modelStep(phys, last.y, last.dy);
        if (Math.abs(pred.y - s.ball.y) < 0.45 && Math.abs(pred.dy - s.ball.dy) < 0.45) {
          mem.goodFrames++;
        } else {
          mem.goodFrames = 0;
          mem.trusted = false;
        }
        if (mem.goodFrames > 25 && phys.wallLocked) mem.trusted = true;
      }
    }
  }

  function offsetForDirect(hitY, targetY, xDist) {
    if (xDist === 0) return 0;
    var ratio = (targetY - hitY) / xDist;
    var angle = Math.atan(ratio / mem.angleSign);
    return angle / (55 * Math.PI / 180);
  }

  function difficultyOf(arrY, oppY, tFrames, hitHalf, pMin, pMax) {
    var minP = clamp(oppY - 5 * tFrames, pMin, pMax);
    var maxP = clamp(oppY + 5 * tFrames, pMin, pMax);
    var coverLo = minP - hitHalf;
    var coverHi = maxP + hitHalf;
    if (arrY < coverLo) return coverLo - arrY;
    if (arrY > coverHi) return arrY - coverHi;
    var slack = arrY - coverLo;
    var slack2 = coverHi - arrY;
    return -(slack < slack2 ? slack : slack2);
  }

  function chooseOffense(s) {
    var H = s.court.h;
    var half = s.paddle.h / 2;
    var pMin = half;
    var pMax = H - half;
    var c = contacts(s);
    var sp = hypot(s.ball.dx, s.ball.dy);
    var pred = predictToX(s.ball.x, s.ball.y, s.ball.dx, s.ball.dy, c.myX, -1);
    if (!pred) {
      setPlan("hold", "Holding center. Waiting for a tell.");
      var mid = H / 2;
      return finish(s, clamp((mid - s.me.y) / (s.paddle.speed || 5), -1, 1), mid);
    }
    var hitY = clamp(pred.y + mem.yBias, 0, H);
    var frames = pred.frames;
    var protecting = s.score.me > s.score.opp && s.frame > 28000;
    var desperate = s.score.me + 1 < s.score.opp || (s.score.me < s.score.opp && s.frame > 22000);
    var safety = protecting ? 18 : desperate ? 8 : 12;
    if (!phys.wallLocked) safety += 4;
    var safeHalf = half - safety;
    if (safeHalf < 18) safeHalf = 18;

    var reachF = frames <= 2 ? frames : frames - 1;
    var reachMin = clamp(s.me.y - 5 * reachF, pMin, pMax);
    var reachMax = clamp(s.me.y + 5 * reachF, pMin, pMax);
    var aimLo = reachMin > (hitY - safeHalf) ? reachMin : (hitY - safeHalf);
    var aimHi = reachMax < (hitY + safeHalf) ? reachMax : (hitY + safeHalf);
    if (aimLo < pMin) aimLo = pMin;
    if (aimHi > pMax) aimHi = pMax;

    var who = oppWords(s.opp.y, H);

    if (aimLo > aimHi) {
      setPlan("panic", "Late shift — sprinting onto the ball.");
      mem.committedOffset = 0;
      return goTo(s, clamp(hitY, pMin, pMax), hitY, frames);
    }

    // Lock the angle in the final approach so a corner flip can't whiff.
    if (frames <= 5 && mem.committedOffset !== null && mem.angleConfirmed) {
      var locked = clamp(hitY - mem.committedOffset * half, aimLo, aimHi);
      if (Math.abs(locked - hitY) <= safeHalf + 1) {
        return goTo(s, locked, hitY, frames);
      }
    }

    if (!mem.angleConfirmed) {
      var calibOff = 0.42;
      var calibY = clamp(hitY - calibOff * half, aimLo, aimHi);
      if (Math.abs(calibY - hitY) < 8 || frames < 4) calibY = clamp(hitY, aimLo, aimHi);
      mem.committedOffset = clamp((hitY - calibY) / half, -1, 1);
      setPlan("calib", "Touch of angle — reading the physics.");
      return goTo(s, calibY, hitY, frames);
    }

    var xDist = c.oppX - c.myX;
    var candidates = [];
    var pY;
    for (pY = aimLo; pY <= aimHi + 0.01; pY += 3) candidates.push(pY);
    candidates.push(clamp(hitY, aimLo, aimHi));
    var corners = [pMin + 2, pMax - 2];
    var ci;
    for (ci = 0; ci < corners.length; ci++) {
      var offD = offsetForDirect(hitY, corners[ci], xDist);
      offD = clamp(offD, -1, 1);
      candidates.push(clamp(hitY - offD * half, aimLo, aimHi));
    }

    var best = null;
    var n;
    var aceNeed = mem.trusted ? 16 : 36;
    for (n = 0; n < candidates.length; n++) {
      var py = candidates[n];
      var shot = launch(hitY, py, sp, 1, half);
      if (shot.dx <= 0.5) continue;
      var ret = predictToX(c.myX, hitY, shot.dx, shot.dy, c.oppX, 1);
      if (!ret) continue;
      var tOpp = frames + ret.frames + (mem.trusted ? 0 : 2);
      var diff = difficultyOf(ret.y, s.opp.y, tOpp, half + mem.r, pMin, pMax);
      var score = diff * 2;
      score -= ret.bounces * 7;
      score -= Math.abs(shot.offset) * 1.5;
      if (diff >= aceNeed) score += 120;
      else score -= Math.min(Math.abs(ret.y - pMin), Math.abs(ret.y - pMax)) * 0.04;
      var side = ret.y < H / 2 ? "top" : "bot";
      if (mem.lastCorner && side !== mem.lastCorner && diff < aceNeed) score += 8;
      // Don't strand ourselves for a non-ace.
      if (diff < aceNeed) {
        var backT = xDist / Math.max(3, shot.spd * 0.94);
        var myTime = frames + ret.frames + backT;
        var far = Math.max(Math.abs(py - pMin), Math.abs(py - pMax));
        var vuln = far - (myTime * 5 + half);
        if (vuln > 0) score -= vuln * 0.35;
      }
      if (!best || score > best.score) {
        best = { score: score, py: py, arrY: ret.y, diff: diff, offset: shot.offset, bounces: ret.bounces, side: side };
      }
    }

    if (!best) {
      setPlan("safe", "Clean block. Staying on the safe side.");
      mem.committedOffset = 0;
      return goTo(s, clamp(hitY, aimLo, aimHi), hitY, frames);
    }

    // Stability check: reject a chaotic "ace" that a 1px error would spoil.
    if (best.diff >= aceNeed && best.bounces > 0) {
      var py2 = clamp(best.py + 4, aimLo, aimHi);
      var shot2 = launch(hitY, py2, sp, 1, half);
      var ret2 = predictToX(c.myX, hitY, shot2.dx, shot2.dy, c.oppX, 1);
      if (!ret2 || Math.abs(ret2.y - best.arrY) > 70) {
        best.diff = Math.min(best.diff, aceNeed - 1);
        best.score -= 120;
      }
    }

    mem.committedOffset = best.offset;
    mem.lastCorner = best.side;

    if (best.diff >= aceNeed) {
      if (best.side === "top") setPlan("ace_top", who + " — ace upstairs.");
      else setPlan("ace_bot", who + " — ace along the floor.");
    } else if (protecting) {
      setPlan("protect", "Protecting the lead. Simple returns.");
      // still use best, it's already safety-clamped
    } else if (best.side === "top") {
      setPlan("pin_top", desperate ? "Behind. Selling the upstairs pin." : who + " — pinning them upstairs.");
    } else {
      setPlan("pin_bot", desperate ? "Behind. Selling the floor pin." : who + " — pinning them to the floor.");
    }
    return goTo(s, best.py, hitY, frames);
  }

  function chooseDefense(s) {
    var H = s.court.h;
    var half = s.paddle.h / 2;
    var pMin = half;
    var pMax = H - half;
    var c = contacts(s);
    mem.committedOffset = null;
    var mid = H / 2;

    if (s.ball.x >= c.oppX - 1) {
      setPlan("hold", "Holding center. Waiting for a tell.");
      return goTo(s, mid, mid, 0);
    }

    var pred = predictToX(s.ball.x, s.ball.y, s.ball.dx, s.ball.dy, c.oppX, 1);
    if (!pred || !mem.angleConfirmed) {
      setPlan("hold", "Holding center. Waiting for a tell.");
      return goTo(s, mid, mid, 0);
    }

    var sp = hypot(s.ball.dx, s.ball.dy);
    var moveMin = clamp(s.opp.y - 5 * pred.frames, pMin, pMax);
    var moveMax = clamp(s.opp.y + 5 * pred.frames, pMin, pMax);
    var hitHalf = half + mem.r;
    var lo = Math.max(moveMin, pred.y - hitHalf, pMin);
    var hi = Math.min(moveMax, pred.y + hitHalf, pMax);

    if (lo > hi) {
      setPlan("they_miss", "That one gets past them. Resetting.");
      return goTo(s, mid, mid, 0);
    }

    // Wide-open aim: anything is possible, center is minimax.
    if (hi - lo > half * 1.7 && pred.frames > 6) {
      setPlan("hold", "Holding center. Waiting for a tell.");
      return goTo(s, mid, pred.y, 0);
    }

    var arrivals = [];
    var step = (hi - lo) / 8;
    if (step < 4) step = 4;
    var p;
    for (p = lo; p <= hi + 0.01; p += step) {
      var shot = launch(pred.y, p, sp, -1, half);
      if (shot.dx >= -0.5) continue;
      var ret = predictToX(c.oppX, pred.y, shot.dx, shot.dy, c.myX, -1);
      if (!ret) continue;
      arrivals.push({ y: ret.y, frames: pred.frames + ret.frames });
    }
    if (!arrivals.length) {
      setPlan("hold", "Holding center. Waiting for a tell.");
      return goTo(s, mid, mid, 0);
    }

    var bestY = mid;
    var bestScore = -1e18;
    var y;
    for (y = pMin; y <= pMax; y += 10) {
      var worst = 1e18;
      var i;
      for (i = 0; i < arrivals.length; i++) {
        var a = arrivals[i];
        var margin = a.frames * 5 + half - Math.abs(a.y - y);
        if (margin < worst) worst = margin;
      }
      var score = worst - Math.abs(y - s.me.y) * 0.015;
      if (score > bestScore) {
        bestScore = score;
        bestY = y;
      }
    }
    setPlan("cover", "Read their paddle. Shifting to cover.");
    var show = arrivals.length === 1 ? arrivals[0].y : bestY;
    return goTo(s, bestY, show, 0);
  }

  function goTo(s, paddleY, targetY, frames) {
    var speed = s.paddle.speed || 5;
    var half = s.paddle.h / 2;
    var dest = clamp(paddleY, half, s.court.h - half);
    var mv = clamp((dest - s.me.y) / speed, -1, 1);
    if (frames === 1) {
      mem.expectHit = true;
      mem.pending = {
        offset: clamp((targetY - dest) / half, -1, 1),
        paddleY: dest
      };
    }
    return finish(s, mv, targetY);
  }

  function finish(s, mv, targetY) {
    if (!isFinite(mv)) mv = 0;
    mv = clamp(mv, -1, 1);
    mem.last = {
      x: s.ball.x,
      y: s.ball.y,
      dx: s.ball.dx,
      dy: s.ball.dy,
      frame: s.frame
    };
    var out = { move: mv, say: mem.say };
    if (isFinite(targetY)) out.target = targetY;
    return out;
  }

  return function move(s) {
    try {
      observe(s);
      if (s.ball.dx < 0 && s.ball.x > s.paddle.faceX) return chooseOffense(s);
      return chooseDefense(s);
    } catch (e) {
      return 0;
    }
  };
}