#!/usr/bin/env python3
"""Check the BE6500 native 6.6 wired-initramfs DTB, not its bootability."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import check_native_core as core
import check_native_ethernet as ethernet


def validate(tree):
    result = ethernet.validate(tree, stage="wired-initramfs")
    errors = result["errors"]
    checked = 0

    def expect(path, prop, expected):
        nonlocal checked
        checked += 1
        actual = tree.cells(path, prop) if isinstance(expected, list) else tree.get(path, prop)
        if actual != expected:
            errors.append(f"{path}:{prop}: expected {expected!r}, got {actual!r}")

    expect("/", "model", "JDCloud ZhaoYun BE6500 (6.6 wired initramfs candidate)")
    expect("/chosen", "bootargs-append", " clk_ignore_unused")
    if tree.has("/chosen", "bootargs"):
        errors.append("wired initramfs candidate must not embed root= or flash policy")

    for path in (
        core.SOC + "/pcie@18000000",
        core.SOC + "/remoteproc@d100000",
        core.SOC + "/wifi@c0000000",
        core.SOC + "/wifi1@c0000000",
        core.SOC + "/wifi2@c0000000",
        core.SOC + "/wifi3@f00000",
        core.SOC + "/wifi4@f00000",
        core.SOC + "/wifi5@f00000",
        core.SOC + "/usb3@8a00000",
        "/license_manager",
    ):
        expect(path, "status", "disabled")

    result.update(
        ok=not errors,
        property_checks=result["property_checks"] + checked,
        scope="native core + wired MHT initramfs candidate; no radio, boot or traffic validation",
        boot_validated=False,
        flashable=False,
        sysupgrade_generated=False,
    )
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dtb", type=Path)
    args = parser.parse_args()
    try:
        result = validate(core.Fdt(args.dtb))
        result["sha256"] = hashlib.sha256(args.dtb.read_bytes()).hexdigest()
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        result = {"ok": False, "errors": [str(exc)], "boot_validated": False,
                  "flashable": False, "sysupgrade_generated": False}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
