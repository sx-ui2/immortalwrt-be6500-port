#!/usr/bin/env python3
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTROLLER = ROOT / "package/be6500-local/luci-app-rejected-clients/root/usr/lib/lua/luci/controller/be6500_oem_beta.lua"
SWITCH = ROOT / "package/be6500-local/luci-app-rejected-clients/root/usr/sbin/be6500-switch-wifi-mode"
BOOT_SYNC = ROOT / "package/be6500-local/luci-app-rejected-clients/root/usr/libexec/be6500-patch-luci-wireless"
PERSONALITY_SYNC = ROOT / "package/be6500-local/luci-app-rejected-clients/root/usr/libexec/be6500-sync-wifi-personality"
PERSONALITY_INIT = ROOT / "package/be6500-local/luci-app-rejected-clients/root/etc/init.d/be6500-wifi-personality"
MAC80211_MAKEFILE = ROOT / "package/kernel/mac80211/Makefile"
FULL_5G_PATCH = ROOT / "package/kernel/mac80211/patches/ath12k/1001-d-BE6500-expose-full-single-radio-5g-range.patch"


class WifiModePersonalityTest(unittest.TestCase):
    def test_missing_selector_means_device_tree_tri_band(self):
        controller = CONTROLLER.read_text()
        switch = SWITCH.read_text()
        self.assertIn('if runtime_bdf == "0x2" then return 0, runtime_bdf end', controller)
        self.assertIn('or "0x1008 (DT default)"', controller)
        self.assertIn('[ -n "$cmdline_bdf" ] || cmdline_bdf=0x1008', switch)

    def test_boot_sync_follows_runtime_personality_even_with_preserved_config(self):
        source = PERSONALITY_SYNC.read_text()
        self.assertIn('case "$runtime_bdf" in', source)
        self.assertIn('0x2)', source)
        self.assertIn('runtime_mode=0', source)
        self.assertIn('runtime_mode=1', source)
        self.assertNotIn('if ! uci -q get wireless.main.freq_mode', source)
        self.assertIn('wireless.main.freq_mode="$runtime_mode"', source)
        self.assertIn('wireless.radio2.disabled="$radio2_disabled"', source)
        self.assertIn('/usr/libexec/be6500-sync-wifi-personality', BOOT_SYNC.read_text())
        self.assertIn('/usr/libexec/be6500-sync-wifi-personality', PERSONALITY_INIT.read_text())

    def test_luci_only_splits_channels_in_actual_split_profile(self):
        source = BOOT_SYNC.read_text()
        self.assertIn("String(uci.get('wireless','main','freq_mode'))==='1'", source)
        self.assertIn("section_id==='radio1'\\&\\&freq.channel>64", source)
        self.assertIn("section_id==='radio2'\\&\\&freq.channel<100", source)
        self.assertIn('dual-band/single-radio mode no 5 GHz entries are removed', source)

    def test_dual_band_is_one_full_range_5g_radio(self):
        source = SWITCH.read_text()
        self.assertIn('0) target_bdf=0x2', source)
        self.assertIn("set wireless.radio2.disabled='1'", source)
        self.assertIn('149|153|157|161|165', source)
        self.assertNotIn('rf_path', source)

        driver = FULL_5G_PATCH.read_text()
        makefile = MAC80211_MAKEFILE.read_text()
        self.assertIn("ath12k_mac_be6500_5g_union", driver)
        self.assertIn('of_machine_is_compatible("jdcloud,be6500")', driver)
        self.assertIn("BE6500 factory single-radio 5G range", driver)
        self.assertNotIn("ath12k_mac_handle_rf_path_switch(ar, target)", driver)
        self.assertNotIn("ath12k_mac_be6500_select_rf_path", driver)
        self.assertIn(FULL_5G_PATCH.name, makefile)

    def test_shell_scripts_parse(self):
        for script in (SWITCH, BOOT_SYNC, PERSONALITY_SYNC, PERSONALITY_INIT):
            subprocess.run(["sh", "-n", str(script)], check=True)

if __name__ == "__main__":
    unittest.main()
