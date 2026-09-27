include $(TOPDIR)/rules.mk

PKG_NAME:=be6500-usb-autostart
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/be6500-usb-autostart
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=JDCloud BE6500 guarded USB host startup
  DEPENDS:=@TARGET_qualcommax_ipq53xx +kmod-usb-phy-ipq5018
  PKGARCH:=all
endef

define Package/be6500-usb-autostart/description
  Starts the native IPQ5332 USB PHY after normal boot. A persistent in-progress
  marker prevents repeated boot failures: an interrupted probe is skipped on
  the next boot until the operator explicitly retries it.
endef

define Package/be6500-usb-autostart/conffiles
/etc/config/be6500_usb
endef

define Build/Compile
endef

define Package/be6500-usb-autostart/install
	$(INSTALL_DIR) $(1)/etc/config $(1)/etc/init.d
	$(INSTALL_CONF) ./files/be6500_usb.config $(1)/etc/config/be6500_usb
	$(INSTALL_BIN) ./files/be6500-usb.init $(1)/etc/init.d/be6500-usb
endef

$(eval $(call BuildPackage,be6500-usb-autostart))
