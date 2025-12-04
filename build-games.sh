#!/bin/bash

# Build script for games that require compilation
# This script builds: glitch-buster, js13k-callisto, and js13k2021

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
GAMES_DIR="$SCRIPT_DIR/js/games"

print_status "Starting game build process..."
echo ""

# ============================================================================
# Build JS13K 2021
# ============================================================================
print_status "Building JS13K 2021..."
JS13K2021_DIR="$GAMES_DIR/js13k2021-main"

if [ ! -d "$JS13K2021_DIR" ]; then
    print_error "JS13K 2021 directory not found: $JS13K2021_DIR"
    exit 1
fi

cd "$JS13K2021_DIR"

# Try to fix npm cache permissions if needed
if [ ! -w "$HOME/.npm" ] 2>/dev/null; then
    print_warning "npm cache may have permission issues. Trying to fix..."
    # Don't use sudo automatically, just warn
    print_warning "If build fails, run: sudo chown -R \$(whoami) ~/.npm"
fi

# Install dependencies
print_status "Installing dependencies for JS13K 2021..."
if npm install 2>&1 | grep -q "EACCES\|permission denied"; then
    print_error "npm permission error. Please run: sudo chown -R \$(whoami) ~/.npm"
    print_warning "Skipping JS13K 2021 build due to npm permissions"
else
    if npm install > /dev/null 2>&1; then
        print_success "Dependencies installed for JS13K 2021"
        
        # Build
        print_status "Building JS13K 2021..."
        # Check if mono is needed (for shader minification)
        if ! command -v mono > /dev/null 2>&1; then
            print_warning "Mono not found - required for shader minification"
            print_warning "Install with: brew install mono"
            print_warning "Attempting build anyway (may fail)..."
        fi
        
        # Try to build, capturing output to check for specific errors
        BUILD_OUTPUT=$(npm run start 2>&1)
        BUILD_EXIT=$?
        
        if [ $BUILD_EXIT -eq 0 ]; then
            if [ -f "index.html" ]; then
                print_success "JS13K 2021 built successfully!"
            else
                print_warning "JS13K 2021 build completed but index.html not found"
            fi
        elif echo "$BUILD_OUTPUT" | grep -q "mono: command not found"; then
            print_error "JS13K 2021 build failed: mono is required"
            print_warning "Install mono with: brew install mono"
            print_warning "Then run the build script again"
        else
            print_error "JS13K 2021 build failed"
            print_warning "Error details: $(echo "$BUILD_OUTPUT" | grep -E "Error|error|at" | tail -2 | head -1)"
        fi
    else
        print_error "Failed to install dependencies for JS13K 2021"
    fi
fi

echo ""

# ============================================================================
# Build Callisto
# ============================================================================
print_status "Building Callisto..."
CALLISTO_DIR="$GAMES_DIR/js13k-callisto-main"

if [ ! -d "$CALLISTO_DIR" ]; then
    print_error "Callisto directory not found: $CALLISTO_DIR"
    exit 1
fi

cd "$CALLISTO_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies for Callisto..."
    if npm install > /dev/null 2>&1; then
        print_success "Dependencies installed for Callisto"
    else
        print_error "Failed to install dependencies for Callisto"
    fi
fi

# Try dev build first (less strict)
print_status "Building Callisto (dev mode)..."
BUILD_OUTPUT=$(npm run dev 2>&1)
BUILD_EXIT=$?

if [ $BUILD_EXIT -eq 0 ]; then
    if [ -f "dist/index.html" ]; then
        print_success "Callisto built successfully (dev mode)!"
    else
        print_warning "Callisto build completed but dist/index.html not found"
    fi
else
    # Try regular build
    print_status "Trying regular build for Callisto..."
    BUILD_OUTPUT=$(npm run build 2>&1)
    BUILD_EXIT=$?
    
    if [ $BUILD_EXIT -eq 0 ]; then
        if [ -f "dist/index.html" ]; then
            print_success "Callisto built successfully!"
        else
            print_warning "Callisto build completed but dist/index.html not found"
        fi
    else
        print_error "Callisto build failed"
        if echo "$BUILD_OUTPUT" | grep -q "esm"; then
            print_warning "The build script has issues with the esm module"
            print_warning "This may be a Node.js version compatibility issue"
            print_warning "Try: nvm use 14 (or another Node.js version)"
        fi
        print_warning "Error: $(echo "$BUILD_OUTPUT" | grep -E "Error|error|at" | tail -2)"
    fi
fi

echo ""

# ============================================================================
# Build Glitch Buster
# ============================================================================
print_status "Building Glitch Buster..."
GLITCH_DIR="$GAMES_DIR/glitch-buster-master"

if [ ! -d "$GLITCH_DIR" ]; then
    print_error "Glitch Buster directory not found: $GLITCH_DIR"
    exit 1
fi

cd "$GLITCH_DIR"

# Check for compiler submodule
COMPILER_JS="js13k-compiler/src/compiler.js"
if [ ! -f "$COMPILER_JS" ]; then
    print_status "Setting up js13k-compiler submodule..."
    
    # Remove empty directory if it exists
    if [ -d "js13k-compiler" ] && [ -z "$(ls -A js13k-compiler 2>/dev/null)" ]; then
        rm -rf js13k-compiler
    fi
    
    # Try manual clone first (more reliable than submodule)
    if [ ! -d "js13k-compiler" ]; then
        print_status "Cloning js13k-compiler repository..."
        if git clone --depth 1 https://github.com/aerolab/js13k-compiler.git js13k-compiler > /dev/null 2>&1; then
            print_success "Compiler cloned successfully"
        else
            # Try submodule as fallback
            print_warning "Direct clone failed, trying submodule..."
            if git submodule update --init --recursive > /dev/null 2>&1; then
                print_success "Submodule initialized"
            else
                print_error "Failed to set up js13k-compiler"
                print_warning "Skipping Glitch Buster build"
                GLITCH_BUILD_SKIP=true
            fi
        fi
    fi
    
    # Check again after initialization
    if [ ! -f "$COMPILER_JS" ] && [ -z "$GLITCH_BUILD_SKIP" ]; then
        # Try to find compiler.js in any location
        FOUND_COMPILER=$(find js13k-compiler -name "compiler.js" -type f 2>/dev/null | head -1)
        if [ -n "$FOUND_COMPILER" ]; then
            print_warning "Found compiler at $FOUND_COMPILER (expected at $COMPILER_JS)"
            # Create directory and copy if needed
            mkdir -p js13k-compiler/src
            if [ ! -f "$COMPILER_JS" ]; then
                cp "$FOUND_COMPILER" "$COMPILER_JS" 2>/dev/null || true
            fi
        else
            print_error "Compiler.js not found in js13k-compiler"
            GLITCH_BUILD_SKIP=true
        fi
    fi
fi

# Build if compiler is available
if [ -z "$GLITCH_BUILD_SKIP" ] && [ -f "$COMPILER_JS" ]; then
    print_status "Building Glitch Buster..."
    BUILD_OUTPUT=$(make build 2>&1)
    BUILD_EXIT=$?
    
    if [ $BUILD_EXIT -eq 0 ]; then
        if [ -f "index.html" ]; then
            print_success "Glitch Buster built successfully!"
        else
            print_warning "Glitch Buster build completed but index.html not found"
        fi
    else
        print_error "Glitch Buster build failed"
        print_warning "Error: $(echo "$BUILD_OUTPUT" | grep -E "Error|error|MODULE_NOT_FOUND" | tail -1)"
        print_warning "Check that all dependencies are installed in js13k-compiler"
    fi
elif [ -z "$GLITCH_BUILD_SKIP" ]; then
    print_error "Compiler not found at $COMPILER_JS"
    print_warning "The js13k-compiler submodule may not be properly initialized"
    print_warning "Try: cd js/games/glitch-buster-master && git submodule update --init --recursive"
fi

echo ""

# ============================================================================
# Summary
# ============================================================================
print_status "Build process completed!"
echo ""
print_status "Summary:"
echo "  - JS13K 2021: $([ -f "$JS13K2021_DIR/index.html" ] && echo -e "${GREEN}✓ Built${NC}" || echo -e "${RED}✗ Not built${NC}")"
echo "  - Callisto: $([ -f "$CALLISTO_DIR/dist/index.html" ] && echo -e "${GREEN}✓ Built${NC}" || echo -e "${RED}✗ Not built${NC}")"
echo "  - Glitch Buster: $([ -f "$GLITCH_DIR/index.html" ] && echo -e "${GREEN}✓ Built${NC}" || echo -e "${RED}✗ Not built${NC}")"
echo ""

# Return to original directory
cd "$SCRIPT_DIR"

