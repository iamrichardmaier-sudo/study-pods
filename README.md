# Study Pods

A static site that collects NotebookLM study audio for each class in one place, with a player built for listening on a phone. It's plain HTML, CSS and JS, with no build step.

```
index.html      page shell
styles.css      all styling (colour tokens at the top)
app.js          rendering + audio player
episodes.json   the episode list: the only file you edit to publish
audio/          episode audio files (.mp3 / .m4a)
art/            cover images (.svg / .png / .jpg, square)
```

## Adding an episode

1. Put the audio file in `audio/` and a square cover image in `art/`.
   Name both after the episode id, e.g. `audio/econ381-game-theory.mp3`.
2. Add an entry to the **top** of `episodes.json` (the list is newest first):

   ```json
   {
     "id": "econ381-game-theory",
     "title": "Game Theory in 20 Minutes",
     "class": "ECON 381",
     "date": "2026-10-12",
     "duration_seconds": 1260,
     "audio_url": "audio/econ381-game-theory.mp3",
     "art_url": "art/econ381-game-theory.png",
     "description": "Nash equilibrium, dominant strategies, and the prisoner's dilemma."
   }
   ```

3. Commit and push. GitHub Pages redeploys within a minute or two.

| Field | Notes |
| --- | --- |
| `id` | Unique, URL-safe, and never changed once published. Saved listening progress is keyed on it. |
| `title` | Episode title. |
| `class` | Class code such as `ECON 380`. Each distinct value gets its own section, so a new class appears automatically. |
| `date` | `YYYY-MM-DD`. |
| `duration_seconds` | Integer. Get it with `ffprobe -v error -show_entries format=duration -of csv=p=0 file.mp3`. |
| `audio_url` | A path relative to the site root (`audio/...`) or a full URL. |
| `art_url` | A path relative to the site root (`art/...`) or a full URL. Square, about 600×600 or larger. |
| `description` | One or two sentences, shown in the player. |

The site sorts by `date` on load, so getting the order wrong doesn't break anything. Keeping the file newest-first just makes it easier to read.

**Class colours:** known classes have a hand-picked accent in `CLASS_COLORS` at the top of `app.js`. Other classes get a stable colour automatically, and you can add a line there to choose one.

## Player

- Speed control cycles 0.5× → 0.75× → 1× → 1.25× → 1.5× → 1.75× → 2×. The chosen speed is remembered.
- Skip back or forward 15 s.
- The player resumes each episode from where you stopped, saving your position to `localStorage` per episode id. Episodes you've finished are marked as played and start again from the beginning.
- The home screen has a "Continue listening" card for your most recent unfinished episode.
- Lock-screen and headphone controls work through the Media Session API.
- On desktop, Space plays or pauses, ← and → skip 15 s, and Esc closes the player.

## Hosting (GitHub Pages)

Go to Settings → Pages → *Deploy from a branch* and pick `main` with `/ (root)`. The `.nojekyll` file makes Pages serve the files as they are.

To preview locally, run `npx http-server` (or any server that supports HTTP Range requests, which seeking needs) and open the URL it prints.

The two seed episodes use placeholder tone audio. Delete their entries and files once real episodes start arriving.

## iPhone widget (Scriptable)

`scriptable/study-pods-widget.js` is a script for the [Scriptable](https://scriptable.app) app. Paste it into a new script and add a Scriptable widget (small, medium or large) to the home screen, choosing that script. The widget shows the latest episodes. Running the script in the app lists every episode by class. Tapping an episode opens it in the site's player through a deep link (`index.html#ep=<id>`). Change `SITE` at the top of the script if the Pages URL is different.
