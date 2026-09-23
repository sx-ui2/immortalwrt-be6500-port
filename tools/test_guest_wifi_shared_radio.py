#!/usr/bin/env python3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "package/be6500-local/luci-app-rejected-clients/root/www/be6500-oem/Native_JS/pages.js"
CONTROLLER = ROOT / "package/be6500-local/luci-app-rejected-clients/root/usr/lib/lua/luci/controller/be6500_oem_beta.lua"


class GuestWifiSharedRadioTest(unittest.TestCase):
    def test_guest_page_has_no_physical_radio_controls(self):
        source = PAGES.read_text()
        guest = source.split("function guestPage()", 1)[1].split("function localPage()", 1)[0]
        for token in ("guest-'+key+'-channel", "guest-'+key+'-bandwidth", "guest-'+key+'-power"):
            self.assertNotIn(token, guest)
        for label in ("无线信道", "频道宽度", "信号强度"):
            self.assertNotIn(label, guest)

    def test_guest_save_cannot_write_wifi_device_radio_options(self):
        source = CONTROLLER.read_text()
        self.assertIn('if role == "main" then\n                local channel = tonumber(band.channel) or 0', source)
        self.assertIn('if role == "main" then\n            local compat_2g = compatible and selected_bands[0]', source)


if __name__ == "__main__":
    unittest.main()
