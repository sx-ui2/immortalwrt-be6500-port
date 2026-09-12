#!/usr/bin/env python3
"""Reject incomplete BE6500 external-radio driver source trees.

This is a source-acquisition gate, not a compatibility certification.  A pass
only means that the obvious pieces are present for manual review and a real
kernel build.  Runtime firmware ABI, BDF/calibration selection, MLO/dual-MAC
operation and hardware startup still require logs from the target board.
"""

import argparse
from pathlib import Path
import re
import sys


TEXT_NAMES = {"Kbuild", "Kconfig", "Makefile"}
TEXT_SUFFIXES = {".c", ".h", ".mk", ".txt"}
MAX_TEXT_SIZE = 2 * 1024 * 1024


def _text_files(root):
    for path in root.rglob("*"):
        if ".git" in path.parts or not path.is_file():
            continue
        if path.name not in TEXT_NAMES and path.suffix not in TEXT_SUFFIXES:
            continue
        try:
            if path.stat().st_size <= MAX_TEXT_SIZE:
                yield path
        except OSError:
            continue


def _read(path):
    return path.read_text(encoding="utf-8", errors="replace")


def _find_ath12k(root):
    candidates = (
        root,
        root / "ath12k",
        root / "drivers/net/wireless/ath/ath12k",
    )
    for candidate in candidates:
        if (candidate / "pci.c").is_file() and (candidate / "core.c").is_file():
            return candidate
    return None


def audit_ath12k(root, pci_id=0x1109):
    """Reject ath12k source without the endpoint's observed PCI binding.

    The legacy driver calls the device QCN9224, while PCI reports 17cb:1109 and
    open ath12k labels 0x1109 QCN9274.  Audit the numeric identity, not either
    product-name string.
    """
    ath12k = _find_ath12k(root)
    if ath12k is None:
        return ["ath12k source directory with pci.c and core.c was not found."]

    files = list(_text_files(ath12k))
    corpus = "\n".join(_read(path) for path in files)
    pci_files = [path for path in files if path.name == "pci.c"]
    pci_corpus = "\n".join(_read(path) for path in pci_files)
    errors = []
    id_literal = rf"0[xX]{pci_id:04x}"
    definitions = re.findall(rf"#define\s+([A-Za-z0-9_]+)\s+{id_literal}\b", corpus)
    literal_binding = re.search(rf"PCI_(?:V?DEVICE)\([^\n]*{id_literal}", pci_corpus)
    symbol_binding = any(re.search(rf"PCI_(?:V?DEVICE)\([^\n]*\b{re.escape(symbol)}\b",
                                   pci_corpus)
                         for symbol in definitions)
    if not literal_binding and not symbol_binding:
        errors.append(f"No ath12k PCI table binding for observed device 0x{pci_id:04x} was found.")

    hw_sources = "\n".join(_read(path) for path in files
                           if path.name in {"core.c", "core.h", "hw.c", "hw.h", "pci.c"})
    symbols = set(definitions)
    symbols.update(re.findall(r"\b(?:ATH12K_HW_)?QCN9274_[A-Z0-9_]+", pci_corpus.upper()))
    if not any(symbol in hw_sources for symbol in symbols):
        errors.append(f"No hardware-parameter path associated with PCI device 0x{pci_id:04x} was found.")
    return errors


def audit_vendor(root):
    """Reject a partial QSDK component_dev checkout.

    The checked QSDK r9 monitor Kbuild references all of these siblings.  Their
    presence is necessary, but still not sufficient, for a vendor-stack build.
    """
    if (root / "dp/wifi3.0/monitor/Kbuild").is_file() and not (root / "component_dev").is_dir():
        return ["The supplied path is component_dev only; its required sibling trees are absent."]

    required = (
        "component_dev/dp/wifi3.0/monitor/Kbuild",
        "cmn_dev/qdf",
        "cmn_dev/hif",
        "cmn_dev/wmi",
        "cmn_dev/target_if",
        "cmn_dev/fw_hdr/hw/qcn9224",
        "os/linux/Makefile-linux.common",
    )
    errors = []
    for relative in required:
        if not (root / relative).exists():
            errors.append(f"Missing vendor source dependency: {relative}")

    if not any((root / name).is_file() for name in ("Kbuild", "Makefile")):
        errors.append("No top-level vendor Kbuild/Makefile integration entry was found.")

    files = list(_text_files(root)) if root.is_dir() else []
    corpus = "\n".join(_read(path) for path in files).upper()
    if "QCN9224" not in corpus:
        errors.append("Vendor tree has no QCN9224 target or hardware-header marker.")
    if "MLO" not in corpus and "MULTI_LINK" not in corpus:
        errors.append("Vendor tree has no MLO/multi-link source marker for the dual-MAC review.")
    return errors


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ath12k", type=Path,
                        help="Backports/kernel tree or ath12k directory to audit")
    parser.add_argument("--pci-id", type=lambda value: int(value, 0), default=0x1109,
                        help="Observed PCI device ID (default: 0x1109)")
    parser.add_argument("--vendor", type=Path,
                        help="Complete qca-wifi root containing component_dev and cmn_dev")
    args = parser.parse_args(argv)
    if not args.ath12k and not args.vendor:
        parser.error("at least one of --ath12k or --vendor is required")

    errors = []
    try:
        if args.ath12k:
            errors.extend(f"ath12k: {item}" for item in audit_ath12k(args.ath12k, args.pci_id))
        if args.vendor:
            errors.extend(f"vendor: {item}" for item in audit_vendor(args.vendor))
    except OSError as exc:
        errors.append(f"unreadable source input: {exc}")

    if errors:
        for error in errors:
            print(f"BLOCKED: {error}", file=sys.stderr)
        print("No wireless image approval. Acquire the complete matching source stack first.",
              file=sys.stderr)
        return 1

    print("Minimum source markers passed; manual build, ABI, BDF and hardware validation remain required.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
