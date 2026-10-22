function createPlayer() {
  const DEG = Math.PI / 180;
  const MAX_ANGLE = 55 * DEG;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  let previous = null;
  let wallClamps = false;
  let discrete = true;
  let timingKnown = false;
  let leftPlane = null;
  let rightPlane = null;
  let lastOffset = null;
  let opponentOffset = 0;
  let opponentVelocity = 0;
  let lastScore = "";
  let commentary = "Reading the serve.";

  let H, R, HALF, STEP, LOW, HIGH, SPAN;

  function reflect(y) {
    let z = (y - LOW) % (2 * SPAN);
    if (z < 0) z += 2 * SPAN;
    return LOW + (z <= SPAN ? z : 2 * SPAN - z);
  }

  function futureY(y, vy, t) {
    if (!wallClamps || !discrete) return reflect(y + vy * t);
    if (Math.abs(vy) < 1e-10 || t <= 0) return y;

    const speed = Math.abs(vy);
    let direction = vy > 0 ? 1 : -1;
    const distance = direction > 0 ? HIGH - y : y - LOW;
    const first = Math.max(1, Math.ceil(distance / speed - 1e-9));
    let n = Math.max(0, Math.round(t));

    if (n < first) return clamp(y + vy * n, LOW, HIGH);

    n -= first;
    let boundary = direction > 0 ? HIGH : LOW;
    direction = -direction;

    const period = Math.max(1, Math.ceil(SPAN / speed - 1e-9));
    const crossings = Math.floor(n / period);
    const remaining = n - crossings * period;

    if (crossings % 2) {
      boundary = boundary === HIGH ? LOW : HIGH;
      direction = -direction;
    }
    return clamp(boundary + direction * speed * remaining, LOW, HIGH);
  }

  function flightTime(distance, vx) {
    const t = Math.max(0, distance / Math.max(1e-9, Math.abs(vx)));
    return discrete ? Math.max(1, Math.ceil(t - 1e-9)) : t;
  }

  function returnFlight(y, offset, speed) {
    const angle = clamp(offset / HALF, -1, 1) * MAX_ANGLE;
    const vx = speed * Math.cos(angle);
    const vy = speed * Math.sin(angle);
    const time = flightTime(rightPlane - leftPlane, vx);
    return { y: futureY(y, vy, time), time, vy };
  }

  return function move(s) {
    const b = s.ball;
    H = s.court.h;
    R = Number.isFinite(b.r) ? b.r : 6;
    HALF = s.paddle.h / 2;
    STEP = s.paddle.speed;
    LOW = R;
    HIGH = H - R;
    SPAN = HIGH - LOW;

    if (leftPlane === null) {
      leftPlane = s.paddle.faceX + R;
      rightPlane = s.paddle.oppFaceX - R;
    }

    const scoreKey = s.score.me + ":" + s.score.opp;
    const newPoint = scoreKey !== lastScore;
    if (newPoint) {
      lastScore = scoreKey;
      lastOffset = null;
      opponentVelocity = 0;
    }

    if (previous && s.frame === previous.frame + 1 && !newPoint) {
      const p = previous;
      opponentVelocity =
        0.55 * opponentVelocity + 0.45 * (s.opp.y - p.oppY);

      const paddleBounce = p.dx * b.dx < 0;
      if (!paddleBounce && p.dy * b.dy < 0) {
        const raw = p.y + p.dy;
        if (raw < LOW || raw > HIGH) {
          const clipped = clamp(raw, LOW, HIGH);
          const mirrored = reflect(raw);
          if (Math.abs(b.y - clipped) < 0.02 &&
              Math.abs(clipped - mirrored) > 0.05) {
            wallClamps = true;
          } else if (Math.abs(b.y - mirrored) < 0.02 &&
                     Math.abs(clipped - mirrored) > 0.05) {
            wallClamps = false;
          }
        }
      }

      if (paddleBounce) {
        const ours = p.dx < 0;
        const face = ours ? s.paddle.faceX : s.paddle.oppFaceX;
        const radiusPlane = face + (ours ? R : -R);

        if (Math.abs(b.x - radiusPlane) < 0.02) {
          if (ours) leftPlane = radiusPlane;
          else rightPlane = radiusPlane;
        } else if (Math.abs(b.x - face) < 0.02) {
          if (ours) leftPlane = face;
          else rightPlane = face;
        }

        const angle = Math.atan2(b.dy, Math.abs(b.dx));
        const centre = ours ? s.me.y : s.opp.y;

        // The return angle reveals the actual impact coordinate.
        if (Math.abs(angle) < MAX_ANGLE - 0.015) {
          const decodedY = centre + HALF * angle / MAX_ANGLE;
          const plane = ours ? leftPlane : rightPlane;
          const fraction = clamp((plane - p.x) / p.dx, 0, 1);
          const continuousY = reflect(p.y + p.dy * fraction);
          const discreteY = futureY(p.y, p.dy, 1);

          if (Math.abs(decodedY - discreteY) < 0.05 &&
              Math.abs(decodedY - continuousY) > 0.15) {
            discrete = true;
            timingKnown = true;
          } else if (Math.abs(decodedY - continuousY) < 0.05 &&
                     Math.abs(decodedY - discreteY) > 0.15) {
            discrete = false;
            timingKnown = true;
          }
        }

        if (!ours) {
          const observed = clamp(
            (b.y - s.opp.y) / HALF, -1, 1
          );
          opponentOffset = 0.65 * opponentOffset + 0.35 * observed;
        }
        lastOffset = null;
      }
    }

    previous = {
      frame: s.frame,
      x: b.x,
      y: b.y,
      dx: b.dx,
      dy: b.dy,
      oppY: s.opp.y
    };

    function finish(goal, target, say) {
      if (say) commentary = say;
      return {
        move: clamp((clamp(goal, HALF, H - HALF) - s.me.y) / STEP, -1, 1),
        say: commentary,
        target: clamp(target, LOW, HIGH)
      };
    }

    if (!Number.isFinite(b.dx) || Math.abs(b.dx) < 1e-8) {
      return finish(H / 2, H / 2, "Centre court. Ready.");
    }

    const speed = Math.hypot(b.dx, b.dy);

    if (b.dx < 0) {
      if (b.x < leftPlane - R) {
        return finish(H / 2, H / 2, "Reset. Next ball.");
      }

      const time = flightTime(b.x - leftPlane, b.dx);
      const frames = Math.max(1, Math.ceil(time - 1e-9));
      const impact = futureY(b.y, b.dy, time);
      const reach = frames * STEP;

      // Keep a little clearance until the engine's collision timing is known.
      const allowance = timingKnown
        ? HALF + Math.min(3, R * 0.5)
        : HALF - Math.min(7, Math.abs(b.dy) + 1);

      const minCentre = Math.max(HALF, s.me.y - reach, impact - allowance);
      const maxCentre = Math.min(H - HALF, s.me.y + reach, impact + allowance);

      if (minCentre > maxCentre) {
        lastOffset = null;
        return finish(impact, impact, "Full stretch. Keep it alive.");
      }

      // Estimate where the opponent will recover before our strike.
      let opponentStart = s.opp.y;
      if (Math.abs(opponentVelocity) > 0.2) {
        opponentStart += opponentVelocity * Math.min(time, 40);
        if ((H / 2 - s.opp.y) * opponentVelocity > 0) {
          opponentStart = opponentVelocity > 0
            ? Math.min(H / 2, opponentStart)
            : Math.max(H / 2, opponentStart);
        }
      }
      opponentStart = clamp(opponentStart, HALF, H - HALF);

      const nextSpeed = Math.min(24, speed * 1.05);
      let best = null;
      let retained = null;

      function evaluate(centre, isRetained) {
        centre = clamp(centre, minCentre, maxCentre);
        const offset = impact - centre;
        const shot = returnFlight(impact, offset, nextSpeed);
        const distance = Math.abs(shot.y - opponentStart);
        const margin = distance - HALF - R - STEP * shot.time;
        const requiredSpeed = (distance - HALF - R) / shot.time;

        let value = 35 * requiredSpeed;
        value += 0.012 * Math.abs(shot.y - H / 2);
        value -= 0.015 * shot.time;

        // Do not strand ourselves at an edge for a fast counterattack.
        value -= 0.10 * Math.max(
          0, Math.abs(centre - H / 2) - STEP * shot.time
        );
        if (margin > 0) value += 200 + 3 * margin;

        const result = {
          centre, offset, shot, margin, value,
          bank: impact + shot.vy * shot.time < LOW ||
                impact + shot.vy * shot.time > HIGH
        };
        if (!best || value > best.value) best = result;
        if (isRetained) retained = result;
      }

      // Search impact offsets, including exact reachability boundaries.
      for (let i = 0; i <= 64; i++) {
        evaluate(minCentre + (maxCentre - minCentre) * i / 64, false);
      }
      evaluate(impact, false);
      evaluate(impact - HALF, false);
      evaluate(impact + HALF, false);

      if (lastOffset !== null) {
        evaluate(impact - lastOffset, true);
        if (retained && retained.value >= best.value - 2.0) best = retained;
      }
      lastOffset = best.offset;

      let say;
      if (best.margin > 3) {
        say = best.shot.y < H / 2
          ? "Top corner. They cannot get there."
          : "Bottom corner. They cannot get there.";
      } else if (best.bank) {
        say = best.shot.y < H / 2
          ? "Banking it into the top corner."
          : "Banking it into the bottom corner.";
      } else {
        say = best.shot.y < H / 2
          ? "Sending them upstairs."
          : "Low and away. Make them chase.";
      }

      return finish(best.centre, impact, say);
    }

    // While attacking, cover the opponent's entire reachable return cone.
    const time = flightTime(rightPlane - b.x, b.dx);
    const impact = futureY(b.y, b.dy, time);
    const opponentReach = STEP * Math.max(1, Math.ceil(time - 1e-9));

    let minOpponent = Math.max(
      HALF, s.opp.y - opponentReach, impact - HALF - R
    );
    let maxOpponent = Math.min(
      H - HALF, s.opp.y + opponentReach, impact + HALF + R
    );

    if (minOpponent > maxOpponent) {
      return finish(H / 2, impact, "That looks out of reach. Stay ready.");
    }

    const minOffset = clamp(impact - maxOpponent, -HALF, HALF);
    const maxOffset = clamp(impact - minOpponent, -HALF, HALF);
    const nextSpeed = Math.min(24, speed * 1.05);
    const catchMargin = HALF - 7;

    let lower = -Infinity;
    let upper = Infinity;

    for (let i = 0; i <= 48; i++) {
      const offset = minOffset + (maxOffset - minOffset) * i / 48;
      const reply = returnFlight(impact, offset, nextSpeed);
      const coverage = STEP * reply.time + catchMargin;
      lower = Math.max(lower, reply.y - coverage);
      upper = Math.min(upper, reply.y + coverage);
    }

    const likelyOffset = clamp(
      opponentOffset * HALF, minOffset, maxOffset
    );
    const likely = returnFlight(impact, likelyOffset, nextSpeed);
    let staging = (lower + upper) / 2;

    if (lower <= upper) {
      const safeLow = Math.max(HALF, lower);
      const safeHigh = Math.min(H - HALF, upper);
      if (safeLow <= safeHigh) {
        const midpoint = (safeLow + safeHigh) / 2;
        staging = 0.8 * midpoint +
          0.2 * clamp(likely.y, safeLow, safeHigh);
      }
    }

    return finish(
      staging,
      likely.y,
      time < 9
        ? "Reading their paddle. Covering the reply."
        : "Recovering early. No free counters."
    );
  };
}