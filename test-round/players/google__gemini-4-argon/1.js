function createPlayer() {
    let prevBallDx = 0;
    let oppHistory = [];
    let isMirror = true;
    let isCenter = true;
    let isStatic = true;
    
    // Calibrated physics constants
    let bounceMinY = 6;
    let bounceMaxY = 494;
    let hitX = 36;
    let oppHitX = 764;
    let prevBallY = null;
    let prevBallDy = null;

    function reflectY(y, minY, maxY) {
        const H = maxY - minY;
        if (H <= 0) return (minY + maxY) / 2;
        let mod = (y - minY) % (2 * H);
        if (mod < 0) mod += 2 * H;
        return mod <= H ? minY + mod : minY + 2 * H - mod;
    }

    function predict(x, y, dx, dy, targetX, minY, maxY) {
        if (dx === 0) return { y: y, frames: 0, bounces: 0 };
        const frames = (targetX - x) / dx;
        if (frames <= 0) return { y: y, frames: 0, bounces: 0 };
        const rawY = y + dy * frames;
        const H = maxY - minY;
        const bounces = Math.abs(Math.floor((rawY - minY) / H));
        const finalY = reflectY(rawY, minY, maxY);
        return { y: finalY, frames: frames, bounces: bounces };
    }

    return function move(s) {
        const { me, opp, ball, court, paddle } = s;
        const halfPaddle = paddle.h / 2;
        const pMinY = halfPaddle;
        const pMaxY = court.h - halfPaddle;

        // 1. Dynamic calibration of wall bounce bounds
        if (prevBallDy !== null && ball.dy !== prevBallDy && Math.sign(ball.dy) !== Math.sign(prevBallDy)) {
            if (ball.y < court.h / 2 && prevBallY < 20) {
                if (prevBallY < 4) bounceMinY = 0;
            } else if (ball.y > court.h / 2 && prevBallY > court.h - 20) {
                if (prevBallY > court.h - 4) bounceMaxY = court.h;
            }
        }

        // 2. Dynamic calibration of paddle hit X plane and opponent profiling
        if (prevBallDx !== 0 && Math.sign(ball.dx) !== Math.sign(prevBallDx)) {
            if (ball.dx > 0 && ball.x < 100) {
                const estHitX = ball.x - ball.dx;
                if (estHitX >= 28 && estHitX <= 40) hitX = estHitX;
            } else if (ball.dx < 0 && ball.x > 700) {
                const estOppX = ball.x - ball.dx;
                if (estOppX >= 760 && estOppX <= 772) oppHitX = estOppX;
            }
        }

        // Track opponent behavior when ball moves away from them
        if (ball.dx < 0 && ball.x < 650 && ball.x > 150) {
            if (Math.abs(opp.y - ball.y) > 40) isMirror = false;
            if (Math.abs(opp.y - court.h / 2) > 40) isCenter = false;
        }
        if (oppHistory.length > 0 && Math.abs(opp.y - oppHistory[oppHistory.length - 1]) > 0.1) {
            isStatic = false;
        }
        oppHistory.push(opp.y);
        if (oppHistory.length > 20) oppHistory.shift();

        prevBallY = ball.y;
        prevBallDy = ball.dy;
        prevBallDx = ball.dx;

        let targetY = court.h / 2;

        if (ball.dx < 0) {
            // BALL COMING TOWARD US
            let currentTargetX = ball.x < hitX ? ball.x : hitX;
            const pred = predict(ball.x, ball.y, ball.dx, ball.dy, currentTargetX, bounceMinY, bounceMaxY);
            const impactY = pred.y;
            const framesToHit = pred.frames;

            const speed = Math.hypot(ball.dx, ball.dy);
            const nextSpeed = Math.min(24, speed * 1.05);

            // Margin of safety on our paddle
            // Shrinks slightly at very high speeds to prioritize just hitting the ball, 
            // otherwise aims up to 37px from center (out of 46px possible) for sharp angles.
            const maxSafeOffset = Math.max(25, 38 - (speed / 24) * 8);

            let bestOffset = 0;
            let maxScore = -Infinity;

            // Predict where the opponent will be when the ball reaches us
            let oppAtHitY = opp.y;
            if (isStatic) {
                oppAtHitY = opp.y;
            } else if (isMirror) {
                oppAtHitY = Math.max(pMinY, Math.min(pMaxY, impactY));
            } else if (isCenter) {
                const distToCenter = (court.h / 2) - opp.y;
                const moveAmt = Math.sign(distToCenter) * Math.min(Math.abs(distToCenter), framesToHit * paddle.speed);
                oppAtHitY = opp.y + moveAmt;
            } else {
                // Blend current position with center-drifting assumption
                oppAtHitY = opp.y * 0.6 + (court.h / 2) * 0.4;
            }

            // Evaluate 41 possible hit offsets across our paddle face
            const steps = 40;
            for (let i = 0; i <= steps; i++) {
                const frac = (i / steps) * 2 - 1; // [-1, 1]
                const candidatePaddleY = Math.max(pMinY, Math.min(pMaxY, impactY - frac * maxSafeOffset));
                
                // Check if we can actually reach this paddle position in time (with 2 frames buffer)
                const distNeeded = Math.abs(candidatePaddleY - me.y);
                const maxReach = Math.max(0, framesToHit - 1.5) * paddle.speed;
                if (distNeeded > maxReach) continue;

                const actualOffset = (impactY - candidatePaddleY) / 40;
                const clampedOffset = Math.max(-1, Math.min(1, actualOffset));
                const bounceAngle = clampedOffset * 55 * (Math.PI / 180);

                const ndx = nextSpeed * Math.cos(bounceAngle);
                const ndy = nextSpeed * Math.sin(bounceAngle);

                const oppPred = predict(currentTargetX, impactY, ndx, ndy, oppHitX, bounceMinY, bounceMaxY);
                
                // How many frames of movement does the opponent need vs how many they have?
                const oppDistNeeded = Math.max(0, Math.abs(oppPred.y - oppAtHitY) - (halfPaddle - 4));
                const oppFramesAvailable = oppPred.frames;
                const oppFramesRequired = oppDistNeeded / paddle.speed;

                // Score emphasizes making the shot unreachable, or forcing maximum movement in minimum time
                let score = (oppFramesRequired - oppFramesAvailable) * 10;

                // Bonus for bounces (harder for simple predictors/trackers to follow)
                if (oppPred.bounces === 1) score += 25;
                else if (oppPred.bounces >= 2) score += 40;

                // Bonus for hitting extreme corners
                if (oppPred.y < 45 || oppPred.y > court.h - 45) score += 20;

                // Slight preference for extreme angles to keep ball speed high / time low
                score += Math.abs(clampedOffset) * 8;

                // Tie-breaker: prefer moving our paddle less
                score -= distNeeded * 0.02;

                if (score > maxScore) {
                    maxScore = score;
                    bestOffset = impactY - candidatePaddleY;
                }
            }

            if (maxScore === -Infinity) {
                // Emergency: just get as close to the ball as possible
                targetY = impactY;
            } else {
                targetY = impactY - bestOffset;
            }

            // Last-frame stabilization: avoid missing edge shots due to sudden paddle movement
            if (framesToHit < 3 && Math.abs(impactY - me.y) <= halfPaddle - 4) {
                // Keep moving smoothly toward targetY unless it's already locked
            }

        } else {
            // BALL GOING AWAY TOWARD OPPONENT
            // Predict where it hits opponent, and the min/max possible return trajectories
            const toOpp = predict(ball.x, ball.y, ball.dx, ball.dy, oppHitX, bounceMinY, bounceMaxY);
            const oppImpactY = toOpp.y;
            const framesToOpp = toOpp.frames;

            const speed = Math.hypot(ball.dx, ball.dy);
            const nextSpeed = Math.min(24, speed * 1.05);

            // Simulate opponent's possible returns across their reachable paddle span
            let minReturnY = court.h;
            let maxReturnY = 0;
            let sumReturnY = 0;
            let count = 0;

            for (let offset = -1; offset <= 1; offset += 0.25) {
                const oppPaddleY = oppImpactY - offset * 40;
                // Check if opponent can roughly reach this spot
                if (Math.abs(oppPaddleY - opp.y) <= (framesToOpp + 5) * paddle.speed + halfPaddle) {
                    const angle = offset * 55 * (Math.PI / 180);
                    const ndx = -nextSpeed * Math.cos(angle);
                    const ndy = nextSpeed * Math.sin(angle);
                    const retPred = predict(oppHitX, oppImpactY, ndx, ndy, hitX, bounceMinY, bounceMaxY);
                    if (retPred.y < minReturnY) minReturnY = retPred.y;
                    if (retPred.y > maxReturnY) maxReturnY = retPred.y;
                    sumReturnY += retPred.y;
                    count++;
                }
            }

            if (count > 0) {
                // Position at the midpoint of the opponent's threat cone, weighted slightly toward center
                const coneMid = (minReturnY + maxReturnY) / 2;
                const coneAvg = sumReturnY / count;
                targetY = coneMid * 0.5 + coneAvg * 0.3 + (court.h / 2) * 0.2;
            } else {
                targetY = court.h / 2;
            }
        }

        // Clamp target within valid paddle center bounds
        targetY = Math.max(pMinY, Math.min(pMaxY, targetY));

        const diff = targetY - me.y;
        if (Math.abs(diff) < 0.01) return 0;
        
        const moveCmd = diff / paddle.speed;
        return Math.max(-1, Math.min(1, moveCmd));
    };
}