function createPlayer() {
  const MAX_ANGLE = 55 * Math.PI / 180;
  let previous = null;
  let wallClamp = false;
  let wallEvidence = 0;
  let continuousEvidence = 0;
  let contactSamples = 0;
  let continuousContact = false;
  let useRadius = true;
  let opponentVelocity = 0;
  let lastAim = null;

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function reflected(y, distance, radius, height) {
    const span = height - 2 * radius;
    let z = (y - radius + distance) % (2 * span);
    if (z < 0) z += 2 * span;
    return radius + (z <= span ? z : 2 * span - z);
  }

  function futureY(y, dy, frames, radius, height) {
    if (!wallClamp || continuousContact) {
      return reflected(y, dy * frames, radius, height);
    }
    if (Math.abs(dy) < 1e-10 || frames <= 0) return y;

    const speed = Math.abs(dy);
    const low = radius;
    const high = height - radius;
    const firstWall = dy > 0 ? high : low;
    const firstTime = Math.max(
      1,
      Math.ceil(Math.abs(firstWall - y) / speed - 1e-9)
    );

    if (frames < firstTime) return y + dy * frames;

    const remaining = frames - firstTime;
    const period = Math.max(1, Math.ceil((high - low) / speed - 1e-9));
    const crossings = Math.floor(remaining / period);
    const remainder = remaining - crossings * period;
    const startsHigh = (dy > 0) !== (crossings % 2 === 1);
    return startsHigh
      ? high - speed * remainder
      : low + speed * remainder;
  }

  function flight(x, y, dx, dy, destination, radius, height) {
    const time = Math.max(0, (destination - x) / dx);
    const steps = Math.max(1, Math.ceil(time - 1e-9));
    return {
      y: futureY(
        y, dy, continuousContact ? time : steps, radius, height
      ),
      steps
    };
  }

  return function move(s) {
    const b = s.ball;
    const p = s.paddle;
    const height = s.court.h;
    const radius = Number.isFinite(b.r) ? b.r : 6;
    const half = p.h / 2;
    const speed = p.speed;
    const minCentre = half;
    const maxCentre = height - half;

    if (previous && s.frame === previous.frame + 1) {
      const old = previous.ball;
      const observedVelocity = s.opp.y - previous.oppY;
      opponentVelocity = 0.65 * observedVelocity + 0.35 * opponentVelocity;

      const paddleBounce = old.dx * b.dx < 0 &&
        (old.x < p.faceX + 65 || old.x > p.oppFaceX - 65);

      if (!paddleBounce && old.dy * b.dy < 0) {
        const rawY = old.y + old.dy;
        if (rawY < radius || rawY > height - radius) {
          const folded = reflected(old.y, old.dy, radius, height);
          const clipped = clamp(rawY, radius, height - radius);
          const difference =
            Math.abs(b.y - folded) - Math.abs(b.y - clipped);
          wallEvidence = clamp(wallEvidence * 0.85 + difference, -30, 30);
          if (wallEvidence > 0.5) wallClamp = true;
          if (wallEvidence < -0.5) wallClamp = false;
        }
      }

      if (paddleBounce) {
        const ours = b.dx > 0;
        const face = ours ? p.faceX : p.oppFaceX;
        const radiusPlane = face + (ours ? radius : -radius);
        const rawX = old.x + old.dx;

        if (Math.abs(b.x - radiusPlane) < 1e-5) {
          useRadius = true;
        } else if (Math.abs(b.x - face) < 1e-5) {
          useRadius = false;
        } else if (ours ? rawX > face : rawX < face) {
          useRadius = true;
        }

        const plane = face + (useRadius ? (ours ? radius : -radius) : 0);
        const fraction = clamp((plane - old.x) / old.dx, 0, 1);
        const angle = Math.atan2(b.dy, Math.abs(b.dx));

        if (Math.abs(angle) < MAX_ANGLE - 0.015 &&
            b.y > radius + 25 && b.y < height - radius - 25) {
          const centre = ours ? s.me.y : s.opp.y;
          const inferredY = centre + half * angle / MAX_ANGLE;
          const discreteY = wallClamp
            ? clamp(old.y + old.dy, radius, height - radius)
            : reflected(old.y, old.dy, radius, height);
          const continuousY = reflected(
            old.y, old.dy * fraction, radius, height
          );
          const discreteError = Math.min(30, Math.abs(inferredY - discreteY));
          const continuousError = Math.min(30, Math.abs(inferredY - continuousY));

          continuousEvidence =
            continuousEvidence * 0.88 + discreteError - continuousError;
          contactSamples++;
          if (contactSamples >= 3) {
            if (continuousEvidence > 2.5) continuousContact = true;
            if (continuousEvidence < -2.5) continuousContact = false;
          }
        }
        lastAim = null;
      }
    } else {
      opponentVelocity = 0;
      lastAim = null;
    }

    previous = {
      frame: s.frame,
      oppY: s.opp.y,
      ball: { x: b.x, y: b.y, dx: b.dx, dy: b.dy }
    };

    const left = p.faceX + (useRadius ? radius : 0);
    const right = p.oppFaceX - (useRadius ? radius : 0);
    const distance = right - left;
    const ballSpeed = Math.hypot(b.dx, b.dy);
    const returnSpeed = Math.min(24, ballSpeed * 1.05);
    const steer = target => clamp((target - s.me.y) / speed, -1, 1);

    if (!Number.isFinite(ballSpeed) || ballSpeed < 0.01) {
      return steer(height / 2);
    }

    if (b.dx < -1e-8) {
      if (b.x < left - Math.abs(b.dx) - radius) {
        return steer(height / 2);
      }

      const arrival = flight(
        b.x, b.y, b.dx, b.dy, left, radius, height
      );
      const hitY = arrival.y;
      const frames = arrival.steps;
      const reach = speed * frames;
      const safeHalf = half + radius - 2;
      const low = Math.max(minCentre, s.me.y - reach, hitY - safeHalf);
      const high = Math.min(maxCentre, s.me.y + reach, hitY + safeHalf);

      if (low > high) {
        return steer(clamp(hitY, minCentre, maxCentre));
      }

      // Conceal the return angle until the last full paddle-width of movement.
      const commitmentFrames = Math.ceil(half / speed) + 1;
      if (frames > commitmentFrames) {
        lastAim = null;
        return steer(clamp(hitY, minCentre, maxCentre));
      }

      const opponentAtImpact = clamp(
        s.opp.y + opponentVelocity * Math.min(frames, 5) * 0.75,
        minCentre,
        maxCentre
      );

      let bestCentre = clamp(hitY, low, high);
      let bestValue = -Infinity;

      function value(centre) {
        const offset = clamp((hitY - centre) / half, -1, 1);
        const angle = offset * MAX_ANGLE;
        const vx = returnSpeed * Math.cos(angle);
        const vy = returnSpeed * Math.sin(angle);
        const outcome = flight(
          left, hitY, vx, vy, right, radius, height
        );

        const separation = Math.abs(outcome.y - opponentAtImpact);
        const margin = separation - speed * outcome.steps - half - radius;

        // Physical reach dominates; prefer reliable, fast shots in close ties.
        return margin
          + 0.008 * Math.abs(outcome.y - height / 2)
          - 0.006 * Math.abs(centre - s.me.y);
      }

      function consider(centre) {
        centre = clamp(centre, low, high);
        const score = value(centre);
        if (score > bestValue) {
          bestValue = score;
          bestCentre = centre;
        }
      }

      consider(low);
      consider(high);
      consider(hitY);
      const samples = 128;
      for (let i = 1; i < samples; i++) {
        consider(low + (high - low) * i / samples);
      }

      // Include analytical corner shots, including wall-bank trajectories.
      const span = height - 2 * radius;
      for (let k = -2; k <= 2; k++) {
        for (const endpoint of [radius + 1, height - radius - 1]) {
          for (const sign of [-1, 1]) {
            const unfolded = radius + 2 * k * span + sign * (endpoint - radius);
            const angle = Math.atan2(unfolded - hitY, distance);
            if (Math.abs(angle) <= MAX_ANGLE) {
              consider(hitY - half * angle / MAX_ANGLE);
            }
          }
        }
      }

      for (const spacing of [0.3, 0.08, 0.02]) {
        const centre = bestCentre;
        for (let j = -4; j <= 4; j++) consider(centre + j * spacing);
      }

      if (lastAim !== null && lastAim >= low && lastAim <= high &&
          value(lastAim) >= bestValue - 0.6) {
        bestCentre = lastAim;
      }
      lastAim = bestCentre;
      return steer(bestCentre);
    }

    if (b.dx > 1e-8) {
      lastAim = null;
      const arrival = flight(
        b.x, b.y, b.dx, b.dy, right, radius, height
      );
      const hitY = arrival.y;

      // Hedge against every return the opponent can still physically choose.
      const enemyReach = speed * arrival.steps;
      const low = Math.max(
        minCentre, s.opp.y - enemyReach, hitY - half - radius
      );
      const high = Math.min(
        maxCentre, s.opp.y + enemyReach, hitY + half + radius
      );

      if (low > high) return steer(height / 2);

      let requiredLow = minCentre;
      let requiredHigh = maxCentre;

      function cover(centre) {
        const offset = clamp((hitY - centre) / half, -1, 1);
        const angle = offset * MAX_ANGLE;
        const vx = -returnSpeed * Math.cos(angle);
        const vy = returnSpeed * Math.sin(angle);
        const back = flight(
          right, hitY, vx, vy, left, radius, height
        );
        const reachable = speed * Math.max(0, back.steps - 1)
          + half + radius - 2;
        requiredLow = Math.max(requiredLow, back.y - reachable);
        requiredHigh = Math.min(requiredHigh, back.y + reachable);
      }

      for (let i = 0; i <= 80; i++) {
        cover(low + (high - low) * i / 80);
      }

      const span = height - 2 * radius;
      for (let k = -2; k <= 2; k++) {
        for (const endpoint of [radius, height - radius]) {
          for (const sign of [-1, 1]) {
            const unfolded = radius + 2 * k * span + sign * (endpoint - radius);
            const angle = Math.atan2(unfolded - hitY, distance);
            if (Math.abs(angle) <= MAX_ANGLE) {
              const centre = hitY - half * angle / MAX_ANGLE;
              if (centre >= low && centre <= high) cover(centre);
            }
          }
        }
      }

      return steer(clamp(
        (requiredLow + requiredHigh) / 2,
        minCentre,
        maxCentre
      ));
    }

    return steer(height / 2);
  };
}