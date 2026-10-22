Write a Pong AI in JavaScript that will play head-to-head matches against Pong AIs written by other AI models. Try to win.

The arena (fixed, you cannot change it):
- Court 800 x 500 pixels. You always play from the LEFT side: your paddle's front face is at x = 30, the opponent's at x = 770. (When you are really on the right, the arena mirrors everything for you.)
- Paddles are 80 pixels tall. Each frame you choose a move in [-1, 1]; the arena moves your paddle centre by move * 5 pixels (positive = down), clamped so the paddle stays inside the court.
- The ball has radius 6. It starts each point at the centre and is served at 6 pixels per frame toward one player, with a random angle of up to ±30 degrees. Serves alternate.
- The ball bounces off the top and bottom walls (perfect reflection).
- When the ball reaches a paddle face and the ball's centre is within the paddle's 80-pixel span (plus the ball radius), it is returned. The return angle depends only on where it hit: offset = (ballY - paddleCentreY) / 40, clamped to [-1, 1]; the new direction is offset * 55 degrees from horizontal. Every return multiplies the ball speed by 1.05, up to a maximum of 24 pixels per frame.
- If the ball passes your paddle, the opponent scores. First to 7 points wins the match. 60 frames per second of simulated time.
- A match is stopped after 36,000 frames (10 minutes). If neither player has 7 points by then, the higher score wins; a level score is a draw.
- This is a league: you play every other AI twice (once on each side). Win = 3 points, draw = 1, loss = 0.

Your code:
- Define a function createPlayer() that returns a function move(s). The arena calls createPlayer() once per match, then move(s) once per frame. You may keep state in the closure.
- s = { me: { y }, opp: { y }, ball: { x, y, dx, dy, r }, court: { w: 800, h: 500 }, paddle: { h: 80, speed: 5, faceX: 30, oppFaceX: 770 }, score: { me, opp }, frame }
  (y = paddle centre; dx < 0 means the ball is coming toward you).
- move(s) must return a number in [-1, 1]. It must be deterministic given the same inputs and history, take well under 1 ms, and use only plain JavaScript (no Math.random, no timers, no globals other than your own).
- Errors, non-numbers or calls slower than 5 ms count as 0 for that frame.

Reply with only the JavaScript code.
