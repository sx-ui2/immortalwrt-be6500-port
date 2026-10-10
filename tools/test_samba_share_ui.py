#!/usr/bin/env python3
import json
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "package/be6500-local/luci-app-rejected-clients"
MAKEFILE = PACKAGE / "Makefile"
MENU = PACKAGE / "root/usr/share/luci/menu.d/luci-app-rejected-clients.json"
TEMPLATE = PACKAGE / "root/usr/lib/lua/luci/view/be6500_oem_beta/index.htm"
CONTROLLER = PACKAGE / "root/usr/lib/lua/luci/controller/be6500_oem_beta.lua"
PAGES = PACKAGE / "root/www/be6500-oem/Native_JS/pages.js"


class SambaShareUiTest(unittest.TestCase):
    def test_router_settings_contains_network_share_page(self):
        menu = json.loads(MENU.read_text())
        self.assertIn("admin/router_settings/shares", menu)
        self.assertEqual(menu["admin/router_settings/shares"]["title"], "网络共享")
        template = TEMPLATE.read_text()
        self.assertIn("shares:'routerSet/shares.html'", template)
        self.assertIn("shares:'网络共享'", template)

    def test_ui_has_folder_browser_and_account_fields(self):
        pages = PAGES.read_text()
        self.assertIn("function sharesPage()", pages)
        self.assertIn("选择文件夹", pages)
        self.assertIn("share-username", pages)
        self.assertIn("share-password", pages)
        self.assertIn("list_samba_directories", pages)
        self.assertIn("save_samba_share", pages)
        self.assertIn("delete_samba_share", pages)
        self.assertIn("/shares\\.html$/", pages)

    def test_backend_limits_browser_to_mounted_usb_directories(self):
        controller = CONTROLLER.read_text()
        self.assertIn('device:match("^/dev/sd[a-z]+%d*$")', controller)
        self.assertIn('path:match("^/mnt/[^/]+$")', controller)
        self.assertIn("samba_safe_directory(path, mount)", controller)
        self.assertIn('stat.type ~= "dir"', controller)
        self.assertIn('stat.type == "dir"', controller)

    def test_password_uses_samba_database_not_uci(self):
        controller = CONTROLLER.read_text()
        self.assertIn("/usr/bin/smbpasswd -a -s", controller)
        self.assertIn("/tmp/.be6500-samba-password-", controller)
        self.assertIn('uci:set("samba4", section_id, "users", username)', controller)
        self.assertNotIn('uci:set("samba4", section_id, "password"', controller)
        self.assertIn('username == "root"', controller)

    def test_required_runtime_packages_are_selected(self):
        makefile = MAKEFILE.read_text()
        self.assertIn("+samba4-server +shadow-useradd", makefile)


if __name__ == "__main__":
    unittest.main()
