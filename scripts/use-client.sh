#!/bin/sh
# Point the engine at one client's content for local work.
#   pnpm client ../acme-site                      symlink a local checkout
#   pnpm client git@github.com:acme/acme-site.git clone it into ./client
set -e
src="$1"
[ -z "$src" ] && { echo "usage: pnpm client <path-or-git-url>"; exit 1; }
rm -rf client
case "$src" in
  *://*|git@*) git clone --depth 1 "$src" client ;;
  *) ln -s "$(cd "$src" && pwd)" client ;;
esac
echo "Using client content from $src. Run: pnpm dev"
