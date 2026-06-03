#!/bin/bash

# RTMP Squid CLI Launcher

cd "$(dirname "$0")"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Run the CLI
node stream.js

