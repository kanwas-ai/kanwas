#!/bin/bash
# Wrapper script to run the iTerm2 AppleScript
# Usage: ./dev-iterm.sh

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

osascript "$SCRIPT_DIR/dev-iterm.scpt" "$PROJECT_ROOT"
