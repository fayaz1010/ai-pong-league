function createPlayer() {
  "use strict";

  const A = 55 * Math.PI / 180;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // Learn whether the engine uses swept or frame-end paddle collisions.
  const models = [
    { radius: true, step: true, error: 0 },
    { radius: false, step: true, error: 1 },
    { radius: true, step: false, error: 2 },
    { radius: false, step: false, error: 2 }
  ];

  let previous = null;
  let modelIndex = 0;
  let wallEvidence = 0;
  let opponentVelocity = 0;
  let lastAim = 250;
  let history = [];
  let commentary = "Reading the bounce. Finding the weakness.";
  let commentKey = "";
  let commentFrame = -100;

  function vertical(y, dy, time, r, h) {
    const span = h - 2 * r;
    if (time <= 0 || Math.abs(dy) < 1e-10) return y;

    if (wallEvidence > 1) {
      // Some engines discard overshoot instead of reflecting it.
      const speed = Math.abs(dy);
      const firstWall = dy > 0 ? h - r : r;
      const first = Math.max(
        1,
        Math.ceil(Math.abs(firstWall - y) / speed - 1e-9)
      );
      if (time < first) return clamp(y + dy * time, r, h);

      const remaining = time - first;
      const period = Math.max(1, Math.ceil(span / speed - 1e-9));
      const traversals = Math.floor(remaining / period);
      const rest = remaining - traversals * period;
      const odd = traversals % 2;
      const start = odd ? h - firstWall : firstWall;
      const direction = (dy > 0 ? -1 : 1) * (odd ? -1 : 1);
      return clamp(start + direction * speed * rest, r, h);
    }

    let z = (y - r + dy * time) % (2 * span);
    if (z < 0) z += 2 * span;
    return r + (z <= span ? z : 2 * span - z);
  }

  function forecast(ball, right, model, s) {
    const r = ball.r || 6;
    const face = right ? s.paddle.oppFaceX : s.paddle.faceX;
    const plane = face + (model.radius ? (right ? -r : r) : 0);
    const t = Math.max(0, (plane - ball.x) / ball.dx);
    const frames = Math.max(1, Math.ceil(t - 1e-9));
    const duration = model.step ? frames : t;
    return {
      y: vertical(ball.y, ball.dy, duration, r, s.court.h),
      t,
      frames,
      plane
    };
  }

  function speak(key, text, frame, urgent) {
    if (key !== commentKey &&
        (urgent || frame - commentFrame >= 15)) {
      commentary = text;
      commentKey = key;
      commentFrame = frame;
    }
  }

  function learn(s) {
    if (!previous) return;

    const p = previous;
    const b = s.ball;
    const old = p.ball;
    const samePoint =
      p.score.me === s.score.me && p.score.opp === s.score.opp;

    opponentVelocity =
      0.55 * opponentVelocity + 0.45 * (s.opp.y - p.opp.y);

    if (!samePoint) {
      opponentVelocity = 0;
      lastAim = s.me.y;
      return;
    }

    const bounced = old.dx * b.dx < 0;
    const ownBounce = bounced && old.dx < 0 && old.x < 100;
    const theirBounce =
      bounced && old.dx > 0 && old.x > s.court.w - 100;

    if (!bounced && old.dy * b.dy < 0 &&
        Math.abs(old.dx - b.dx) < 0.001) {
      const r = old.r || 6;
      const raw = old.y + old.dy;
      if (raw < r || raw > s.court.h - r) {
        const snapped = clamp(raw, r, s.court.h - r);
        const reflected = raw < r
          ? 2 * r - raw
          : 2 * (s.court.h - r) - raw;
        const snapError = Math.abs(b.y - snapped);
        const reflectionError = Math.abs(b.y - reflected);
        if (snapError + 0.05 < reflectionError) {
          wallEvidence = Math.min(8, wallEvidence + 2);
        } else if (reflectionError + 0.05 < snapError) {
          wallEvidence = Math.max(-8, wallEvidence - 2);
        }
      }
    }

    if (!ownBounce && !theirBounce) return;

    const center = ownBounce ? s.me.y : s.opp.y;
    let offset = Math.atan2(b.dy, Math.abs(b.dx)) / A;
    let observedY = b.y;

    if (Math.abs(offset) < 0.985) {
      const a = center + offset * s.paddle.h / 2;
      const reflected = center - offset * s.paddle.h / 2;
      if (Math.abs(a - b.y) <= Math.abs(reflected - b.y)) {
        observedY = a;
      } else {
        observedY = reflected;
        offset = -offset;
      }
    }

    const r = old.r || 6;
    const face = theirBounce ? s.paddle.oppFaceX : s.paddle.faceX;
    const radiusPlane = face + (theirBounce ? -r : r);

    for (const model of models) {
      const prediction = forecast(old, theirBounce, model, s);
      let error = Math.min(900, (prediction.y - observedY) ** 2);
      if (prediction.frames !== 1) error += 100;

      if (Math.abs(b.x - radiusPlane) < 0.01 && !model.radius) {
        error += 36;
      } else if (Math.abs(b.x - face) < 0.01 && model.radius) {
        error += 36;
      }

      model.error = 0.7 * model.error + 0.3 * error;
    }

    modelIndex = 0;
    for (let i = 1; i < models.length; i++) {
      if (models[i].error < models[modelIndex].error) modelIndex = i;
    }

    if (theirBounce) {
      history.push({
        y: clamp(observedY, r, s.court.h - r),
        me: s.me.y,
        offset: clamp(
          (observedY - s.opp.y) / (s.paddle.h / 2),
          -1, 1
        )
      });
      if (history.length > 20) history.shift();
    }
  }

  return function move(s) {
    const b = s.ball;
    if (![b.x, b.y, b.dx, b.dy, s.me.y, s.opp.y]
        .every(Number.isFinite)) return 0;

    learn(s);

    const model = models[modelIndex];
    const h = s.court.h;
    const r = b.r || 6;
    const half = s.paddle.h / 2;
    const paddleSpeed = s.paddle.speed;
    const low = half;
    const high = h - half;
    const middle = h / 2;
    const left = s.paddle.faceX + (model.radius ? r : 0);
    const right = s.paddle.oppFaceX - (model.radius ? r : 0);
    const distance = right - left;
    const returnSpeed = Math.min(24, Math.hypot(b.dx, b.dy) * 1.05);

    let destination = middle;
    let target = middle;

    function shot(y, center) {
      const angle = clamp((y - center) / half, -1, 1) * A;
      const vx = returnSpeed * Math.cos(angle);
      const vy = returnSpeed * Math.sin(angle);
      const t = distance / vx;
      const duration = model.step ? Math.ceil(t - 1e-9) : t;
      return {
        y: vertical(y, vy, duration, r, h),
        t,
        duration,
        bank: y + vy * duration < r || y + vy * duration > h - r
      };
    }

    // Exact inverse-angle candidates supplement the numerical search.
    function cornerCenters(hitY, callback) {
      const span = h - 2 * r;
      for (const landing of [r, r + 12, h - r - 12, h - r]) {
        for (let k = -2; k <= 2; k++) {
          for (const sign of [-1, 1]) {
            const unfolded = r + 2 * k * span + sign * (landing - r);
            const angle = Math.atan2(unfolded - hitY, distance);
            if (Math.abs(angle) <= A + 1e-9) {
              callback(hitY - half * angle / A);
            }
          }
        }
      }
    }

    if (b.dx < -1e-9) {
      const incoming = forecast(b, false, model, s);
      const hitY = incoming.y;
      const n = incoming.frames;
      target = hitY;

      let uncertainty = 0.05;
      for (const alternative of models) {
        const gap = alternative.error - model.error;
        if (gap < 8) {
          const other = forecast(b, false, alternative, s);
          uncertainty = Math.max(
            uncertainty,
            Math.abs(other.y - hitY) * Math.exp(-Math.max(0, gap) / 2)
          );
        }
      }
      uncertainty = Math.min(7, uncertainty);

      const reach = paddleSpeed * n;
      const safeSpan = half + r - 1 - uncertainty;
      const minCenter = Math.max(low, hitY - safeSpan, s.me.y - reach);
      const maxCenter = Math.min(high, hitY + safeSpan, s.me.y + reach);

      if (minCenter > maxCenter) {
        destination = clamp(hitY, low, high);
        speak("stretch", "Full stretch. Every pixel counts.", s.frame, true);
      } else {
        let predictedOpponent = clamp(
          s.opp.y + opponentVelocity * Math.min(n, 6),
          low, high
        );

        // Do not extrapolate a return-to-centre movement through centre.
        if ((s.opp.y - middle) * opponentVelocity < 0 &&
            (predictedOpponent - middle) * (s.opp.y - middle) < 0) {
          predictedOpponent = middle;
        }

        let bestValue = -Infinity;
        let bestCenter = clamp(hitY, minCenter, maxCenter);
        let bestShot = null;

        function evaluate(center) {
          if (center < minCenter - 1e-8 || center > maxCenter + 1e-8) return;
          center = clamp(center, minCenter, maxCenter);

          let total = 0;
          let worst = Infinity;
          let nominal = null;

          for (let j = -1; j <= 1; j++) {
            const impact = clamp(hitY + j * uncertainty, r, h - r);
            const result = shot(impact, center);
            const value =
              Math.abs(result.y - predictedOpponent) -
              paddleSpeed * result.duration +
              0.045 * Math.abs(result.y - middle);

            total += value * (j === 0 ? 2 : 1);
            worst = Math.min(worst, value);
            if (j === 0) nominal = result;
          }

          const value =
            0.65 * total / 4 + 0.35 * worst -
            0.018 * Math.abs(center - lastAim);

          if (value > bestValue) {
            bestValue = value;
            bestCenter = center;
            bestShot = nominal;
          }
        }

        for (let i = 0; i <= 60; i++) {
          evaluate(minCenter + (maxCenter - minCenter) * i / 60);
        }
        evaluate(clamp(lastAim, minCenter, maxCenter));
        evaluate(clamp(hitY, minCenter, maxCenter));
        cornerCenters(hitY, evaluate);

        let step = (maxCenter - minCenter) / 60;
        for (let pass = 0; pass < 3; pass++) {
          const around = bestCenter;
          step /= 3;
          for (let j = -3; j <= 3; j++) evaluate(around + j * step);
        }

        destination = bestCenter;
        lastAim = bestCenter;

        if (bestShot) {
          const top = bestShot.y < middle;
          const margin =
            Math.abs(bestShot.y - predictedOpponent) -
            paddleSpeed * bestShot.duration - half - r;

          if (margin > 5) {
            speak(
              top ? "finishTop" : "finishBottom",
              top ? "Top corner. Their legs cannot get there."
                  : "Bottom corner. That's a very long sprint.",
              s.frame, n <= 2
            );
          } else if (bestShot.bank) {
            speak(
              top ? "bankTop" : "bankBottom",
              top ? "Off the wall, into the top corner."
                  : "Banking low. Chase the bounce.",
              s.frame, false
            );
          } else {
            speak(
              top ? "attackTop" : "attackBottom",
              top ? "Taking the top lane. Make them move."
                  : "Taking the bottom lane. Make them move.",
              s.frame, false
            );
          }
        }
      }
    } else if (b.dx > 1e-9) {
      const arrival = forecast(b, true, model, s);
      const hitY = arrival.y;
      const reach = paddleSpeed * arrival.frames;

      const minCenter = Math.max(
        low, hitY - half - r, s.opp.y - reach
      );
      const maxCenter = Math.min(
        high, hitY + half + r, s.opp.y + reach
      );

      if (minCenter <= maxCenter) {
        const possibilities = [];
        let lowerBound = low;
        let upperBound = high;
        let totalWeight = 0;
        let weightedY = 0;

        function add(center, weight) {
          if (center < minCenter - 1e-8 || center > maxCenter + 1e-8) return;
          const result = shot(hitY, center);
          const allowance = paddleSpeed * result.duration + half + r - 2;

          possibilities.push({ y: result.y, allowance, weight });
          totalWeight += weight;
          weightedY += weight * result.y;
          lowerBound = Math.max(lowerBound, result.y - allowance);
          upperBound = Math.min(upperBound, result.y + allowance);
        }

        for (let i = 0; i <= 32; i++) {
          add(minCenter + (maxCenter - minCenter) * i / 32, 1 / 33);
        }
        cornerCenters(hitY, center => add(center, 0.015));

        // Remember their preferred contact offsets, conditioned on position.
        for (let i = 0; i < history.length; i++) {
          const old = history[i];
          const similarity = Math.exp(
            -Math.abs(old.y - hitY) / 100 -
            Math.abs(old.me - s.me.y) / 220
          );
          const recency = 0.5 + 0.5 * (i + 1) / history.length;
          add(
            hitY - old.offset * half,
            5 * similarity * recency / history.length
          );
        }

        if (arrival.frames <= 5) {
          const projected = clamp(
            s.opp.y + opponentVelocity * arrival.frames,
            minCenter, maxCenter
          );
          add(projected, 2 * (6 - arrival.frames) / 5);
        }

        const expectedY = weightedY / totalWeight;
        const minimax = clamp((lowerBound + upperBound) / 2, low, high);
        let bestCost = Infinity;
        let bestPosition = minimax;

        function assess(position) {
          position = clamp(position, low, high);
          let worstMiss = 0;
          let expectedMiss = 0;
          let expectedDistance = 0;

          for (const possibility of possibilities) {
            const d = Math.abs(position - possibility.y);
            const miss = Math.max(0, d - possibility.allowance);
            worstMiss = Math.max(worstMiss, miss);
            expectedMiss += possibility.weight * miss * miss;
            expectedDistance += possibility.weight * d * d;
          }

          const cost =
            0.16 * worstMiss * worstMiss +
            expectedMiss / totalWeight +
            0.0006 * expectedDistance / totalWeight +
            0.0001 * (position - minimax) ** 2;

          if (cost < bestCost) {
            bestCost = cost;
            bestPosition = position;
          }
        }

        for (let y = low; y <= high; y += 10) assess(y);
        assess(high);
        assess(minimax);
        assess(s.me.y);
        if (lowerBound <= upperBound) {
          assess(clamp(expectedY, lowerBound, upperBound));
        }
        const coarse = bestPosition;
        for (let d = -8; d <= 8; d += 2) assess(coarse + d);

        destination = bestPosition;
        target = clamp(expectedY, r, h - r);

        if (arrival.frames <= 7) {
          speak(
            "read",
            "Watching their paddle. Cutting off the reply.",
            s.frame, false
          );
        } else {
          speak(
            "recover",
            "Shot away. Covering the dangerous replies.",
            s.frame, false
          );
        }
      } else {
        destination = middle;
        speak("pressure", "They need a miracle. Staying ready.", s.frame, false);
      }
    }

    previous = {
      ball: { x: b.x, y: b.y, dx: b.dx, dy: b.dy, r },
      me: { y: s.me.y },
      opp: { y: s.opp.y },
      score: { me: s.score.me, opp: s.score.opp }
    };

    return {
      move: clamp((destination - s.me.y) / paddleSpeed, -1, 1),
      say: commentary,
      target
    };
  };
}