# Redemption Coliseum

A digital trading card game based on Phaser (Client) and Colyseus (Server).

## Project Structure (Monorepo)

This repository contains both the client and server code.

- **Redemption Coliseum/client/**: The frontend (Phaser 3, TypeScript, Vite).
- **Redemption Coliseum/server/**: The backend (Colyseus, Node.js, Express).
- **shared/**: Shared code (types, constants).

## Local Development

### Prerequisites
- Node.js (v18 or higher recommended)
- npm

### Installation & Start

1. **Start Server:**
   ```bash
   cd "Redemption Coliseum/server"
   npm install
   npm run dev
   ```
   The server runs at `ws://localhost:2567`.

2. **Start Client:**
   ```bash
   cd "Redemption Coliseum/client"
   npm install
   npm run dev
   ```
   The game is accessible at `http://localhost:5173`.

## Deployment

### Server (Render.com)
- **Root Directory:** `Redemption Coliseum/server`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Environment Variables:**
  - `SAVE_GAME_SECRET`: (Your secret)

### Client (Vercel)
- **Root Directory:** `Redemption Coliseum/client`
- **Framework Preset:** Vite
- **Important:** After server deployment, update the URL in `client/src/scenes/LobbyScene.ts`!