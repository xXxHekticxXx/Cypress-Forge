# Cypress Forge

By Cypress Works. Design detailed, printable D&D terrain for 28 mm minis on 1-inch squares, from ancient ruins to
starship decks, and export it ready to print.

**Open it:** https://xxxhekticxxx.github.io/Cypress-Forge/ (works on PC and phone; install it from the browser menu and it works offline).

- 8 eras: Ancient, Medieval, Age of Sail, Steampunk, Modern, Cyberpunk, Far future, Alien
- 9 pieces: floors, walls, corners, doors (with a printable door), hills/cliffs, stairs, pillars, scatter props, bridges
- Every setting adjustable, with 🎲 random and ↺ reset on each; Simple mode for just the basics
- Bases: flat, magnet pockets (5×2 to 8×3 mm), or clip slots with printable clips
- Generate a whole room; print sets with quantities; export STL per piece + 3MF plates laid out for a 250 × 250 mm bed

All meshes are closed solids (checked for every era, piece and style by `npx tsx scripts/check-closed.ts`).

Development: `npm install`, `npm run dev`. Pushing to `main` builds and publishes to GitHub Pages.
