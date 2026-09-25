#!/usr/bin/env python3
"""Fail closed when an OpenWrt sysupgrade image lost its fwtool metadata."""

import argparse
import json
import pathlib
import struct
import sys


TRAILER_MAGIC = b"FWx0"
TRAILER = struct.Struct(">4sIB3xI")
FWIMAGE_INFO = 1
HEADER_SIZE = 8


def read_metadata(image: pathlib.Path):
    data = image.read_bytes()
    search_from = max(0, len(data) - 1024 * 1024)
    offset = data.rfind(TRAILER_MAGIC, search_from)

    while offset >= 0:
        if offset + TRAILER.size <= len(data):
            magic, _crc32, chunk_type, chunk_size = TRAILER.unpack_from(data, offset)
            payload_size = chunk_size - TRAILER.size
            payload_start = offset - payload_size
            if (
                magic == TRAILER_MAGIC
                and chunk_type == FWIMAGE_INFO
                and chunk_size >= TRAILER.size + HEADER_SIZE
                and payload_start >= 0
            ):
                header = data[payload_start : payload_start + HEADER_SIZE]
                if header == b"\0" * HEADER_SIZE:
                    raw = data[payload_start + HEADER_SIZE : offset]
                    return json.loads(raw.decode("utf-8"))
        offset = data.rfind(TRAILER_MAGIC, search_from, offset)

    raise ValueError("OpenWrt fwtool metadata is missing")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=pathlib.Path)
    parser.add_argument("--require-device")
    args = parser.parse_args()

    try:
        metadata = read_metadata(args.image)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        print(f"{args.image}: {exc}", file=sys.stderr)
        return 1

    devices = metadata.get("supported_devices", [])
    if args.require_device and args.require_device not in devices:
        print(
            f"{args.image}: required device {args.require_device!r} is absent "
            f"from supported_devices={devices!r}",
            file=sys.stderr,
        )
        return 1

    print(json.dumps(metadata, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
