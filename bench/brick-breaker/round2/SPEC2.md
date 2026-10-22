Build a complete Brick Breaker game as ONE self-contained HTML file (inline CSS and JavaScript, no external files, libraries or network requests).

Gameplay:
1. A canvas with id "game", exactly 800 x 600 pixels. Paddle at the bottom moved by ArrowLeft / ArrowRight and by the mouse; it never leaves the canvas.
2. The ball sits on the paddle until Space is pressed, then launches upward; it bounces off the side and top walls, the paddle and bricks.
3. Three levels. Level 1: 5 rows x 10 columns of 1-hit bricks. Level 2: 6 x 10 where the top two rows need 2 hits. Level 3: any layout you like with at least 40 bricks, at least 10 of them needing 2 hits. Each hit on a brick scores 10 points. Clearing a level starts the next one with the ball back on the paddle; clearing level 3 shows "YOU WIN".
4. 3 lives. Losing the last ball in play costs a life and resets the ball onto the paddle. At 0 lives show "GAME OVER"; Space then restarts from level 1 (score 0, 3 lives).
5. Power-ups fall from about 10% of destroyed bricks and are caught with the paddle: "wide" doubles the paddle width for 600 frames; "multi" adds 2 extra balls.
6. Autopilot: the A key toggles an autopilot that moves the paddle by itself and launches the ball. It must be good enough to clear all three levels without losing a life.
7. Save the best score in localStorage under the key "bb_highscore" and show it on screen.
8. P pauses and un-pauses. Draw score, lives, level and high score on the canvas. Animate with requestAnimationFrame. No console errors.

Test interface (required; keep it live every frame):
window.game = {
  score, lives, level, state ('ready' | 'playing' | 'paused' | 'over' | 'won'),
  balls: [{x, y, dx, dy}],                  // every ball in play (canvas pixels, pixels per frame)
  paddle: {x, y, w},                         // x = left edge
  bricks: [{x, y, w, h, hits}],              // remaining bricks; hits = hits still needed to destroy it
  bricksLeft,                                // = bricks.length
  autopilot,                                 // boolean
  tick(n),          // advance the simulation exactly n frames synchronously (same logic as a real frame), ignoring pause
  seed(n),          // make all randomness (power-up drops, launch angles) deterministic from integer n
  setBall(x, y, dx, dy),                     // replace all balls with one ball there; state becomes 'playing'
  spawnPowerUp(type, x, y)                   // drop a power-up of type 'wide' | 'multi' at that point
}

Reply with only the complete HTML file.
