import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
PATCHER = ROOT / "package/be6500-local/luci-app-rejected-clients/root/usr/libexec/be6500-patch-luci-wireless"
OEM_JS = ROOT / "package/be6500-local/luci-app-rejected-clients/root/www/be6500-oem/Native_JS/pages.js"
CONTROLLER = ROOT / "package/be6500-local/luci-app-rejected-clients/root/usr/lib/lua/luci/controller/be6500_oem_beta.lua"


class WirelessWidthSelectorTests(unittest.TestCase):
    def test_standard_luci_width_control_is_restored(self):
        patcher = PATCHER.read_text()
        self.assertIn("be6500-width-selectable", patcher)
        self.assertIn("if grep -q 'be6500-width-fixed'", patcher)
        self.assertNotIn(
            "E('label',{'class':'be6500-width-fixed','style':'position",
            patcher,
        )

    def test_old_hidden_width_patch_has_an_upgrade_replacement(self):
        patcher = PATCHER.read_text()
        self.assertIn("if grep -q 'be6500-width-fixed'", patcher)
        self.assertIn("'style':'[^']*'", patcher)
        self.assertIn("float:left; margin-right:3px", patcher)

    def test_oem_ui_offers_all_supported_widths(self):
        source = OEM_JS.read_text()
        for width in ("20", "40", "80", "160"):
            self.assertIn("['%s'" % width, source)

    def test_invalid_high_channel_160mhz_is_downgraded(self):
        frontend = OEM_JS.read_text()
        backend = CONTROLLER.read_text()
        self.assertIn("width === 160", frontend)
        self.assertIn("channel >= 149", frontend)
        self.assertIn("if width >= 160", backend)
        self.assertIn("channel >= 149", backend)


if __name__ == "__main__":
    unittest.main()
