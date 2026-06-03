#!/usr/bin/env node

import chalk from 'chalk';
import inquirer from 'inquirer';
import chokidar from 'chokidar';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hacker-style ASCII art
const ASCII_ART = `
${chalk.red('██████╗ ████████╗███╗   ███╗██████╗ ')}
${chalk.red('██╔══██╗╚══██╔══╝████╗ ████║██╔══██╗')}
${chalk.red('██████╔╝   ██║   ██╔████╔██║██████╔╝')}
${chalk.red('██╔══██╗   ██║   ██║╚██╔╝██║██╔═══╝ ')}
${chalk.red('██║  ██║   ██║   ██║ ╚═╝ ██║██║     ')}
${chalk.red('╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚═╝╚═╝     ')}

${chalk.cyan('███████╗ ██████╗ ██╗   ██╗██╗██████╗ ')}
${chalk.cyan('██╔════╝██╔═══██╗██║   ██║██║██╔══██╗')}
${chalk.cyan('███████╗██║   ██║██║   ██║██║██║  ██║')}
${chalk.cyan('╚════██║██║▄▄ ██║██║   ██║██║██║  ██║')}
${chalk.cyan('███████║╚██████╔╝╚██████╔╝██║██████╔╝')}
${chalk.cyan('╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝╚═════╝ ')}
`;

// Video file extensions
const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.webm', '.m4v', '.mpg', '.mpeg', '.3gp'];

class RTMPStreamer {
  constructor() {
    this.folderPath = '';
    this.videoFiles = [];
    this.currentStream = null;
    this.playlist = [];
    this.currentIndex = 0;
    this.settings = {
      rtmpUrl: 'rtmp://ingest.angelthump.com/live',
      streamKey: '',
      bitrate: '3000k',
      audioBitrate: '192k',
      resolution: '1920x1080',
      videoFit: 'fit',
      loop: true,
      shuffle: true,
      scanInterval: 5 * 60 * 1000 // 5 minutes
    };
    this.watcher = null;
    this.recentlyPlayed = [];
    this.paused = false;
    this.keyListener = null;
    this.currentStreamInfo = null;
    this.lastProgressUpdate = Date.now();
  }

  // Print header
  printHeader() {
    console.clear();
    console.log(ASCII_ART);
  }

  // Scan folder for video files
  async scanFolder(folderPath, recursive = true, showProgress = false) {
    const files = [];
    let dirCount = 0;
    
    const scanDir = (dirPath, depth = 0) => {
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        dirCount++;
        
        if (showProgress) {
          const indent = '  '.repeat(depth);
          console.log(chalk.gray(`${indent}[SCAN] ${dirPath}`));
        }
        
        for (const entry of entries) {
          // Skip hidden files and system directories
          if (entry.name.startsWith('.')) continue;
          
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory() && recursive) {
            scanDir(fullPath, depth + 1);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (VIDEO_EXTENSIONS.includes(ext)) {
              const stats = fs.statSync(fullPath);
              files.push({
                path: fullPath,
                name: entry.name,
                size: stats.size,
                sizeGB: (stats.size / 1024 / 1024 / 1024).toFixed(2)
              });
              
              if (showProgress) {
                const indent = '  '.repeat(depth + 1);
                console.log(chalk.green(`${indent}[FOUND] ${entry.name} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`));
              }
            }
          }
        }
      } catch (error) {
        // Skip directories we don't have permission to read
        if (showProgress) {
          console.log(chalk.yellow(`  [SKIP] ${dirPath} (${error.message})`));
        }
      }
    };

    try {
      if (showProgress) {
        console.log(chalk.cyan(`\n>> Recursive scan starting...`));
      }
      scanDir(folderPath, 0);
      if (showProgress) {
        console.log(chalk.cyan(`>> Scanned ${dirCount} directories`));
      }
      return files.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error(chalk.red(`[ERROR] Scanning folder: ${error.message}`));
      return [];
    }
  }

  // Smart shuffle - avoid recently played
  smartShuffle(files) {
    const historySize = 50;
    const recentSet = new Set(this.recentlyPlayed.slice(-historySize));
    const available = files.filter(f => !recentSet.has(f.path));
    
    if (available.length === 0) {
      // All recently played, shuffle everything
      this.recentlyPlayed = [];
      return this.shuffle(files);
    }
    
    return this.shuffle(available);
  }

  // Fisher-Yates shuffle
  shuffle(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Show stream status header
  showStreamHeader() {
    const current = this.playlist[this.currentIndex];
    if (!current) return;
    
    console.log(chalk.gray(`\n${'═'.repeat(60)}`));
    console.log(chalk.cyan.bold('  [ STREAM STATUS ]'));
    console.log(chalk.white(`  Current: ${current.name}`));
    console.log(chalk.gray(`  Position: ${this.currentIndex + 1}/${this.playlist.length}`));
    console.log(chalk.gray(`  Next: ${this.playlist[this.currentIndex + 1]?.name || '[END]'}`));
    console.log(chalk.gray(`${'═'.repeat(60)}`));
  }

  // Show interactive playlist controls
  showPlaylistControls() {
    console.log(chalk.gray(`${'─'.repeat(60)}`));
    console.log(chalk.cyan.bold('  [ CONTROLS ]'));
    console.log(chalk.white('  [n]') + chalk.gray(' Next | ') + 
                chalk.white('[p]') + chalk.gray(' Playlist | ') +
                chalk.white('[s]') + chalk.gray(' Shuffle | ') +
                chalk.white('[i]') + chalk.gray(' Info | ') +
                chalk.white('[q]') + chalk.gray(' Quit'));
    console.log(chalk.gray(`${'─'.repeat(60)}\n`));
  }

  // Setup keyboard listener
  setupKeyListener() {
    if (this.keyListener) return;

    // Make sure stdin is in raw mode
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }
    
    readline.emitKeypressEvents(process.stdin);

    this.keyListener = async (str, key) => {
      if (key.ctrl && key.name === 'c') {
        this.stopStream();
        console.log(chalk.yellow('\n\n>> EXIT'));
        process.exit(0);
      }

      // Ignore keys during inquirer prompts
      if (process.stdin.isRaw === false) return;

      switch(key.name) {
        case 'n':
          console.log(chalk.yellow('\n>> Skipping to next stream...'));
          this.skipToNext();
          break;
        case 'p':
          await this.showPlaylistMenuNonBlocking();
          break;
        case 's':
          console.log(chalk.magenta('\n>> Reshuffling queue...'));
          this.playlist = this.smartShuffle(this.videoFiles);
          console.log(chalk.green('[OK] Queue reshuffled\n'));
          this.showStreamHeader();
          this.showPlaylistControls();
          break;
        case 'i':
          this.showCurrentInfo();
          this.showPlaylistControls();
          break;
        case 'q':
          console.log(chalk.yellow('\n>> Terminating stream...'));
          this.stopStream();
          process.exit(0);
          break;
      }
    };

    process.stdin.on('keypress', this.keyListener);
    
    // Show initial controls
    this.showStreamHeader();
    this.showPlaylistControls();
  }

  // Skip to next movie
  skipToNext() {
    if (this.currentStream) {
      this.currentStream.kill('SIGKILL');
    }
  }

  // Show current info
  showCurrentInfo() {
    if (this.currentIndex < this.playlist.length) {
      const current = this.playlist[this.currentIndex];
      console.log(chalk.cyan(`\n[ STREAM INFO ]`));
      console.log(chalk.white(`   File: ${current.name}`));
      console.log(chalk.gray(`   Path: ${current.path}`));
      console.log(chalk.gray(`   Size: ${current.sizeGB} GB`));
      console.log(chalk.gray(`   Position: ${this.currentIndex + 1}/${this.playlist.length}`));
      console.log(chalk.gray(`   Next: ${this.playlist[this.currentIndex + 1]?.name || '[END OF QUEUE]'}`));
      if (this.currentStreamInfo) {
        console.log(chalk.blue(`   Time: ${this.currentStreamInfo.time || '00:00:00'}`));
        console.log(chalk.blue(`   FPS: ${this.currentStreamInfo.fps || 0}`));
        console.log(chalk.blue(`   Bitrate: ${this.currentStreamInfo.bitrate || 0}kbps`));
      }
      console.log('');
    }
  }

  // Show interactive playlist menu (non-blocking version)
  async showPlaylistMenuNonBlocking() {
    // Temporarily disable raw mode for inquirer
    const wasRawMode = process.stdin.isRaw;
    if (process.stdin.isTTY && wasRawMode) {
      process.stdin.setRawMode(false);
    }

    const actions = [
      { name: '[VIEW] Full playlist', value: 'view' },
      { name: '[MOVE] Current stream up', value: 'moveup' },
      { name: '[MOVE] Current stream down', value: 'movedown' },
      { name: '[BUMP] Stream to top', value: 'movetop' },
      { name: '[REMOVE] Stream from queue', value: 'remove' },
      { name: '[BACK] Return to stream', value: 'back' }
    ];

    try {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: chalk.cyan('[ PLAYLIST OPTIONS ]'),
          choices: actions
        }
      ]);

      switch(action) {
        case 'view':
          await this.viewPlaylist();
          break;
        case 'moveup':
          if (this.currentIndex + 1 < this.playlist.length) {
            this.moveMovie(this.currentIndex + 1, -1);
          }
          break;
        case 'movedown':
          if (this.currentIndex + 1 < this.playlist.length - 1) {
            this.moveMovie(this.currentIndex + 1, 1);
          }
          break;
        case 'movetop':
          await this.selectAndMoveToTop();
          break;
        case 'remove':
          await this.removeMovie();
          break;
      }
    } catch (error) {
      // User cancelled, just continue
      console.log(chalk.yellow('\n[CANCEL] Menu cancelled'));
    } finally {
      // Always re-enable raw mode and show controls again
      if (process.stdin.isTTY && wasRawMode) {
        process.stdin.setRawMode(true);
      }
      
      this.showStreamHeader();
      this.showPlaylistControls();
    }
  }

  // Show interactive playlist menu
  async showPlaylistMenu() {
    // Temporarily disable raw mode for inquirer
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    const actions = [
      { name: '[VIEW] Full playlist', value: 'view' },
      { name: '[MOVE] Current stream up', value: 'moveup' },
      { name: '[MOVE] Current stream down', value: 'movedown' },
      { name: '[BUMP] Stream to top', value: 'movetop' },
      { name: '[REMOVE] Stream from queue', value: 'remove' },
      { name: '[BACK] Return to stream', value: 'back' }
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: chalk.cyan('[ PLAYLIST OPTIONS ]'),
        choices: actions
      }
    ]);

    switch(action) {
      case 'view':
        await this.viewPlaylist();
        break;
      case 'moveup':
        this.moveMovie(this.currentIndex + 1, -1);
        break;
      case 'movedown':
        this.moveMovie(this.currentIndex + 1, 1);
        break;
      case 'movetop':
        await this.selectAndMoveToTop();
        break;
      case 'remove':
        await this.removeMovie();
        break;
    }

    // Re-enable raw mode
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
  }

  // View full playlist with pagination
  async viewPlaylist() {
    // Ensure raw mode is disabled for inquirer
    const wasRawMode = process.stdin.isRaw;
    if (process.stdin.isTTY && wasRawMode) {
      process.stdin.setRawMode(false);
    }

    try {
      const choices = this.playlist.map((file, i) => {
        const indicator = i === this.currentIndex ? chalk.green('>>') : '  ';
        const played = i < this.currentIndex ? chalk.gray('[X]') : '[ ]';
        return {
          name: `${indicator} ${played} ${String(i + 1).padStart(3, ' ')}. ${file.name} (${file.sizeGB} GB)`,
          value: i
        };
      });

      choices.push({ name: chalk.yellow('<< Return'), value: -1 });

      const { selection } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selection',
          message: chalk.cyan(`[ QUEUE: ${this.playlist.length} streams ]`),
          choices,
          pageSize: 15
        }
      ]);

      if (selection !== -1) {
        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: chalk.cyan('[ ACTION ]'),
            choices: [
              { name: '[UP] Move up', value: 'up' },
              { name: '[DOWN] Move down', value: 'down' },
              { name: '[TOP] Bump to top', value: 'top' },
              { name: '[DEL] Remove', value: 'remove' },
              { name: '[CANCEL]', value: 'cancel' }
            ]
          }
        ]);

        switch(action) {
          case 'up':
            this.moveMovie(selection, -1);
            break;
          case 'down':
            this.moveMovie(selection, 1);
            break;
          case 'top':
            this.moveMovieToTop(selection);
            break;
          case 'remove':
            this.playlist.splice(selection, 1);
            if (this.currentIndex >= selection) {
              this.currentIndex = Math.max(0, this.currentIndex - 1);
            }
            console.log(chalk.green('[OK] Stream removed from queue'));
            break;
        }

        if (action !== 'cancel') {
          await this.viewPlaylist(); // Show updated playlist
        }
      }
    } catch (error) {
      // Handle any errors (e.g., user cancellation)
      console.log(chalk.yellow('\n[CANCEL] Playlist view cancelled'));
    } finally {
      // Always restore raw mode if it was enabled before
      if (process.stdin.isTTY && wasRawMode) {
        process.stdin.setRawMode(true);
      }
    }
  }

  // Move movie in playlist
  moveMovie(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= this.playlist.length) {
      console.log(chalk.red('[ERROR] Cannot move beyond queue bounds'));
      return;
    }

    const [movie] = this.playlist.splice(index, 1);
    this.playlist.splice(newIndex, 0, movie);

    // Adjust current index if needed
    if (index === this.currentIndex) {
      this.currentIndex = newIndex;
    } else if (index < this.currentIndex && newIndex >= this.currentIndex) {
      this.currentIndex--;
    } else if (index > this.currentIndex && newIndex <= this.currentIndex) {
      this.currentIndex++;
    }

    console.log(chalk.green(`[OK] Stream moved ${direction > 0 ? 'down' : 'up'}`))
  }

  // Move movie to top of queue (play next)
  moveMovieToTop(index) {
    if (index <= this.currentIndex) {
      console.log(chalk.yellow('⚠️  This movie has already played or is playing'));
      return;
    }

    const [movie] = this.playlist.splice(index, 1);
    this.playlist.splice(this.currentIndex + 1, 0, movie);
    console.log(chalk.green(`[OK] "${movie.name}" bumped to top of queue`));
  }

  // Select and move movie to top
  async selectAndMoveToTop() {
    const choices = this.playlist
      .map((file, i) => ({
        name: `${i + 1}. ${file.name}`,
        value: i
      }))
      .filter((_, i) => i > this.currentIndex);

    if (choices.length === 0) {
      console.log(chalk.yellow('⚠️  No upcoming movies to move'));
      return;
    }

    const { index } = await inquirer.prompt([
      {
        type: 'list',
        name: 'index',
        message: chalk.cyan('Select movie to move to top:'),
        choices,
        pageSize: 15
      }
    ]);

    this.moveMovieToTop(index);
  }

  // Remove movie from playlist
  async removeMovie() {
    const choices = this.playlist
      .map((file, i) => ({
        name: `${i + 1}. ${file.name}`,
        value: i
      }))
      .filter((_, i) => i > this.currentIndex);

    if (choices.length === 0) {
      console.log(chalk.yellow('⚠️  No upcoming movies to remove'));
      return;
    }

    const { index } = await inquirer.prompt([
      {
        type: 'list',
        name: 'index',
        message: chalk.cyan('Select movie to remove:'),
        choices,
        pageSize: 15
      }
    ]);

    const movie = this.playlist[index];
    this.playlist.splice(index, 1);
    console.log(chalk.green(`[OK] "${movie.name}" removed from queue`));
  }
  async streamFile(filePath) {
    return new Promise((resolve, reject) => {
      console.log(chalk.cyan(`\n>> STREAM ACTIVE: ${chalk.yellow(path.basename(filePath))}`));
      console.log(chalk.gray(`   RTMP: ${this.settings.rtmpUrl}/***`));
      console.log(chalk.gray(`   Video: ${this.settings.bitrate} @ ${this.settings.resolution} | Audio: ${this.settings.audioBitrate}, ${this.settings.audioChannels}ch`));
      
      const fullRtmpUrl = `${this.settings.rtmpUrl}/${this.settings.streamKey}`;
      
      // Build video filter based on fit mode
      const [width, height] = this.settings.resolution.split('x');
      let videoFilters;
      
      if (this.settings.videoFit === 'stretch') {
        // Stretch mode: force fill entire window
        videoFilters = [
          `scale=${width}:${height}`,
          'setsar=1'
        ];
      } else {
        // Fit mode: preserve aspect ratio with black bars
        videoFilters = [
          `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
          'setsar=1'
        ];
      }

      const command = ffmpeg(filePath)
        .inputOptions(['-re']) // Read at native frame rate
        .videoCodec('libx264')
        .videoBitrate(this.settings.bitrate)
        .size(this.settings.resolution)
        .videoFilters(videoFilters)
        .audioCodec('aac')
        .audioBitrate(this.settings.audioBitrate)
        .audioChannels(this.settings.audioChannels)
        .format('flv')
        .outputOptions([
          '-preset veryfast',
          '-g 60',
          '-keyint_min 60',
          '-sc_threshold 0',
          '-pix_fmt yuv420p',
          '-maxrate ' + this.settings.bitrate,
          '-bufsize ' + (parseInt(this.settings.bitrate) * 2) + 'k'
        ])
        .output(fullRtmpUrl);

      command.on('start', (cmdLine) => {
        console.log(chalk.green('[OK] FFmpeg process started\n'));
      });

      command.on('progress', (progress) => {
        if (progress.timemark) {
          // Update stream info for the 'i' command
          this.currentStreamInfo = {
            time: progress.timemark,
            fps: Math.round(progress.currentFps || 0),
            bitrate: Math.round(progress.currentKbps || 0)
          };
          
          // Only update display every 2 seconds to reduce spam
          const now = Date.now();
          if (now - this.lastProgressUpdate > 2000) {
            process.stdout.write(chalk.blue(`\r  [TIME] ${progress.timemark} | [FPS] ${this.currentStreamInfo.fps} | [RATE] ${this.currentStreamInfo.bitrate}kbps     `));
            this.lastProgressUpdate = now;
          }
        }
      });

      command.on('end', () => {
        console.log(chalk.green(`\n[OK] Stream completed\n`));
        
        // Track recently played
        this.recentlyPlayed.push(filePath);
        if (this.recentlyPlayed.length > 50) {
          this.recentlyPlayed.shift();
        }
        
        // Clear stream info
        this.currentStreamInfo = null;
        
        resolve();
      });

      command.on('error', (err) => {
        console.error(chalk.red(`\n[ERROR] FFmpeg: ${err.message}`));
        this.currentStreamInfo = null;
        reject(err);
      });

      command.run();
      this.currentStream = command;
    });
  }

  // Stream playlist
  async streamPlaylist() {
    if (this.playlist.length === 0) {
      console.log(chalk.red('[ERROR] Queue is empty'));
      return;
    }

    // Setup keyboard listener for interactive controls
    this.setupKeyListener();

    while (this.currentIndex < this.playlist.length) {
      const file = this.playlist[this.currentIndex];
      
      try {
        await this.streamFile(file.path);
        this.currentIndex++;
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Skipping to next file...`));
        this.currentIndex++;
      }
    }

    // End of playlist
    if (this.settings.loop) {
      console.log(chalk.magenta(`\n🔄 Playlist completed! Reshuffling and restarting...\n`));
      
      if (this.settings.shuffle) {
        this.playlist = this.smartShuffle(this.videoFiles);
      }
      
      this.currentIndex = 0;
      await this.streamPlaylist(); // Loop
    } else {
      console.log(chalk.green(`\n[OK] Queue completed`));
    }
  }

  // Start watching folder
  startWatching() {
    console.log(chalk.cyan(`\n[ WATCH MODE ACTIVE ]`));
    console.log(chalk.gray(`   Interval: ${this.settings.scanInterval / 1000 / 60} minutes`));
    console.log(chalk.gray(`   Mode: Recursive (all subdirectories)`));
    
    setInterval(async () => {
      const newFiles = await this.scanFolder(this.folderPath, true, false);
      const oldPaths = new Set(this.videoFiles.map(f => f.path));
      const addedFiles = newFiles.filter(f => !oldPaths.has(f.path));
      
      if (addedFiles.length > 0) {
        console.log(chalk.yellow(`\n[WATCH] ${addedFiles.length} new file(s) detected:`));
        
        // Show each new file
        for (const file of addedFiles) {
          console.log(chalk.green(`  [+] ${file.name} (${file.sizeGB} GB)`));
          console.log(chalk.gray(`      ${file.path}`));
        }
        
        this.videoFiles = newFiles;
        
        // Add new files to playlist
        for (const file of addedFiles) {
          this.playlist.push(file);
        }
        
        console.log(chalk.cyan(`[OK] Queue updated: ${this.playlist.length} total streams\n`));
      }
    }, this.settings.scanInterval);
  }

  // Stop streaming
  stopStream() {
    if (this.currentStream) {
      this.currentStream.kill('SIGKILL');
      this.currentStream = null;
      console.log(chalk.red('\n[STOP] Stream terminated'));
    }
  }

  // Main interactive menu
  async run() {
    this.printHeader();

    // Get folder path
    const { folderPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'folderPath',
        message: chalk.cyan('[ FOLDER PATH ]'),
        default: '.',
        validate: (input) => {
          const resolvedPath = path.resolve(input);
          if (!fs.existsSync(resolvedPath)) {
            return 'Folder does not exist!';
          }
          if (!fs.statSync(resolvedPath).isDirectory()) {
            return 'Path is not a directory!';
          }
          return true;
        }
      }
    ]);

    this.folderPath = path.resolve(folderPath);

    // Scan for videos with progress display
    this.videoFiles = await this.scanFolder(folderPath, true, true);
    
    if (this.videoFiles.length === 0) {
      console.log(chalk.red(`\n[ERROR] No video files found`));
      console.log(chalk.gray(`   Supported formats: ${VIDEO_EXTENSIONS.join(', ')}`));
      process.exit(1);
    }

    console.log(chalk.green(`[OK] Found ${this.videoFiles.length} file(s) | Total: ${this.videoFiles.reduce((sum, f) => sum + parseFloat(f.sizeGB), 0).toFixed(2)} GB`));

    // Get RTMP settings
    const settings = await inquirer.prompt([
      {
        type: 'list',
        name: 'rtmpService',
        message: chalk.cyan('[ RTMP SERVICE ]'),
        choices: [
          { name: 'AngelThump', value: 'rtmp://ingest.angelthump.com/live' },
          { name: 'Twitch', value: 'rtmp://live.twitch.tv/app' },
          { name: 'YouTube', value: 'rtmp://a.rtmp.youtube.com/live2' },
          { name: 'Custom URL', value: 'custom' }
        ]
      },
      {
        type: 'input',
        name: 'customUrl',
        message: chalk.cyan('[ CUSTOM RTMP URL ]'),
        when: (answers) => answers.rtmpService === 'custom'
      },
      {
        type: 'password',
        name: 'streamKey',
        message: chalk.cyan('[ STREAM KEY ]'),
        mask: '*',
        validate: (input) => input.length > 0 ? true : 'Stream key is required!'
      },
      {
        type: 'list',
        name: 'bitrate',
        message: chalk.cyan('[ VIDEO BITRATE ]'),
        choices: [
          '1000k',
          '1500k', 
          '2000k',
          '2500k', 
          '3000k', 
          '3500k',
          '4000k',
          '4500k', 
          '5000k',
          '6000k', 
          '7000k',
          '8000k',
          '10000k',
          '12000k'
        ],
        default: '3000k'
      },
      {
        type: 'list',
        name: 'audioBitrate',
        message: chalk.cyan('[ AUDIO BITRATE ]'),
        choices: ['96k', '128k', '160k', '192k', '256k', '320k'],
        default: '192k'
      },
      {
        type: 'list',
        name: 'audioChannels',
        message: chalk.cyan('[ AUDIO CHANNELS ]'),
        choices: [
          { name: 'Mono (1)', value: 1 },
          { name: 'Stereo (2)', value: 2 },
          { name: '5.1 Surround (6)', value: 6 }
        ],
        default: 2
      },
      {
        type: 'list',
        name: 'resolution',
        message: chalk.cyan('[ RESOLUTION ]'),
        choices: ['1280x720', '1920x1080', '2560x1440', '3840x2160'],
        default: '1920x1080'
      },
      {
        type: 'list',
        name: 'videoFit',
        message: chalk.cyan('[ VIDEO FIT ]'),
        choices: [
          { name: 'Fit (preserve aspect ratio, add black bars)', value: 'fit' },
          { name: 'Stretch (fill entire window)', value: 'stretch' }
        ],
        default: 'fit'
      },
      {
        type: 'confirm',
        name: 'shuffle',
        message: chalk.cyan('[ ENABLE SMART SHUFFLE ]'),
        default: true
      },
      {
        type: 'confirm',
        name: 'loop',
        message: chalk.cyan('[ AUTO-LOOP QUEUE ]'),
        default: true
      },
      {
        type: 'confirm',
        name: 'watch',
        message: chalk.cyan('[ WATCH FOR NEW FILES ]'),
        default: true
      },
      {
        type: 'list',
        name: 'scanInterval',
        message: chalk.cyan('[ SCAN INTERVAL ]'),
        choices: [
          { name: '1 minute', value: 1 },
          { name: '2 minutes', value: 2 },
          { name: '5 minutes', value: 5 },
          { name: '10 minutes', value: 10 },
          { name: '15 minutes', value: 15 },
          { name: '30 minutes', value: 30 }
        ],
        default: 5,
        when: (answers) => answers.watch
      }
    ]);

    // Update settings
    this.settings.rtmpUrl = settings.rtmpService === 'custom' ? settings.customUrl : settings.rtmpService;
    this.settings.streamKey = settings.streamKey;
    this.settings.bitrate = settings.bitrate;
    this.settings.audioBitrate = settings.audioBitrate;
    this.settings.audioChannels = settings.audioChannels;
    this.settings.resolution = settings.resolution;
    this.settings.videoFit = settings.videoFit;
    this.settings.shuffle = settings.shuffle;
    this.settings.loop = settings.loop;
    
    // Update scan interval if watching is enabled
    if (settings.watch && settings.scanInterval) {
      this.settings.scanInterval = settings.scanInterval * 60 * 1000; // Convert to milliseconds
    }

    // Build playlist
    if (settings.shuffle) {
      this.playlist = this.smartShuffle(this.videoFiles);
    } else {
      this.playlist = [...this.videoFiles];
    }

    // Show playlist preview
    console.log(chalk.cyan(`\n[ QUEUE: ${this.playlist.length} streams ]`));
    this.playlist.slice(0, 10).forEach((file, i) => {
      console.log(chalk.gray(`   ${String(i + 1).padStart(2, '0')}. ${file.name} (${file.sizeGB} GB)`));
    });
    if (this.playlist.length > 10) {
      console.log(chalk.gray(`   ... +${this.playlist.length - 10} more`));
    }

    // Start watching if enabled
    if (settings.watch) {
      this.startWatching();
    }

    // Confirm and start
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: chalk.green.bold('>> START STREAMING?'),
        default: true
      }
    ]);

    if (confirm) {
      console.log(chalk.green.bold(`\n>> INITIALIZING STREAM...`));
      console.log(chalk.gray(`${'═'.repeat(60)}\n`));
      
      // Handle Ctrl+C
      process.on('SIGINT', () => {
        this.stopStream();
        console.log(chalk.yellow('\n\n>> EXIT'));
        process.exit(0);
      });

      await this.streamPlaylist();
    } else {
      console.log(chalk.yellow('\n[ABORT] Cancelled'));
      process.exit(0);
    }
  }
}

// Run the CLI
const streamer = new RTMPStreamer();
streamer.run().catch((error) => {
  console.error(chalk.red(`\n✗ Fatal error: ${error.message}`));
  process.exit(1);
});

