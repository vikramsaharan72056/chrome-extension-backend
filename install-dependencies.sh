#!/usr/bin/env bash

# Update system and install FFmpeg
echo "Installing FFmpeg..."
apt-get update && apt-get install -y ffmpeg

# Install yt-dlp via pip
echo "Installing yt-dlp..."
pip install yt-dlp

# Verify installations
echo "FFmpeg version:"
ffmpeg -version

echo "yt-dlp version:"
yt-dlp --version
