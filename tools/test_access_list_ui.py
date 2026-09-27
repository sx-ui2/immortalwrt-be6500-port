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

    def test_ui_supports_synced_and_manual_names(self):
        source = PAGES.read_text()
        self.assertIn("access-sync", source)
        self.assertIn("access-edit", source)
        self.assertIn("item.name_manual = 0", source)
        self.assertIn("name_manual: modalMode === 'device' ? 0 : 1", source)


if __name__ == "__main__":
    unittest.main()
