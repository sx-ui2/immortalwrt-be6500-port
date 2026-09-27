#!/usr/bin/env python3
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
MANAGER = ROOT / (
    "package/be6500-local/luci-app-rejected-clients/root/usr/libexec/"
    "be6500-cert-manager"
)
CONTROLLER = ROOT / (
    "package/be6500-local/luci-app-rejected-clients/root/usr/lib/lua/luci/"
    "controller/be6500_oem_beta.lua"
)
PAGES = ROOT / (
    "package/be6500-local/luci-app-rejected-clients/root/www/be6500-oem/"
    "Native_JS/pages.js"
)


class CertificateProviderRefreshTests(unittest.TestCase):
    def test_updates_restate_dns_hook_instead_of_reusing_old_renewal_metadata(self):
        manager = MANAGER.read_text()
        self.assertNotIn('--renew -d "$domain"', manager)
        self.assertIn('--issue --dns "$dns"', manager)
        self.assertIn("force_arg='--force'", manager)
        self.assertIn("[ \"$action\" = renew ] && [ \"$1\" = '--cron' ] && force_arg=''", manager)

    def test_logs_are_isolated_per_certificate(self):
        manager = MANAGER.read_text()
        controller = CONTROLLER.read_text()
        pages = PAGES.read_text()
        self.assertIn('LOG="/tmp/be6500-cert-$SECTION.log"', manager)
        self.assertIn('command = command .. " " .. cert_id', controller)
        self.assertIn("activeLogId", pages)

    def test_selected_ca_is_persisted_with_certificate(self):
        manager = MANAGER.read_text()
        controller = CONTROLLER.read_text()
        pages = PAGES.read_text()
        self.assertIn('setv ca "${10}"', manager)
        self.assertIn('local ca = tostring(args.ca or "letsencrypt")', controller)
        self.assertIn("ca: acme.provider", pages)


if __name__ == "__main__":
    unittest.main()
