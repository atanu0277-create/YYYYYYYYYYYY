# Ludo Online

A fully-featured, production-ready real-time multiplayer Ludo game.

## Features
- Real-time multiplayer synchronization using WebSocket (Socket.io).
- Room-based lobbies with full game logic on the backend.
- Pure Vanilla JS HTML5 canvas rendering (no frameworks), maintaining 60fps animations.
- Fully responsive styling logic conforming scaling.

## Setup & Running

**Prerequisites:** Node.js (v18 or higher recommended).

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

3. Open the preview URL or navigate to `http://localhost:3000` to play.

## Architecture

- **Backend**: Express + Socket.IO handling completely secure state transitions and randomized dice rolling (using node's built-in cryptographically secure PRNG).
- **Frontend**: Responsive UI paired with `requestAnimationFrame` canvas rendering.
- **Data Validation**: Game state validation avoids ghost/out-of-turn inputs.
