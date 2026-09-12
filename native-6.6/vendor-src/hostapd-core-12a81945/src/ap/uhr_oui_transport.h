/*
 * hostapd / IEEE 802.11bn UHR
 *
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause-Clear
 */

#ifndef UHR_OUI_TRANSPORT_H
#define UHR_OUI_TRANSPORT_H

/* Forward declarations */
struct hostapd_data;
struct uhr_oui_ctx;

/* SMD IAP OUI - Locally Administered */
#define UHR_IAP_OUI_0  0x02
#define UHR_IAP_OUI_1  0x00
#define UHR_IAP_OUI_2  0x00

/* SMD IAP OUI Suffixes */
#define UHR_IAP_SUFFIX_REQUEST   0x06
#define UHR_IAP_SUFFIX_RESPONSE  0x07

/* ETH_P_OUI value */
#ifndef ETH_P_OUI
#define ETH_P_OUI 0x88B7
#endif

/* Maximum number of peers */
#define UHR_MAX_PEERS 16

/**
 * struct uhr_peer_entry - Peer AP entry
 */
struct uhr_peer_entry {
	u8 mac_addr[ETH_ALEN];
	u8 key[32];    /* AES-SIV-256 key; valid only when has_key is true */
	bool has_key;
	struct uhr_peer_entry *next;
};

/**
 * struct uhr_oui_ctx - UHR OUI transport context
 * @hapd: hostapd data
 * @l2: L2 packet socket for ETH_P_OUI
 * @own_addr: Own MAC address
 * @iap_transaction_id: Per-context transaction ID counter (FIX: race condition)
 * @iap_sequence_number: Per-context sequence number (FIX: race condition)
 * @peers: List of configured peer APs
 */
struct uhr_oui_ctx {
	struct hostapd_data *hapd;
	struct l2_packet_data *l2;
	u8 own_addr[ETH_ALEN];
	u8 iap_transaction_id;
	u64 iap_sequence_number;
	struct uhr_peer_entry *peers;
	int peer_count;
};


/**
 * uhr_oui_init - Initialize UHR OUI transport
 * @hapd: hostapd data
 * Returns: OUI context or NULL on failure
 *
 * Creates ETH_P_OUI socket and registers receive callback.
 * No FT configuration required.
 */
struct uhr_oui_ctx *uhr_oui_init(struct hostapd_data *hapd);

/**
 * uhr_oui_deinit - Cleanup UHR OUI transport
 * @ctx: OUI context
 *
 * Closes socket and frees resources.
 */
void uhr_oui_deinit(struct uhr_oui_ctx *ctx);

/**
 * uhr_oui_send - Send SMD IAP frame via ETH_P_OUI
 * @ctx: OUI context
 * @dst_addr: Destination AP MAC address
 * @oui_suffix: OUI suffix (0x06 or 0x07)
 * @data: IAP frame data
 * @data_len: IAP frame length
 * Returns: 0 on success, -1 on error
 */
int uhr_oui_send(struct uhr_oui_ctx *ctx, const u8 *dst_addr, const u8 *src_addr, u8 oui_suffix,
		 const u8 *data, size_t data_len);

/**
 * uhr_oui_peer_exists - Check if peer is reachable (exact match or wildcard IAP)
 * @ctx: OUI context
 * @mac_addr: Peer MAC address to check
 * Returns: 1 if peer exists (exact or wildcard), 0 otherwise
 */
int uhr_oui_peer_exists(struct uhr_oui_ctx *ctx, const u8 *mac_addr);

/**
 * uhr_oui_add_peer - Add peer to configured list
 * @ctx: OUI context
 * @mac_addr: Peer MAC address to add  (00:00:00:00:00:00 = wildcard)
 * @key: 32-byte AES-SIV key, or NULL for no encryption
 * @has_key: true if key is valid
 * Returns: 0 on success, -1 on error
 */
int uhr_oui_add_peer(struct uhr_oui_ctx *ctx, const u8 *mac_addr,
		     const u8 *key, bool has_key);

/**
 * uhr_oui_clone_peer - Register new_mac with the key from existing_mac
 * @ctx: OUI context
 * @existing_mac: Peer whose key to copy (falls back to wildcard if not found)
 * @new_mac: New MLD address to register
 * Returns: 0 on success, -1 on error
 *
 * Called from uhr_iap_rx to register the MLD address carried in the IAP
 * frame body.  The peer list is keyed by MLD address only; link addresses
 * are never stored.
 */
int uhr_oui_clone_peer(struct uhr_oui_ctx *ctx,
		       const u8 *existing_mac, const u8 *new_mac);

/**
 * uhr_load_partners - Load configured SMD partner APs
 * @hapd: hostapd data
 * Returns: Number of partners loaded, or -1 on error
 *
 * Loads SMD partner APs from configuration into OUI transport context.
 */
int uhr_load_partners(struct hostapd_data *hapd);

#endif /* UHR_OUI_TRANSPORT_H */
