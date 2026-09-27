#!/usr/bin/env python3
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
UBOOT = ROOT / "tools/install_be6500_uboot.sh"
LAYOUT = ROOT / "tools/prepare_be6500_stock_layout.sh"


class StockInstallScriptTests(unittest.TestCase):
    def test_uboot_requires_exact_image_and_explicit_write_confirmation(self):
        source = UBOOT.read_text()
        self.assertIn("cead2ac1bfc6731f727a51226f49011b297eaee269e34277bfcdd0d9f84190cd", source)
        self.assertIn("EXPECTED_SIZE=655360", source)
        self.assertIn("I_HAVE_COPIED_THE_UBOOT_BACKUP", source)
        self.assertIn("check_slot mmcblk0p14 16930 '0:APPSBL'", source)
        self.assertIn("check_slot mmcblk0p15 18466 '0:APPSBL_1'", source)
        self.assertLess(source.index('if [ "$MODE" = check ]'), source.index("dd if=\"$IMAGE\" of=/dev/mmcblk0p14"))
        self.assertIn('actual="$(dd if="/dev/$node"', source)

    def test_layout_script_preserves_stock_partitions_and_only_uses_free_tail(self):
        source = LAYOUT.read_text()
        self.assertIn("TOTAL_SECTORS=244252672", source)
        self.assertIn("DATA_START=5058560", source)
        self.assertIn("DATA_END=244252662", source)
        self.assertIn("I_HAVE_COPIED_THE_GPT_BACKUP", source)
        for line in (
            "check_part mmcblk0p21 72738 14336 '0:HLOS'",
            "check_part mmcblk0p22 87074 14336 '0:HLOS_1'",
            "check_part mmcblk0p23 101410 498722 rootfs",
            "check_part mmcblk0p25 601122 512 factory",
            "check_part mmcblk0p26 601634 2097152 plugin",
            "check_part mmcblk0p27 2698786 262144 log",
            "check_part mmcblk0p28 2960930 2097152 swap",
        ):
            self.assertIn(line, source)
        self.assertLess(source.index('if [ "$MODE" = check ]'), source.index("parted -s -a none"))
        self.assertNotIn("mkfs", source)


if __name__ == "__main__":
    unittest.main()
