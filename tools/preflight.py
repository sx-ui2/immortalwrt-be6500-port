#!/usr/bin/env python3
"""Read-only checks for known BE6500/QSDK 6.6 migration mistakes.

Passing these checks is NOT evidence that an image can boot, that a board-data
file matches the radio, or that the complete vendor wireless stack works.
"""

import argparse
import json
from pathlib import Path
import re
import struct
import sys

from qcn92xx_firmware_audit import (
    audit_caldata_hotplug,
    audit_firmware,
    audit_recipe,
)


BOARD_DTS = Path("target/linux/qualcommax/files/arch/arm64/boot/dts/qcom/ipq5332-jdcloud-be6500.dts")
FIRMWARE_PACKAGE = Path("package/be6500-local/be6500-oem-wifi-firmware")
QCN92XX_FIRMWARE_ROOT = FIRMWARE_PACKAGE / "files/qcn9224"
IMAGE_PROFILE = Path("target/linux/qualcommax/image/ipq53xx.mk")
NETWORK_DEFAULTS = Path("target/linux/qualcommax/ipq53xx/base-files/etc/board.d/02_network")
IPQ53_CONFIG = Path("target/linux/qualcommax/ipq53xx/config-default.qsdk14")
RADIO_EVIDENCE = Path("native-6.6/radio-evidence.json")
CALDATA_HOTPLUG = Path(
    "target/linux/qualcommax/ipq53xx/base-files/etc/hotplug.d/firmware/11-ath12k-caldata"
)
ATH12K_BOARD_MAGIC = b"QCA-ATH12K-BOARD\0"


def check_dts(source):
    errors = []
    if "-only-not-boot-validated" in source:
        errors.append("Development DTS is not a complete router board port; "
                      "do not use it in the full image build.")
    if '"qcom,gcc-ipq5332"' in source:
        errors.append("Legacy 5.4 GCC binding qcom,gcc-ipq5332: QSDK 6.6 uses "
                      "qcom,ipq5332-gcc and different clock/reset IDs. "
                      "Do not fix this by renaming the compatible alone.")
    if not (re.search(r'#include\s+"ipq5332\.dtsi"', source)
            or '"qcom,ipq5332-gcc"' in source):
        errors.append("No native IPQ5332 6.6 base/binding found in the board DTS.")
    return errors


def check_firmware_recipe(source):
    errors = []
    for line in source.splitlines():
        if line.lstrip().startswith("#"):
            continue
        if "bdwlan" in line and re.search(r"/board-2\.bin(?:\s|$)", line):
            errors.append("Raw bdwlan is being renamed to board-2.bin. "
                          "ath12k API2 requires its own magic and typed records.")
    return errors


def check_board2(data):
    if not data.startswith(ATH12K_BOARD_MAGIC):
        return ["board-2.bin lacks the QCA-ATH12K-BOARD magic; this is not an API2 container."]
    # This is intentionally only a rejection check, not an API2 parser or a
    # board-ID/calibration compatibility validator.
    return []


def check_module(data, kernel_release):
    if len(data) < 20 or data[:4] != b"\x7fELF" or data[5] not in (1, 2):
        return ["Not an uncompressed ELF kernel module."]
    endian = "<" if data[5] == 1 else ">"
    machine = struct.unpack_from(endian + "H", data, 18)[0]
    errors = []
    if data[4] != 2 or machine != 183:
        errors.append(f"Expected ELF64/AArch64 (183), got ELF class {data[4]}, machine {machine}.")
    match = re.search(rb"(?:^|\x00)vermagic=([^\x00]+)", data)
    version = match.group(1).split()[0].decode("ascii", "replace") if match else None
    if version != kernel_release:
        errors.append(f"Expected kernel release {kernel_release}, got {version or 'no vermagic'}.")
    # Same ELF architecture and release are necessary, but do not verify symbol
    # CRCs, kernel configuration, compiler compatibility or module dependencies.
    return errors


def check_profile(config):
    if not re.search(r"^CONFIG_PACKAGE_kmod-qca-wifi-unified-profile=y$", config, re.M):
        return ["Requested QSDK unified wireless profile is not selected. "
                "ath11k/ath12k plus OEM firmware is not the QWRT vendor driver stack."]
    return []


def check_wired_profile(source):
    errors = []
    if not re.search(r"^\s*kmod-dsa-qca8k\s*\\?\s*$", source, re.M):
        errors.append("The QCA8386 DSA driver is absent from DEVICE_PACKAGES; "
                      "a compiled qca8k.ko alone does not put it in the image.")
    for package in ("automount", "block-mount", "kmod-usb-storage"):
        if not re.search(rf"(?:^|\s)-{re.escape(package)}(?:\s|\\|$)", source, re.M):
            errors.append(f"The RAM-only diagnostic profile does not exclude {package}.")
    return errors


def check_ipq53_kernel_config(source):
    if not re.search(r"^CONFIG_MDIO_IPQ4019=y$", source, re.M):
        return ["IPQ53xx MDIO is not built in; the first RAM boot proved that the "
                "module was absent and QCA8386 could not be discovered."]
    return []


def _hex_id(value):
    try:
        return int(str(value), 0)
    except (TypeError, ValueError):
        return None


def check_radio_stack(profile, board_dts, evidence=None):
    """Check the external-radio identity and remaining board-data gates.

    QWRT calls the external radio QCN9224, while the actual endpoint enumerates
    as Qualcomm PCI 17cb:1109.  Open ath12k calls device 0x1109 QCN9274.  Chip
    names from the legacy DT/firmware therefore must not be used as a PCI
    compatibility gate; the observed ID and target driver's ID table are the
    authoritative first check.
    """
    if "qcom,cnss-qcn9224" not in board_dts:
        return []
    if not re.search(r"^\s*kmod-ath12k\s*\\?\s*$", profile, re.M):
        return []
    if not isinstance(evidence, dict):
        return ["Generic ath12k is selected but no structured radio evidence was supplied."]

    errors = []
    observed_vendor = _hex_id(evidence.get("observed_pci_vendor"))
    observed_device = _hex_id(evidence.get("observed_pci_device"))
    supported = {_hex_id(item) for item in evidence.get("selected_driver_pci_ids", [])}
    supported.discard(None)
    if observed_vendor != 0x17CB or observed_device is None:
        errors.append("The external radio's observed Qualcomm PCI identity is missing or invalid.")
    elif observed_device not in supported:
        errors.append(f"Observed PCI device 0x{observed_device:04x} is absent from the selected ath12k ID table.")

    if not evidence.get("ath12k_board_data_verified"):
        errors.append("PCI 17cb:1109 and ART extraction are statically proven, but the "
                      "BDF/calibration runtime selection is not verified for ath12k.")
    if not evidence.get("dual_mac_mlo_verified"):
        errors.append("The old QWRT dual-5GHz topology is proven, but the target 6.6 ath12k "
                      "dual-radio path is not verified: QCN9274 HW2.0 must report QMI "
                      "num_phy=2 and WMI must enumerate two pdevs before the second 5 GHz "
                      "radio can be claimed in the new stack.")
    return errors


def check_network_defaults(source):
    errors = []
    if "mmc_get_mac_binary factory 0x0" not in source:
        errors.append("Factory WAN MAC is not read from the proven factory partition offset.")
    if not re.search(r'ucidef_set_interface_macaddr\s+"wan"\s+"\$wan_mac"', source):
        errors.append("Factory WAN MAC is not assigned to the WAN interface.")
    if not re.search(r'ucidef_set_interface_macaddr\s+"lan"\s+"\$lan_mac"', source):
        errors.append("Derived LAN MAC is not assigned to the LAN interface.")
    return errors


def audit(root, require_vendor):
    errors = []
    evidence = None
    evidence_path = root / RADIO_EVIDENCE
    if not evidence_path.is_file():
        errors.append(f"{RADIO_EVIDENCE}: missing input")
    else:
        try:
            evidence = json.loads(evidence_path.read_text())
        except (json.JSONDecodeError, UnicodeError) as exc:
            errors.append(f"{RADIO_EVIDENCE}: invalid JSON: {exc}")

    hotplug_path = root / CALDATA_HOTPLUG
    if not hotplug_path.is_file():
        errors.append(f"{CALDATA_HOTPLUG}: missing input")
    elif isinstance(evidence, dict):
        errors.extend(
            f"{CALDATA_HOTPLUG}: {error}"
            for error in audit_caldata_hotplug(hotplug_path.read_text(), evidence)
        )

    qcn_firmware_root = root / QCN92XX_FIRMWARE_ROOT
    recipe_path = root / FIRMWARE_PACKAGE / "Makefile"
    if not qcn_firmware_root.is_dir():
        errors.append(f"{QCN92XX_FIRMWARE_ROOT}: missing input")
    elif isinstance(evidence, dict):
        errors.extend(
            f"{QCN92XX_FIRMWARE_ROOT}: {error}"
            for error in audit_firmware(qcn_firmware_root, evidence)
        )
    if recipe_path.is_file() and isinstance(evidence, dict):
        errors.extend(
            f"{FIRMWARE_PACKAGE / 'Makefile'}: {error}"
            for error in audit_recipe(recipe_path.read_text(), evidence)
        )

    checks = [(BOARD_DTS, check_dts),
              (FIRMWARE_PACKAGE / "Makefile", check_firmware_recipe),
              (IMAGE_PROFILE, check_wired_profile),
              (IPQ53_CONFIG, check_ipq53_kernel_config),
              (NETWORK_DEFAULTS, check_network_defaults)]
    if require_vendor:
        checks.append((Path("initramfs.config"), check_profile))
    for relative, check in checks:
        path = root / relative
        if not path.is_file():
            errors.append(f"{relative}: missing input")
            continue
        errors.extend(f"{relative}: {error}" for error in check(path.read_text()))
    profile_path = root / IMAGE_PROFILE
    dts_path = root / BOARD_DTS
    if profile_path.is_file() and dts_path.is_file():
        errors.extend(
            f"{IMAGE_PROFILE}: {error}"
            for error in check_radio_stack(profile_path.read_text(), dts_path.read_text(), evidence)
        )
    for path in (root / FIRMWARE_PACKAGE / "files").rglob("board-2.bin"):
        errors.extend(f"{path.relative_to(root)}: {error}" for error in check_board2(path.read_bytes()))
    return errors


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--require-vendor-wifi", action="store_true")
    parser.add_argument("--module", type=Path, action="append", default=[])
    parser.add_argument("--kernel-release", default="6.6.116+")
    args = parser.parse_args(argv)
    try:
        errors = audit(args.root, args.require_vendor_wifi)
        for path in args.module:
            errors.extend(f"{path}: {error}" for error in check_module(path.read_bytes(), args.kernel_release))
    except (OSError, UnicodeError) as exc:
        print(f"BLOCKED: unreadable input: {exc}", file=sys.stderr)
        return 1
    if errors:
        for error in errors:
            print(f"BLOCKED: {error}", file=sys.stderr)
        print("No build/deployment started. Fix the source mismatch before retrying.", file=sys.stderr)
        return 1
    print("Known input mismatch checks passed. This is NOT boot or flash approval.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
