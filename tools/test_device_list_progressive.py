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
        self.assertIn("local wireless = fast and known_wireless_clients_fast(uci) or known_wireless_clients(uci)", source)
        self.assertIn("local function known_wireless_clients_fast(uci)", source)
        fast_start = source.index("local function known_wireless_clients_fast(uci)")
        fast_end = source.index("local function usable_device_name", fast_start)
        fast_source = source[fast_start:fast_end]
        self.assertIn('iw dev " .. iface .. " station dump', fast_source)
        self.assertNotIn('"get_clients"', fast_source)
        self.assertIn('method == "web_get_device_rates"', source)
        self.assertIn("local rates = device_traffic_rates(devices)", source)
        self.assertIn("ubus -t 2 call luci-rpc getHostHints", source)
        self.assertIn("ubus -t 1 call luci-rpc getHostHints", source)
        self.assertIn("local device_type, vendor = device_identity(display_name, mac)", source)
        self.assertNotIn("if not fast then device_type, vendor = device_identity(display_name, mac) end", source)
        rate_start = source.index("local function build_device_rate_list(uci)")
        rate_end = source.index("local function firewall_reload()", rate_start)
        self.assertNotIn("build_device_list", source[rate_start:rate_end])

    def test_first_paint_prefers_hostname_unless_name_is_manual(self):
        source = CONTROLLER.read_text()
        self.assertIn("local manual_name = saved_name", source)
        self.assertIn("local display_name = manual_name or usable_hostname(lease_name)", source)
        self.assertIn("or usable_hostname(configured_names[mac]) or usable_hostname(hinted_names[mac])", source)
        self.assertIn('prefix == "设备" or prefix == "无线设备" or prefix == "有线设备"', source)
        self.assertIn('prefix:find("无线设备", 1, true)', source)
        self.assertIn("if generated_device_name(raw_saved_name, mac) then saved_name = nil end", source)

    def test_hostapd_inventory_avoids_duplicate_iwinfo_scan(self):
        source = CONTROLLER.read_text()
        self.assertIn("if not saw_control_socket and not saw_ubus_object then", source)
        self.assertIn('luci.sys.exec("hostapd_cli -p /var/run/hostapd', source)
        self.assertNotIn("/usr/bin/timeout 1 hostapd_cli", source)

    def test_ui_renders_fast_list_before_full_details(self):
        source = PAGES.read_text()
        quick = source.index("load('web_get_device_list_fast', false)")
        full = source.index("refreshDetails();", quick)
        self.assertLess(quick, full)
        self.assertIn("setTimeout(refreshDetails, 15000)", source)
        self.assertIn("setTimeout(refreshRates, 2000)", source)
        self.assertIn("rpc('web_get_device_rates', {})", source)
        self.assertIn("return load('web_get_device_list', false)", source)

    def test_offline_rows_show_only_offline_without_rates(self):
        source = PAGES.read_text()
        row_start = source.index("function deviceRow(device, index)")
        row_end = source.index("function devicesPage()", row_start)
        row = source[row_start:row_end]
        self.assertIn("online ? '在线<small>'", row)
        self.assertIn(": '离线'", row)
        self.assertIn("online ? '<li class=\"col-device-speed\">", row)
        page_start = row_end
        page_end = source.index("function accessPage()", page_start)
        page = source[page_start:page_end]
        offline_header = page[page.index("<h3>离线设备</h3>"):page.index("var editing", page.index("<h3>离线设备</h3>"))]
        self.assertIn("offline-device-table", offline_header)
        self.assertNotIn("实时速度", offline_header)

    def test_access_renders_acl_before_device_enrichment(self):
        controller = CONTROLLER.read_text()
        page = PAGES.read_text()
        self.assertIn('method == "get_macfilter_info_fast"', controller)
        self.assertIn('method == "web_get_rejected_list_fast"', controller)
        self.assertIn("device_name_catalog(uci, fast)", controller)
        self.assertIn("rpc('web_get_rejected_list_fast', {})", page)
        access_start = page.index("function accessPage()")
        access_end = page.index("function rejectedPage()", access_start)
        access = page[access_start:access_end]
        self.assertIn("rpc('get_macfilter_info_fast', {})", access)
        self.assertNotIn("rpc('get_macfilter_info', {})", access)
        self.assertIn("rpc('web_get_device_list_fast', {})", access)
        self.assertIn("rpc('web_get_device_list', {})", access)
        self.assertLess(
            access.index("render();", access.index("state.access = access;")),
            access.index("rpc('web_get_device_list_fast', {})"),
        )
        rejected = page[access_end:page.index("function dhcpPage()", access_end)]
        self.assertIn("rpc('get_macfilter_info_fast', {})", rejected)


if __name__ == "__main__":
    unittest.main()
