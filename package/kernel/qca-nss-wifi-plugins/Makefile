include $(TOPDIR)/rules.mk

PKG_NAME:=qca-nss-wifi-plugins
PKG_RELEASE:=1

# QSDK 14.0 r9 bridge between ath12k and the PPE Direct Switch API.  Keep
# this pinned to the same release train as nss-ppe and wlan-open: newer
# ath12k no longer calls the PPE-DS symbols directly.
PKG_SOURCE_URL:=https://git.codelinaro.org/clo/qsdk/oss/lklm/nss-plugins.git
PKG_SOURCE_PROTO:=git
PKG_SOURCE_DATE:=2026-06-24
PKG_SOURCE_VERSION:=0de0e5a9f9fd07cc7a161c33d2c97bf180370746
PKG_MIRROR_HASH:=skip

PKG_BUILD_PARALLEL:=1
PKG_FLAGS:=nonshared
PKG_BUILD_DEPENDS:=qca-nss-ppe qca-ssdk

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define KernelPackage/qca-nss-wifi-plugins
  SECTION:=kernel
  CATEGORY:=Kernel modules
  SUBMENU:=Network Devices
  TITLE:=Qualcomm NSS Wi-Fi PPE-DS bridge
  DEPENDS:=@TARGET_qualcommax +kmod-qca-nss-ppe-ds +kmod-qca-ssdk
  FILES:=$(PKG_BUILD_DIR)/qca-nss-wifi-plugins.ko
  AUTOLOAD:=$(call AutoLoad,53,qca-nss-wifi-plugins,1)
endef

define KernelPackage/qca-nss-wifi-plugins/Description
  QSDK bridge exporting the modular NSS/PPE operations used by ath12k to
  allocate Wi-Fi virtual ports and PPE Direct Switch instances.
endef

PPE_SYMVERS:=$(STAGING_DIR)/usr/share/qca-nss-ppe/qca-nss-ppe.symvers
SSDK_SYMVERS:=$(STAGING_DIR)/usr/share/qca-ssdk/qca-ssdk.symvers

EXTRA_CFLAGS+= \
	-I$(STAGING_DIR)/usr/include/qca-nss-ppe \
	-I$(STAGING_DIR)/usr/include/qca-nss-ppe/api \
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
		ARCH="$(LINUX_KARCH)" \
		CROSS_COMPILE="$(TARGET_CROSS)" \
		EXTRA_CFLAGS="$(EXTRA_CFLAGS)" \
		KBUILD_EXTRA_SYMBOLS="$(PPE_SYMVERS) $(SSDK_SYMVERS)" \
		modules
endef

define Build/InstallDev
	$(INSTALL_DIR) $(1)/usr/share/qca-nss-wifi-plugins
	$(CP) $(PKG_BUILD_DIR)/../symvers/qca-nss-wifi-plugins.symvers \
		$(1)/usr/share/qca-nss-wifi-plugins/qca-nss-wifi-plugins.symvers
endef

$(eval $(call KernelPackage,qca-nss-wifi-plugins))
