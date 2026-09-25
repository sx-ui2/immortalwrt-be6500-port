include $(TOPDIR)/rules.mk

PKG_NAME:=qca-usb-phy-ipq5018
PKG_RELEASE:=1

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define KernelPackage/usb-phy-ipq5018
  SUBMENU:=USB Support
  TITLE:=Qualcomm IPQ5018/IPQ5332 USB PHY support
  DEPENDS:=@TARGET_qualcommax_ipq53xx +kmod-usb-core
  KCONFIG:= \
	CONFIG_PHY_QCOM_M31_USB=m \
	CONFIG_PHY_IPQ_UNIPHY_USB=m
  FILES:= \
	$(LINUX_DIR)/drivers/phy/qualcomm/phy-qcom-m31.ko \
	$(LINUX_DIR)/drivers/phy/qualcomm/phy-qca-uniphy.ko
  AUTOLOAD:=$(call AutoLoad,85,phy-qcom-m31 phy-qca-uniphy,1)
endef

define KernelPackage/usb-phy-ipq5018/description
  Packages the M31 USB2 PHY and USB UniPHY drivers used by the IPQ5332
  DWC3 host controller.  They remain modules so USB probing cannot block
  the router's early boot path.
endef

define Build/Compile
endef

$(eval $(call KernelPackage,usb-phy-ipq5018))
