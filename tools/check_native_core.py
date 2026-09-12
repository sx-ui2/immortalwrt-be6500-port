#!/usr/bin/env python3
"""Check specified BE6500 core-port DTB facts, NOT bootability or full schema."""

import argparse
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import subprocess
import sys

SOC = "/soc@0"
UART = SOC + "/serial@78af000"
MMC = SOC + "/mmc@7804000"
GCC = SOC + "/clock-controller@1800000"
TLMM = SOC + "/pinctrl@1000000"
FIXED_RESERVATIONS = [
    (0x49B00000, 0x600000), (0x4A100000, 0x400000),
    (0x4A500000, 0x100000), (0x4A600000, 0x200000),
    (0x4A800000, 0x100000), (0x4A900000, 0x2300000),
    (0x4CC00000, 0x100000), (0x4CD00000, 0x100000),
    (0x4CE00000, 0x500000), (0x4DB00000, 0x1100000),
    (0x51E00000, 0x3200000),
]
DISABLED = [
    SOC + "/mdio@90000", SOC + "/ess-instance", SOC + "/edma@3ab00000",
    SOC + "/nss-ppe", SOC + "/remoteproc@d100000", SOC + "/usb3@8a00000",
    SOC + "/pcie@10000000", SOC + "/pcie@18000000", SOC + "/pcie@20000000",
    SOC + "/wifi@c0000000", SOC + "/wifi1@c0000000", SOC + "/wifi2@c0000000",
    SOC + "/wifi3@f00000", SOC + "/wifi4@f00000", SOC + "/wifi5@f00000",
    "/keys", "/userpd1", "/wcss-smp2p", "/qseecom", "/ctx-save",
]


class Fdt:
    def __init__(self, path):
        self.path = str(path)

    @lru_cache(maxsize=None)
    def get(self, path, prop, kind="s"):
        result = subprocess.run(["fdtget", "-t", kind, self.path, path, prop],
                                capture_output=True, text=True, check=False)
        if result.returncode:
            raise ValueError(f"{path}:{prop}: {result.stderr.strip()}")
        return result.stdout.rstrip("\n")

    def cells(self, path, prop):
        return [int(x, 16) for x in self.get(path, prop, "x").split()]

    def children(self, path):
        result = subprocess.run(["fdtget", "-l", self.path, path],
                                capture_output=True, text=True, check=True)
        return result.stdout.splitlines()

    def has(self, path, prop):
        result = subprocess.run(["fdtget", "-p", self.path, path],
                                capture_output=True, text=True, check=False)
        if result.returncode:
            raise ValueError(f"missing node: {path}")
        return prop in result.stdout.splitlines()


def symbol(tree, name, fallback):
    """Resolve a label in debug DTBs, or its stable path in release DTBs.

    OpenWrt's image build does not pass ``-@`` to dtc, so the final DTB has no
    ``/__symbols__`` node.  The candidate uses fixed, checked node paths; keep
    accepting symbol-rich development DTBs while validating the exact release
    artifact as well.
    """
    try:
        return tree.get("/__symbols__", name)
    except ValueError:
        # Confirm the fallback node exists before returning it.  ``children``
        # also succeeds for leaf nodes and avoids silently accepting a typo.
        tree.children(fallback)
        return fallback


def validate(tree, *, stage="core"):
    if stage not in ("core", "ethernet", "wired-initramfs", "radio-audit"):
        raise ValueError("Unknown development stage")
    errors = []
    checked = 0

    def expect(path, prop, expected):
        nonlocal checked
        checked += 1
        actual = tree.cells(path, prop) if isinstance(expected, list) else tree.get(path, prop)
        if actual != expected:
            errors.append(f"{path}:{prop}: expected {expected!r}, got {actual!r}")

    expect("/", "compatible", "jdcloud,be6500 qcom,ipq5332")
    expect("/", "be6500,port-stage", stage + "-only-not-boot-validated")
    expect("/memory@40000000", "reg", [0, 0x40000000, 0, 0x40000000])
    expect(GCC, "compatible", "qcom,ipq5332-gcc")
    gcc = tree.cells(GCC, "phandle")[0]
    tlmm = tree.cells(TLMM, "phandle")[0]
    xo_path = symbol(tree, "xo", "/clocks/xo")
    xo = tree.cells(xo_path, "phandle")[0]
    expect(xo_path, "clock-frequency", [24000000])
    expect(symbol(tree, "sleep_clk", "/clocks/sleep-clk"), "clock-frequency", [32000])
    # Pinned 6.6 header: UART1_APPS=21, BLSP1_AHB=10, SDCC1_AHB/APPS=113/114.
    expect(UART, "clocks", [gcc, 21, gcc, 10])
    expect(UART, "clock-names", "core iface")
    expect(UART, "status", "okay")
    expect(MMC, "clocks", [gcc, 113, gcc, 114, xo])
    expect(MMC, "clock-names", "iface core xo")
    expect(MMC, "status", "okay")
    expect(MMC, "bus-width", [4])
    expect(MMC, "max-frequency", [192000000])
    for prop in ("mmc-ddr-1_8v", "mmc-hs200-1_8v", "non-removable"):
        expect(MMC, prop, [])
    expect("/chosen", "stdout-path", "serial0:115200n8")
    if tree.has("/chosen", "bootargs"):
        errors.append("Unexpected bootargs: do not embed old PARTUUID/boot policy")
    for cpu in range(4):
        expect(f"/cpus/cpu@{cpu}", "compatible", "arm,cortex-a53")

    emmc_pins = symbol(tree, "jd_emmc_pins", TLMM + "/emmc-state")
    expect(MMC, "pinctrl-0", tree.cells(emmc_pins, "phandle"))
    for child, pins, function in [
        ("clk-pins", "gpio13", "sdc_clk"),
        ("cmd-pins", "gpio12", "sdc_cmd"),
        ("data-pins", "gpio8 gpio9 gpio10 gpio11", "sdc_data"),
    ]:
        expect(emmc_pins + "/" + child, "pins", pins)
        expect(emmc_pins + "/" + child, "function", function)
        expect(emmc_pins + "/" + child, "drive-strength", [8])
    serial_pins = symbol(tree, "serial_0_pins", TLMM + "/serial0-state")
    expect(UART, "pinctrl-0", tree.cells(serial_pins, "phandle"))
    expect(serial_pins, "pins", "gpio18 gpio19")
    expect(serial_pins, "function", "blsp0_uart0")
    for color, gpio in [("red", 24), ("green", 33), ("blue", 49)]:
        expect("/leds/led-" + color, "gpios", [tlmm, gpio, 0])
        expect("/leds/led-" + color, "default-state", "keep")
    expect("/keys/joy", "gpios", [tlmm, 31, 1])
    expect("/keys/reset", "gpios", [tlmm, 32, 1])
    ethernet_nodes = {SOC + "/mdio@90000", SOC + "/ess-instance",
                      SOC + "/edma@3ab00000", SOC + "/nss-ppe"}
    for path in DISABLED:
        ethernet_stage = stage in ("ethernet", "wired-initramfs", "radio-audit")
        expect(path, "status", "okay" if ethernet_stage and path in ethernet_nodes else "disabled")
    if tree.has(SOC + "/remoteproc@d100000", "memory-region"):
        errors.append("Unvalidated wireless memory-region is still bound")

    reservations = []
    for child in tree.children("/reserved-memory"):
        path = "/reserved-memory/" + child
        if tree.has(path, "status") and tree.get(path, "status") == "disabled":
            if tree.has(path, "compatible") and tree.get(path, "compatible") == "shared-dma-pool":
                continue
            continue
        reg = tree.cells(path, "reg")
        if len(reg) != 4:
            errors.append(f"{path}: expected one 64-bit fixed reservation")
            continue
        start, size = (reg[0] << 32) | reg[1], (reg[2] << 32) | reg[3]
        reservations.append((start, size))
        if not size or start < 0x40000000 or start + size > 0x80000000:
            errors.append(f"{path}: reservation outside captured 1GiB RAM")
        if not tree.has(path, "no-map"):
            errors.append(f"{path}: no-map is missing")
    reservations.sort()
    if reservations != sorted(FIXED_RESERVATIONS):
        errors.append("Fixed reservations differ from captured/core baseline")
    for (a, size), (b, _) in zip(reservations, reservations[1:]):
        if a + size > b:
            errors.append(f"Overlapping reserved memory at {a:#x} and {b:#x}")
    return {"ok": not errors, "property_checks": checked, "errors": errors,
            "fixed_reservations": len(reservations),
            "boot_validated": False, "flashable": False,
            "scope": "core facts only; not full schema/driver/hardware validation"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dtb", type=Path)
    args = parser.parse_args()
    try:
        result = validate(Fdt(args.dtb))
        result["sha256"] = hashlib.sha256(args.dtb.read_bytes()).hexdigest()
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        result = {"ok": False, "errors": [str(exc)], "boot_validated": False,
                  "flashable": False}
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
