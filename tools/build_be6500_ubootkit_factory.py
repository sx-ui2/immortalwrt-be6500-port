#!/usr/bin/env python3
"""Build a JDCloud BE6500 factory image accepted by uBootKit.

The replacement bootloader does not accept an OpenWrt sysupgrade tar or a
scripted recovery FIT on its "firmware update" page.  It expects the JDCloud
factory layout: a FIT kernel in a 7 MiB HLOS slot, followed by a SquashFS root
image and a big-endian DEADC0DE end marker at a 64 KiB boundary.
"""

from __future__ import annotations

import argparse
import hashlib
import struct
import tarfile
from pathlib import Path


HLOS_SIZE = 7 * 1024 * 1024
ROOTFS_PARTITION_SIZE = 75 * 1024 * 1024
ERASE_BLOCK_SIZE = 64 * 1024
FDT_MAGIC = bytes.fromhex("d00dfeed")
SQUASHFS_MAGIC = b"hsqs"
EOF_MARKER = bytes.fromhex("deadc0de")


def find_member(archive: tarfile.TarFile, leaf: str) -> tarfile.TarInfo:
    matches = [member for member in archive.getmembers() if member.name.endswith(f"/{leaf}")]
    if len(matches) != 1:
        raise ValueError(f"expected one sysupgrade {leaf!r} member, found {len(matches)}")
    return matches[0]


def read_member(archive: tarfile.TarFile, member: tarfile.TarInfo) -> bytes:
    source = archive.extractfile(member)
    if source is None:
        raise ValueError(f"cannot read {member.name}")
    return source.read()


def build(sysupgrade: Path, output: Path) -> tuple[int, str]:
    with tarfile.open(sysupgrade, "r:*") as archive:
        kernel = read_member(archive, find_member(archive, "kernel"))
        root = read_member(archive, find_member(archive, "root"))

    if not kernel.startswith(FDT_MAGIC):
        raise ValueError("sysupgrade kernel is not a FIT/FDT image")
    fit_size = struct.unpack(">I", kernel[4:8])[0]
    if fit_size > len(kernel):
        raise ValueError("FIT total size exceeds the kernel member length")
    if len(kernel) > HLOS_SIZE:
        raise ValueError(f"kernel exceeds the {HLOS_SIZE}-byte HLOS slot")
    if not root.startswith(SQUASHFS_MAGIC):
        raise ValueError("sysupgrade root is not a little-endian SquashFS image")
    if len(root) % ERASE_BLOCK_SIZE:
        raise ValueError("root member is not padded to a 64 KiB erase-block boundary")
    if len(root) + len(EOF_MARKER) > ROOTFS_PARTITION_SIZE:
        raise ValueError("root image and end marker exceed the rootfs partition")

    output.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with output.open("wb") as target:
        for chunk in (kernel, bytes(HLOS_SIZE - len(kernel)), root, EOF_MARKER):
            target.write(chunk)
            digest.update(chunk)

    expected_size = HLOS_SIZE + len(root) + len(EOF_MARKER)
    actual_size = output.stat().st_size
    if actual_size != expected_size:
        raise RuntimeError(f"output size mismatch: expected {expected_size}, got {actual_size}")

    with output.open("rb") as built:
        built.seek(HLOS_SIZE)
        if built.read(4) != SQUASHFS_MAGIC:
            raise RuntimeError("SquashFS is not located at the required 7 MiB boundary")
        built.seek(-len(EOF_MARKER), 2)
        if built.read() != EOF_MARKER:
            raise RuntimeError("factory image is missing its DEADC0DE trailer")

    return actual_size, digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("sysupgrade", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    size, digest = build(args.sysupgrade, args.output)
    print(f"wrote {args.output}")
    print(f"size {size} (0x{size:x})")
    print(f"sha256 {digest}")


if __name__ == "__main__":
    main()
