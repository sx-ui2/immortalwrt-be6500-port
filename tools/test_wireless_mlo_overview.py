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
        self.assertIn("be6500MloTopology", self.source)
        self.assertIn("wifi.getActiveBSSID()", self.source)
        self.assertIn("be6500SeenLogical[be6500MloKey(wifi)]", self.source)
        self.assertIn("String(s.ifname||'').indexOf('mld')", self.source)
        self.assertIn("mld_ap=1", self.source)

    def test_mlo_radio_header_does_not_repeat_one_links_frequency(self):
        self.assertIn("be6500MloRadioFrequency", self.source)
        self.assertIn("be6500MloRadioTopology", self.source)
        self.assertIn("radioDev.get('channel')", self.source)
        self.assertIn("radioDev.get('band')", self.source)
        self.assertIn("2407+be6500Channel*5", self.source)
        self.assertIn("5000+be6500Channel*5", self.source)
        self.assertNotIn("5950+be6500Channel*5", self.source)
        self.assertNotIn("be6500Band==='6g'", self.source)
        self.assertIn("be6500Channel>0?'%d (%.3f %s)'", self.source)

    def test_non_mlo_overview_keeps_stock_row_selection(self):
        self.assertIn("!be6500MloOverview||", self.source)
        self.assertIn("wifi.getWifiDeviceName()==radio.getName()", self.source)

    def test_browser_cache_version_changes_with_overview_patch(self):
        self.assertIn("be6500v24", self.source)

    def test_status_overview_uses_each_radios_own_configured_frequency(self):
        self.assertIn("BE6500_LUCI_WIFI_STATUS_VIEW", self.source)
        self.assertIn("be6500MloStatusFrequency", self.source)
        self.assertIn("be6500PerRadioStatus", self.source)
        self.assertIn("radio.get('channel')", self.source)
        self.assertIn("radio.get('band')", self.source)
        self.assertIn("be6500ChannelText", self.source)
        self.assertIn("5000+be6500ConfiguredChannel*5", self.source)
        self.assertNotIn("5950+be6500ConfiguredChannel*5", self.source)
        self.assertNotIn("be6500ConfiguredBand==='6g'", self.source)

    def test_board_channel_analysis_never_offers_a_6ghz_band(self):
        self.assertNotIn("be6500ConfiguredBand==='6g'", self.source)

    def test_status_overview_deduplicates_the_logical_mld(self):
        self.assertIn("be6500MloStatusTopology", self.source)
        self.assertIn("key=bssid", self.source)
        self.assertIn("net.getActiveBSSID()", self.source)

    def test_package_install_applies_wireless_patch_without_touching_config(self):
        makefile = MAKEFILE.read_text()
        self.assertIn('wireless_patcher="$$root/usr/libexec/be6500-patch-luci-wireless"', makefile)
        self.assertIn("BE6500_SKIP_WIFI_PERSONALITY_SYNC=1", makefile)
        self.assertIn("BE6500_LUCI_WIFI_STATUS_VIEW", makefile)
        self.assertIn('"$$wireless_patcher" || exit 1', makefile)


if __name__ == "__main__":
    unittest.main()
