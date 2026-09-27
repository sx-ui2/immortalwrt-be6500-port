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

    def test_access_page_uses_one_v55_style_snapshot(self):
        source = PAGES.read_text()
        start = source.index("  function accessPage() {")
        end = source.index("\n  function rejectedPage() {", start)
        access = source[start:end]
        self.assertIn("rpc('get_macfilter_info', {})", access)
        self.assertIn("rpc('web_get_device_list', {})", access)
        self.assertIn("rpc('web_get_rejected_list', {})", access)
        self.assertNotIn("get_macfilter_info_fast", access)
        self.assertNotIn("accessLoadGeneration", access)
        self.assertNotIn("applyAccessData", access)


if __name__ == "__main__":
    unittest.main()
