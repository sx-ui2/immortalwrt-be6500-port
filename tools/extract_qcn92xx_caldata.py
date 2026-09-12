#!/usr/bin/env python3
"""Audit or extract BE6500 QCN92xx calibration data from an ART image.

The default mode is read-only.  An output file is written only when the caller
supplies ``--output``; an existing output additionally requires ``--force``.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile


DEFAULT_TARGET = "ath12k/QCN92XX/hw1.0/cal-pci-0001:01:00.0.bin"


def parse_integer(value):
    return int(value, 0)


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def extract_art_slice(path, offset, size):
    if offset < 0:
        raise ValueError("ART offset must not be negative.")
    if size <= 0:
        raise ValueError("Calibration size must be positive.")
    if not path.is_file():
        raise ValueError(f"ART input is not a regular file: {path}")

    source_size = path.stat().st_size
    end = offset + size
    if end > source_size:
        raise ValueError(
            f"ART input is too short: need bytes {offset}..{end - 1}, "
            f"file size is {source_size}."
        )

    with path.open("rb") as stream:
        stream.seek(offset)
        data = stream.read(size)
    if len(data) != size:
        raise ValueError(f"Short read from ART input: got {len(data)}, expected {size}.")
    return data


def validate_calibration(data, expected_sha256=None):
    if not data:
        raise ValueError("Calibration data is empty.")
    if data == bytes(len(data)):
        raise ValueError("Calibration data is entirely 0x00.")
    if data == b"\xff" * len(data):
        raise ValueError("Calibration data is entirely 0xff.")

    digest = sha256_bytes(data)
    if expected_sha256 and digest.lower() != expected_sha256.lower():
        raise ValueError(
            f"Calibration SHA256 mismatch: got {digest}, expected {expected_sha256}."
        )
    return digest


def write_output(path, data, force=False):
    if path.exists() and not force:
        raise ValueError(f"Output already exists (use --force to replace it): {path}")
    if not path.parent.is_dir():
        raise ValueError(f"Output parent directory does not exist: {path.parent}")

    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
                mode="wb", dir=path.parent, prefix=f".{path.name}.", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(0o644)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--art", required=True, type=Path,
                        help="raw image of the device's 0:ART partition")
    parser.add_argument("--evidence", required=True, type=Path,
                        help="radio-evidence.json containing the proven offset/size/hash")
    parser.add_argument("--output", type=Path,
                        help="explicit destination; omitted for read-only audit mode")
    parser.add_argument("--force", action="store_true",
                        help="allow replacing an existing explicit output")
    args = parser.parse_args(argv)

    try:
        evidence = json.loads(args.evidence.read_text(encoding="utf-8"))
        offset = int(evidence["legacy_calibration_art_offset"])
        size = int(evidence["legacy_calibration_size"])
        expected = evidence.get("legacy_calibration_sha256")
        target = evidence.get("ath12k_calibration_request", DEFAULT_TARGET)
        data = extract_art_slice(args.art, offset, size)
        digest = validate_calibration(data, expected)
        if args.output:
            write_output(args.output, data, args.force)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"BLOCKED: {error}", file=sys.stderr)
        return 1

    result = {
        "ok": True,
        "mode": "extract" if args.output else "audit-only",
        "art": str(args.art),
        "art_offset": offset,
        "calibration_size": size,
        "sha256": digest,
        "ath12k_request_path": target,
        "output": str(args.output) if args.output else None,
        "runtime_radio_validated": False,
        "flashable": False,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
