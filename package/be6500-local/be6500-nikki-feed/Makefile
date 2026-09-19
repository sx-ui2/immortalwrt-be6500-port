include $(TOPDIR)/rules.mk

PKG_NAME:=be6500-nikki-feed
PKG_VERSION:=1
PKG_RELEASE:=1

PKG_MAINTAINER:=BE6500 firmware maintainers
PKG_LICENSE:=GPL-3.0-or-later

include $(INCLUDE_DIR)/package.mk

define Package/be6500-nikki-feed
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Official Nikki binary feed configuration for BE6500
  URL:=https://github.com/nikkinikki-org/OpenWrt-nikki
  DEPENDS:=+opkg
endef

define Package/be6500-nikki-feed/description
  Installs the official Nikki package signing key and configures the matching
  OpenWrt 24.10 binary feed so Nikki and its LuCI translations can be updated
  with opkg after the firmware is installed.
endef

define Build/Compile
endef

define Package/be6500-nikki-feed/install
	$(INSTALL_DIR) $(1)/usr/share/be6500-nikki-feed
	$(INSTALL_DATA) ./files/key-build.pub $(1)/usr/share/be6500-nikki-feed/key-build.pub
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/99-be6500-nikki-feed $(1)/etc/uci-defaults/99-be6500-nikki-feed
endef

$(eval $(call BuildPackage,be6500-nikki-feed))
