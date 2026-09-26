include $(TOPDIR)/rules.mk

PKG_NAME:=qca-usb-phy-ipq5018
PKG_RELEASE:=6

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define KernelPackage/usb-phy-ipq5018
  SUBMENU:=USB Support
  TITLE:=JDCloud BE6500 QWRT-compatible USB PHY support
  DEPENDS:=@TARGET_qualcommax_ipq53xx +kmod-usb-core +kmod-usb-phy-nop +kmod-usb3 +kmod-usb-dwc3-qcom
  KCONFIG:= \
	CONFIG_USB_PHY=y \
	CONFIG_PHY_QCOM_M31_USB=n \
	CONFIG_PHY_IPQ_UNIPHY_USB=n
  FILES:= \
	$(PKG_BUILD_DIR)/qca-m31-usb-phy.ko \
	$(PKG_BUILD_DIR)/phy-qca-uniphy.ko
endef

define KernelPackage/usb-phy-ipq5018/description
  Ports the USB PHY topology and M31 programming sequence from the running
  QWRT image while keeping both hardware PHY modules out of the automatic
  boot path.  They are deliberately not placed in /etc/modules.d and are
  never probed automatically; use be6500-usb-host probe after the router is
  fully running.
endef

define Build/Prepare
	$(call Build/Prepare/Default)
	$(CP) ./src/Makefile $(PKG_BUILD_DIR)/
	$(CP) ./src/qca-m31-usb-phy.c $(PKG_BUILD_DIR)/
	$(CP) $(LINUX_DIR)/drivers/phy/qualcomm/phy-qca-uniphy.c $(PKG_BUILD_DIR)/
endef

define Build/Compile
	$(KERNEL_MAKE) M=$(PKG_BUILD_DIR) modules
endef

define KernelPackage/usb-phy-ipq5018/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) ./files/be6500-usb-host $(1)/usr/sbin/be6500-usb-host
endef

$(eval $(call KernelPackage,usb-phy-ipq5018))
