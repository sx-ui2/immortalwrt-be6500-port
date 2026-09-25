include $(TOPDIR)/rules.mk

PKG_NAME:=be6500-current-config
PKG_RELEASE:=10

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
	$(INSTALL_BIN) ./files/97-be6500-migrate-network-ifname $(1)/etc/uci-defaults/97-be6500-migrate-network-ifname
	$(INSTALL_BIN) ./files/99-be6500-current-config $(1)/etc/uci-defaults/99-be6500-current-config
	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) ./files/be6500-migrate-network-ifname $(1)/usr/libexec/be6500-migrate-network-ifname
endef

define Package/be6500-current-config/postinst
#!/bin/sh

# During image assembly the first-boot uci-default performs the migration.
# On a live package upgrade, migrate the saved UCI data immediately but leave
# the currently running network untouched.
[ -n "$${IPKG_INSTROOT:-}" ] || /usr/libexec/be6500-migrate-network-ifname
exit $$?
endef

$(eval $(call BuildPackage,be6500-current-config))
