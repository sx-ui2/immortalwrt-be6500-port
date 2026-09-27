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
        self.assertIn("local wireless = fast and known_wireless_clients_fast() or known_wireless_clients(uci)", source)
        self.assertIn("local function known_wireless_clients_fast()", source)
        self.assertIn('object, "get_clients", {}', source)
        self.assertIn('method == "web_get_device_rates"', source)
        self.assertIn("local rates = device_traffic_rates(devices)", source)
        self.assertIn("/usr/bin/timeout 2 ubus call luci-rpc getHostHints", source)

    def test_hostapd_inventory_avoids_duplicate_iwinfo_scan(self):
        source = CONTROLLER.read_text()
        self.assertIn("if not saw_control_socket and not saw_ubus_object then", source)
        self.assertIn("/usr/bin/timeout 1 hostapd_cli", source)

    def test_ui_renders_fast_list_before_full_details(self):
        source = PAGES.read_text()
        quick = source.index("load('web_get_device_list_fast', false)")
        full = source.index("refreshDetails();", quick)
        self.assertLess(quick, full)
        self.assertIn("setTimeout(refreshDetails, 15000)", source)
        self.assertIn("setTimeout(refreshRates, 2000)", source)
        self.assertIn("rpc('web_get_device_rates', {})", source)
        self.assertIn("return load('web_get_device_list', false)", source)

    def test_access_and_rejected_lists_render_before_enrichment(self):
        controller = CONTROLLER.read_text()
        page = PAGES.read_text()
        self.assertIn('method == "get_macfilter_info_fast"', controller)
        self.assertIn('method == "web_get_rejected_list_fast"', controller)
        self.assertIn("device_name_catalog(uci, fast)", controller)
        self.assertIn("rpc('get_macfilter_info_fast', {})", page)
        self.assertIn("rpc('web_get_rejected_list_fast', {})", page)
        fast_access = page.index("var fast = Promise.all([", page.index("function accessPage()"))
        first_access_render = page.index("applyAccessData(items, true);", fast_access)
        rejected_history = page.index("rpc('web_get_rejected_list_fast', {})", fast_access)
        self.assertLess(first_access_render, rejected_history)
        self.assertLess(
            page.index("rpc('get_macfilter_info_fast', {})"),
            page.index("rpc('get_macfilter_info', {})", page.index("function accessPage()")),
        )


if __name__ == "__main__":
    unittest.main()
