include $(TOPDIR)/rules.mk

PKG_NAME:=qca-usb-phy-ipq5018
PKG_RELEASE:=8

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define KernelPackage/usb-phy-ipq5018
  SUBMENU:=USB Support
  TITLE:=JDCloud BE6500 Linux 6.6 native USB PHY
  DEPENDS:=@TARGET_qualcommax_ipq53xx +kmod-usb-core +kmod-usb3 +kmod-usb-dwc3-qcom
  KCONFIG:= \
	CONFIG_PHY_QCOM_M31_USB=n \
	CONFIG_PHY_IPQ_UNIPHY_USB=n
  FILES:= \
	$(PKG_BUILD_DIR)/phy-qcom-m31.ko \
	$(PKG_BUILD_DIR)/phy-qca-uniphy.ko
endef

define KernelPackage/usb-phy-ipq5018/description
  Builds the pinned QSDK 14 / Linux 6.6 generic PHY drivers for the native
  qcom,ipq5332-usb-hsphy binding. Both modules remain outside /etc/modules.d.
  The RAM diagnostic loads them explicitly; the persistent image uses a late
  self-disabling probe so a failed attempt cannot create a permanent boot loop.
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
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) ./files/be6500-usb-host $(1)/usr/sbin/be6500-usb-host
endef

$(eval $(call KernelPackage,usb-phy-ipq5018))
