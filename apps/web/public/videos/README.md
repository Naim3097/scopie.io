# Scopie feed videos

Drop the feed clips in THIS folder. They deploy to scopie.io as static
files, so the feed stops depending on third-party test streams.

## File rules

- **Format**: MP4 (H.264 video + AAC audio) — plays natively on every
  phone with no extra player code. Portrait 9:16 looks best in the feed.
- **Size**: keep each file **under 25 MB** (a 15–60 s clip at 720p is
  typically 3–15 MB). GitHub refuses files over 100 MB and the deploy
  gets slow past ~50 MB, so smaller is better.
- **Count**: any number; the feed shows them in filename order.

## Naming (optional but nice)

The filename becomes the caption, and you can credit a creator:

    aisyah - New collection drop is finally here.mp4
    daniel - Morning run, clear mind.mp4
    My first Scopie clip.mp4          (no creator -> shown as @scopie)

`creator - caption.mp4` → posted as @creator with that caption.
Underscores become spaces. Hashtags in the name work too.

## Posters (optional)

A JPG/PNG with the same name (e.g. `aisyah - New collection drop is
finally here.jpg`) is used as that video's loading poster. Skip them and
the player just shows the first frame.
