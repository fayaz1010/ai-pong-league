function createPlayer() {
    let prevBallDx = 0;
    let prevBallX = 400;
    let prevBallY = 250;
    let prevOppY = 250;
    
    let wallOffset = 6; // Default assumption: ball bounces at r and h - r
    let hitOffset = 6;  // Default assumption: ball bounces at faceX + r and oppFaceX - r
    let calibratedWall = false;
    let calibratedHit = false;

    let oppReactionDelay = 0;
    let oppBias = 0; // Tracks if opponent prefers hitting with top or bottom of paddle

    // Predicts the Y coordinate and time (in frames) when the ball reaches targetX
    function predictY(startX, startY, dx, dy, targetX, courtH, wOffset) {
        if (dx === 0) return { y: startY, t: Infinity, bounces: 0 };
        const t = (targetX - startX) / dx;
        if (t < 0) return { y: startY, t: 0, bounces: 0 };
        
        const rawY = startY + dy * t;
        const minY = wOffset;
        const maxY = courtH - wOffset;
        const span = maxY - minY;
        
        if (span <= 0) return { y: courtH / 2, t: t, bounces: 0 };

        // Triangle wave reflection for perfect wall bounces
        let relY = rawY - minY;
        const bounces = Math.floor(Math.abs(relY) / span);
        const period = 2 * span;
        relY = ((relY % period) + period) % period;
        
        const finalY = relY <= span ? minY + relY : maxY - (relY - span);
        return { y: finalY, t: t, bounces: bounces };
    }

    return function move(s) {
        const { me, opp, ball, court, paddle } = s;
        const r = ball.r || 6;
        const pHalf = paddle.h / 2;
        const maxPaddleY = court.h - pHalf;
        const minPaddleY = pHalf;

        // 1. Dynamically calibrate arena physics (center vs edge collision detection)
        if (!calibratedWall && Math.sign(ball.dy) !== Math.sign(prevBallY - (ball.y - ball.dy)) && Math.abs(ball.x - 400) > 50) {
            if (ball.y < 50 || ball.y > court.h - 50) {
                // Estimate where the bounce occurred
                const approxExtreme = ball.dy > 0 ? Math.min(ball.y, prevBallY) : Math.max(ball.y, prevBallY);
                const distToWall = approxExtreme < 250 ? approxExtreme : court.h - approxExtreme;
                wallOffset = distToWall < 3 ? 0 : r;
                calibratedWall = true;
            }
        }

        if (!calibratedHit && Math.sign(ball.dx) !== Math.sign(prevBallDx) && prevBallDx !== 0 && Math.abs(ball.x - 400) > 100) {
            if (ball.dx > 0 && prevBallX < 100) {
                hitOffset = (prevBallX - paddle.faceX) < 3 ? 0 : r;
                calibratedHit = true;
                
                // Observe opponent's previous hit to learn their bias
                const hitOffsetRatio = (prevBallY - prevOppY) / pHalf;
                if (Math.abs(hitOffsetRatio) <= 1.2) {
                    oppBias = 0.8 * oppBias + 0.2 * hitOffsetRatio;
                }
            }
        }

        prevBallDx = ball.dx;
        prevBallX = ball.x;
        prevBallY = ball.y;
        prevOppY = opp.y;

        const myHitX = paddle.faceX + hitOffset;
        const oppHitX = paddle.oppFaceX - hitOffset;

        let targetY = court.h / 2;

        // 2. Strategy when ball is coming toward us
        if (ball.dx < 0) {
            const pred = predictY(ball.x, ball.y, ball.dx, ball.dy, myHitX, court.h, wallOffset);
            const impactY = pred.y;
            const framesLeft = pred.t;

            const currentSpeed = Math.hypot(ball.dx, ball.dy);
            const nextSpeed = Math.min(24, currentSpeed * 1.05);

            // Predict opponent's position when our return reaches them
            // Most AIs either stay where they are, track the ball, or return to center
            const estOppYAtHit = opp.y * 0.6 + (court.h / 2) * 0.4;

            let bestOffset = 0;
            let maxAdvantage = -Infinity;

            // Evaluate 29 possible hit offsets across our paddle face
            const safetyMargin = Math.min(0.92, Math.max(0.75, 1 - (currentSpeed / 100))); // Play safer at high speeds
            const steps = 28;

            for (let i = 0; i <= steps; i++) {
                const offset = ((i / steps) * 2 - 1) * safetyMargin;
                const reqPaddleY = Math.max(minPaddleY, Math.min(maxPaddleY, impactY - offset * pHalf));
                
                // Recalculate true offset after clamping paddle to court bounds
                const actualOffset = Math.max(-1, Math.min(1, (impactY - reqPaddleY) / pHalf));

                // Can we physically reach this paddle position in time?
                const distToMove = Math.abs(reqPaddleY - me.y);
                const framesNeeded = distToMove / paddle.speed;
                if (framesNeeded > framesLeft + 1) continue; // Unreachable angle

                // Simulate return trajectory
                const angle = actualOffset * 55 * (Math.PI / 180);
                const rvx = nextSpeed * Math.cos(angle);
                const rvy = nextSpeed * Math.sin(angle);

                const oppPred = predictY(myHitX, impactY, rvx, rvy, oppHitX, court.h, wallOffset);
                
                // How far the opponent has to move from their estimated position
                const targetClampedForOpp = Math.max(minPaddleY, Math.min(maxPaddleY, oppPred.y));
                const oppDistRequired = Math.abs(targetClampedForOpp - estOppYAtHit);
                const oppTimeAvailable = oppPred.t;
                const oppMaxReach = oppTimeAvailable * paddle.speed;

                // Score this shot
                let score = (oppDistRequired - oppMaxReach);

                // Bonus for shots that bounce (harder for simple predictors)
                if (oppPred.bounces === 1) score += 18;
                else if (oppPred.bounces >= 2) score += 25;

                // Bonus for hitting into corners
                const distFromCenter = Math.abs(oppPred.y - court.h / 2);
                score += distFromCenter * 0.15;

                // Slight penalty for using the extreme edge of our paddle (risk of miscalibration miss)
                score -= Math.pow(Math.abs(actualOffset), 3) * 12;

                if (score > maxAdvantage) {
                    maxAdvantage = score;
                    bestOffset = actualOffset;
                }
            }

            targetY = impactY - bestOffset * pHalf;

            // Last-frame micro-adjustment: if ball is extremely close and we might miss, just aim center of paddle at ball
            if (framesLeft < 3 && Math.abs( impactY - me.y ) > pHalf * 0.85) {
                targetY = impactY;
            }

        } 
        // 3. Strategy when ball is moving away (Defensive Positioning)
        else if (ball.dx > 0) {
            const oppPred = predictY(ball.x, ball.y, ball.dx, ball.dy, oppHitX, court.h, wallOffset);
            const oppImpactY = oppPred.y;
            const currentSpeed = Math.hypot(ball.dx, ball.dy);
            const returnSpeed = Math.min(24, currentSpeed * 1.05);

            // Simulate the range of possible returns from the opponent
            // Assume they might hit with offset in [-0.85, 0.85]
            const simOffsets = [-0.8, -0.4, 0, 0.4, 0.8];
            let minReturnY = court.h;
            let maxReturnY = 0;
            let weightedSumY = 0;
            let totalWeight = 0;

            for (let off of simOffsets) {
                const angle = off * 55 * (Math.PI / 180);
                const rvx = -returnSpeed * Math.cos(angle);
                const rvy = returnSpeed * Math.sin(angle);
                const myPred = predictY(oppHitX, oppImpactY, rvx, rvy, myHitX, court.h, wallOffset);
                
                if (myPred.y < minReturnY) minReturnY = myPred.y;
                if (myPred.y > maxReturnY) maxReturnY = myPred.y;

                // Weight towards opponent's historical bias and straight returns
                const weight = 1 / (1 + Math.abs(off - oppBias));
                weightedSumY += myPred.y * weight;
                totalWeight += weight;
            }

            const midpointReturnY = (minReturnY + maxReturnY) / 2;
            const expectedReturnY = totalWeight > 0 ? weightedSumY / totalWeight : court.h / 2;

            // Blend between the minimax midpoint (covers extremes) and expected return
            const optimalDefensiveY = midpointReturnY * 0.65 + expectedReturnY * 0.35;

            // Gradually transition from center court to the optimal defensive position as ball approaches opponent
            const progress = Math.max(0, Math.min(1, (ball.x - myHitX) / (oppHitX - myHitX)));
            targetY = (court.h / 2) * (1 - progress) + optimalDefensiveY * progress;
        }

        // Clamp target within valid paddle movement bounds
        targetY = Math.max(minPaddleY, Math.min(maxPaddleY, targetY));

        // Calculate exact move in [-1, 1]
        const diff = targetY - me.y;
        if (Math.abs(diff) < 0.01) return 0;
        
        return Math.max(-1, Math.min(1, diff / paddle.speed));
    };
}