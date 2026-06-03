# RTMP Squid CLI

Stream a folder of video files to any RTMP server — AngelThump, Twitch, YouTube,
or anything else — as a continuous 24/7 broadcast that **never drops the
connection between files**.

It's a single shell script. No Node, no npm, no packages — just `ffmpeg`,
`ffprobe`, and standard coreutils. The whole thing is one file you can read,
audit, and copy to a server.

This is the command-line counterpart to the RTMP Squid web app, and it
reproduces the web app's streaming core:

- **Never-stopping stream** — one persistent encoder holds the RTMP connection
  for the whole session. Files are piped through a FIFO one after another, so the
  connection is never dropped between videos.
- **Auto-filling queue** — point it at a folder and it builds an endless random
  (or sequential) queue that tops itself up and loops forever.
- **Auto-reconnect** — if the link drops, it reconnects with exponential backoff
  and resumes the current file where it left off. A stall watchdog catches a
  half-open connection that hasn't fully died.
- **Standby slate** — a "STANDBY" card covers any gap when there's nothing to
  play, so the connection still never drops.
- **Platform-safe encode** — H.264 High profile, true CBR, 2-second keyframes,
  yuv420p, 48 kHz AAC by default. Satisfies Twitch, Kick, and AngelThump at once.

## Requirements

- Linux or macOS
- FFmpeg 4.0+ (with `libx264` and `aac`) — provides `ffmpeg` and `ffprobe`
- A POSIX shell (`bash` 3.2+, which is standard on macOS and Linux)

Check your system:

```bash
./rtmpsquid --check
```

## Install

There's nothing to build or install — copy the `rtmpsquid` script anywhere and
run it. To make it available everywhere:

```bash
install -m 755 rtmpsquid /usr/local/bin/rtmpsquid
```

Install FFmpeg if you don't have it:

```bash
sudo apt install -y ffmpeg     # Debian/Ubuntu
brew install ffmpeg            # macOS
```

## Usage

Non-interactive (scripts, servers):

```bash
rtmpsquid \
  --library /path/to/videos \
  --url rtmp://live.twitch.tv/app \
  --key YOUR_STREAM_KEY
```

Interactive — run it bare on a terminal and it walks you through the setup:

```bash
rtmpsquid
```

Every option also reads from an environment variable, so you can keep settings
in a file and `source` it, or pass them inline:

```bash
LIBRARY=/srv/movies RTMP_URL=rtmp://ingest.angelthump.com/live STREAM_KEY=… rtmpsquid
```

### Running 24/7 on a server

Use `tmux` (or a systemd unit) so it survives your SSH session:

```bash
tmux new -s stream
rtmpsquid --library /srv/movies --url rtmp://… --key …
# detach with Ctrl-b d ; reattach with: tmux attach -t stream
```

## Options

| Flag | Env | Default | Meaning |
|---|---|---|---|
| `--library DIR` | `LIBRARY` | — | Folder of videos (scanned recursively) |
| `--url URL` | `RTMP_URL` | — | RTMP/RTMPS ingest URL |
| `--key KEY` | `STREAM_KEY` | — | Stream key (appended to the URL) |
| `--resolution WxH` | `RESOLUTION` | `1920x1080` | Output resolution |
| `--fps N` | `FPS` | `30` | Output frame rate |
| `--bitrate RATE` | `VBITRATE` | `3000k` | Video bitrate (CBR) |
| `--audio-bitrate RATE` | `ABITRATE` | `160k` | Audio bitrate |
| `--audio-channels N` | `ACHANNELS` | `2` | 1, 2, or 6 |
| `--fit MODE` | `FIT` | `fit` | `fit` (letterbox), `stretch`, or `crop` |
| `--sequential` | `SHUFFLE=0` | shuffle | Play in name order instead of shuffling |
| `--no-reconnect` | `AUTO_RESTART=0` | reconnect on | Don't auto-reconnect on a drop |
| `--no-title` | `SHOW_TITLE=0` | overlay on | Hide the on-screen movie-name overlay |
| `--min-mb N` | `MIN_MOVIE_MB` | `5` | Ignore files smaller than N MB |
| `--preset NAME` | `PRESET` | `veryfast` | x264 preset |
| `--check` | | | Verify ffmpeg/ffprobe and exit |
| `--help` | | | Show help |

## Keyboard controls

While streaming on a terminal:

| Key | Action |
|---|---|
| `n` | Skip to the next video |
| `s` | Reshuffle the queue |
| `i` | Show stream info (current file, queue, live bitrate) |
| `q` | Quit |
| `Ctrl-C` | Quit |

## How it works

A single persistent **streamer** ffmpeg reads a continuous MPEG-TS byte stream
from a FIFO and copies it straight to the RTMP server — this is the one process
that holds the connection. The script keeps a read-write file descriptor open on
the FIFO (`exec 3<>fifo`) so the reader never sees end-of-file between videos.

For each video, a short-lived **feeder** ffmpeg encodes it to the platform-safe
profile and writes the result into the FIFO; a standby slate feeder fills any
gap. Each feeder's output timestamps are offset so the concatenated stream stays
monotonic across files. When the RTMP link drops, the streamer is rebuilt with
backoff and the current file resumes where it left off.

## Supported formats

`.mp4 .mkv .webm .mov .avi .flv .wmv .m4v .mpg .mpeg .3gp .ts .m2ts .ogv`

## License

MIT
