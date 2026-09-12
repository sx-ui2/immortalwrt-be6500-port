include $(TOPDIR)/rules.mk

PKG_NAME:=qca-nss-ppe
PKG_RELEASE:=1

PKG_SOURCE_URL:=https://git.codelinaro.org/clo/qsdk/oss/lklm/nss-ppe.git
PKG_SOURCE_PROTO:=git
PKG_SOURCE_DATE:=2026-08-10
PKG_SOURCE_VERSION:=01fa40d7b234e09f1722a938375e617851a5fc1a
PKG_MIRROR_HASH:=skip

PKG_BUILD_PARALLEL:=1
PKG_FLAGS:=nonshared
PKG_BUILD_DEPENDS:=qca-ssdk

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define KernelPackage/qca-nss-ppe
  SECTION:=kernel
  CATEGORY:=Kernel modules
  SUBMENU:=Network Devices
  TITLE:=Qualcomm NSS PPE driver
  DEPENDS:=@TARGET_qualcommax +kmod-qca-ssdk
  FILES:=$(PKG_BUILD_DIR)/drv/ppe_drv/qca-nss-ppe.ko
  AUTOLOAD:=$(call AutoLoad,31,qca-nss-ppe,1)
endef

define KernelPackage/qca-nss-ppe/Description
  QSDK packet processing engine driver used by the NSS dataplane.
endef

QCA_SSDK_SYMVERS:=$(STAGING_DIR)/usr/share/qca-ssdk/qca-ssdk.symvers

EXTRA_CFLAGS+= \
	-I$(PKG_BUILD_DIR)/nss_debug/exports \
	-I$(STAGING_DIR)/usr/include/qca-ssdk \
	-I$(STAGING_DIR)/usr/include/qca-ssdk/api \
	-I$(STAGING_DIR)/usr/include/qca-ssdk/fal \
	-I$(STAGING_DIR)/usr/include/qca-ssdk/init \
	-I$(STAGING_DIR)/usr/include/qca-ssdk/ref \
	-I$(STAGING_DIR)/usr/include/qca-ssdk/sal

define Build/Compile
	+$(KERNEL_MAKE) $(PKG_JOBS) \
		-C "$(LINUX_DIR)" \
		M="$(PKG_BUILD_DIR)" \
		EXTRA_CFLAGS="$(EXTRA_CFLAGS)" \
		KBUILD_EXTRA_SYMBOLS="$(QCA_SSDK_SYMVERS)" \
		SoC="$(CONFIG_TARGET_SUBTARGET)" \
		ppe-drv=y \
		modules
endef

define Build/InstallDev
	$(INSTALL_DIR) $(1)/usr/include/qca-nss-ppe
	$(CP) $(PKG_BUILD_DIR)/drv/exports/*.h $(1)/usr/include/qca-nss-ppe/
	$(INSTALL_DIR) $(1)/usr/share/qca-nss-ppe
	$(CP) $(PKG_BUILD_DIR)/../symvers/qca-nss-ppe.symvers $(1)/usr/share/qca-nss-ppe/qca-nss-ppe.symvers
endef

$(eval $(call KernelPackage,qca-nss-ppe))
