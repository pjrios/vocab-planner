#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
cd "$SCRIPT_DIR"

# Run the build script
./build-games.sh

# Keep the terminal open so the user can see the results
echo ""
echo "Press any key to close this window..."
read -n 1 -s

