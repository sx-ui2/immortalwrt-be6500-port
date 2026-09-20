include $(TOPDIR)/rules.mk

PKG_NAME:=qca-nss-ae-clients
PKG_RELEASE:=1

# QSDK 14.0 r9 PPE clients.  ath12k deliberately no longer allocates WLAN
# virtual ports itself; this notifier must be present before the Wi-Fi netdevs
# are registered so PPE-DS receives a real port number for every AP/STA VIF.
PKG_SOURCE_URL:=https://git.codelinaro.org/clo/qsdk/oss/lklm/nss-ae-clients.git
PKG_SOURCE_PROTO:=git
PKG_SOURCE_DATE:=2026-08-06
PKG_SOURCE_VERSION:=37cc0db5569bf7c8e30dfe97895c09a25b421bcb
PKG_MIRROR_HASH:=skip

PKG_BUILD_PARALLEL:=1
PKG_FLAGS:=nonshared
PKG_BUILD_DEPENDS:=qca-nss-ppe qca-ssdk

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define KernelPackage/qca-nss-ppe-ath-clients
  SECTION:=kernel
  CATEGORY:=Kernel modules
  SUBMENU:=Network Devices
  TITLE:=Qualcomm NSS PPE ath clients
  DEPENDS:=@TARGET_qualcommax +kmod-qca-nss-ppe-vp
  FILES:=$(PKG_BUILD_DIR)/clients/ath_client/qca-nss-ppe-ath-clients.ko
  # Numeric module entries are loaded before the unnumbered ath12k entry.
  # Register the netdevice notifier after VP but before ath12k creates VIFs.
  AUTOLOAD:=$(call AutoLoad,52,qca-nss-ppe-ath-clients,1)
endef

define KernelPackage/qca-nss-ppe-ath-clients/Description
  Allocates and releases NSS PPE virtual ports for mac80211 netdevices.
endef

define KernelPackage/qca-nss-ppe-bridge-mgr
  SECTION:=kernel
  CATEGORY:=Kernel modules
  SUBMENU:=Network Devices
  TITLE:=Qualcomm NSS PPE bridge manager
  DEPENDS:=@TARGET_qualcommax +kmod-qca-nss-ppe +kmod-qca-nss-ppe-vlan-mgr
  FILES:=$(PKG_BUILD_DIR)/clients/bridge/qca-nss-ppe-bridge-mgr.ko
  # Register before netifd creates br-lan so the PPE logical interface and
  # bridge membership are present before ECM sees the first routed flow.
  AUTOLOAD:=$(call AutoLoad,41,qca-nss-ppe-bridge-mgr,1)
endef

define KernelPackage/qca-nss-ppe-bridge-mgr/Description
  Tracks Linux bridge devices and membership in the Qualcomm PPE.
endef

define KernelPackage/qca-nss-ppe-vlan-mgr
  SECTION:=kernel
  CATEGORY:=Kernel modules
  SUBMENU:=Network Devices
  TITLE:=Qualcomm NSS PPE VLAN manager
  DEPENDS:=@TARGET_qualcommax +kmod-qca-nss-ppe +kmod-qca-nss-ppe-vp
  FILES:=$(PKG_BUILD_DIR)/clients/vlan/qca-nss-ppe-vlan.ko
  AUTOLOAD:=$(call AutoLoad,40,qca-nss-ppe-vlan,1)
endef

define KernelPackage/qca-nss-ppe-vlan-mgr/Description
  Creates PPE logical interfaces for Linux 802.1Q VLAN devices.
endef

define KernelPackage/qca-nss-ppe-pppoe-mgr
  SECTION:=kernel
  CATEGORY:=Kernel modules
  SUBMENU:=Network Devices
  TITLE:=Qualcomm NSS PPE PPPoE manager
  DEPENDS:=@TARGET_qualcommax +kmod-qca-nss-ppe +kmod-pppoe
  FILES:=$(PKG_BUILD_DIR)/clients/pppoe/qca-nss-ppe-pppoe-mgr.ko
  AUTOLOAD:=$(call AutoLoad,42,qca-nss-ppe-pppoe-mgr,1)
endef

define KernelPackage/qca-nss-ppe-pppoe-mgr/Description
  Tracks PPPoE sessions and creates their Qualcomm PPE interfaces.
endef

PPE_SYMVERS:=$(STAGING_DIR)/usr/share/qca-nss-ppe/qca-nss-ppe.symvers

AE_CLIENT_BUILD_FLAGS:=
ifneq ($(CONFIG_PACKAGE_kmod-qca-nss-ppe-bridge-mgr),)
  AE_CLIENT_BUILD_FLAGS+=bridge-mgr=y
endif
ifneq ($(CONFIG_PACKAGE_kmod-qca-nss-ppe-vlan-mgr),)
  AE_CLIENT_BUILD_FLAGS+=vlan-mgr=y
endif
ifneq ($(CONFIG_PACKAGE_kmod-qca-nss-ppe-pppoe-mgr),)
  AE_CLIENT_BUILD_FLAGS+=pppoe-mgr=y PPPOE_MGR_FE_PPE_ENABLE=y
endif
ifneq ($(CONFIG_PACKAGE_kmod-qca-nss-ppe-ath-clients),)
  AE_CLIENT_BUILD_FLAGS+=ath_clients=y
endif

EXTRA_CFLAGS+= \
	-I$(STAGING_DIR)/usr/include/qca-nss-ppe \
	-I$(STAGING_DIR)/usr/include/qca-ssdk \
	-I$(STAGING_DIR)/usr/include/qca-ssdk/fal \
	-I$(STAGING_DIR)/usr/include/qca-ssdk/init

define Build/Compile
	+$(KERNEL_MAKE) $(PKG_JOBS) \
		-C "$(LINUX_DIR)" \
		M="$(PKG_BUILD_DIR)" \
		ARCH="$(LINUX_KARCH)" \
		CROSS_COMPILE="$(TARGET_CROSS)" \
		EXTRA_CFLAGS="$(EXTRA_CFLAGS)" \
		KBUILD_EXTRA_SYMBOLS="$(PPE_SYMVERS)" \
		SoC="$(CONFIG_TARGET_SUBTARGET)" \
		$(AE_CLIENT_BUILD_FLAGS) \
		modules
endef

$(eval $(call KernelPackage,qca-nss-ppe-ath-clients))
$(eval $(call KernelPackage,qca-nss-ppe-bridge-mgr))
$(eval $(call KernelPackage,qca-nss-ppe-vlan-mgr))
$(eval $(call KernelPackage,qca-nss-ppe-pppoe-mgr))
