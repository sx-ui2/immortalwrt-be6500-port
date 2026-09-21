include $(TOPDIR)/rules.mk

PKG_NAME:=qca-nss-sfe
PKG_RELEASE:=1

# Match the QSDK 14.0 r9 line used by the PPE and ECM packages.  The default
# branch of shortcut-fe is historical; this revision is the current Qualcomm
# SFE implementation with Linux 6.6 and PPPoE support.
PKG_SOURCE_URL:=https://git.codelinaro.org/clo/qsdk/oss/lklm/shortcut-fe.git
PKG_SOURCE_PROTO:=git
PKG_SOURCE_DATE:=2026-07-16
PKG_SOURCE_VERSION:=4b1a99a929147e70d3256a7b20f814f23bc270b2
PKG_MIRROR_HASH:=skip

PKG_BUILD_PARALLEL:=1
PKG_FLAGS:=nonshared

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define KernelPackage/qca-nss-sfe
  SECTION:=kernel
  CATEGORY:=Kernel modules
  SUBMENU:=Network Support
  TITLE:=Qualcomm Shortcut Forwarding Engine
  DEPENDS:=@TARGET_qualcommax +kmod-nf-conntrack +kmod-ppp +kmod-pppoe
  FILES:=$(PKG_BUILD_DIR)/qca-nss-sfe.ko
endef

define KernelPackage/qca-nss-sfe/Description
  Qualcomm in-kernel Shortcut Forwarding Engine used as ECM's software fast
  path and QoS-compatible fallback when PPE acceleration is not appropriate.
endef

SFE_MAKE_OPTS:= \
	SFE_SUPPORT_IPV6=y \
	SFE_BRIDGE_VLAN_FILTERING_ENABLE=y

define Build/Compile
	+$(KERNEL_MAKE) $(PKG_JOBS) \
		-C "$(LINUX_DIR)" \
		M="$(PKG_BUILD_DIR)" \
		ARCH="$(LINUX_KARCH)" \
		CROSS_COMPILE="$(TARGET_CROSS)" \
		EXTRA_CFLAGS="-I$(PKG_BUILD_DIR)/exports" \
		$(SFE_MAKE_OPTS) \
		modules
endef

define Build/InstallDev
	$(INSTALL_DIR) $(1)/usr/include/qca-nss-sfe
	$(CP) $(PKG_BUILD_DIR)/exports/. $(1)/usr/include/qca-nss-sfe/
	$(INSTALL_DIR) $(1)/usr/share/qca-nss-sfe
	$(CP) $(PKG_BUILD_DIR)/../symvers/qca-nss-sfe.symvers $(1)/usr/share/qca-nss-sfe/qca-nss-sfe.symvers
endef

$(eval $(call KernelPackage,qca-nss-sfe))
