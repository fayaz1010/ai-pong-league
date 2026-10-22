function createPlayer() {
  const PI = Math.PI;
  const maxAngle = 55 * PI / 180;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  let previous = null;
  let leftContact = 36, rightContact = 764;
  let discreteHits = true;
  let clampWalls = false;
  let opponentVelocity = 0;
  let lastAim = null;
  let lastPhase = "";
  let commentary = "";

  const shots = [];
  for (let offset = -40; offset <= 40; offset++) {
    const angle = offset / 40 * maxAngle;
    shots.push({
      offset,
      cos: Math.cos(angle),
      sin: Math.sin(angle)
    });
  }
  shots.push({ offset: -43, cos: Math.cos(maxAngle), sin: -Math.sin(maxAngle) });
  shots.push({ offset: 43, cos: Math.cos(maxAngle), sin: Math.sin(maxAngle) });

  function fold(y, radius, height) {
    const span = height - 2 * radius;
    let z = (y - radius) % (2 * span);
    if (z < 0) z += 2 * span;
    return radius + (z <= span ? z : 2 * span - z);
  }

  function project(y, vy, time, radius, height, stepped) {
    if (!clampWalls || !stepped) {
      return fold(y + vy * time, radius, height);
    }

    let remaining = Math.max(0, Math.round(time));
    for (let i = 0; i < 12 && remaining > 0; i++) {
      if (Math.abs(vy) < 1e-10) return y;
      const wall = vy > 0 ? height - radius : radius;
      const untilWall = Math.max(
        1, Math.ceil((wall - y) / vy - 1e-9)
      );
      if (untilWall > remaining) return y + vy * remaining;
      y = wall;
      vy = -vy;
      remaining -= untilWall;
    }
    return fold(y + vy * remaining, radius, height);
  }

  function flightTime(distance, vx) {
    const t = Math.max(0, distance / Math.max(1e-9, Math.abs(vx)));
    return discreteHits ? Math.max(1, Math.ceil(t - 1e-9)) : t;
  }

  function speak(key, text) {
    if (key !== lastPhase) {
      lastPhase = key;
      commentary = text;
    }
  }

  return function move(s) {
    const b = s.ball;
    const radius = Number.isFinite(b.r) ? b.r : 6;
    const height = s.court.h;
    const half = s.paddle.h / 2;
    const paddleSpeed = s.paddle.speed;
    const minY = half, maxY = height - half;
    const score = s.score.me + ":" + s.score.opp;

    if (previous && s.frame === previous.frame + 1 &&
        previous.score === score) {
      const p = previous;
      const observedVelocity = s.opp.y - p.oppY;
      opponentVelocity = 0.65 * observedVelocity + 0.35 * opponentVelocity;

      if (p.dx * b.dx < 0) {
        const face = b.dx > 0 ? s.paddle.faceX : s.paddle.oppFaceX;
        const radiusContact = face + (b.dx > 0 ? radius : -radius);
        let contact = null;

        if (Math.abs(b.x - radiusContact) < 0.01) contact = radiusContact;
        else if (Math.abs(b.x - face) < 0.01) contact = face;

        if (contact !== null) {
          discreteHits = true;
          if (b.dx > 0) leftContact = contact;
          else rightContact = contact;
        } else {
          const boundary = b.dx > 0 ? leftContact : rightContact;
          const t = (boundary - p.x) / p.dx;
          if (t >= 0 && t <= 1.001) {
            const expectedX = boundary + b.dx * (1 - t);
            if (Math.abs(expectedX - b.x) < 0.1) discreteHits = false;
          }
        }
      } else if (p.dy * b.dy < 0) {
        const rawY = p.y + p.dy;
        if (rawY < radius || rawY > height - radius) {
          const reflected = fold(rawY, radius, height);
          const clipped = clamp(rawY, radius, height - radius);
          if (Math.abs(reflected - clipped) > 0.05) {
            clampWalls = Math.abs(b.y - clipped) < Math.abs(b.y - reflected);
          }
        }
      }
    } else {
      opponentVelocity = 0;
      lastAim = null;
    }

    previous = {
      frame: s.frame, score,
      x: b.x, y: b.y, dx: b.dx, dy: b.dy,
      oppY: s.opp.y
    };

    const distance = rightContact - leftContact;
    const speed = Math.hypot(b.dx, b.dy);
    let desired = height / 2;
    let target;

    if (b.dx < -1e-8) {
      const time = flightTime(b.x - leftContact, b.dx);
      const steps = Math.max(1, Math.ceil(time - 1e-9));
      const impactY = project(
        b.y, b.dy, time, radius, height, discreteHits
      );
      target = impactY;

      const reachableLow = Math.max(minY, s.me.y - paddleSpeed * steps);
      const reachableHigh = Math.min(maxY, s.me.y + paddleSpeed * steps);
      const nextSpeed = Math.min(24, speed * 1.05);

      let opponentAtHit = clamp(
        s.opp.y + opponentVelocity * Math.min(time, 6),
        minY, maxY
      );
      const recoveryWeight = clamp((time - 12) / 65, 0, 0.8);
      opponentAtHit += (height / 2 - opponentAtHit) * recoveryWeight;

      let bestScore = -Infinity;
      let bestLanding = height / 2;
      let bestBank = false;

      function evaluate(offset, cos, sin) {
        const center = impactY - offset;
        if (center < reachableLow - 1e-7 ||
            center > reachableHigh + 1e-7) return;

        const vx = nextSpeed * cos;
        const vy = nextSpeed * sin;
        const travel = flightTime(distance, vx);
        const landing = project(
          impactY, vy, travel, radius, height, discreteHits
        );

        const gap = Math.abs(landing - opponentAtHit);
        const winningMargin = gap - half - radius - paddleSpeed * travel;
        let value = winningMargin;

        // Prefer margins that survive small timing or collision differences.
        value -= Math.max(0, Math.abs(offset) - 38) * 0.45;

        if (lastAim !== null) {
          value -= Math.min(80, Math.abs(center - lastAim)) * 0.025;
        }

        // Do not win the placement battle and lose to the immediate reply.
        if (nextSpeed > 12 && winningMargin < 8) {
          const replySpeed = Math.min(24, nextSpeed * 1.05);
          const available = paddleSpeed * travel;
          const oppLow = Math.max(
            minY, landing - half - radius,
            opponentAtHit - available
          );
          const oppHigh = Math.min(
            maxY, landing + half + radius,
            opponentAtHit + available
          );

          let counterRisk = -Infinity;
          if (oppLow <= oppHigh) {
            for (let j = 0; j <= 8; j++) {
              const opponentCenter = oppLow + (oppHigh - oppLow) * j / 8;
              const angle = clamp(
                (landing - opponentCenter) / half, -1, 1
              ) * maxAngle;
              const returnTime = flightTime(
                distance, replySpeed * Math.cos(angle)
              );
              const returnY = project(
                landing, replySpeed * Math.sin(angle),
                returnTime, radius, height, discreteHits
              );
              const risk = Math.abs(returnY - center) -
                paddleSpeed * (travel + returnTime - 1) - half - radius + 3;
              counterRisk = Math.max(counterRisk, risk);
            }
          }
          value -= 1.8 * Math.max(0, counterRisk + 12);
        }

        if (value > bestScore) {
          bestScore = value;
          desired = center;
          bestLanding = landing;
          const rawLanding = impactY + vy * travel;
          bestBank = rawLanding < radius || rawLanding > height - radius;
        }
      }

      for (let i = 0; i < shots.length; i++) {
        const shot = shots[i];
        evaluate(shot.offset, shot.cos, shot.sin);
      }

      // Include the exact reachable boundaries: a one-pixel save matters.
      const extraCenters = [
        reachableLow, reachableHigh,
        clamp(impactY, reachableLow, reachableHigh),
        clamp(s.me.y, reachableLow, reachableHigh)
      ];
      for (let i = 0; i < extraCenters.length; i++) {
        const offset = impactY - extraCenters[i];
        if (Math.abs(offset) <= half + radius - 1) {
          const angle = clamp(offset / half, -1, 1) * maxAngle;
          evaluate(offset, Math.cos(angle), Math.sin(angle));
        }
      }

      if (bestScore === -Infinity) {
        desired = clamp(impactY, minY, maxY);
        speak("save", "Full stretch. Every pixel counts.");
      } else {
        const high = bestLanding < height / 2;
        const key = (bestBank ? "bank" : "drive") + (high ? "high" : "low");
        speak(key, bestBank
          ? (high ? "Bank shot upstairs. Chase that."
                  : "Bank shot downstairs. Chase that.")
          : (high ? "Taking the high lane. Make them run."
                  : "Taking the low lane. Make them run."));
      }
      lastAim = desired;
    } else if (b.dx > 1e-8) {
      lastAim = null;

      const opponentTime = flightTime(rightContact - b.x, b.dx);
      const impactY = project(
        b.y, b.dy, opponentTime, radius, height, discreteHits
      );
      const opponentSteps = Math.max(1, Math.ceil(opponentTime - 1e-9));
      const opponentLow = Math.max(
        minY, impactY - half - radius,
        s.opp.y - paddleSpeed * opponentSteps
      );
      const opponentHigh = Math.min(
        maxY, impactY + half + radius,
        s.opp.y + paddleSpeed * opponentSteps
      );

      if (opponentLow <= opponentHigh) {
        const replySpeed = Math.min(24, speed * 1.05);
        let requiredLow = -Infinity;
        let requiredHigh = Infinity;

        // Find the position covering the widest set of legal replies.
        // The opponent's reachable impact interval shrinks every frame.
        for (let i = 0; i <= 32; i++) {
          const center = opponentLow + (opponentHigh - opponentLow) * i / 32;
          const angle = clamp((impactY - center) / half, -1, 1) * maxAngle;
          const returnTime = flightTime(distance, replySpeed * Math.cos(angle));
          const returnY = project(
            impactY, replySpeed * Math.sin(angle),
            returnTime, radius, height, discreteHits
          );
          const coverage = paddleSpeed * Math.max(0, returnTime - 1) +
            half + radius - 4;
          requiredLow = Math.max(requiredLow, returnY - coverage);
          requiredHigh = Math.min(requiredHigh, returnY + coverage);
        }

        desired = clamp((requiredLow + requiredHigh) / 2, minY, maxY);
        speak("read", "Reading their angle. Covering the reply.");
      } else {
        desired = height / 2;
        speak("miss", "That looks out of reach. Reset and watch.");
      }
    } else {
      lastAim = null;
      speak("ready", "Centered. Ready for the next serve.");
    }

    const command = clamp(
      (clamp(desired, minY, maxY) - s.me.y) / paddleSpeed, -1, 1
    );
    const result = {
      move: Number.isFinite(command) ? command : 0,
      say: commentary
    };
    if (Number.isFinite(target)) result.target = target;
    return result;
  };
}