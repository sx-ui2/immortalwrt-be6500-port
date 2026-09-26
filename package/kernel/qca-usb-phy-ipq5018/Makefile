include $(TOPDIR)/rules.mk

PKG_NAME:=qca-usb-phy-ipq5018
PKG_RELEASE:=4

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define KernelPackage/usb-phy-ipq5018
  SUBMENU:=USB Support
  TITLE:=JDCloud BE6500 Linux 6.6 USB PHY support
  DEPENDS:=@TARGET_qualcommax_ipq53xx +kmod-usb-core +kmod-usb3 +kmod-usb-dwc3-qcom
  KCONFIG:= \
	CONFIG_PHY_QCOM_M31_USB=n \
	CONFIG_PHY_IPQ_UNIPHY_USB=n
  FILES:= \
	$(PKG_BUILD_DIR)/phy-qcom-m31.ko \
	$(PKG_BUILD_DIR)/phy-qca-uniphy.ko
endef

define KernelPackage/usb-phy-ipq5018/description
  Builds the QSDK 14 / Linux 6.6 generic PHY drivers out-of-tree so the
  boot-confirmed kernel Image remains unchanged. The modules are deliberately
  not placed in /etc/modules.d; a late guarded service probes them only after
  the router has completed normal boot and suppresses a repeated probe after
  an interrupted first attempt.
endef

define Build/Prepare
	$(call Build/Prepare/Default)
	$(CP) ./src/Makefile $(PKG_BUILD_DIR)/
	$(CP) $(LINUX_DIR)/drivers/phy/qualcomm/phy-qcom-m31.c $(PKG_BUILD_DIR)/
	$(CP) $(LINUX_DIR)/drivers/phy/qualcomm/phy-qca-uniphy.c $(PKG_BUILD_DIR)/
endef

define Build/Compile
	$(KERNEL_MAKE) M=$(PKG_BUILD_DIR) modules
endef

define KernelPackage/usb-phy-ipq5018/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/be6500_usb_guard $(1)/etc/config/be6500_usb_guard
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/be6500-usb-host.init $(1)/etc/init.d/be6500-usb-host
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) ./files/be6500-usb-host $(1)/usr/sbin/be6500-usb-host
endef

define KernelPackage/usb-phy-ipq5018/conffiles
/etc/config/be6500_usb_guard
endef

$(eval $(call KernelPackage,usb-phy-ipq5018))
