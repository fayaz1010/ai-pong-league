function createPlayer() {
  const DEG = 55 * Math.PI / 180;
  const models = [
    { radius: true, discrete: true, loss: 0 },
    { radius: true, discrete: false, loss: 0.4 },
    { radius: false, discrete: true, loss: 0.4 },
    { radius: false, discrete: false, loss: 0.6 }
  ];

  let previous = null;
  let wallClamp = false;
  let wallKnown = false;
  let opponentVelocity = 0;
  let lastTarget = null;

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function advanceY(y, velocity, time, radius, height, useClamp) {
    const lo = radius;
    const hi = height - radius;
    const span = hi - lo;

    if (!useClamp) {
      let z = (y - lo + velocity * time) % (2 * span);
      if (z < 0) z += 2 * span;
      return lo + (z <= span ? z : 2 * span - z);
    }

    let remaining = time;
    let v = velocity;
    y = clamp(y, lo, hi);

    for (let i = 0; i < 32 && remaining > 1e-9; i++) {
      if (Math.abs(v) < 1e-10) return y;

      const wall = v > 0 ? hi : lo;
      const distance = Math.max(0, (wall - y) / v);
      const steps = Math.max(1, Math.ceil(distance - 1e-10));

      if (remaining < steps) {
        return clamp(y + v * remaining, lo, hi);
      }

      y = wall;
      remaining -= steps;
      v = -v;
    }
    return y;
  }

  function interception(ball, plane, model, radius, height, useClamp) {
    const exactTime = Math.max(0, (plane - ball.x) / ball.dx);
    const time = model.discrete
      ? Math.max(0, Math.ceil(exactTime - 1e-9))
      : exactTime;

    return {
      y: advanceY(ball.y, ball.dy, time, radius, height, useClamp),
      time: time,
      moves: Math.max(1, Math.ceil(exactTime - 1e-9))
    };
  }

  return function move(s) {
    const b = s.ball;
    const H = s.court.h;
    const radius = Number.isFinite(b.r) ? b.r : 6;
    const half = s.paddle.h / 2;
    const paddleSpeed = s.paddle.speed;
    const minCentre = half;
    const maxCentre = H - half;

    const consecutive = previous &&
      s.frame === previous.frame + 1 &&
      s.score.me === previous.scoreMe &&
      s.score.opp === previous.scoreOpp;

    if (consecutive) {
      const p = previous;
      opponentVelocity =
        0.55 * opponentVelocity + 0.45 * (s.opp.y - p.oppY);

      const rawY = p.ball.y + p.ball.dy;
      const wallCrossed = rawY < radius || rawY > H - radius;
      const paddleBounce = p.ball.dx * b.dx < 0;
      const oldSpeed = Math.hypot(p.ball.dx, p.ball.dy);
      const newSpeed = Math.hypot(b.dx, b.dy);

      if (wallCrossed && !paddleBounce &&
          Math.abs(oldSpeed - newSpeed) < 0.01) {
        const reflected = advanceY(
          p.ball.y, p.ball.dy, 1, radius, H, false
        );
        const stopped = clamp(rawY, radius, H - radius);
        const eReflect = Math.abs(b.y - reflected);
        const eClamp = Math.abs(b.y - stopped);

        if (Math.abs(eReflect - eClamp) > 0.05) {
          wallClamp = eClamp < eReflect;
          wallKnown = true;
        }
      }

      if (p.ball.dx < 0) {
        const bounced = b.dx > 0;
        const nearPaddle =
          p.ball.x + p.ball.dx <= s.paddle.faceX + radius + 1;

        if (bounced || nearPaddle) {
          for (const model of models) {
            const plane = s.paddle.faceX + (model.radius ? radius : 0);
            const crosses = p.ball.x + p.ball.dx <= plane + 1e-7;
            let error = 0;

            if (bounced) {
              if (!crosses) error += 30;

              const t = model.discrete ? 1 :
                clamp((plane - p.ball.x) / p.ball.dx, 0, 1);
              const y = advanceY(
                p.ball.y, p.ball.dy, t, radius, H, wallClamp
              );

              if (b.y > radius + 25 && b.y < H - radius - 25) {
                const predictedOffset = clamp((y - s.me.y) / half, -1, 1);
                const observedOffset = Math.atan2(b.dy, b.dx) / DEG;
                error += Math.min(
                  35, Math.abs(predictedOffset - observedOffset) * half
                );
              }

              if (Math.abs(b.x - s.paddle.faceX) < 1e-6 && model.radius) {
                error += 5;
              }
              if (Math.abs(b.x - s.paddle.faceX - radius) < 1e-6 &&
                  !model.radius) {
                error += 5;
              }
            } else if (crosses) {
              const y = advanceY(
                p.ball.y, p.ball.dy, 1, radius, H, wallClamp
              );
              if (Math.abs(y - s.me.y) < half + radius - 1) error += 20;
            }

            model.loss = 0.97 * model.loss + error;
          }
        }
      }
    } else {
      opponentVelocity = 0;
      lastTarget = null;
    }

    let model = models[0];
    for (let i = 1; i < models.length; i++) {
      if (models[i].loss < model.loss) model = models[i];
    }

    const left = s.paddle.faceX + (model.radius ? radius : 0);
    const right = s.paddle.oppFaceX - (model.radius ? radius : 0);
    const distance = right - left;
    const ballSpeed = Math.hypot(b.dx, b.dy);
    const returnSpeed = Math.min(24, ballSpeed * 1.05);

    function shot(hitY, centre, speed) {
      const angle = clamp((hitY - centre) / half, -1, 1) * DEG;
      const vx = speed * Math.cos(angle);
      const vy = speed * Math.sin(angle);
      const exact = distance / vx;
      const time = model.discrete ? Math.ceil(exact - 1e-9) : exact;
      return {
        y: advanceY(hitY, vy, time, radius, H, wallClamp),
        time: time
      };
    }

    let target = H / 2;

    if (b.dx < -1e-9) {
      const hit = interception(b, left, model, radius, H, wallClamp);
      let lowY = hit.y;
      let highY = hit.y;

      for (const alternative of models) {
        if (alternative.loss > model.loss + 3) continue;

        const plane =
          s.paddle.faceX + (alternative.radius ? radius : 0);
        const other = interception(
          b, plane, alternative, radius, H, wallClamp
        );
        lowY = Math.min(lowY, other.y);
        highY = Math.max(highY, other.y);

        if (!wallKnown) {
          const alternateWall = interception(
            b, plane, alternative, radius, H, !wallClamp
          );
          lowY = Math.min(lowY, alternateWall.y);
          highY = Math.max(highY, alternateWall.y);
        }
      }

      const reach = paddleSpeed * hit.moves;
      const safeOffset = half + radius - 1.25;
      let lower = Math.max(
        minCentre, s.me.y - reach, highY - safeOffset
      );
      let upper = Math.min(
        maxCentre, s.me.y + reach, lowY + safeOffset
      );

      if (lower <= upper) {
        let predictedOpponent = s.opp.y +
          opponentVelocity * Math.min(6, Math.max(0, hit.moves - 1));

        if ((s.opp.y - H / 2) * opponentVelocity < 0 &&
            (predictedOpponent - H / 2) * (s.opp.y - H / 2) < 0) {
          predictedOpponent = H / 2;
        }
        predictedOpponent = clamp(
          predictedOpponent, minCentre, maxCentre
        );

        let bestScore = -Infinity;
        let bestCentre = clamp(hit.y, lower, upper);

        function consider(centre) {
          centre = clamp(centre, lower, upper);
          const result = shot(hit.y, centre, returnSpeed);
          const separation = Math.abs(result.y - predictedOpponent);
          let value = separation -
            paddleSpeed * result.time - half - radius;

          // Avoid needless last-frame reversals when two shots are equivalent.
          value -= 0.008 * Math.abs(centre - s.me.y);
          if (lastTarget !== null) {
            value -= 0.012 * Math.abs(centre - lastTarget);
          }
          value += 0.00001 * result.y;

          if (value > bestScore) {
            bestScore = value;
            bestCentre = centre;
          }
        }

        const count = 88;
        for (let i = 0; i <= count; i++) {
          consider(lower + (upper - lower) * i / count);
        }
        consider(hit.y);
        consider(hit.y - half);
        consider(hit.y + half);
        if (lastTarget !== null) consider(lastTarget);

        // Refine the best coarse candidate.
        const step = (upper - lower) / count;
        const coarseBest = bestCentre;
        for (let i = -5; i <= 5; i++) {
          consider(coarseBest + step * i / 5);
        }

        target = bestCentre;
      } else {
        // No robust shot is reachable: maximize the probability of a save.
        target = clamp((lowY + highY) / 2, minCentre, maxCentre);
      }

      lastTarget = target;
    } else if (b.dx > 1e-9) {
      lastTarget = null;

      const hit = interception(b, right, model, radius, H, wallClamp);
      const opponentReach = paddleSpeed * hit.moves;
      const lower = Math.max(
        minCentre,
        s.opp.y - opponentReach,
        hit.y - half - radius
      );
      const upper = Math.min(
        maxCentre,
        s.opp.y + opponentReach,
        hit.y + half + radius
      );

      if (lower <= upper) {
        let necessaryLower = -Infinity;
        let necessaryUpper = Infinity;

        // Find a position that can cover the opponent's entire legal
        // return-angle range, not merely its current apparent aim.
        for (let i = 0; i <= 48; i++) {
          const centre = lower + (upper - lower) * i / 48;
          const result = shot(hit.y, centre, returnSpeed);
          const coverage =
            paddleSpeed * Math.max(0, result.time - 1) + half + radius - 2;

          necessaryLower = Math.max(
            necessaryLower, result.y - coverage
          );
          necessaryUpper = Math.min(
            necessaryUpper, result.y + coverage
          );
        }

        if (necessaryLower <= necessaryUpper) {
          target = clamp(H / 2, necessaryLower, necessaryUpper);
        } else {
          target = (necessaryLower + necessaryUpper) / 2;
        }
        target = clamp(target, minCentre, maxCentre);
      }
    }

    previous = {
      frame: s.frame,
      scoreMe: s.score.me,
      scoreOpp: s.score.opp,
      oppY: s.opp.y,
      ball: { x: b.x, y: b.y, dx: b.dx, dy: b.dy }
    };

    const command = (target - s.me.y) / paddleSpeed;
    return Number.isFinite(command) ? clamp(command, -1, 1) : 0;
  };
}