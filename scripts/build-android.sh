#!/usr/bin/env bash
# Build the Android app (APK) with the MSVC toolchain actually on PATH.
#
# Why this script exists rather than calling `tauri android build` directly:
#
# Git Bash ships coreutils' `link` as `/usr/bin/link.exe`, and cargo resolves the
# linker by name. With Git Bash's bin directory ahead of the MSVC toolchain on
# PATH, `link.exe` is coreutils' *hard-link utility*, not MSVC's linker, and every
# Rust build script fails with:
#
#   link: extra operand '...'
#   Try 'link --help' for more information.
#
# That message is coreutils', not MSVC's - which is the tell. It is easy to
# misread as a missing Windows SDK. The SDK and BuildTools are usually installed;
# what is missing is the PATH order and `LIB`.
#
# Usage:
#   ./scripts/build-android.sh            # debug APK
#   ./scripts/build-android.sh --release  # release APK (needs a signing config)
#
# Prerequisites: JDK 17+, Android SDK + NDK, Rust android targets
# (rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android).

set -euo pipefail

cd "$(dirname "$0")/.."

fail() { echo "error: $*" >&2; exit 1; }

# ---- Android SDK -----------------------------------------------------------
: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-$LOCALAPPDATA/Android/Sdk}}"
[ -d "$ANDROID_HOME" ] || fail "Android SDK not found at '$ANDROID_HOME'. Set ANDROID_HOME."
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"

# The NDK the project was last built against; pick the newest if that is gone.
if [ -z "${NDK_HOME:-}" ]; then
  NDK_HOME=$(ls -d "$ANDROID_HOME"/ndk/* 2>/dev/null | sort -V | tail -1 || true)
fi
[ -n "${NDK_HOME:-}" ] || fail "No NDK under '$ANDROID_HOME/ndk'. Install one with sdkmanager."
export NDK_HOME

# Tauri's Android environment setup reads ProgramData, which some shells
# (Git Bash under a sandbox, CI images) do not export. Its absence produces
# "The `ProgramData` environment variable isn't set, which is quite weird".
: "${ProgramData:=C:/ProgramData}"
export ProgramData PROGRAMDATA="$ProgramData"

# ---- MSVC ----------------------------------------------------------------
# vswhere is the supported way to find a VS install; the glob is the fallback
# for a BuildTools-only install that vswhere sometimes reports oddly.
find_msvc() {
  local vswhere="/c/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe"
  local root=""
  if [ -x "$vswhere" ]; then
    root=$("$vswhere" -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 \
      -property installationPath 2>/dev/null | tr -d '\r' || true)
  fi
  if [ -z "$root" ]; then
    root=$(ls -d "/c/Program Files (x86)/Microsoft Visual Studio/2022"/* 2>/dev/null | head -1 || true)
  fi
  [ -n "$root" ] || return 1
  local win_root
  win_root=$(cygpath -u "$root" 2>/dev/null || echo "$root")
  ls -d "$win_root"/VC/Tools/MSVC/* 2>/dev/null | sort -V | tail -1
}

MSVC_DIR=$(find_msvc || true)
[ -n "$MSVC_DIR" ] || fail "MSVC toolchain not found. Install 'Visual Studio Build Tools' with the C++ workload."

# Hostx64/x64 is the host linker for an x64 host; the Android targets are linked
# by the NDK's own linker, which Tauri configures separately.
export PATH="$MSVC_DIR/bin/Hostx64/x64:$PATH"

# `LIB` is what the linker resolves kernel32.lib & co from. Without it the link
# fails on the first system library - the symptom the README used to describe.
WIN_KITS=$(ls -d "/c/Program Files (x86)/Windows Kits/10/Lib"/* 2>/dev/null | sort -V | tail -1 || true)
[ -n "$WIN_KITS" ] || fail "Windows SDK libs not found under '/c/Program Files (x86)/Windows Kits/10/Lib'."

msvc_lib=$(cygpath -w "$MSVC_DIR/lib/x64")
kits_lib=$(cygpath -w "$WIN_KITS")
export LIB="$msvc_lib;$kits_lib\\ucrt\\x64;$kits_lib\\um\\x64"

# ---- sanity check ---------------------------------------------------------
# Fail here with a clear message rather than 11 minutes into a Gradle build.
#
# The probe directory is relative to the repository on purpose. `mktemp -d`
# returns an absolute Windows path, and a shell that rewrites absolute paths
# (Git Bash's MSYS layer, some sandboxes) can turn it into a relative one that
# the cleanup then deletes from the wrong place.
probe=".android-build-probe"
rm -rf "$probe" 2>/dev/null || true
mkdir -p "$probe"
printf 'fn main(){}\n' > "$probe/probe.rs"
if ! rustc "$probe/probe.rs" -o "$probe/probe.exe" 2>"$probe/err"; then
  echo "error: the MSVC linker still cannot produce an executable." >&2
  echo "       PATH=$PATH" >&2
  echo "       LIB=$LIB" >&2
  sed 's/^/       /' "$probe/err" >&2
  find "$probe" -type f -delete 2>/dev/null || true
  rmdir "$probe" 2>/dev/null || true
  exit 1
fi
find "$probe" -type f -delete 2>/dev/null || true
rmdir "$probe" 2>/dev/null || true

echo "toolchain ok"
echo "  ANDROID_HOME = $ANDROID_HOME"
echo "  NDK_HOME     = $NDK_HOME"
echo "  MSVC         = $MSVC_DIR"
echo ""

# ---- build ----------------------------------------------------------------
if [ "${1:-}" = "--release" ]; then
  exec npx tauri android build --apk
else
  exec npx tauri android build --debug --apk
fi
