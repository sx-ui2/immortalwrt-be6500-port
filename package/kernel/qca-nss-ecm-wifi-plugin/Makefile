include $(TOPDIR)/rules.mk

PKG_NAME:=qca-nss-ecm-wifi-plugin
PKG_RELEASE:=1
PKG_BUILD_DEPENDS:=qca-nss-ecm mac80211

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define KernelPackage/qca-nss-ecm-wifi-plugin
  SECTION:=kernel
  CATEGORY:=Kernel modules
  SUBMENU:=Network Support
  TITLE:=Qualcomm ECM to ath12k Wi-Fi metadata bridge
  DEPENDS:=@TARGET_qualcommax +kmod-qca-nss-ecm +kmod-ath
  FILES:=$(PKG_BUILD_DIR)/ecm_wifi_plugin.ko
endef

define KernelPackage/qca-nss-ecm-wifi-plugin/Description
  Supplies ath12k MLO and PPE-DS metadata to the ECM Wi-Fi classifier so
  PPE rules use the correct Wi-Fi enqueue node.
endef

define Build/Prepare
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CP) ./src/* $(PKG_BUILD_DIR)/
endef

ECM_SYMVERS:=$(STAGING_DIR)/usr/share/qca-nss-ecm/qca-nss-ecm.symvers
ATH_SYMVERS:=$(KERNEL_BUILD_DIR)/symvers/mac80211.symvers

EXTRA_CFLAGS+=-I$(STAGING_DIR)/usr/include/qca-nss-ecm \
	-I$(STAGING_DIR)/usr/include/mac80211

define Build/Compile
	+$(KERNEL_MAKE) $(PKG_JOBS) \
		-C "$(LINUX_DIR)" \
		M="$(PKG_BUILD_DIR)" \
		ARCH="$(LINUX_KARCH)" \
		CROSS_COMPILE="$(TARGET_CROSS)" \
		EXTRA_CFLAGS="$(EXTRA_CFLAGS)" \
		KBUILD_EXTRA_SYMBOLS="$(ECM_SYMVERS) $(ATH_SYMVERS)" \
		modules
endef

$(eval $(call KernelPackage,qca-nss-ecm-wifi-plugin))
