// A starter Pong player (hand-written, not one of the 15 AI players). It predicts where the ball
// will cross your paddle face, bounces included, and moves there. Beat this first, then beat Astra #3.
// Copy it to players/<your-name>/1.js, edit, then:  npm run league -- --only="<your-name> #1"
function createPlayer() {
  let lastSay = '';
  return function move(s) {
    const {me, ball, court, paddle} = s;
    let target = court.h / 2;               // default: wait in the middle
    let say = 'Holding the centre.';
    if (ball.dx < 0) {                      // ball is coming toward me (I am always on the left)
      const frames = (ball.x - ball.r - paddle.faceX) / -ball.dx;
      let y = ball.y + ball.dy * frames;    // straight-line guess...
      const lo = ball.r, hi = court.h - ball.r, span = hi - lo;
      y = ((y - lo) % (2 * span) + 2 * span) % (2 * span);   // ...folded back off the walls
      target = lo + (y > span ? 2 * span - y : y);
      say = `Meeting it at y=${Math.round(target)}.`;
    }
    if (say !== lastSay) lastSay = say;     // only change the line when the plan changes
    const move = Math.max(-1, Math.min(1, (target - me.y) / paddle.speed));
    return {move, say: lastSay, target};
  };
}
