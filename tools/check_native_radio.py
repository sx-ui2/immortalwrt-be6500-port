#!/usr/bin/env python3
"""Audit the disabled BE6500 QCN92xx candidate; never approve boot/flash."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import check_native_core as core
import check_native_ethernet as ethernet

SOC = core.SOC
PCIE = SOC + "/pcie@18000000"
PCIE_PHY = SOC + "/phy_x2@4b1000"
PCIE_RP = PCIE + "/pcie1_rp"
MHI = PCIE_RP + "/qcom,mhi@1"
WIFI0 = SOC + "/wifi@c0000000"
MLO = "/reserved-memory/mlo@4db00000"
HREMOTE = "/reserved-memory/qcn9224-pcie1@51e00000"
MHI_POOL = "/reserved-memory/dma-pool-radio-audit"


def validate(tree):
    result = ethernet.validate(tree, stage="radio-audit")
    errors = result["errors"]
    checked = 0

    def expect(path, prop, expected):
        nonlocal checked
        checked += 1
        actual = tree.cells(path, prop) if isinstance(expected, list) else tree.get(path, prop)
        if actual != expected:
            errors.append(f"{path}:{prop}: expected {expected!r}, got {actual!r}")

    def phandle(path):
        return tree.cells(path, "phandle")

    tlmm = phandle(core.TLMM)
    for path in (PCIE_PHY, PCIE, MHI, MHI_POOL, WIFI0):
        expect(path, "status", "disabled")
    expect(PCIE, "linux,pci-domain", [1])
    expect(PCIE, "num-lanes", [2])
    expect(PCIE, "perst-gpios", tlmm + [47, 1])
    pin = tree.get("/__symbols__", "jd_pcie1_default_state")
    expect(PCIE, "pinctrl-0", phandle(pin))
    expect(pin, "pins", "gpio47")
    expect(pin, "function", "gpio")
    expect(pin, "drive-strength", [8])
    expect(MHI, "reg", [0, 0, 0, 0, 0])
    expect(PCIE_RP, "#address-cells", [3])
    expect(PCIE_RP, "#size-cells", [2])
    expect(MHI, "qrtr_node_id", [0x31])
    expect(MHI, "qcom,board_id", [0x1008])
    expect(MHI, "qcom,caldata_offset", [0x58800])
    expect(MHI, "memory-region", phandle(HREMOTE) + phandle(MHI_POOL) + phandle(MLO))
    expect(MHI, "memory-region-names", "host-ddr-mem mhi-region mlo-global-mem")
    expect(HREMOTE, "reg", [0, 0x51E00000, 0, 0x3200000])
    expect(MLO, "reg", [0, 0x4DB00000, 0, 0x1100000])
    expect(MHI_POOL, "compatible", "shared-dma-pool")
    expect(MHI_POOL, "size", [0, 0x900000])
    expect(MHI_POOL, "alignment", [0, 0x1000])
    expect(MHI_POOL, "no-map", [])
    expect(WIFI0, "qcom,board_id", [0x16])
    checked += 1
    if tree.children(PCIE_RP) != ["qcom,mhi@1"]:
        errors.append("PCIe1 must describe one physical QCN92xx endpoint, not a fabricated second 5 GHz device")

    result.update(
        ok=not errors,
        property_checks=result["property_checks"] + checked,
        scope="disabled radio mapping only; no PCI enumeration, firmware, calibration or PHY validation",
        ath12k_board_data_verified=False,
        dual_mac_mlo_verified=False,
        boot_validated=False,
        flashable=False,
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
                  "flashable": False}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
