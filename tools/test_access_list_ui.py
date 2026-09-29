#!/usr/bin/env python3
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
PAGES = ROOT / "package/be6500-local/luci-app-rejected-clients/root/www/be6500-oem/Native_JS/pages.js"
CONTROLLER = ROOT / "package/be6500-local/luci-app-rejected-clients/root/usr/lib/lua/luci/controller/be6500_oem_beta.lua"


class AccessListUiTests(unittest.TestCase):
    def test_order_is_not_replaced_by_mac_sort(self):
        source = CONTROLLER.read_text()
        start = source.index("local function access_entries")
        end = source.index("local function find_access", start)
        self.assertNotIn("table.sort", source[start:end])

    def test_ui_supports_name_sync_and_edit_with_v55_payload(self):
        source = PAGES.read_text()
        self.assertIn("access-sync", source)
        self.assertIn("access-edit", source)
        self.assertNotIn("item.name_manual = 0", source)
        self.assertNotIn("name_manual: modalMode", source)
        self.assertIn("else draft[policy].push({ name: name, mac: mac });", source)

    def test_access_page_uses_one_quick_authoritative_snapshot(self):
        source = PAGES.read_text()
        start = source.index("  function accessPage() {")
        end = source.index("\n  function rejectedPage() {", start)
        access = source[start:end]
        self.assertEqual(access.count("rpc('get_macfilter_info_fast', {})"), 1)
        self.assertNotIn("rpc('get_macfilter_info', {})", access)
        self.assertIn("rpc('web_get_device_list_fast', {})", access)
        self.assertIn("rpc('web_get_device_list', {})", access)
        self.assertIn("rpc('web_get_rejected_list_fast', {})", access)
        self.assertNotIn("rpc('web_get_rejected_list', {})", access)
        self.assertIn("accessLoadGeneration", access)
        self.assertNotIn("applyAccessData", access)
        self.assertEqual(access.count("draft.deny = asArray(state.access.blacklist)"), 1)
        self.assertLess(
            access.index("render();", access.index("state.access = access;")),
            access.index("rpc('web_get_device_list_fast', {})"),
        )

    def test_fast_snapshot_skips_duplicate_radio_inventory(self):
        source = CONTROLLER.read_text()
        start = source.index("local function request_client")
        end = source.index("local function replace_access_entries", start)
        request_client = source[start:end]
        self.assertIn("if fast then return mac, true end", request_client)
        self.assertNotIn("known_wireless_clients_fast", request_client)

    def test_first_render_tolerates_pending_device_inventory(self):
        source = PAGES.read_text()
        start = source.index("  function accessPage() {")
        end = source.index("\n  function rejectedPage() {", start)
        access = source[start:end]
        self.assertIn("return asArray(state.devices).filter", access)
        self.assertIn("asArray(state.devices).forEach", access)
        self.assertNotIn("return state.devices.filter", access)
        self.assertNotIn("\n      state.devices.forEach(function (device) {", access)

    def test_device_picker_keeps_complete_known_inventory(self):
        source = PAGES.read_text()
        start = source.index("    function refreshDeviceOptions() {")
        end = source.index("    function modal(", start)
        picker = source[start:end]
        self.assertIn("asArray(state.devices).forEach", picker)
        self.assertNotIn("indexOf('Wi-Fi')", picker)
        self.assertNotIn('indexOf("Wi-Fi")', picker)
        self.assertIn("if (!mac || listed[mac] || candidates[mac]) return;", picker)


if __name__ == "__main__":
    unittest.main()
