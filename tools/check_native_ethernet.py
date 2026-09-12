#!/usr/bin/env python3
"""Check BE6500 ethernet candidate wiring/bindings, NOT hardware operation."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import check_native_core as core

SOC = core.SOC
MDIO = SOC + "/mdio@90000"
ESS = SOC + "/ess-instance"
PPE = ESS + "/ess-switch@3a000000"
MHT = ESS + "/ess-switch1@1"
DSA = MDIO + "/switch@10"
EDMA = SOC + "/edma@3ab00000"
WAN = SOC + "/ethernet@3a504000"
CPU = SOC + "/ethernet@3a500000"
BASELINE = Path(__file__).resolve().parents[1] / "native-6.6/artifacts/core.static-only.dtb"


def validate(tree, baseline=None, *, stage="ethernet"):
    result = core.validate(tree, stage=stage)
    errors = result["errors"]
    baseline = baseline or core.Fdt(BASELINE)
    checked = 0

    def expect(path, prop, expected):
        nonlocal checked
        checked += 1
        actual = tree.cells(path, prop) if isinstance(expected, list) else tree.get(path, prop)
        if actual != expected:
            errors.append(f"{path}:{prop}: expected {expected!r}, got {actual!r}")

    def absent(path, prop):
        nonlocal checked
        checked += 1
        if tree.has(path, prop):
            errors.append(f"{path}:{prop}: legacy/unvalidated property must be absent")

    def phandle(path):
        return tree.cells(path, "phandle")

    tlmm = phandle(core.TLMM)
    expect(MDIO, "phy-reset-gpio", tlmm + [51, 1])
    expect(MHT, "link-intr-gpio", tlmm + [23, 0])
    expect(MDIO, "phyaddr_fixup", [0xC90F018])
    expect(MDIO, "uniphyaddr_fixup", [0xC90F014])
    expect(MDIO, "mdio_clk_fixup", [])
    expect(MDIO, "#size-cells", [0])
    pin_paths = [core.symbol(tree, name, core.TLMM + "/" + fallback)
                 for name, fallback in (("mdio1_pins", "mdio1-state"),
                                        ("mdio0_pins", "mdio0-state"))]
    expect(MDIO, "pinctrl-0", phandle(pin_paths[0]) + phandle(pin_paths[1]))
    for index, pin in enumerate(pin_paths):
        # Pin functions and bias/drive details must remain the native SoC's.
        other = core.symbol(
            baseline,
            ("mdio1_pins", "mdio0_pins")[index],
            core.TLMM + "/" + ("mdio1-state", "mdio0-state")[index],
        )
        for child in tree.children(pin):
            for prop in ("pins", "function", "drive-strength"):
                value = baseline.cells(other + "/" + child, prop) if prop == "drive-strength" else baseline.get(other + "/" + child, prop)
                expect(pin + "/" + child, prop, value)

    # Provider phandles can change with compilation; resolve before comparing.
    def clock_refs(dt, path, prop):
        providers = {
            dt.cells(core.symbol(dt, name, fallback), "phandle")[0]: name
            for name, fallback in (("gcc", core.GCC),
                                   ("nsscc", SOC + "/nsscc@39b00000"))
        }
        cells = dt.cells(path, prop)
        if len(cells) % 2:
            raise ValueError(f"{path}:{prop}: invalid clock/reset cell count")
        return [(providers.get(cells[i], f"unknown-{cells[i]}"), cells[i + 1])
                for i in range(0, len(cells), 2)]

    for path in (MDIO, PPE, EDMA):
        for prop in ("clocks", "resets"):
            if baseline.has(path, prop):
                checked += 1
                if clock_refs(tree, path, prop) != clock_refs(baseline, path, prop):
                    errors.append(f"{path}:{prop}: does not match pinned native 6.6 bindings")
        for prop in ("clock-names", "reset-names", "reg-names", "compatible"):
            if baseline.has(path, prop):
                expect(path, prop, baseline.get(path, prop))
        expect(path, "reg", baseline.cells(path, "reg"))

    expect("/aliases", "ethernet0", WAN)
    expect("/aliases", "ethernet1", CPU)
    for path, macid, address in ((WAN, 2, 0x3A504000), (CPU, 1, 0x3A500000)):
        expect(path, "compatible", "qcom,nss-dp")
        expect(path, "reg", [address, 0x4000])
        expect(path, "qcom,id", [macid])
        expect(path, "qcom,mactype", [1])
        expect(path, "status", "okay")
        for prop in ("phy-mode", "qcom,link-poll", "qcom,phy-mdio-addr", "local-mac-address", "mac-address"):
            absent(path, prop)
    for prop in ("qcom,mht-dev", "qcom,is_switch_connected", "qcom,ppe-offload-disabled"):
        expect(CPU, prop, [1])
    expect(ESS, "num_devices", [2])
    for path, bitmaps, modes in ((PPE, (1, 2, 4), (12, 15)), (MHT, (1, 14, 0), (12, 255))):
        expect(path, "mdio-bus", phandle(MDIO))
        for suffix, value in zip(("cpu", "lan", "wan"), bitmaps):
            expect(path, "switch_" + suffix + "_bmp", [value])
        expect(path, "switch_mac_mode", [modes[0]])
        expect(path, "switch_mac_mode1", [modes[1]])
    expect(PPE, "switch_mac_mode2", [255])
    expect(MHT, "compatible", "qcom,ess-switch-qca8386")
    expect(MHT, "device_id", [1])
    expect(MHT, "link-polling-required", [0])
    expect(MHT, "fdb_sync", "interrupt")

    uplink = PPE + "/qcom,port_phyinfo/port@0"
    expect(uplink, "port_id", [1])
    expect(uplink, "forced-speed", [2500])
    expect(uplink, "forced-duplex", [1])
    expect(uplink + "/fixed-link", "speed", [2500])
    expect(uplink + "/fixed-link", "full-duplex", [])
    expect(uplink + "/switch_external", "switch_handle", phandle(MHT))
    expect(uplink + "/switch_external", "switch_cpu_port", [0])
    wan_phy = PPE + "/qcom,port_phyinfo/port@1"
    expect(wan_phy, "port_id", [2])
    expect(wan_phy, "phy_address", [4])
    expect(wan_phy, "phy-handle", phandle(MDIO + "/ethernet-phy@4"))
    expect(wan_phy, "phy-mode", "sgmii")
    expect(DSA, "compatible", "qca,qca8386")
    expect(DSA, "reg", [16])
    expect(DSA + "/ports/port@0", "ethernet", phandle(CPU))
    expect(DSA + "/ports/port@0", "dsa-tag-protocol", "qca_8021q")
    checked += 1
    if set(tree.children(DSA + "/ports")) != {f"port@{i}" for i in range(4)}:
        errors.append("DSA must describe CPU plus three LAN ports, not a fourth LAN PHY")
    for i in range(1, 5):
        expect(MDIO + f"/ethernet-phy@{i}", "reg", [i])
        expect(MDIO + f"/ethernet-phy@{i}", "fixup", [])
        if i < 4:
            port = DSA + f"/ports/port@{i}"
            expect(port, "reg", [i])
            expect(port, "label", f"lan{i}")
            expect(port, "phy-handle", phandle(MDIO + f"/ethernet-phy@{i}"))
            expect(port, "phy-mode", "internal")
            expect(MHT + f"/qcom,port_phyinfo/port@{i}", "port_id", [i])
            expect(MHT + f"/qcom,port_phyinfo/port@{i}", "phy_address", [i])

    # QSDK MHT allocation: 12 regular TX rings + 8 additional switch TX rings.
    for suffix, value in {
        "txdesc-ring-start": 4, "txdesc-rings": 12, "mht-txdesc-rings": 8,
        "txcmpl-ring-start": 4, "txcmpl-rings": 12, "mht-txcmpl-rings": 8,
        "rxfill-ring-start": 4, "rxfill-rings": 4, "rxdesc-ring-start": 12,
        "rxdesc-rings": 4, "tx-map-priority-level": 1, "rx-map-priority-level": 1,
        "ppeds-num": 2, "num_loopback_rings": 1,
    }.items():
        expect(EDMA, "qcom," + suffix, [value])
    expect(EDMA, "qcom,txdesc-map", list(range(8, 16)) + list(range(4, 8)) + list(range(16, 24)))
    expect(EDMA, "qcom,txdesc-fc-grp-map", [1, 2, 3, 4, 5])
    expect(EDMA, "qcom,rxfill-map", [4, 5, 6, 7])
    expect(EDMA, "qcom,rxdesc-map", [12, 13, 14, 15])
    expect(EDMA, "qcom,rx-ring-queue-map", [q + cpu * 8 for q in range(8) for cpu in range(4)])
    irq_ids = list(range(163, 175)) + list(range(139, 143)) + [191] + list(range(155, 159))
    irq_ids += [160, 128, 152, 161, 129, 153] + list(range(175, 183))
    expect(EDMA, "interrupts", [cell for irq in irq_ids for cell in (0, irq, 4)])

    result.update(ok=not errors, property_checks=result["property_checks"] + checked,
                  scope="core + ethernet wiring/resource checks; no boot, traffic or physical-jack validation",
                  factory_mac_provisioned=False, physical_jack_order_validated=False)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dtb", type=Path)
    args = parser.parse_args()
    try:
        result = validate(core.Fdt(args.dtb))
        result["sha256"] = hashlib.sha256(args.dtb.read_bytes()).hexdigest()
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        result = {"ok": False, "errors": [str(exc)], "boot_validated": False, "flashable": False}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
