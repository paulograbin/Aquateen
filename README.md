# Aquateen

A browser version of an old Portuguese-language game based on **Aqua Teen Hunger Force**. Choose a character, dodge falling enemies, and survive long enough to save Carl.

## Where it came from

This project revisits my old Flash game done in 2006 and brings it to modern browsers while preserving it as closely as possible.

The starting point was my old **Aquateen.exe**, a Windows executable containing the game and Macromedia Flash Player 6. This copy has a July 2006 file date; the original release date hasn’t been confirmed.

The original includes Mestre Shake, Almôndega, Peterson, and Batatão as playable characters, with the familiar house as the backdrop and the Mooninites among the enemies.

## How to play

Open **index.html** in a modern browser. On macOS, you can also double-click **Play Aquateen.command**. Keep the folder together; no installation or internet connection is needed.

- Choose one of the four characters.
- Move your mouse to guide your character around the falling enemies. On a touchscreen, drag your finger.
- You start with **five lives** and earn points by staying alive.
- New enemy waves appear as your score increases. Reach **1,000 points** to rescue Carl.

Controls below the game let you pause, restart, or switch to fullscreen.

## Publish with GitHub Pages

The game can be hosted directly on GitHub Pages:

1. Push this project, including `.nojekyll`, to the repository’s `main` branch.
2. Open **Settings → Pages** in the GitHub repository.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select **main** and **/ (root)**, then click **Save**.

After deployment, the game will be available at **https://paulograbin.github.io/Aquateen/**. Future pushes to `main` will update it automatically. No build command or dependency installation is required.

## What was done

The Flash game was extracted from the executable. Its original artwork, animations, Portuguese text, and game rules were recovered and used to rebuild it for modern browsers with **Three.js**.

The port keeps the original **2D appearance**, character choices, countdowns, movement, scoring, hit animations, and endings. The aim is to preserve the game’s look and feel as closely as possible. It runs without Flash or Ruffle.

A few browser conveniences were added, including pause, fullscreen, and touch controls. The code was also reorganized into smaller, clearly named parts to make it easier to understand and maintain.

## Current status

Automated gameplay checks pass for all four characters, including damage, enemy waves, victory, game over, and replay. Full visual and interactive verification in a browser is still pending, so an exact match to the original hasn’t been confirmed.

## Credits and further reading

The characters and artwork come from the recovered game. Three.js is included with its MIT license.

For details about the code, see the [implementation guide](src/README.md). The [recovery notes](research/FINDINGS.md) describe what was learned from the original file.
