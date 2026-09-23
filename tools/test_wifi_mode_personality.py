#!/usr/bin/env python3
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTROLLER = ROOT / "package/be6500-local/luci-app-rejected-clients/root/usr/lib/lua/luci/controller/be6500_oem_beta.lua"
SWITCH = ROOT / "package/be6500-local/luci-app-rejected-clients/root/usr/sbin/be6500-switch-wifi-mode"
BOOT_SYNC = ROOT / "package/be6500-local/luci-app-rejected-clients/root/usr/libexec/be6500-patch-luci-wireless"


class WifiModePersonalityTest(unittest.TestCase):
    def test_missing_selector_means_device_tree_tri_band(self):
        controller = CONTROLLER.read_text()
        switch = SWITCH.read_text()
        self.assertIn('if runtime_bdf == "0x2" then return 0, runtime_bdf end', controller)
        self.assertIn('or "0x1008 (DT default)"', controller)
        self.assertIn('[ -n "$cmdline_bdf" ] || cmdline_bdf=0x1008', switch)

    def test_boot_sync_recovers_missing_mode_from_runtime_personality(self):
        source = BOOT_SYNC.read_text()
        self.assertIn('[ "$runtime_bdf" = "0x2" ] && runtime_mode=0 || runtime_mode=1', source)
        self.assertIn('if ! uci -q get wireless.main.freq_mode >/dev/null; then', source)
        self.assertIn('wireless.radio2.disabled="$([ "$runtime_mode" = 1 ] && echo 0 || echo 1)"', source)

    def test_shell_scripts_parse(self):
        for script in (SWITCH, BOOT_SYNC):
            subprocess.run(["sh", "-n", str(script)], check=True)


if __name__ == "__main__":
    unittest.main()
