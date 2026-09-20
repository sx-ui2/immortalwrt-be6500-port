include $(TOPDIR)/rules.mk

PKG_NAME:=be6500-luci-zh-default
PKG_VERSION:=1
PKG_RELEASE:=2

include $(INCLUDE_DIR)/package.mk

define Package/be6500-luci-zh-default
  SECTION:=base
  CATEGORY:=Base system
  TITLE:=BE6500 Simplified Chinese LuCI default
  DEPENDS:=+luci-i18n-base-zh-cn \
	+luci-i18n-firewall-zh-cn \
	+luci-i18n-samba4-zh-cn
endef

define Build/Compile
endef

define Package/be6500-luci-zh-default/install
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/97-be6500-luci-runtime-i18n $(1)/etc/uci-defaults/97-be6500-luci-runtime-i18n
	$(INSTALL_BIN) ./files/98-be6500-qwrt-base $(1)/etc/uci-defaults/98-be6500-qwrt-base
	$(INSTALL_BIN) ./files/99-be6500-luci-zh $(1)/etc/uci-defaults/99-be6500-luci-zh
endef

$(eval $(call BuildPackage,be6500-luci-zh-default))
