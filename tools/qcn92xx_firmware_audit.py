#!/usr/bin/env python3
"""Audit the BE6500 QCN92xx firmware inputs without claiming hardware success."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys


REQUIRED_STATIC_FILES = (
    "amss.bin",
    "amss_dualmac.bin",
    "m3.bin",
    "regdb.bin",
    "qdss_trace_config.bin",
)


def _parse_legacy_external_pdevs(text):
    """Return soc1 pdev/PHY/range tuples from the saved QWRT boot log."""
    lines = text.splitlines()
    pdevs = []
    for index, line in enumerate(lines):
        match = re.search(r"__ol_ath_attach:.*soc1 pdev:\s*(wifi\d+)\b", line)
        if not match:
            continue
        window = "\n".join(lines[index:index + 12])
        phy = re.search(r"phy id\s*=\s*(\d+)\b", window)
        limits = re.search(
            r"lo_5ghz\s*=\s*(\d+)\s*,\s*hi_5ghz\s*=\s*(\d+)", window)
        if phy and limits:
            pdevs.append({
                "interface": match.group(1),
                "phy_id": int(phy.group(1)),
                "lo_5ghz_mhz": int(limits.group(1)),
                "hi_5ghz_mhz": int(limits.group(2)),
            })
    return pdevs


def audit_legacy_runtime_log(text, evidence):
    """Validate the old 5.4/QWRT dual-5GHz evidence without blessing 6.6."""
    errors = []
    required_markers = (
        ("qcn9224/amss_dualmac.bin", "legacy dual-MAC firmware boot"),
        ("qcn9224/bdwlan.b1008", "legacy b1008 BDF download"),
        ("qcn9224/caldata_2.bin", "legacy external-radio calibration download"),
    )
    for marker, description in required_markers:
        if marker not in text:
            errors.append(f"Saved QWRT log lacks the {description}: {marker}.")

    board_id = str(evidence.get("runtime_target_board_id", "")).lower()
    if board_id and not re.search(rf"Target capability:.*board_id:\s*{re.escape(board_id)}\b", text):
        errors.append(f"Saved QWRT log lacks runtime target board ID {board_id}.")

    expected = evidence.get("legacy_external_pdevs", [])
    observed = _parse_legacy_external_pdevs(text)
    if len(observed) != len(expected):
        errors.append(
            f"Saved QWRT log exposes {len(observed)} external pdevs, expected {len(expected)}."
        )
    for item in expected:
        if item not in observed:
            errors.append(
                "Saved QWRT log lacks external pdev "
                f"{item.get('interface')} phy{item.get('phy_id')} "
                f"{item.get('lo_5ghz_mhz')}-{item.get('hi_5ghz_mhz')} MHz."
            )
    return errors


def audit_ath12k_runtime_log(text, evidence):
    """Apply the minimum dual-radio acceptance gate to a future 6.6 log."""
    errors = []
    expected_num_phy = int(evidence.get("ath12k_expected_external_num_phy", 2))
    qmi_pattern = (
        rf"phy capability resp valid\s+1\s+num_phy\s+{expected_num_phy}\b"
    )
    wmi_pattern = rf"WMI_INIT:.*\(num_radios={expected_num_phy}\)"
    if not re.search(qmi_pattern, text):
        errors.append(
            f"Target ath12k log does not prove QMI num_phy={expected_num_phy}."
        )
    if not re.search(wmi_pattern, text):
        errors.append(
            f"Target ath12k log does not prove WMI num_radios={expected_num_phy}."
        )
    if "qmi BDF download sequence completed" not in text:
        errors.append("Target ath12k log does not show a completed BDF download sequence.")

    failure_patterns = (
        (r"no valid response from PHY capability", "PHY capability fallback"),
        (r"qmi BDF download failed", "BDF download failure"),
        (r"failed to fetch board data", "board-data fetch failure"),
        (r"failed to load cal(?:data|ibration)", "calibration load failure"),
    )
    for pattern, description in failure_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            errors.append(f"Target ath12k log contains {description}.")
    return errors


def _sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _check_file(path, size=None, sha256=None):
    errors = []
    if not path.is_file():
        return [f"Missing firmware input: {path}"]
    if size is not None and path.stat().st_size != size:
        errors.append(f"Unexpected size for {path}: {path.stat().st_size}, expected {size}.")
    if sha256 is not None and _sha256(path) != sha256:
        errors.append(f"SHA256 mismatch for {path}.")
    return errors


def audit_firmware(root, evidence, calibration=None):
    errors = []
    for name in REQUIRED_STATIC_FILES:
        errors.extend(_check_file(root / name))

    bdf = root / Path(evidence["legacy_bdf_file"]).name
    errors.extend(_check_file(bdf, evidence["legacy_bdf_size"],
                              evidence["legacy_bdf_sha256"]))
    dualmac = root / Path(evidence["legacy_firmware_file"]).name
    errors.extend(_check_file(dualmac, evidence["legacy_firmware_size"],
                              evidence["legacy_firmware_sha256"]))

    if calibration is not None:
        errors.extend(_check_file(calibration, evidence["legacy_calibration_size"],
                                  evidence["legacy_calibration_sha256"]))
    return errors


def audit_recipe(text, evidence):
    errors = []
    expected_dir = evidence["ath12k_driver_directory"]
    if expected_dir not in text:
        errors.append(f"Firmware recipe does not install the QSDK driver path {expected_dir}.")
    if "ath12k/QCN9224/hw2.0" in text:
        errors.append("Unsupported QCN9224/hw2.0 path remains in the firmware recipe.")
    if not re.search(r"bdwlan\.b1008.{0,320}board\.bin", text, re.DOTALL):
        errors.append("Recipe does not expose bdwlan.b1008 as the API1 board.bin fallback.")
    if "amss_dualmac.bin" not in text:
        errors.append("Recipe does not expose amss_dualmac.bin.")

    commands = "\n".join(line for line in text.splitlines()
                         if not line.lstrip().startswith("#"))
    if re.search(r"bdwlan[^\n]*board-2\.bin", commands):
        errors.append("Raw bdwlan data must not be renamed to the API2 board-2.bin container.")
    return errors


def audit_driver(root, evidence):
    files = [path for path in root.rglob("*")
             if path.is_file() and path.suffix in {".c", ".h"}]
    corpus = "\n".join(path.read_text(encoding="utf-8", errors="replace") for path in files)
    errors = []
    if f'.dir = "{Path(evidence["ath12k_driver_directory"]).relative_to("ath12k")}"' not in corpus:
        errors.append("Selected ath12k source lacks the QCN92XX/hw1.0 firmware directory.")
    if not re.search(r"\.max_radios\s*=\s*2\s*,", corpus):
        errors.append("Selected ath12k source lacks a dual-radio hardware profile.")
    if not re.search(r"\.def_num_link\s*=\s*0\s*,", corpus):
        errors.append("Selected QCN9274 profile no longer requires firmware PHY capability "
                      "discovery; re-audit the dual-radio assumptions.")
    mask = int(evidence["ath12k_dualmac_mask"], 0)
    if not re.search(rf"OTP_VALID_DUALMAC_BOARD_ID_MASK\s+0[xX]{mask:x}\b", corpus):
        errors.append(f"Selected ath12k source lacks the dual-MAC board-id mask 0x{mask:x}.")
    if "amss_dualmac.bin" not in corpus:
        errors.append("Selected ath12k source lacks the dual-MAC firmware filename.")
    if not re.search(
            r"ath12k_core_fetch_board_data_api_1\s*\(\s*ab\s*,\s*bd\s*,\s*"
            r"ATH12K_DEFAULT_BOARD_FILE\s*\)", corpus, re.DOTALL):
        errors.append("Selected ath12k source lacks the API1 board.bin fallback.")

    qmi_response = corpus.find("ab->qmi.target.board_id = resp.board_info.board_id")
    qmi_dt_fallback = corpus.find(
        'of_property_read_u32(dev->of_node, "qcom,board_id"')
    if qmi_response < 0 or qmi_dt_fallback < 0 or qmi_response > qmi_dt_fallback:
        errors.append("Selected ath12k source does not prefer the QMI runtime board ID "
                      "before the qcom,board_id DT fallback.")
    if "req->file_id = ab->qmi.target.board_id" not in corpus:
        errors.append("Selected ath12k source does not pass the resolved runtime board ID "
                      "to the BDF download request.")
    if "ab->qmi.num_radios = resp.num_phy" not in corpus:
        errors.append("Selected ath12k source does not obtain the radio count from the QMI "
                      "PHY capability response.")
    if "ab->qmi.num_radios = ab->hw_params->def_num_link" not in corpus:
        errors.append("Selected ath12k source lacks the documented default-link fallback.")
    if "soc->num_radios++" not in corpus or "phy_id_map" not in corpus:
        errors.append("Selected ath12k source lacks WMI per-PHY pdev enumeration.")
    return errors


def audit_caldata_hotplug(text, evidence):
    errors = []
    request = evidence["ath12k_calibration_request"]
    board = evidence["openwrt_board_name"]
    partition = evidence["legacy_calibration_art_partition"]
    offset = int(evidence["legacy_calibration_art_offset"])
    size = int(evidence["legacy_calibration_size"])

    if request not in text:
        errors.append(f"Calibration hotplug does not match the exact request {request}.")
    if board not in text:
        errors.append(f"Calibration hotplug is not restricted to board {board}.")
    if "caldata_extract_mmc" not in text:
        errors.append("Calibration hotplug must read the eMMC ART partition with caldata_extract_mmc.")
    if partition not in text:
        errors.append(f"Calibration hotplug does not name partition {partition}.")

    numeric_tokens = {token.lower() for token in re.findall(r"0[xX][0-9a-fA-F]+|\b\d+\b", text)}
    if str(offset) not in numeric_tokens and hex(offset) not in numeric_tokens:
        errors.append(f"Calibration hotplug does not use ART offset {offset} ({hex(offset)}).")
    if str(size) not in numeric_tokens and hex(size) not in numeric_tokens:
        errors.append(f"Calibration hotplug does not use size {size} ({hex(size)}).")
    return errors


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--firmware-root", type=Path)
    parser.add_argument("--recipe", type=Path)
    parser.add_argument("--calibration", type=Path)
    parser.add_argument("--driver-root", type=Path)
    parser.add_argument("--caldata-hotplug", type=Path)
    parser.add_argument("--legacy-log", type=Path)
    parser.add_argument("--ath12k-log", type=Path)
    args = parser.parse_args(argv)

    if not any((args.firmware_root, args.recipe, args.driver_root,
                args.caldata_hotplug, args.legacy_log, args.ath12k_log)):
        parser.error("at least one audit input is required")

    evidence = json.loads(args.evidence.read_text())
    errors = []
    if args.firmware_root:
        errors.extend(audit_firmware(args.firmware_root, evidence, args.calibration))
    if args.recipe:
        errors.extend(audit_recipe(args.recipe.read_text(), evidence))
    if args.driver_root:
        errors.extend(audit_driver(args.driver_root, evidence))
    if args.caldata_hotplug:
        errors.extend(audit_caldata_hotplug(
            args.caldata_hotplug.read_text(encoding="utf-8"), evidence))
    if args.legacy_log:
        errors.extend(audit_legacy_runtime_log(
            args.legacy_log.read_text(encoding="utf-8", errors="replace"), evidence))
    if args.ath12k_log:
        errors.extend(audit_ath12k_runtime_log(
            args.ath12k_log.read_text(encoding="utf-8", errors="replace"), evidence))

    if errors:
        for error in errors:
            print(f"BLOCKED: {error}", file=sys.stderr)
        return 1
    print("QCN92xx source inputs and layout passed; runtime radio validation is still required.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
