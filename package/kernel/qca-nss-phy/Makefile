include $(TOPDIR)/rules.mk

PKG_NAME:=qca-nss-phy
PKG_RELEASE:=1

PKG_SOURCE_URL:=https://git.codelinaro.org/clo/qsdk/oss/lklm/qca-nss-phy.git
PKG_SOURCE_PROTO:=git
PKG_SOURCE_DATE:=2026-07-03
PKG_SOURCE_VERSION:=16eec6ac35820cb67af59223e8b4c2dba7179655
PKG_MIRROR_HASH:=skip

PKG_BUILD_PARALLEL:=1
PKG_FLAGS:=nonshared

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define KernelPackage/qca-nss-phy
  SECTION:=kernel
  CATEGORY:=Kernel modules
  SUBMENU:=Network Devices
  TITLE:=Qualcomm NSS PHY and switch clock support
  DEPENDS:=@(TARGET_qualcommax)
  FILES:= \
	$(PKG_BUILD_DIR)/linux_std/clock/qca8k-cc.ko \
	$(PKG_BUILD_DIR)/linux_std/qca8084/qca8084-phy.ko
  AUTOLOAD:=$(call AutoLoad,29,qca8k-cc qca8084-phy,1)
endef

define KernelPackage/qca-nss-phy/Description
  QSDK 14 switch clock and QCA8084 PHY helpers used by the Qualcomm SSDK.
endef

define Build/Compile
	+$(KERNEL_MAKE) $(PKG_JOBS) \
		-C "$(LINUX_DIR)" \
		M="$(PKG_BUILD_DIR)/linux_std/clock" \
		modules
	+$(KERNEL_MAKE) $(PKG_JOBS) \
		-C "$(LINUX_DIR)" \
		M="$(PKG_BUILD_DIR)/linux_std/qca8084" \
		KBUILD_EXTRA_SYMBOLS="$(PKG_BUILD_DIR)/linux_std/clock/Module.symvers" \
		modules
endef

define Build/InstallDev
	$(INSTALL_DIR) $(1)/usr/include/qca-nss-phy
	$(INSTALL_DIR) $(1)/usr/share/qca-nss-phy
	$(CP) $(PKG_BUILD_DIR)/nss_ext/*.h $(1)/usr/include/qca-nss-phy/
	$(CP) $(PKG_BUILD_DIR)/linux_std/qcom_phy_lib.h $(1)/usr/include/qca-nss-phy/
	$(CP) $(PKG_BUILD_DIR)/linux_std/clock/qca8k_clk.h $(1)/usr/include/qca-nss-phy/
	$(CP) $(PKG_BUILD_DIR)/linux_std/mdio_ahb/mdio-ahb.h $(1)/usr/include/qca-nss-phy/
	$(CP) $(PKG_BUILD_DIR)/linux_std/clock/Module.symvers \
		$(1)/usr/share/qca-nss-phy/qca8k-cc.symvers
	$(CP) $(PKG_BUILD_DIR)/linux_std/qca8084/Module.symvers \
		$(1)/usr/share/qca-nss-phy/qca8084-phy.symvers
endef

$(eval $(call KernelPackage,qca-nss-phy))
