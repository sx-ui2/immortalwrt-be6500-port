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
PKG_BUILD_DEPENDS:=qca-ssdk qca-nss-dp

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

# The vendor tree exposes virtual ports, Direct Switch and the PPE rule engine
# as separate modules.  Keep that packaging boundary here.  The BE6500 image
# selects VP and rule/QoS; DS must remain unselected until a matching WLAN
# plugin exporting qca_nss_wifi_plugins_get_ops is available.  The rule module
# exposes the hardware policer/QoS blocks used by the BE6500 shaper.
define KernelPackage/qca-nss-ppe-vp
  SECTION:=kernel
  CATEGORY:=Kernel modules
  SUBMENU:=Network Devices
  TITLE:=Qualcomm NSS PPE virtual port driver
  DEPENDS:=@TARGET_qualcommax +kmod-qca-nss-ppe +kmod-qca-nss-dp
  FILES:=$(PKG_BUILD_DIR)/drv/ppe_vp/qca-nss-ppe-vp.ko
  AUTOLOAD:=$(call AutoLoad,51,qca-nss-ppe-vp,1)
endef

define KernelPackage/qca-nss-ppe-vp/Description
  PPE virtual ports for WLAN interfaces.
endef

define KernelPackage/qca-nss-ppe-ds
  SECTION:=kernel
  CATEGORY:=Kernel modules
  SUBMENU:=Network Devices
  TITLE:=Qualcomm NSS PPE Direct Switch driver
  DEPENDS:=@TARGET_qualcommax +kmod-qca-nss-ppe-vp +kmod-qca-nss-dp
  FILES:=$(PKG_BUILD_DIR)/drv/ppe_ds/qca-nss-ppe-ds.ko
  AUTOLOAD:=$(call AutoLoad,52,qca-nss-ppe-ds,1)
endef

define KernelPackage/qca-nss-ppe-ds/Description
  PPE Direct Switch support for Wi-Fi virtual ports.
endef

define KernelPackage/qca-nss-ppe-rule
  SECTION:=kernel
  CATEGORY:=Kernel modules
  SUBMENU:=Network Devices
  TITLE:=Qualcomm NSS PPE rule, policer and QoS driver
  DEPENDS:=@TARGET_qualcommax +kmod-qca-nss-ppe +kmod-qca-nss-ppe-vp
  FILES:=$(PKG_BUILD_DIR)/drv/ppe_rule/qca-nss-ppe-rule.ko
  AUTOLOAD:=$(call AutoLoad,53,qca-nss-ppe-rule,1)
endef

define KernelPackage/qca-nss-ppe-rule/Description
  PPE flow rules and hardware policer/QoS support.
endef

QCA_SSDK_SYMVERS:=$(STAGING_DIR)/usr/share/qca-ssdk/qca-ssdk.symvers
QCA_NSS_DP_SYMVERS:=$(KERNEL_BUILD_DIR)/symvers/qca-nss-dp.symvers

PPE_BUILD_FLAGS:=ppe-drv=y
ifneq ($(CONFIG_PACKAGE_kmod-qca-nss-ppe-vp),)
  PPE_BUILD_FLAGS+=ppe-vp=y
endif
ifneq ($(CONFIG_PACKAGE_kmod-qca-nss-ppe-ds),)
  PPE_BUILD_FLAGS+=ppe-ds=y
endif
ifneq ($(CONFIG_PACKAGE_kmod-qca-nss-ppe-rule),)
  # qca-nss-ppe-rule unconditionally wires RFS/COS/mirror/priority helpers
  # from its module entrypoint, so these companion objects must be selected
  # together with ACL/policer/QoS on IPQ53xx.
  PPE_BUILD_FLAGS+=ppe-rule=y PPE_ACL_ENABLED=y PPE_POLICER_ENABLED=y PPE_QOS_ENABLED=y PPE_RFS_ENABLED=y PPE_COS_MAP_ENABLED=y PPE_MIRROR_ENABLED=y PPE_PRIORITY_ENABLED=y PPE_RULE_IPQ53XX=y
endif

EXTRA_CFLAGS+= \
	-I$(PKG_BUILD_DIR)/exports \
	-I$(PKG_BUILD_DIR)/drv/exports \
	-I$(PKG_BUILD_DIR)/nss_debug/exports \
	-I$(STAGING_DIR)/usr/include/qca-ssdk \
	-I$(STAGING_DIR)/usr/include/qca-ssdk/api \
	-I$(STAGING_DIR)/usr/include/qca-ssdk/fal \
	-I$(STAGING_DIR)/usr/include/qca-ssdk/init \
	-I$(STAGING_DIR)/usr/include/qca-ssdk/ref \
	-I$(STAGING_DIR)/usr/include/qca-ssdk/sal \
	-I$(STAGING_DIR)/usr/include/qca-nss-dp

define Build/Compile
	+$(KERNEL_MAKE) $(PKG_JOBS) \
		-C "$(LINUX_DIR)" \
		M="$(PKG_BUILD_DIR)" \
		EXTRA_CFLAGS="$(EXTRA_CFLAGS)" \
		KBUILD_EXTRA_SYMBOLS="$(QCA_SSDK_SYMVERS) $(QCA_NSS_DP_SYMVERS)" \
		SoC="$(CONFIG_TARGET_SUBTARGET)" \
		$(PPE_BUILD_FLAGS) \
		modules
endef

define Build/InstallDev
	$(INSTALL_DIR) $(1)/usr/include/qca-nss-ppe
	$(CP) $(PKG_BUILD_DIR)/drv/exports/*.h $(1)/usr/include/qca-nss-ppe/
	$(CP) $(PKG_BUILD_DIR)/drv/ppe_ds/exports/*.h $(1)/usr/include/qca-nss-ppe/
	$(CP) $(PKG_BUILD_DIR)/exports/nss_plugins.h $(1)/usr/include/qca-nss-ppe/
	$(INSTALL_DIR) $(1)/usr/share/qca-nss-ppe
	$(CP) $(PKG_BUILD_DIR)/../symvers/qca-nss-ppe.symvers $(1)/usr/share/qca-nss-ppe/qca-nss-ppe.symvers
endef

$(eval $(call KernelPackage,qca-nss-ppe))
$(eval $(call KernelPackage,qca-nss-ppe-vp))
$(eval $(call KernelPackage,qca-nss-ppe-ds))
$(eval $(call KernelPackage,qca-nss-ppe-rule))
