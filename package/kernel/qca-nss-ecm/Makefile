include $(TOPDIR)/rules.mk

PKG_NAME:=qca-nss-ecm
PKG_RELEASE:=5

# Keep ECM on the same QSDK 14.0 r9 release line as qca-nss-ppe.  This tree
# contains the IPQ5332 PPE front end and the Linux 6.6 compatibility work.
PKG_SOURCE_URL:=https://git.codelinaro.org/clo/qsdk/oss/lklm/qca-nss-ecm.git
PKG_SOURCE_PROTO:=git
PKG_SOURCE_DATE:=2026-08-06
PKG_SOURCE_VERSION:=5997ffd40deef3ee6788a411bd3a06dbb5beb784
PKG_MIRROR_HASH:=skip

PKG_BUILD_PARALLEL:=1
PKG_FLAGS:=nonshared
PKG_BUILD_DEPENDS:=qca-nss-ppe qca-nss-sfe

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define KernelPackage/qca-nss-ecm
  SECTION:=kernel
  CATEGORY:=Kernel modules
  SUBMENU:=Network Support
  TITLE:=Qualcomm PPE/SFE Enhanced Connection Manager
  DEPENDS:=@TARGET_qualcommax +kmod-qca-nss-ppe +kmod-qca-nss-ppe-vp +kmod-qca-nss-sfe +kmod-nf-conntrack +kmod-ppp +kmod-pppoe
  FILES:= \
	$(PKG_BUILD_DIR)/ecm.ko \
	$(PKG_BUILD_DIR)/examples/ecm_sfe_l2.ko
endef

define KernelPackage/qca-nss-ecm/Description
  QSDK Enhanced Connection Manager with Qualcomm PPE and SFE front ends.  AUTO
  mode follows the factory firmware and permits a QoS-compatible SFE fallback.
endef

define KernelPackage/qca-nss-ecm/conffiles
/etc/config/ecm
endef

define KernelPackage/qca-nss-ecm/install
	$(INSTALL_DIR) $(1)/etc/config $(1)/etc/init.d
	$(INSTALL_CONF) ./files/ecm.config $(1)/etc/config/ecm
	$(INSTALL_BIN) ./files/qca-nss-ecm.init $(1)/etc/init.d/qca-nss-ecm
endef

PPE_SYMVERS:=$(STAGING_DIR)/usr/share/qca-nss-ppe/qca-nss-ppe.symvers
SFE_SYMVERS:=$(STAGING_DIR)/usr/share/qca-nss-sfe/qca-nss-sfe.symvers
ECM_SOC:=$(subst ",,$(CONFIG_TARGET_SUBTARGET))

ECM_MAKE_OPTS:= \
	ECM_FRONT_END_PPE_ENABLE=y \
	ECM_FRONT_END_SFE_ENABLE=y \
	ECM_FRONT_END_PPE_QOS_ENABLE=y \
	ECM_IPV6_ENABLE=y \
	ECM_NON_PORTED_SUPPORT_ENABLE=y \
	ECM_INTERFACE_VLAN_ENABLE=y \
	ECM_CLASSIFIER_MARK_ENABLE=y \
	ECM_CLASSIFIER_DSCP_ENABLE=y \
	ECM_CLASSIFIER_PCC_ENABLE=y \
	ECM_MULTICAST_ENABLE=n \
	ECM_INTERFACE_PPPOE_ENABLE=y \
	ECM_INTERFACE_PPP_ENABLE=y \
	ECM_INTERFACE_DSA_ENABLE=n \
	ECM_INTERFACE_SKIP_ACCEL_ENABLE=y

EXTRA_CFLAGS+=-I$(STAGING_DIR)/usr/include/qca-nss-ppe -I$(STAGING_DIR)/usr/include/qca-nss-sfe

define Build/Compile
	+$(KERNEL_MAKE) $(PKG_JOBS) \
		-C "$(LINUX_DIR)" \
		M="$(PKG_BUILD_DIR)" \
		ARCH="$(LINUX_KARCH)" \
		CROSS_COMPILE="$(TARGET_CROSS)" \
		EXTRA_CFLAGS="$(EXTRA_CFLAGS)" \
		KBUILD_EXTRA_SYMBOLS="$(PPE_SYMVERS) $(SFE_SYMVERS)" \
		SoC="$(ECM_SOC)" \
		$(ECM_MAKE_OPTS) \
		modules
endef

$(eval $(call KernelPackage,qca-nss-ecm))
