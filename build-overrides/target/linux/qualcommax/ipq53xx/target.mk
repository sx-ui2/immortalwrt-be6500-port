BOARDNAME:=Qualcomm IPQ53xx WiSoC
CPU_TYPE:=cortex-a53

# Packages for the persistent base are declared by its device profile.  In
# particular, OEM radio firmware is copied in later as a versioned payload and
# is never allowed to make the first-stage recovery image exceed its HLOS slot.
DEFAULT_PACKAGES +=

define Target/Description
	Build firmware images for Qualcomm IPQ53xx 64-bit systems.
endef
