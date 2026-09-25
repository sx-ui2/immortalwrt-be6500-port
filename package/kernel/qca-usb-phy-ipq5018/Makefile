include $(TOPDIR)/rules.mk

PKG_NAME:=qca-usb-phy-ipq5018
PKG_RELEASE:=3

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define KernelPackage/usb-phy-ipq5018
  SUBMENU:=USB Support
  TITLE:=JDCloud BE6500 factory USB PHY support
  DEPENDS:=@TARGET_qualcommax_ipq53xx +kmod-usb-core
  KCONFIG:= \
	CONFIG_PHY_QCOM_M31_USB=n \
	CONFIG_PHY_IPQ_UNIPHY_USB=m
  FILES:= \
	$(PKG_BUILD_DIR)/qca-m31-usb-phy.ko \
	$(LINUX_DIR)/drivers/phy/qualcomm/phy-qca-uniphy.ko
  AUTOLOAD:=$(call AutoLoad,45,qca-m31-usb-phy phy-qca-uniphy,1)
endef

define KernelPackage/usb-phy-ipq5018/description
  Preserves the factory QSDK USB topology used by the JDCloud BE6500:
  the legacy usb_phy M31 USB2 driver and the generic IPQ5332 UniPHY USB3
  driver.  Do not replace the M31 half with PHY_QCOM_M31_USB; that driver
  uses a different device-tree binding and caused the v42 boot failure.
endef

define Build/Prepare
	$(call Build/Prepare/Default)
	$(CP) ./src/* $(PKG_BUILD_DIR)/
endef

define Build/Compile
	$(KERNEL_MAKE) M=$(PKG_BUILD_DIR) modules
endef

$(eval $(call KernelPackage,usb-phy-ipq5018))
