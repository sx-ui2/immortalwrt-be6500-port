import hashlib
import tempfile
from pathlib import Path
import unittest

import qcn92xx_firmware_audit as audit


def fixture_evidence(bdf, firmware, calibration):
    return {
        "legacy_bdf_file": "qcn9224/bdwlan.b1008",
        "legacy_bdf_size": len(bdf),
        "legacy_bdf_sha256": hashlib.sha256(bdf).hexdigest(),
        "legacy_firmware_file": "qcn9224/amss_dualmac.bin",
        "legacy_firmware_size": len(firmware),
        "legacy_firmware_sha256": hashlib.sha256(firmware).hexdigest(),
        "legacy_calibration_size": len(calibration),
        "legacy_calibration_sha256": hashlib.sha256(calibration).hexdigest(),
        "ath12k_driver_directory": "ath12k/QCN92XX/hw1.0",
        "ath12k_dualmac_mask": "0x1000",
        "ath12k_calibration_request": "ath12k/QCN92XX/hw1.0/cal-pci-0001:01:00.0.bin",
        "openwrt_board_name": "jdcloud,be6500",
        "legacy_calibration_art_partition": "0:ART",
        "legacy_calibration_art_offset": 0x58800,
        "runtime_target_board_id": "0xff",
        "legacy_external_pdevs": [
            {"interface": "wifi1", "phy_id": 0,
             "lo_5ghz_mhz": 4910, "hi_5ghz_mhz": 5330},
            {"interface": "wifi2", "phy_id": 1,
             "lo_5ghz_mhz": 5490, "hi_5ghz_mhz": 5835},
        ],
    }


class Qcn92xxFirmwareAuditTests(unittest.TestCase):
    @staticmethod
    def write_supported_driver(root):
        (root / "hw.c").write_text(
            '.dir = "QCN92XX/hw1.0",\n.max_radios = 2,\n.def_num_link = 0,\n')
        (root / "mhi.c").write_text(
            '#define OTP_VALID_DUALMAC_BOARD_ID_MASK 0x1000\n"amss_dualmac.bin"\n')
        (root / "core.c").write_text(
            'ath12k_core_fetch_board_data_api_1(ab, bd, ATH12K_DEFAULT_BOARD_FILE);\n')
        (root / "qmi.c").write_text(
            'ab->qmi.target.board_id = resp.board_info.board_id;\n'
            'of_property_read_u32(dev->of_node, "qcom,board_id", &board_id);\n'
            'req->file_id = ab->qmi.target.board_id;\n'
            'ab->qmi.num_radios = resp.num_phy;\n'
            'ab->qmi.num_radios = ab->hw_params->def_num_link;\n')
        (root / "wmi.c").write_text('while (phy_id_map) { soc->num_radios++; }\n')

    def test_firmware_hashes_and_calibration_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bdf, firmware, calibration = b"bdf", b"dualmac", b"cal"
            for name in audit.REQUIRED_STATIC_FILES:
                (root / name).write_bytes(firmware if name == "amss_dualmac.bin" else b"x")
            (root / "bdwlan.b1008").write_bytes(bdf)
            cal = root / "caldata_2.bin"
            cal.write_bytes(calibration)
            self.assertEqual([], audit.audit_firmware(
                root, fixture_evidence(bdf, firmware, calibration), cal))

    def test_wrong_bdf_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in audit.REQUIRED_STATIC_FILES:
                (root / name).write_bytes(b"dualmac" if name == "amss_dualmac.bin" else b"x")
            (root / "bdwlan.b1008").write_bytes(b"wrong")
            errors = audit.audit_firmware(
                root, fixture_evidence(b"bdf", b"dualmac", b"cal"))
            self.assertTrue(any("bdwlan.b1008" in item for item in errors))

    def test_supported_recipe_passes(self):
        evidence = fixture_evidence(b"bdf", b"dualmac", b"cal")
        recipe = """
$(INSTALL_DIR) $(1)/lib/firmware/ath12k/QCN92XX/hw1.0
ln -sf /lib/firmware/qcn9224/bdwlan.b1008 \\
    $(1)/lib/firmware/ath12k/QCN92XX/hw1.0/board.bin
ln -sf /lib/firmware/qcn9224/amss_dualmac.bin $(1)/lib/firmware/ath12k/QCN92XX/hw1.0/amss_dualmac.bin
"""
        self.assertEqual([], audit.audit_recipe(recipe, evidence))

    def test_old_path_and_fake_api2_are_rejected(self):
        evidence = fixture_evidence(b"bdf", b"dualmac", b"cal")
        recipe = "$(CP) bdwlan.b1008 $(1)/lib/firmware/ath12k/QCN9224/hw2.0/board-2.bin"
        self.assertGreaterEqual(len(audit.audit_recipe(recipe, evidence)), 3)

    def test_dualmac_driver_markers_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_supported_driver(root)
            self.assertEqual([], audit.audit_driver(
                root, fixture_evidence(b"bdf", b"dualmac", b"cal")))

    def test_driver_without_dualmac_mask_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_supported_driver(root)
            (root / "mhi.c").write_text('"amss_dualmac.bin"\n')
            self.assertTrue(audit.audit_driver(
                root, fixture_evidence(b"bdf", b"dualmac", b"cal")))

    def test_driver_without_api1_fallback_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_supported_driver(root)
            (root / "core.c").write_text("/* API2 only */\n")
            errors = audit.audit_driver(
                root, fixture_evidence(b"bdf", b"dualmac", b"cal"))
            self.assertTrue(any("API1 board.bin fallback" in item for item in errors))

    def test_driver_with_dt_before_qmi_board_id_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_supported_driver(root)
            (root / "qmi.c").write_text(
                'of_property_read_u32(dev->of_node, "qcom,board_id", &board_id);\n'
                'ab->qmi.target.board_id = resp.board_info.board_id;\n'
                'req->file_id = ab->qmi.target.board_id;\n'
                'ab->qmi.num_radios = resp.num_phy;\n'
                'ab->qmi.num_radios = ab->hw_params->def_num_link;\n')
            errors = audit.audit_driver(
                root, fixture_evidence(b"bdf", b"dualmac", b"cal"))
            self.assertTrue(any("QMI runtime board ID" in item for item in errors))

    def test_driver_without_firmware_phy_count_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write_supported_driver(root)
            (root / "qmi.c").write_text(
                'ab->qmi.target.board_id = resp.board_info.board_id;\n'
                'of_property_read_u32(dev->of_node, "qcom,board_id", &board_id);\n'
                'req->file_id = ab->qmi.target.board_id;\n'
                'ab->qmi.num_radios = ab->hw_params->def_num_link;\n')
            errors = audit.audit_driver(
                root, fixture_evidence(b"bdf", b"dualmac", b"cal"))
            self.assertTrue(any("QMI PHY capability response" in item for item in errors))

    def test_mmc_caldata_hotplug_passes(self):
        evidence = fixture_evidence(b"bdf", b"dualmac", b"x" * 0x2d000)
        hotplug = """
case "$FIRMWARE" in
ath12k/QCN92XX/hw1.0/cal-pci-0001:01:00.0.bin)
  case "$(board_name)" in
  jdcloud,be6500) caldata_extract_mmc "0:ART" 0x58800 0x2d000 ;;
  esac ;;
esac
"""
        self.assertEqual([], audit.audit_caldata_hotplug(hotplug, evidence))

    def test_wrong_bus_and_generic_board_are_rejected(self):
        evidence = fixture_evidence(b"bdf", b"dualmac", b"x" * 0x2d000)
        hotplug = """
ath12k/QCN92XX/hw1.0/cal-pci-0002:01:00.0.bin
caldata_extract "ART" 0x1000 0x20000
"""
        errors = audit.audit_caldata_hotplug(hotplug, evidence)
        self.assertGreaterEqual(len(errors), 5)

    @staticmethod
    def legacy_log(include_wifi2=True):
        wifi2 = """
__ol_ath_attach: soc(0x2): soc1 pdev: wifi2
ol_ath_pdev_regdmn_init:  phy id = 1 Modes supported
ol_ath_pdev_regdmn_init:  Reg cap - phy_id = 1 supp_bnd = 2, lo_5ghz = 5490, hi_5ghz = 5835
""" if include_wifi2 else ""
        return """
Target capability: chip_id: 0x0, board_id: 0xff, soc_id: 0x401a2200
Booting fw image qcn9224/amss_dualmac.bin, size 7557120
Downloading BDF: qcn9224/bdwlan.b1008, size: 100352
Downloading BDF: qcn9224/caldata_2.bin, size: 184320
__ol_ath_attach: soc(0x2): soc1 pdev: wifi1
ol_ath_pdev_regdmn_init:  phy id = 0 Modes supported
ol_ath_pdev_regdmn_init:  Reg cap - phy_id = 0 supp_bnd = 2, lo_5ghz = 4910, hi_5ghz = 5330
""" + wifi2

    def test_legacy_dual_5ghz_log_passes(self):
        evidence = fixture_evidence(b"bdf", b"dualmac", b"cal")
        self.assertEqual([], audit.audit_legacy_runtime_log(
            self.legacy_log(), evidence))

    def test_legacy_log_without_second_pdev_is_rejected(self):
        evidence = fixture_evidence(b"bdf", b"dualmac", b"cal")
        errors = audit.audit_legacy_runtime_log(
            self.legacy_log(include_wifi2=False), evidence)
        self.assertTrue(any("exposes 1 external pdevs" in item for item in errors))
        self.assertTrue(any("wifi2 phy1" in item for item in errors))

    def test_legacy_log_with_wrong_upper_band_is_rejected(self):
        evidence = fixture_evidence(b"bdf", b"dualmac", b"cal")
        log = self.legacy_log().replace("5490, hi_5ghz = 5835", "4910, hi_5ghz = 5330")
        errors = audit.audit_legacy_runtime_log(log, evidence)
        self.assertTrue(any("wifi2 phy1 5490-5835" in item for item in errors))

    @staticmethod
    def ath12k_log(num_phy=2, num_radios=2):
        return f"""
ath12k_pci 0001:01:00.0: phy capability resp valid 1 num_phy {num_phy} valid 1 board_id 255
ath12k_pci 0001:01:00.0: qmi BDF download sequence completed for type: 0, size: 100352
ath12k_pci 0001:01:00.0: WMI_INIT: num_vdevs=17 (num_radios={num_radios})
"""

    def test_target_ath12k_dual_radio_log_passes(self):
        evidence = fixture_evidence(b"bdf", b"dualmac", b"cal")
        self.assertEqual([], audit.audit_ath12k_runtime_log(
            self.ath12k_log(), evidence))

    def test_target_ath12k_single_radio_log_is_rejected(self):
        evidence = fixture_evidence(b"bdf", b"dualmac", b"cal")
        errors = audit.audit_ath12k_runtime_log(
            self.ath12k_log(num_phy=1, num_radios=1), evidence)
        self.assertTrue(any("QMI num_phy=2" in item for item in errors))
        self.assertTrue(any("WMI num_radios=2" in item for item in errors))

    def test_target_ath12k_phy_fallback_is_rejected(self):
        evidence = fixture_evidence(b"bdf", b"dualmac", b"cal")
        log = self.ath12k_log() + "no valid response from PHY capability, choose default num_phy 0\n"
        errors = audit.audit_ath12k_runtime_log(log, evidence)
        self.assertTrue(any("PHY capability fallback" in item for item in errors))


if __name__ == "__main__":
    unittest.main()
