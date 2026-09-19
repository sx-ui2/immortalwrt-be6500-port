include $(TOPDIR)/rules.mk

PKG_NAME:=be6500-yq
PKG_VERSION:=4.45.1
PKG_RELEASE:=1

PKG_SOURCE:=yq-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/mikefarah/yq/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=074a21a002c32a1db3850064ad1fc420083d037951c8102adecfea6c5fd96427
PKG_BUILD_DIR:=$(BUILD_DIR)/yq-$(PKG_VERSION)

PKG_MAINTAINER:=BE6500 firmware maintainers
PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

GO_PKG:=github.com/mikefarah/yq/v4
GO_PKG_LDFLAGS_X:=$(GO_PKG)/cmd.Version=$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

# The stock Go host bootstrap in this tree only supports linux/amd64.  Keep a
# pinned and checksum-verified native toolchain for the linux/arm64 BE6500
# builder; the resulting yq binary is still cross-compiled for the target.
BE6500_HOST_GO_VERSION:=1.26.1
BE6500_HOST_GO_SHA256:=a290581cfe4fe28ddd737dde3095f3dbeb7f2e4065cab4eae44dfc53b760c2f7
BE6500_HOST_GO_ARCHIVE:=$(DL_DIR)/go$(BE6500_HOST_GO_VERSION).linux-arm64.tar.gz
BE6500_HOST_GO_ROOT:=$(DL_DIR)/host-go-$(BE6500_HOST_GO_VERSION)-linux-arm64

ifeq ($(GO_HOST_OS_ARCH),linux_arm64)
PKG_BUILD_DEPENDS:=
endif

define Package/be6500-yq
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Portable command-line YAML processor for the BE6500 image
  URL:=https://mikefarah.gitbook.io/yq/
  DEPENDS:=$(GO_ARCH_DEPENDS)
  PROVIDES:=yq
  CONFLICTS:=yq
endef

define Package/be6500-yq/description
  A reproducible yq build used by Nikki on the BE6500 firmware.
endef

define Build/Prepare
	$(Build/Prepare/Default)
ifeq ($(GO_HOST_OS_ARCH),linux_arm64)
	[ -x "$(BE6500_HOST_GO_ROOT)/bin/go" ] || { \
		$(RM) -rf "$(BE6500_HOST_GO_ROOT)"; \
		curl -fL --retry 3 -o "$(BE6500_HOST_GO_ARCHIVE)" \
			"https://dl.google.com/go/go$(BE6500_HOST_GO_VERSION).linux-arm64.tar.gz"; \
		echo "$(BE6500_HOST_GO_SHA256)  $(BE6500_HOST_GO_ARCHIVE)" | sha256sum -c -; \
		mkdir -p "$(BE6500_HOST_GO_ROOT)"; \
		tar -C "$(BE6500_HOST_GO_ROOT)" --strip-components=1 -xzf "$(BE6500_HOST_GO_ARCHIVE)"; \
	}
endif
endef

ifeq ($(GO_HOST_OS_ARCH),linux_arm64)
define Build/Compile
	PATH="$(BE6500_HOST_GO_ROOT)/bin:$$$$PATH" $(call GoPackage/Build/Compile)
endef
endif

$(eval $(call GoBinPackage,be6500-yq))
$(eval $(call BuildPackage,be6500-yq))
