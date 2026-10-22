Build a complete Brick Breaker game as ONE self-contained HTML file (inline CSS and JavaScript, no external files, libraries or network requests).

Requirements:
1. A canvas with id "game", exactly 800 x 600 pixels.
2. A paddle at the bottom, moved by the ArrowLeft / ArrowRight keys and by the mouse (paddle centre follows the mouse x over the canvas). The paddle must never leave the canvas.
3. The ball sits on the paddle until Space is pressed, then launches upward. It bounces off the left, right and top walls, the paddle and the bricks.
4. 5 rows x 10 columns of bricks (50 bricks). A brick is destroyed when hit and adds 10 points.
5. 3 lives. If the ball falls below the paddle you lose a life and the ball resets onto the paddle. At 0 lives show "GAME OVER"; pressing Space then restarts a fresh game (score 0, 3 lives, 50 bricks).
6. When every brick is destroyed show "YOU WIN".
7. Draw the score and the lives on the canvas.
8. P pauses and un-pauses the game (everything freezes while paused).
9. For automated testing, expose a live object window.game with these fields, kept up to date every frame:
   score (number), lives (number), bricksLeft (number), state ('ready' | 'playing' | 'paused' | 'over' | 'won'),
   ball: {x, y, dx, dy} (canvas pixels, pixels per frame), paddle: {x, y, w} (x = left edge),
   and a function window.game.setBall(x, y, dx, dy) that places the ball there with that velocity and sets state to 'playing'.
10. Animate with requestAnimationFrame. No errors in the browser console.

Reply with only the complete HTML file.
