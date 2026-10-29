#!/bin/bash

set -e

if [ "$(id -u)" = 0 ]; then
    echo "Refusing to run as root: set the container user (MUD_UID / MUD_GID in .env)" >&2
    exit 1
fi

BIN_DIR=/opt/fluffos/bin
CONFIG_FILE=${CONFIG_FILE:-/etc/fluffos/config}
RUN_CONFIG=/tmp/$(basename "$CONFIG_FILE")

if [ ! -r "$CONFIG_FILE" ]; then
    echo "Config file not found: $CONFIG_FILE" >&2
    exit 1
fi

cp "$CONFIG_FILE" "$RUN_CONFIG"

sed -i \
    -e "/^debug log file :/cdebug log file : debug-$(date +%Y%m%d-%H%M).log" \
    -e "/^binary directory :/cbinary directory : $BIN_DIR" \
    "$RUN_CONFIG"

exec "$BIN_DIR/driver" "$RUN_CONFIG" "$@"
