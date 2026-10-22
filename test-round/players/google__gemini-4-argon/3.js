function createPlayer() {
    let prevBallDx = 0;
    let detectedSurfaceHits = false;
    let detectedEdgeHits = false;

    function reflectY(y, minY, maxY) {
        const range = maxY - minY;
        if (range <= 0) return (minY + maxY) / 2;
        let rel = (y - minY) % (2 * range);
        if (rel < 0) rel += 2 * range;
        return rel <= range ? minY + rel : minY + 2 * range - rel;
    }

    return function move(s) {
        const { me, opp, ball, court, paddle } = s;
        const { x: bx, y: by, dx: bdx, dy: bdy, r: br } = ball;
        const { h: ch } = court;
        const { h: ph, speed: ps, faceX, oppFaceX } = paddle;

        const minBallY = br;
        const maxBallY = ch - br;
        const minPadY = ph / 2;
        const maxPadY = ch - ph / 2;

        // Detect exact arena physics on paddle bounce (radius offset vs center offset)
        if (prevBallDx < 0 && bdx > 0 && bx < 100) {
            if (bx > faceX + br - 0.1) detectedSurfaceHits = true;
            if (bx < faceX + 2.0) detectedEdgeHits = true;
        }
        prevBallDx = bdx;

        const hitX = (detectedSurfaceHits && !detectedEdgeHits) ? (faceX + br) :
                     (detectedEdgeHits && !detectedSurfaceHits) ? faceX : (faceX + br / 2);
        const oppHitX = (detectedSurfaceHits && !detectedEdgeHits) ? (oppFaceX - br) :
                        (detectedEdgeHits && !detectedSurfaceHits) ? oppFaceX : (oppFaceX - br / 2);

        let targetY = ch / 2;

        if (bdx < 0) {
            // Ball is coming towards us
            const dist = bx - hitX;
            const tToMe = Math.max(0, dist / -bdx);
            const impactY = reflectY(by + bdy * tToMe, minBallY, maxBallY);

            // Predict opponent position when ball reaches us (assume they track ball or center)
            let estOppYAtHit = opp.y;
            const oppTargetNow = (Math.abs(opp.y - ch / 2) < 35 && Math.abs(by - ch / 2) > 60) ? ch / 2 : impactY;
            const oppMoveDir = Math.sign(oppTargetNow - opp.y);
            estOppYAtHit = Math.max(minPadY, Math.min(maxPadY, opp.y + oppMoveDir * Math.min(Math.abs(oppTargetNow - opp.y), tToMe * ps * 0.6)));

            const currentSpeed = Math.hypot(bdx, bdy);
            const nextSpeed = Math.min(24, currentSpeed * 1.05);
            const travelDist = oppHitX - hitX;

            const safeHalfSpan = (ph / 2) + br - 4; // Safe margin inside the 46px reach
            const maxReachAtHit = tToMe * ps;
            const reachableMinPad = Math.max(minPadY, me.y - maxReachAtHit);
            const reachableMaxPad = Math.min(maxPadY, me.y + maxReachAtHit);

            let bestScore = -Infinity;
            let bestPadY = impactY;
            let foundReachable = false;

            const numSteps = 36;
            for (let i = 0; i <= numSteps; i++) {
                const frac = -1 + (2 * i) / numSteps;
                const candPadY = Math.max(minPadY, Math.min(maxPadY, impactY - frac * safeHalfSpan));

                if (candPadY < reachableMinPad - 1 || candPadY > reachableMaxPad + 1) continue;
                foundReachable = true;

                const actualOffset = Math.max(-1, Math.min(1, (impactY - candPadY) / (ph / 2)));
                const angle = actualOffset * 55 * (Math.PI / 180);
                const rvx = nextSpeed * Math.cos(angle);
                const rvy = nextSpeed * Math.sin(angle);

                const tToOpp = travelDist / rvx;
                const oppArrivalY = reflectY(impactY + rvy * tToOpp, minBallY, maxBallY);

                const oppMaxReach = tToOpp * ps;
                const distFromEst = Math.abs(oppArrivalY - estOppYAtHit);
                const distFromCurr = Math.abs(oppArrivalY - opp.y);

                // Score based on how badly we beat the opponent's reach
                let score = (distFromEst * 0.65 + distFromCurr * 0.35) - oppMaxReach;

                // Favor fast, sharp-angled shots that force wall bounces
                score += Math.abs(actualOffset) * 18;

                // Corner shots are harder for opponents due to paddle clamping
                if (oppArrivalY < minPadY || oppArrivalY > maxPadY) {
                    score += 12;
                }

                // Safety penalty for using the extreme edge of our paddle at high speeds
                if (Math.abs(frac) > 0.85) {
                    score -= (Math.abs(frac) - 0.85) * (currentSpeed > 16 ? 80 : 30);
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestPadY = candPadY;
                }
            }

            targetY = foundReachable ? bestPadY : impactY;

        } else if (bdx > 0) {
            // Ball is going towards opponent: anticipate return window
            const distToOpp = Math.max(0, oppHitX - bx);
            const tToOpp = distToOpp / bdx;
            const oppImpactY = reflectY(by + bdy * tToOpp, minBallY, maxBallY);

            const currentSpeed = Math.hypot(bdx, bdy);
            const nextSpeed = Math.min(24, currentSpeed * 1.05);
            const travelDist = oppHitX - hitX;

            // Estimate opponent's paddle Y at impact
            const oppMaxMove = tToOpp * ps;
            const estOppPadY = Math.max(minPadY, Math.min(maxPadY,
                opp.y + Math.sign(oppImpactY - opp.y) * Math.min(Math.abs(oppImpactY - opp.y), oppMaxMove)
            ));

            // Opponent might shift their paddle slightly around estOppPadY to aim
            const Slack = Math.min(25, Math.max(0, oppMaxMove - Math.abs(oppImpactY - opp.y)));
            const minOppPad = Math.max(minPadY, estOppPadY - Slack);
            const maxOppPad = Math.min(maxPadY, estOppPadY + Slack);

            let minRetY = ch;
            let maxRetY = 0;

            const samples = 9;
            for (let i = 0; i <= samples; i++) {
                const testOppY = minOppPad + (maxOppPad - minOppPad) * (i / samples);
                const off = Math.max(-1, Math.min(1, (oppImpactY - testOppY) / (ph / 2)));
                const ang = off * 55 * (Math.PI / 180);
                const rvx = nextSpeed * Math.cos(ang);
                const rvy = nextSpeed * Math.sin(ang);
                const tBack = travelDist / rvx;
                const retY = reflectY(oppImpactY + rvy * tBack, minBallY, maxBallY);
                if (retY < minRetY) minRetY = retY;
                if (retY > maxRetY) maxRetY = retY;
            }

            // Position at the midpoint of the opponent's possible return window, blended slightly with court center
            const expectedMid = (minRetY + maxRetY) / 2;
            const weight = Math.min(0.75, 1 - (tToOpp / 140));
            targetY = (ch / 2) * (1 - weight) + expectedMid * weight;
        }

        targetY = Math.max(minPadY, Math.min(maxPadY, targetY));
        const diff = targetY - me.y;
        if (Math.abs(diff) < 1e-4) return 0;
        return Math.max(-1, Math.min(1, diff / ps));
    };
}