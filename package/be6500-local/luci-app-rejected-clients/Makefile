include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-rejected-clients
PKG_RELEASE:=44
PKG_MAINTAINER:=Codex

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-rejected-clients
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Network settings and device management page
  DEPENDS:=+luci-base +luci-compat +luci-lua-runtime +luci-theme-bootstrap +uhttpd +uhttpd-mod-ubus +rpcd +rpcd-mod-file +jsonfilter +ip-full +iwinfo +nftables +hostapd-utils \
	+libustream-openssl +ca-bundle +curl +openssl-util +acme-acmesh +acme-acmesh-dnsapi \
	+luci-app-ddns +luci-app-upnp +luci-app-sqm +luci-app-nlbwmon \
	+luci-i18n-package-manager-zh-cn +luci-i18n-ddns-zh-cn \
	+luci-i18n-nlbwmon-zh-cn +luci-i18n-sqm-zh-cn +luci-i18n-upnp-zh-cn \
	+luci-i18n-diskman-zh-cn +luci-i18n-usb-printer-zh-cn \
	+udpxy +tcpdump +kmod-macvlan +arp-scan-database +zram-swap +losetup \
	+qca-ssdk-shell +kmod-qca-nss-ppe-vp +kmod-qca-nss-ppe-ds \
	+kmod-qca-nss-ppe-bridge-mgr +kmod-qca-nss-ppe-vlan-mgr \
	+kmod-qca-nss-ppe-pppoe-mgr \
	+kmod-qca-nss-ppe-ath-clients \
	+kmod-qca-nss-wifi-plugins +kmod-qca-nss-ppe-rule
  PKGARCH:=all
endef

define Package/luci-app-rejected-clients/description
  Custom network settings, Wi-Fi control, device management, access control,
  IPTV, DDNS, Mesh, rejected-device and connection-record LuCI page.
endef

define Build/Compile
endef

define Package/luci-app-rejected-clients/install
	$(INSTALL_DIR) $(1)/www/be6500-oem/Native_JS
	$(INSTALL_DATA) ./root/www/be6500-oem/Native_JS/pages.js $(1)/www/be6500-oem/Native_JS/pages.js
	$(INSTALL_DIR) $(1)/www/be6500-oem/Native_CSS
	$(INSTALL_DATA) ./root/www/be6500-oem/Native_CSS/system-theme.css $(1)/www/be6500-oem/Native_CSS/system-theme.css
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(INSTALL_DATA) ./root/usr/lib/lua/luci/controller/be6500_oem_beta.lua $(1)/usr/lib/lua/luci/controller/be6500_oem_beta.lua
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/view/be6500_oem_beta
	$(INSTALL_DATA) ./root/usr/lib/lua/luci/view/be6500_oem_beta/index.htm $(1)/usr/lib/lua/luci/view/be6500_oem_beta/index.htm
	$(INSTALL_DIR) $(1)/usr/share/be6500-luci-overrides/status/include
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/status/include/10_system.js $(1)/usr/share/be6500-luci-overrides/status/include/10_system.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/status/include/20_memory.js $(1)/usr/share/be6500-luci-overrides/status/include/20_memory.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/status/include/25_storage.js $(1)/usr/share/be6500-luci-overrides/status/include/25_storage.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/status/include/29_ports.js $(1)/usr/share/be6500-luci-overrides/status/include/29_ports.js
	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) ./root/usr/libexec/rejected-mac $(1)/usr/libexec/rejected-mac
	$(INSTALL_BIN) ./root/usr/libexec/ddns-manager $(1)/usr/libexec/ddns-manager
	ln -sf ddns-manager $(1)/usr/libexec/be6500-ddns-manager
	$(INSTALL_BIN) ./root/usr/libexec/be6500-cert-manager $(1)/usr/libexec/be6500-cert-manager
	$(INSTALL_BIN) ./root/usr/libexec/be6500-wifi-apply $(1)/usr/libexec/be6500-wifi-apply
	$(INSTALL_BIN) ./root/usr/libexec/be6500-led-control $(1)/usr/libexec/be6500-led-control
	$(INSTALL_BIN) ./root/usr/libexec/be6500-led-blink.uc $(1)/usr/libexec/be6500-led-blink.uc
	$(INSTALL_BIN) ./root/usr/libexec/be6500-radio0-auto-channel $(1)/usr/libexec/be6500-radio0-auto-channel
	$(INSTALL_BIN) ./root/usr/libexec/be6500-sync-wifi-personality $(1)/usr/libexec/be6500-sync-wifi-personality
	$(INSTALL_BIN) ./root/usr/libexec/be6500-patch-luci-wireless $(1)/usr/libexec/be6500-patch-luci-wireless
	$(INSTALL_BIN) ./root/usr/libexec/be6500-patch-luci-network $(1)/usr/libexec/be6500-patch-luci-network
	$(INSTALL_BIN) ./root/usr/libexec/be6500-game-port $(1)/usr/libexec/be6500-game-port
	$(INSTALL_BIN) ./root/usr/libexec/be6500-iptv-priority $(1)/usr/libexec/be6500-iptv-priority
	$(INSTALL_BIN) ./root/usr/libexec/be6500-patch-luci-firewall $(1)/usr/libexec/be6500-patch-luci-firewall
	$(INSTALL_BIN) ./root/usr/libexec/be6500-fw4-multiwan $(1)/usr/libexec/be6500-fw4-multiwan
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./root/etc/uci-defaults/95-be6500-luci-wireless $(1)/etc/uci-defaults/95-be6500-luci-wireless
	$(INSTALL_BIN) ./root/etc/uci-defaults/99-be6500-wireless-runtime-fix $(1)/etc/uci-defaults/99-be6500-wireless-runtime-fix
	$(INSTALL_BIN) ./root/etc/uci-defaults/99-be6500-encryption-normalize $(1)/etc/uci-defaults/99-be6500-encryption-normalize
	$(INSTALL_BIN) ./root/etc/uci-defaults/99-be6500-wireless-dedupe $(1)/etc/uci-defaults/99-be6500-wireless-dedupe
	$(INSTALL_BIN) ./root/etc/uci-defaults/99-be6500-led-defaults $(1)/etc/uci-defaults/99-be6500-led-defaults
	$(INSTALL_BIN) ./root/etc/uci-defaults/99-be6500-switch-port-labels $(1)/etc/uci-defaults/99-be6500-switch-port-labels
	$(INSTALL_BIN) ./root/etc/uci-defaults/99-be6500-runtime-services $(1)/etc/uci-defaults/99-be6500-runtime-services
	$(INSTALL_DIR) $(1)/etc/sysctl.d
	$(INSTALL_CONF) ./root/etc/sysctl.d/99-be6500-ppe.conf $(1)/etc/sysctl.d/99-be6500-ppe.conf
	$(INSTALL_DIR) $(1)/etc/rc.button
	$(INSTALL_BIN) ./root/etc/rc.button/joy $(1)/etc/rc.button/joy
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/init.d/be6500-wifi-personality $(1)/etc/init.d/be6500-wifi-personality
	$(INSTALL_BIN) ./root/etc/init.d/be6500-led $(1)/etc/init.d/be6500-led
	$(INSTALL_BIN) ./root/etc/init.d/be6500-fw4-multiwan $(1)/etc/init.d/be6500-fw4-multiwan
	$(INSTALL_BIN) ./root/etc/init.d/be6500-luci-patches $(1)/etc/init.d/be6500-luci-patches
	$(INSTALL_BIN) ./root/etc/init.d/be6500-guest-qos $(1)/etc/init.d/be6500-guest-qos
	$(INSTALL_BIN) ./root/etc/init.d/be6500-game-port $(1)/etc/init.d/be6500-game-port
	$(INSTALL_DIR) $(1)/etc/hotplug.d/iface
	$(INSTALL_BIN) ./root/etc/hotplug.d/iface/95-be6500-fw4-multiwan $(1)/etc/hotplug.d/iface/95-be6500-fw4-multiwan
	$(INSTALL_BIN) ./root/etc/hotplug.d/iface/96-be6500-guest-qos $(1)/etc/hotplug.d/iface/96-be6500-guest-qos
	$(INSTALL_BIN) ./root/etc/hotplug.d/iface/97-be6500-iptv-priority $(1)/etc/hotplug.d/iface/97-be6500-iptv-priority
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) ./root/usr/sbin/be6500-switch-wifi-mode $(1)/usr/sbin/be6500-switch-wifi-mode
	$(INSTALL_BIN) ./root/usr/sbin/be6500-qos-apply $(1)/usr/sbin/be6500-qos-apply
	$(INSTALL_BIN) ./root/usr/sbin/be6500-qos-watch $(1)/usr/sbin/be6500-qos-watch
	$(INSTALL_DIR) $(1)/sbin
	$(INSTALL_BIN) ./root/sbin/tempinfo $(1)/sbin/tempinfo
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-rejected-clients.json $(1)/usr/share/rpcd/acl.d/luci-app-rejected-clients.json
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-rejected-clients.json $(1)/usr/share/luci/menu.d/luci-app-rejected-clients.json
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/be6500_oem $(1)/etc/config/be6500_oem
	$(INSTALL_CONF) ./root/etc/config/be6500_oem_api $(1)/etc/config/be6500_oem_api
	$(INSTALL_CONF) ./root/etc/wgetrc $(1)/etc/wgetrc
endef

define Package/luci-app-rejected-clients/postinst
#!/bin/sh

# Apply the generated LuCI assets while the image root is being assembled as
# well as during a live package upgrade.  The boot service repeats this
# operation idempotently, but the firmware itself must already contain the
# cleaned native device view and truthful storage view before its first boot.
root="$${IPKG_INSTROOT:-}"
status_source="$$root/usr/share/be6500-luci-overrides/status/include"
status_target="$$root/www/luci-static/resources/view/status/include"

if [ -d "$$status_source" ]; then
	mkdir -p "$$status_target"
	for source in "$$status_source"/*.js; do
		[ -f "$$source" ] || continue
		cp -f "$$source" "$$status_target/" || exit 1
	done
fi

interfaces="$$root/www/luci-static/resources/view/network/interfaces.js"
patcher="$$root/usr/libexec/be6500-patch-luci-network"
if [ -f "$$interfaces" ] && [ -x "$$patcher" ]; then
	BE6500_LUCI_INTERFACES_VIEW="$$interfaces" \
	BE6500_LUCI_SWITCH_VIEW="$$root/www/luci-static/resources/view/network/switch.js" \
	BE6500_LUCI_HEADERS="$$root/usr/share/ucode/luci/template/header.ut" \
	BE6500_LUCI_CACHE_ROOT="$$root/tmp" \
		"$$patcher" || exit 1
fi

exit 0
endef

$(eval $(call BuildPackage,luci-app-rejected-clients))
