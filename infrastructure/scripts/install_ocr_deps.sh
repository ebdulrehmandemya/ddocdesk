#!/bin/bash

echo "🔍 Detecting Operating System..."

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "🍎 Detected macOS."
    if ! command -v brew &> /dev/null; then
        echo "❌ Homebrew is not installed. Please install it from https://brew.sh"
        exit 1
    fi
    echo "🍺 Installing Tesseract and Poppler via Homebrew..."
    brew install tesseract poppler
    
elif [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "linux-musl"* ]]; then
    # Linux
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO=$ID
    else
        echo "❌ Cannot detect Linux distribution."
        exit 1
    fi

    case "$DISTRO" in
        ubuntu|debian|linuxmint|pop)
            echo "🐧 Detected Debian/Ubuntu-based Linux."
            sudo apt-get update
            sudo apt-get install -y tesseract-ocr poppler-utils
            ;;
        fedora|rhel|centos)
            echo "🐧 Detected Fedora/RHEL-based Linux."
            sudo dnf install -y tesseract poppler-utils
            ;;
        arch|manjaro|endeavouros)
            echo "🐧 Detected Arch-based Linux."
            sudo pacman -Syu --noconfirm tesseract poppler
            ;;
        *)
            echo "⚠️ Unrecognized Linux distribution ($DISTRO)."
            echo "Please manually install 'tesseract' and 'poppler-utils' using your package manager."
            exit 1
            ;;
    esac

else
    echo "❌ Unsupported OS: $OSTYPE"
    echo ""
    echo "🪟 If you are on Windows:"
    echo "   1. Open PowerShell as Administrator."
    echo "   2. Run: choco install tesseract poppler"
    echo "   (Requires Chocolatey: https://chocolatey.org/install)"
    echo ""
    echo "   Alternatively, if you use WSL (Windows Subsystem for Linux),"
    echo "   run this script inside your WSL Ubuntu terminal."
    exit 1
fi

echo ""
echo "✅ Installation complete!"
