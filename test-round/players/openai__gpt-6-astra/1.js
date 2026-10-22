function createPlayer() {
  let previous = null;
  let opponentVelocity = 0;
  let wallEvidence = 0;
  let collisionEvidence = 0;
  let inset = null;
  let lastAim = 250;

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  function reflected(y, velocity, time, lo, hi) {
    const length = hi - lo;
    const period = 2 * length;
    let z = (y - lo + velocity * time) % period;
    if (z < 0) z += period;
    return lo + (z <= length ? z : period - z);
  }

  // Discrete wall collisions that discard the overshoot.
  function clampedFlight(y, velocity, time, lo, hi) {
    if (Math.abs(velocity) < 1e-10 || time <= 0) return y;

    const speed = Math.abs(velocity);
    const direction = velocity > 0 ? 1 : -1;
    const distance = direction > 0 ? hi - y : y - lo;
    const first = Math.max(1, Math.ceil(distance / speed - 1e-9));

    if (time < first) return clamp(y + velocity * time, lo, hi);

    const remaining = time - first;
    const period = Math.max(1, Math.ceil((hi - lo) / speed - 1e-9));
    const turns = Math.floor(remaining / period);
    const fraction = remaining - turns * period;
    const atHigh = direction > 0 ? turns % 2 === 0 : turns % 2 !== 0;
    return clamp(atHigh ? hi - speed * fraction : lo + speed * fraction, lo, hi);
  }

  return function move(s) {
    const b = s.ball;
    const height = s.court.h;
    const radius = Number.isFinite(b.r) ? b.r : 6;
    const half = s.paddle.h / 2;
    const paddleSpeed = s.paddle.speed;
    const lowCentre = half;
    const highCentre = height - half;
    const middle = height / 2;
    const maxAngle = 55 * Math.PI / 180;

    if (inset === null) inset = radius;

    const consecutive = previous && s.frame === previous.frame + 1;

    if (consecutive) {
      const p = previous.ball;
      const observedVelocity = s.opp.y - previous.opponentY;
      opponentVelocity = Math.abs(observedVelocity) < 0.05
        ? 0
        : 0.65 * observedVelocity + 0.35 * opponentVelocity;

      if (p.dx * b.dx > 0 && p.dy * b.dy < 0) {
        const mirrorY = reflected(p.y, p.dy, 1, radius, height - radius);
        const clampY = clamp(p.y + p.dy, radius, height - radius);
        const difference = Math.abs(b.y - clampY) - Math.abs(b.y - mirrorY);
        if (Math.abs(mirrorY - clampY) > 0.15) {
          wallEvidence = clamp(wallEvidence + difference, -30, 30);
        }
      }

      if (p.dx * b.dx < 0) {
        const leftBounce = p.dx < 0;
        const face = leftBounce ? s.paddle.faceX : s.paddle.oppFaceX;
        const observedInset = leftBounce ? b.x - face : face - b.x;

        // Exact post-collision placement reveals the collision plane.
        if (Math.abs(observedInset) < 0.05) inset = 0;
        else if (Math.abs(observedInset - radius) < 0.05) inset = radius;

        const plane = leftBounce ? face + inset : face - inset;
        const fraction = clamp((plane - p.x) / p.dx, 0, 1);
        const useReflection = wallEvidence > 0.5;
        const fullY = useReflection
          ? reflected(p.y, p.dy, 1, radius, height - radius)
          : clampedFlight(p.y, p.dy, 1, radius, height - radius);
        const impactY = reflected(p.y, p.dy, fraction, radius, height - radius);

        if (Math.abs(fullY - impactY) > 0.5) {
          const discreteError = Math.abs(b.y - fullY);
          const continuousError = Math.abs(b.y - impactY);
          if (Math.min(discreteError, continuousError) < 0.3) {
            collisionEvidence = clamp(
              collisionEvidence + discreteError - continuousError,
              -25,
              25
            );
          }
        }
      }
    } else {
      opponentVelocity = 0;
    }

    const continuous = collisionEvidence > 2;
    const mirrorWalls = wallEvidence > 0.5 || continuous;
    const leftPlane = s.paddle.faceX + inset;
    const rightPlane = s.paddle.oppFaceX - inset;
    const width = rightPlane - leftPlane;

    function flightY(y, velocity, time) {
      return mirrorWalls
        ? reflected(y, velocity, time, radius, height - radius)
        : clampedFlight(y, velocity, time, radius, height - radius);
    }

    function flightTime(distance, velocity) {
      const t = Math.max(0, distance / Math.max(1e-9, Math.abs(velocity)));
      return continuous ? t : Math.max(1, Math.ceil(t - 1e-9));
    }

    const speed = Math.hypot(b.dx, b.dy);
    const returnSpeed = Math.min(24, speed * 1.05);
    let target = middle;

    if (b.dx < -1e-8) {
      const time = flightTime(b.x - leftPlane, b.dx);
      const frames = Math.max(1, Math.ceil(time - 1e-9));
      const impactY = flightY(b.y, b.dy, time);

      const reachableLow = Math.max(lowCentre, s.me.y - paddleSpeed * frames);
      const reachableHigh = Math.min(highCentre, s.me.y + paddleSpeed * frames);

      // Saturated edge hits retain almost six pixels of collision tolerance.
      const aimLow = Math.max(reachableLow, impactY - half - 0.2);
      const aimHigh = Math.min(reachableHigh, impactY + half + 0.2);

      if (aimLow > aimHigh) {
        target = clamp(impactY, lowCentre, highCentre);
      } else {
        let opponentAtImpact = s.opp.y;
        const velocity = opponentVelocity;

        if (Math.abs(velocity) > 0.15) {
          const towardMiddle = (middle - s.opp.y) * velocity > 0;
          if (towardMiddle) {
            const travel = Math.min(
              Math.abs(middle - s.opp.y),
              Math.abs(velocity) * time
            );
            opponentAtImpact += Math.sign(velocity) * travel;
          } else {
            opponentAtImpact += velocity * Math.min(time, 12);
          }
        }
        opponentAtImpact = clamp(opponentAtImpact, lowCentre, highCentre);

        function quality(centre) {
          const offset = clamp((impactY - centre) / half, -1, 1);
          const angle = offset * maxAngle;
          const vx = returnSpeed * Math.cos(angle);
          const vy = returnSpeed * Math.sin(angle);
          const travelTime = flightTime(width, vx);
          const destination = flightY(impactY, vy, travelTime);

          const requiredTravel = Math.max(
            0,
            Math.abs(destination - opponentAtImpact) - half - radius
          );
          const availableTravel = paddleSpeed * travelTime;
          const margin = requiredTravel - availableTravel;

          let value = margin > 0
            ? 3 + margin / 100
            : requiredTravel / Math.max(1, availableTravel);

          // Prefer quick pressure and avoid pointless target oscillation.
          value -= 0.00035 * travelTime;
          value -= 0.000035 * Math.abs(centre - s.me.y);
          value -= 0.000015 * Math.abs(centre - lastAim);
          return value;
        }

        let bestCentre = clamp(lastAim, aimLow, aimHigh);
        let bestValue = quality(bestCentre);
        const divisions = 72;
        const step = (aimHigh - aimLow) / divisions;

        for (let i = 0; i <= divisions; i++) {
          const centre = aimLow + step * i;
          const value = quality(centre);
          if (value > bestValue) {
            bestValue = value;
            bestCentre = centre;
          }
        }

        let refinement = step;
        for (let pass = 0; pass < 3; pass++) {
          const base = bestCentre;
          refinement /= 4;
          for (let i = -4; i <= 4; i++) {
            const centre = clamp(base + i * refinement, aimLow, aimHigh);
            const value = quality(centre);
            if (value > bestValue) {
              bestValue = value;
              bestCentre = centre;
            }
          }
        }

        target = bestCentre;
        lastAim = target;
      }
    } else if (b.dx > 1e-8) {
      const time = flightTime(rightPlane - b.x, b.dx);
      const impactY = flightY(b.y, b.dy, time);
      const frames = Math.max(1, Math.ceil(time - 1e-9));

      const enemyLow = Math.max(
        lowCentre,
        s.opp.y - paddleSpeed * frames,
        impactY - half - radius
      );
      const enemyHigh = Math.min(
        highCentre,
        s.opp.y + paddleSpeed * frames,
        impactY + half + radius
      );

      if (enemyLow <= enemyHigh) {
        const minimumOffset = clamp((impactY - enemyHigh) / half, -1, 1);
        const maximumOffset = clamp((impactY - enemyLow) / half, -1, 1);

        // Position at the opponent's impact to cover the widest possible
        // collection of returns, accounting for each shot's travel time.
        let safeLow = lowCentre;
        let safeHigh = highCentre;

        for (let i = 0; i <= 40; i++) {
          const offset = minimumOffset + (maximumOffset - minimumOffset) * i / 40;
          const angle = offset * maxAngle;
          const travelTime = flightTime(width, returnSpeed * Math.cos(angle));
          const destination = flightY(
            impactY,
            returnSpeed * Math.sin(angle),
            travelTime
          );
          const coverage = paddleSpeed * travelTime + half + radius - 2;
          safeLow = Math.max(safeLow, destination - coverage);
          safeHigh = Math.min(safeHigh, destination + coverage);
        }

        let expectedEnemy = s.opp.y;
        if (Math.abs(opponentVelocity) > 0.2) {
          const interceptCentre = clamp(impactY, lowCentre, highCentre);
          if ((interceptCentre - expectedEnemy) * opponentVelocity > 0) {
            expectedEnemy += Math.sign(opponentVelocity) * Math.min(
              Math.abs(interceptCentre - expectedEnemy),
              Math.abs(opponentVelocity) * time
            );
          } else {
            expectedEnemy += opponentVelocity * Math.min(time, 6);
          }
        }
        expectedEnemy = clamp(expectedEnemy, enemyLow, enemyHigh);

        const expectedAngle = clamp((impactY - expectedEnemy) / half, -1, 1) * maxAngle;
        const expectedTime = flightTime(width, returnSpeed * Math.cos(expectedAngle));
        const expectedY = flightY(
          impactY,
          returnSpeed * Math.sin(expectedAngle),
          expectedTime
        );

        if (safeLow <= safeHigh) {
          target = clamp(expectedY, safeLow, safeHigh);
        } else {
          target = (safeLow + safeHigh) / 2;
          if (time < 10 && Math.abs(opponentVelocity) < 0.2) {
            target += 0.18 * (clamp(expectedY, safeHigh, safeLow) - target);
          }
        }
      }
    }

    target = clamp(target, lowCentre, highCentre);

    previous = {
      frame: s.frame,
      opponentY: s.opp.y,
      ball: { x: b.x, y: b.y, dx: b.dx, dy: b.dy }
    };

    const result = (target - s.me.y) / paddleSpeed;
    return Number.isFinite(result) ? clamp(result, -1, 1) : 0;
  };
}