# PENTA — Five letters. Six tries.

A polished, **Wordle-like daily word game**. Guess the hidden five-letter word in six
attempts; after each guess the tiles tell you how close you were.

🟩 right letter, right spot · 🟨 right letter, wrong spot · ⬛ not in the word

## Features

- **Daily puzzle** — everyone gets the same word each day, with a countdown to the next one.
- **Practice mode** — unlimited random rounds (tap the ↻ icon). Practice never touches your stats.
- **Faithful Wordle rules**, including the correct **two-pass duplicate-letter** coloring.
- **Hard mode** — every revealed hint must be reused in later guesses.
- **Statistics** — games played, win %, current/max streak, and a guess-distribution chart, saved locally.
- **Share** your result as an emoji grid (Web Share on mobile, clipboard on desktop).
- **Light / dark themes**, on-screen + physical keyboard, flip/pop/shake/bounce animations.
- **Perfectly responsive** — the board is measured against the live viewport (width *and* height,
  accounting for the mobile keyboard via `visualViewport`) so it always fits without scrolling,
  on any phone, tablet, or desktop.

## Tech

Zero-dependency, no build step — plain HTML/CSS/ES-module JavaScript. The word list (2,500 common
answers + 5,757 accepted guesses) comes from the **Stanford GraphBase** five-letter word set
(public domain) and is baked into `words.js`.

## Run locally

```bash
npx serve .        # or: python -m http.server
```

Then open the printed URL. (It must be served over HTTP — ES modules don't load from `file://`.)

## Regenerate the word list

```bash
node gen-words.cjs   # reads sgb-words.txt -> writes words.js
```

## Deploy

Static site — deploys to Vercel as-is. Pushes to `main` trigger automatic redeploys.
