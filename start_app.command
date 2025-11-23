#!/bin/bash

# Get the directory where the script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to that directory
cd "$DIR"

# Check if python3 is available
if command -v python3 &>/dev/null; then
    echo "Starting local server with Python 3..."
    # Open browser after a slight delay
    (sleep 1 && open "http://localhost:8000") &
    # Start server
    python3 -m http.server 8000
else
    echo "Python 3 is not installed. Please install Python 3 to run this local server."
    read -p "Press any key to exit..."
fi
