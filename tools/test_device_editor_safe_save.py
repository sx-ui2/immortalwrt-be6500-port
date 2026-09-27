#!/usr/bin/env python3
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
PKG = ROOT / "package/be6500-local/luci-app-rejected-clients"
PAGES = PKG / "root/www/be6500-oem/Native_JS/pages.js"
CONTROLLER = PKG / "root/usr/lib/lua/luci/controller/be6500_oem_beta.lua"
HELPER = PKG / "root/usr/libexec/rejected-mac"


class DeviceEditorSafeSaveTests(unittest.TestCase):
    def test_device_rows_expose_and_consume_authoritative_network_state(self):
        controller = CONTROLLER.read_text()
        pages = PAGES.read_text()
        self.assertIn("network_enable = net_enable and 1 or 0", controller)
        self.assertIn(
            "device.network_enable != null ? device.network_enable : device.net_enable",
            pages,
        )

    def test_ordinary_save_only_runs_changed_operations_sequentially(self):
        pages = PAGES.read_text()
        start = pages.index("        save.addEventListener('click', function () {", pages.index("function openDeviceEditor"))
        end = pages.index("        ui.showModal('设备信息'", start)
        save = pages[start:end]
        self.assertIn("var tasks = [];", save)
        self.assertIn("tasks.reduce(function (promise, task)", save)
        self.assertIn("wantedQos !== Number(device.qos_enable || 0)", save)
        self.assertIn("network.checked !== !!Number", save)
        self.assertNotIn("Promise.all([", save)

    def test_unchanged_qos_does_not_reload_ecm_or_network(self):
        controller = CONTROLLER.read_text()
        start = controller.index('    elseif method == "web_set_device_limit_speed" then')
        end = controller.index('    elseif method == "get_macfilter_info"', start)
        handler = controller[start:end]
        no_change = handler.index("current_enable == wanted_enable")
        apply_call = handler.index("/usr/libexec/rejected-mac set_limit")
        self.assertLess(no_change, apply_call)
        self.assertIn("限速设置未变化，无需重新应用", handler)

    def test_access_helper_has_no_dormant_wifi_reload_hook(self):
        helper = HELPER.read_text()
        self.assertNotIn("reload_wifi_later", helper)

    def test_mlo_band_is_omitted_in_device_status(self):
        controller = CONTROLLER.read_text()
        pages = PAGES.read_text()
        self.assertIn('item.band = item.mlo and ""', controller)
        self.assertIn("(device.band ? ' · ' + String(device.band) : '')", pages)


if __name__ == "__main__":
    unittest.main()
