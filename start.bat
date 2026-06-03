@echo off
REM RTMP Squid CLI Launcher for Windows

cd /d "%~dp0"

REM Check if node_modules exists
if not exist "node_modules\" (
  echo Installing dependencies...
  npm install
)

REM Run the CLI
node stream.js

