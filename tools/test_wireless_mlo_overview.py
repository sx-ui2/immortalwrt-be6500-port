import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
PATCHER = ROOT / "package/be6500-local/luci-app-rejected-clients/root/usr/libexec/be6500-patch-luci-wireless"
MAKEFILE = ROOT / "package/be6500-local/luci-app-rejected-clients/Makefile"


class WirelessMloOverviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = PATCHER.read_text()

    def test_mlo_network_rows_are_deduplicated_by_logical_bssid(self):
        self.assertIn("be6500MloOverview", self.source)
        self.assertIn("be6500MloLogicalRow", self.source)
        self.assertIn("wifi.getActiveBSSID()", self.source)
        self.assertIn("be6500SeenLogical[be6500MloKey(wifi)]", self.source)
        self.assertIn("role==='main'?'main:'", self.source)

    def test_mlo_radio_header_does_not_repeat_one_links_frequency(self):
        self.assertIn("be6500MloRadioStatus", self.source)
        self.assertIn("多链路状态由驱动统一管理", self.source)
        self.assertIn("return node;}let channel,frequency,bitrate", self.source)

    def test_non_mlo_overview_keeps_stock_row_selection(self):
        self.assertIn("!be6500MloOverview||", self.source)
        self.assertIn("wifi.getWifiDeviceName()==radio.getName()", self.source)

    def test_browser_cache_version_changes_with_overview_patch(self):
        self.assertIn("be6500v22", self.source)

    def test_package_install_applies_wireless_patch_without_touching_config(self):
        makefile = MAKEFILE.read_text()
        self.assertIn('wireless_patcher="$$root/usr/libexec/be6500-patch-luci-wireless"', makefile)
        self.assertIn("BE6500_SKIP_WIFI_PERSONALITY_SYNC=1", makefile)
        self.assertIn('"$$wireless_patcher" || exit 1', makefile)


if __name__ == "__main__":
    unittest.main()
