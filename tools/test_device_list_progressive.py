#!/usr/bin/env python3
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
PAGES = ROOT / "package/be6500-local/luci-app-rejected-clients/root/www/be6500-oem/Native_JS/pages.js"
CONTROLLER = ROOT / "package/be6500-local/luci-app-rejected-clients/root/usr/lib/lua/luci/controller/be6500_oem_beta.lua"


class DeviceListProgressiveTests(unittest.TestCase):
    def test_fast_endpoint_skips_expensive_enrichment(self):
        source = CONTROLLER.read_text()
        self.assertIn('method == "web_get_device_list_fast"', source)
        self.assertIn("local wireless = fast and {} or known_wireless_clients(uci)", source)
        self.assertIn("if not fast then\n        local rates = device_traffic_rates(result)", source)
        self.assertIn("/usr/bin/timeout 2 ubus call luci-rpc getHostHints", source)

    def test_hostapd_inventory_avoids_duplicate_iwinfo_scan(self):
        source = CONTROLLER.read_text()
        self.assertIn("if not saw_control_socket and not saw_ubus_object then", source)
        self.assertIn("/usr/bin/timeout 1 hostapd_cli", source)

    def test_ui_renders_fast_list_before_full_details(self):
        source = PAGES.read_text()
        quick = source.index("load('web_get_device_list_fast', false)")
        full = source.index(".then(refreshDetails)", quick)
        self.assertLess(quick, full)
        self.assertIn("setTimeout(refreshDetails, 5000)", source)
        self.assertNotIn("setInterval(load, 2000)", source)
        self.assertIn("return load('web_get_device_list', false)", source)


if __name__ == "__main__":
    unittest.main()
