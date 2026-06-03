# RTMP Squid CLI

Command-line tool for streaming video files to RTMP servers.

## Requirements

- Node.js 18 or higher
- FFmpeg 4.0 or higher

## Installation

```bash
npm install
```

## Usage

```bash
npm start
# or
./start.sh         # Linux/macOS
start.bat          # Windows
```

## Quick Setup

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install -y nodejs npm ffmpeg
cd cli
npm install
npm start
```

### macOS
```bash
brew install node ffmpeg
cd cli
npm install
npm start
```

### Windows
1. Install Node.js from https://nodejs.org/
2. Install FFmpeg from https://ffmpeg.org/download.html
3. Run `start.bat`

## Check System Compatibility

```bash
npm run check
```

This verifies Node.js version, FFmpeg installation, and dependencies.

## Features

- Recursive folder scanning for video files
- Smart shuffle (avoids repeating last 50 videos)
- Folder watching (auto-detects new files)
- Interactive playlist controls during streaming
- Multiple RTMP platforms (AngelThump, Twitch, YouTube, custom)
- Configurable bitrate, resolution, audio settings
- Auto-loop for continuous streaming
- Aspect ratio preservation with black bars

## Supported Formats

.mp4, .avi, .mov, .mkv, .flv, .wmv, .webm, .m4v, .mpg, .mpeg, .3gp

## Interactive Controls

While streaming:
- `n` - Skip to next video
- `p` - Playlist manager (reorder, remove videos)
- `s` - Reshuffle queue
- `i` - Show stream info
- `q` - Quit
- `Ctrl+C` - Force quit

## Configuration Options

### Video Bitrates
1000k, 1500k, 2000k, 2500k, 3000k, 3500k, 4000k, 4500k, 5000k, 6000k, 7000k, 8000k, 10000k, 12000k

### Audio Bitrates
96k, 128k, 160k, 192k, 256k, 320k

### Resolutions
- 1280x720 (720p)
- 1920x1080 (1080p)
- 2560x1440 (1440p)
- 3840x2160 (4K)

### Audio Channels
- Mono (1)
- Stereo (2)
- 5.1 Surround (6)

## RTMP Services

### AngelThump
URL: `rtmp://ingest.angelthump.com/live`

### Twitch
URL: `rtmp://live.twitch.tv/app`

### YouTube
URL: `rtmp://a.rtmp.youtube.com/live2`

### Custom
Enter any RTMP URL and stream key.

## Troubleshooting

### "node: command not found"
Install Node.js:
- Ubuntu/Debian: `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install -y nodejs`
- macOS: `brew install node`
- Windows: Download from https://nodejs.org/

### "ffmpeg: command not found"
Install FFmpeg:
- Ubuntu/Debian: `sudo apt install ffmpeg`
- macOS: `brew install ffmpeg`
- Windows: Download from https://ffmpeg.org/download.html and add to PATH

### "Permission denied: ./start.sh"
```bash
chmod +x start.sh stream.js check-system.js
```

### npm permission errors
```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

## Remote Server Setup

```bash
# Upload CLI folder
scp -r cli/ user@server:/home/user/

# SSH to server
ssh user@server

# Install dependencies
sudo apt install -y nodejs npm ffmpeg

# Setup and run
cd cli
npm install
tmux new -s stream
./start.sh
```

## Dependencies

- chalk - Terminal colors
- inquirer - Interactive prompts
- chokidar - Folder watching
- fluent-ffmpeg - FFmpeg wrapper

## License

MIT
