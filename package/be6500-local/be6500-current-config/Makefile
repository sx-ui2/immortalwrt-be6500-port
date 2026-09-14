include $(TOPDIR)/rules.mk

PKG_NAME:=be6500-current-config
PKG_RELEASE:=4

include $(INCLUDE_DIR)/package.mk

define Package/be6500-current-config
  SECTION:=base
  CATEGORY:=Base system
  TITLE:=JDCloud BE6500 captured runtime configuration
  DEPENDS:=+base-files
  PKGARCH:=all
endef

define Package/be6500-current-config/description
  Configuration snapshot captured from the currently validated BE6500 runtime.
endef

define Build/Compile
endef

define Package/be6500-current-config/install
	$(INSTALL_DIR) $(1)/usr/share/be6500-current-config
	$(CP) ./files/etc/config/* $(1)/usr/share/be6500-current-config/
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/98-be6500-default-password $(1)/etc/uci-defaults/98-be6500-default-password
	$(INSTALL_BIN) ./files/97-be6500-remove-ifname-migration $(1)/etc/uci-defaults/97-be6500-remove-ifname-migration
	$(INSTALL_BIN) ./files/99-be6500-current-config $(1)/etc/uci-defaults/99-be6500-current-config
endef

$(eval $(call BuildPackage,be6500-current-config))
