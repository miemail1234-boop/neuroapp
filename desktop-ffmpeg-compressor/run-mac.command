#!/bin/zsh
set -e
cd "$(dirname "$0")"
python3 ffmpeg_compressor.py
