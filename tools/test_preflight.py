import struct
import unittest

import preflight


def module_fixture(elf_class=2, machine=183, release="6.6.116+"):
    header = bytearray(64)
    header[:6] = b"\x7fELF" + bytes([elf_class, 1])
    struct.pack_into("<H", header, 18, machine)
    return bytes(header) + b"\0vermagic=" + release.encode() + b" SMP preempt mod_unload aarch64\0"


class PreflightTests(unittest.TestCase):
    def test_reject_qwrt_legacy_binding(self):
        errors = preflight.check_dts('gcc@1800000 { compatible = "qcom,gcc-ipq5332"; };')
        self.assertTrue(any("Legacy 5.4 GCC" in item for item in errors))

    def test_native_base_include(self):
        self.assertEqual([], preflight.check_dts('#include "ipq5332.dtsi"\n/ { model = "test"; };'))

    def test_legacy_binding_even_with_native_include(self):
        self.assertTrue(preflight.check_dts('#include "ipq5332.dtsi"\ncompatible="qcom,gcc-ipq5332";'))

    def test_empty_dts_is_not_accepted(self):
        self.assertTrue(preflight.check_dts(""))

    def test_core_only_dts_cannot_enter_full_image(self):
        self.assertTrue(preflight.check_dts(
            '#include "ipq5332.dtsi"\nbe6500,port-stage = "core-only-not-boot-validated";'))

    def test_ethernet_only_dts_cannot_enter_full_image(self):
        self.assertTrue(preflight.check_dts(
            '#include "ipq5332.dtsi"\nbe6500,port-stage = "ethernet-only-not-boot-validated";'))

    def test_raw_board2_alias_is_rejected(self):
        self.assertTrue(preflight.check_firmware_recipe(
            "\t$(INSTALL_DATA) ./files/qcn9224/bdwlan.bin $(1)/lib/firmware/ath12k/board-2.bin\n"))

    def test_raw_board1_alias_is_not_api2(self):
        self.assertEqual([], preflight.check_firmware_recipe(
            "\t$(INSTALL_DATA) ./files/qcn9224/bdwlan.bin $(1)/lib/firmware/ath12k/board.bin\n"))

    def test_comment_is_not_install_command(self):
        self.assertEqual([], preflight.check_firmware_recipe("# Never rename bdwlan to /board-2.bin"))

    def test_raw_board_header_rejected(self):
        self.assertTrue(preflight.check_board2(bytes.fromhex("010004040000000000880100")))

    def test_api2_magic_only_check(self):
        self.assertEqual([], preflight.check_board2(preflight.ATH12K_BOARD_MAGIC + b"\0" * 16))

    def test_arm32_oem_54_rejected_twice(self):
        self.assertEqual(2, len(preflight.check_module(module_fixture(1, 40, "5.4.213"), "6.6.116+")))

    def test_arm64_qwrt_54_rejected_by_release(self):
        self.assertEqual(1, len(preflight.check_module(module_fixture(release="5.4.213"), "6.6.116+")))

    def test_matching_module_header(self):
        self.assertEqual([], preflight.check_module(module_fixture(), "6.6.116+"))

    def test_non_elf_rejected(self):
        self.assertTrue(preflight.check_module(b"", "6.6.116+"))

    def test_missing_vermagic_rejected(self):
        self.assertTrue(preflight.check_module(module_fixture()[:64], "6.6.116+"))

    def test_open_stack_not_vendor_stack(self):
        self.assertTrue(preflight.check_profile("CONFIG_PACKAGE_kmod-ath12k=y\n"))

    def test_module_selection_not_image_inclusion(self):
        self.assertTrue(preflight.check_profile("CONFIG_PACKAGE_kmod-qca-wifi-unified-profile=m\n"))

    def test_vendor_selection(self):
        self.assertEqual([], preflight.check_profile("CONFIG_PACKAGE_kmod-qca-wifi-unified-profile=y\n"))

    def test_dsa_driver_must_be_in_image_profile(self):
        self.assertTrue(preflight.check_wired_profile("DEVICE_PACKAGES := kmod-qca-nss-dp\n"))

    def test_dsa_driver_in_image_profile(self):
        self.assertEqual([], preflight.check_wired_profile(
            "DEVICE_PACKAGES := \\\n\t-automount -block-mount \\\n"
            "\t-kmod-usb-storage \\\n\tkmod-dsa-qca8k \\\n\tkmod-qca-nss-dp\n"))

    def test_ram_profile_must_exclude_automatic_storage_access(self):
        errors = preflight.check_wired_profile(
            "DEVICE_PACKAGES := \\\n\tkmod-dsa-qca8k\n")
        self.assertEqual(3, len(errors))

    def test_generic_ath12k_requires_structured_hardware_evidence(self):
        profile = "DEVICE_PACKAGES := \\\n\tkmod-ath12k \\\n\tkmod-dsa-qca8k\n"
        dts = 'wifi@f00000 { compatible = "qcom,cnss-qcn9224"; };\n'
        self.assertTrue(preflight.check_radio_stack(profile, dts, None))

    def test_generic_ath12k_unrelated_board_is_not_rejected(self):
        profile = "DEVICE_PACKAGES := \\\n\tkmod-ath12k\n"
        dts = 'wifi@0 { compatible = "pci17cb,1109"; };\n'
        self.assertEqual([], preflight.check_radio_stack(profile, dts, None))

    def test_qcn9224_without_false_generic_claim(self):
        profile = "DEVICE_PACKAGES := \\\n\tkmod-qca-wifi-unified-profile\n"
        dts = 'wifi@f00000 { compatible = "qcom,cnss-qcn9224"; };\n'
        self.assertEqual([], preflight.check_radio_stack(profile, dts, None))

    def test_observed_1109_is_accepted_as_driver_identity(self):
        profile = "DEVICE_PACKAGES := \\\n\tkmod-ath12k \\\n\tkmod-dsa-qca8k\n"
        dts = 'wifi@f00000 { compatible = "qcom,cnss-qcn9224"; };\n'
        evidence = {
            "observed_pci_vendor": "0x17cb",
            "observed_pci_device": "0x1109",
            "selected_driver_pci_ids": ["0x1109"],
            "ath12k_board_data_verified": True,
            "dual_mac_mlo_verified": True,
        }
        self.assertEqual([], preflight.check_radio_stack(profile, dts, evidence))

    def test_matching_pci_does_not_hide_unverified_board_data(self):
        profile = "DEVICE_PACKAGES := \\\n\tkmod-ath12k\n"
        dts = 'wifi@f00000 { compatible = "qcom,cnss-qcn9224"; };\n'
        evidence = {
            "observed_pci_vendor": "0x17cb",
            "observed_pci_device": "0x1109",
            "selected_driver_pci_ids": ["0x1109"],
            "ath12k_board_data_verified": False,
            "dual_mac_mlo_verified": False,
        }
        errors = preflight.check_radio_stack(profile, dts, evidence)
        self.assertEqual(2, len(errors))
        self.assertTrue(any("BDF/calibration" in item for item in errors))

    def test_observed_pci_must_exist_in_selected_driver(self):
        profile = "DEVICE_PACKAGES := \\\n\tkmod-ath12k\n"
        dts = 'wifi@f00000 { compatible = "qcom,cnss-qcn9224"; };\n'
        evidence = {
            "observed_pci_vendor": "0x17cb",
            "observed_pci_device": "0x1109",
            "selected_driver_pci_ids": ["0x1107"],
            "ath12k_board_data_verified": True,
            "dual_mac_mlo_verified": True,
        }
        self.assertTrue(any("absent" in item
                            for item in preflight.check_radio_stack(profile, dts, evidence)))

    def test_factory_mac_defaults(self):
        source = '''
wan_mac="$(mmc_get_mac_binary factory 0x0)"
lan_mac="$(macaddr_add "$wan_mac" 1)"
ucidef_set_interface_macaddr "wan" "$wan_mac"
ucidef_set_interface_macaddr "lan" "$lan_mac"
'''
        self.assertEqual([], preflight.check_network_defaults(source))

    def test_mdio_must_be_built_in(self):
        self.assertEqual([], preflight.check_ipq53_kernel_config(
            "CONFIG_MDIO_IPQ4019=y\n"))
        self.assertTrue(preflight.check_ipq53_kernel_config(
            "CONFIG_MDIO_IPQ4019=m\n"))

    def test_missing_factory_mac_defaults(self):
        self.assertEqual(3, len(preflight.check_network_defaults(
            'ucidef_set_interfaces_lan_wan "lan1 lan2 lan3" "wan"\n')))


if __name__ == "__main__":
    unittest.main()
