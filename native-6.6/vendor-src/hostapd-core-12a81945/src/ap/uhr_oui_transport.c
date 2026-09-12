/*
 * hostapd / IEEE 802.11bn UHR
 *
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause-Clear
 */

#include "utils/includes.h"
#include "utils/common.h"
#include "utils/eloop.h"
#include "l2_packet/l2_packet.h"
#include "crypto/aes.h"
#include "crypto/aes_siv.h"
#include "hostapd.h"
#include "uhr_oui_transport.h"
#include "uhr_iap.h"
#include "uhr_utils.h"
#include "ap_config.h"


/**
 * uhr_oui_get_peer - Look up a peer by MAC address (exact match only)
 */
static struct uhr_peer_entry *uhr_oui_get_peer(struct uhr_oui_ctx *ctx,
					       const u8 *mac_addr)
{
	struct uhr_peer_entry *peer;

	if (!ctx || !mac_addr)
		return NULL;

	for (peer = ctx->peers; peer; peer = peer->next) {
		if (os_memcmp(peer->mac_addr, mac_addr, ETH_ALEN) == 0)
			return peer;
	}

	return NULL;
}


/**
 * uhr_oui_get_wildcard_peer - Find wildcard peer entry (all-zero MAC)
 *
 * A wildcard entry has mac_addr == 00:00:00:00:00:00 and supplies the
 * shared key for peers not yet individually registered.  On first contact
 * the wildcard is cloned into a concrete entry keyed by the peer's MLD addr.
 */
static struct uhr_peer_entry *uhr_oui_get_wildcard_peer(struct uhr_oui_ctx *ctx)
{
	struct uhr_peer_entry *peer;

	if (!ctx)
		return NULL;

	for (peer = ctx->peers; peer; peer = peer->next) {
		if (is_zero_ether_addr(peer->mac_addr))
			return peer;
	}

	return NULL;
}

/**
 * uhr_oui_add_peer - Add peer to configured list
 */
int uhr_oui_add_peer(struct uhr_oui_ctx *ctx, const u8 *mac_addr,
		     const u8 *key, bool has_key)
{
	struct uhr_peer_entry *peer;

	if (!ctx || !mac_addr)
		return -1;

	if (uhr_oui_get_peer(ctx, mac_addr)) {
		wpa_printf(MSG_DEBUG, "SMD OUI: Peer " MACSTR " already exists",
			   MAC2STR(mac_addr));
		return 0;
	}
	if (ctx->peer_count >= UHR_MAX_PEERS) {
		wpa_printf(MSG_WARNING,
			   "SMD OUI: Peer list full (%d), not adding " MACSTR,
			   UHR_MAX_PEERS, MAC2STR(mac_addr));
		return -1;
	}

	peer = os_zalloc(sizeof(*peer));
	if (!peer) {
		wpa_printf(MSG_ERROR, "SMD OUI: Failed to allocate peer entry");
		return -1;
	}

	os_memcpy(peer->mac_addr, mac_addr, ETH_ALEN);
	if (has_key && key) {
		os_memcpy(peer->key, key, sizeof(peer->key));
		peer->has_key = true;
	}
	peer->next = ctx->peers;
	ctx->peers = peer;
	ctx->peer_count++;

	wpa_printf(MSG_DEBUG, "SMD OUI: Added peer " MACSTR " (%s)",
		   MAC2STR(mac_addr), peer->has_key ? "encrypted" : "plain");
	return 0;
}


/**
 * uhr_oui_clone_peer - Register new_mac with the key from existing_mac
 *
 * Called from uhr_iap_rx to register the MLD address carried in the IAP
 * frame body.  Falls back to the wildcard entry when existing_mac has no
 * exact entry (first-contact via wildcard path).
 */
int uhr_oui_clone_peer(struct uhr_oui_ctx *ctx,
		       const u8 *existing_mac, const u8 *new_mac)
{
	struct uhr_peer_entry *existing;

	if (!ctx || !existing_mac || !new_mac)
		return -1;

	if (uhr_oui_get_peer(ctx, new_mac)) {
		wpa_printf(MSG_DEBUG,
			   "SMD OUI: " MACSTR " already in smd_partner list, skipping clone",
			   MAC2STR(new_mac));
		return 0;
	}

	existing = uhr_oui_get_peer(ctx, existing_mac);
	if (!existing) {
		existing = uhr_oui_get_wildcard_peer(ctx);
		if (existing)
			wpa_printf(MSG_INFO,
				   "SMD OUI: Adding " MACSTR " to smd_partner list (promoted via wildcard key)",
				   MAC2STR(new_mac));
	}
	if (!existing) {
		wpa_printf(MSG_WARNING,
			   "SMD OUI: No key source for MLD addr " MACSTR " — no exact peer and no wildcard",
			   MAC2STR(new_mac));
		return -1;
	}

	return uhr_oui_add_peer(ctx, new_mac, existing->key, existing->has_key);
}


/**
 * uhr_oui_rx_callback - Receive callback for ETH_P_OUI frames
 * @ctx: OUI context
 * @src_addr: Source MAC address
 * @buf: Received frame buffer
 * @len: Frame length
 *
 * Called by L2 packet layer when ETH_P_OUI frame is received.
 * Validates OUI header, optionally decrypts, and dispatches to IAP handler.
 */
static void uhr_oui_rx_callback(void *ctx, const u8 *src_addr,
				const u8 *buf, size_t len)
{
	struct uhr_oui_ctx *oui_ctx = ctx;
	struct uhr_peer_entry *peer;
	struct uhr_peer_entry *wildcard_peer = NULL;
	u8 oui_suffix;
	u8 dst_addr[ETH_ALEN] = {0};
	const u8 *iap_data;
	size_t iap_len;
	u8 *plain = NULL;


	wpa_printf(MSG_DEBUG,
		   "SMD OUI: Received frame from " MACSTR " (len=%zu)",
		   MAC2STR(src_addr), len);

	/* Validate minimum length (OUI header = 4 bytes) */
	if (len < 4) {
		wpa_printf(MSG_DEBUG, "SMD OUI: Frame too short (%zu < 4)",
			   len);
		return;
	}

	wpa_hexdump(MSG_DEBUG, "SMD OUI: Received UHR OUI frame", buf, len);

	oui_suffix = *(buf + sizeof(struct l2_ethhdr) + 5);

	/* Validate suffix */
	if (oui_suffix != UHR_IAP_SUFFIX_REQUEST &&
	    oui_suffix != UHR_IAP_SUFFIX_RESPONSE) {
		wpa_printf(MSG_DEBUG, "SMD OUI: Invalid suffix 0x%02x",
			   oui_suffix);
		return;
	}

	wpa_printf(MSG_DEBUG, "SMD OUI: Valid frame (suffix=0x%02x)",
		   oui_suffix);

	os_memcpy(dst_addr, buf, ETH_ALEN);

	iap_data = buf + sizeof(struct l2_ethhdr) + 6;
	iap_len  = len - sizeof(struct l2_ethhdr) - 6;

	peer = uhr_oui_get_peer(oui_ctx, src_addr);
	if (!peer) {
		/* No exact match — try wildcard (all-zero MAC).  The wildcard
		 * supplies the shared key; src_addr is promoted to a concrete
		 * entry by uhr_iap_rx once the MLD addr is known from the body. */
		wildcard_peer = uhr_oui_get_wildcard_peer(oui_ctx);
		if (wildcard_peer) {
			wpa_printf(MSG_INFO,
				   "SMD OUI: No exact peer for " MACSTR " — decrypting with wildcard key",
				   MAC2STR(src_addr));
			peer = wildcard_peer;
		}
	}
	if (peer && peer->has_key) {
		/* AES-SIV-256 decrypt: AD = [src_addr, oui_suffix] */
		const u8 *ad[2] = { src_addr, &oui_suffix };
		size_t ad_len[2] = { ETH_ALEN, 1 };
		size_t plain_len;

		if (iap_len < AES_BLOCK_SIZE) {
			wpa_printf(MSG_DEBUG,
				   "SMD OUI: Encrypted frame too short (%zu)",
				   iap_len);
			return;
		}

		plain_len = iap_len - AES_BLOCK_SIZE;
		plain = os_malloc(plain_len);
		if (!plain) {
			wpa_printf(MSG_ERROR, "SMD OUI: OOM allocating decrypt buffer");
			return;
		}

		if (aes_siv_decrypt(peer->key, sizeof(peer->key),
				    iap_data, iap_len, 2, ad, ad_len,
				    plain) < 0) {
			wpa_printf(MSG_DEBUG,
				   "SMD OUI: AES-SIV decrypt failed from " MACSTR,
				   MAC2STR(src_addr));
			os_free(plain);
			return;
		}

		if (wildcard_peer)
			wpa_printf(MSG_INFO,
				   "SMD OUI: Wildcard decryption succeeded for " MACSTR " — MLD addr will be promoted",
				   MAC2STR(src_addr));

		uhr_iap_rx(oui_ctx->hapd, src_addr, dst_addr, plain, plain_len);
		os_free(plain);
	} else {
		uhr_iap_rx(oui_ctx->hapd, src_addr, dst_addr, iap_data, iap_len);
	}
}


/**
 * uhr_oui_init - Initialize UHR OUI transport
 */
struct uhr_oui_ctx *uhr_oui_init(struct hostapd_data *hapd)
{
	struct uhr_oui_ctx *ctx;

	wpa_printf(MSG_DEBUG,
		   "SMD OUI: Initializing native ETH_P_OUI transport");

	ctx = os_zalloc(sizeof(*ctx));
	if (!ctx) {
		wpa_printf(MSG_ERROR, "SMD OUI: Failed to allocate context");
		return NULL;
	}

	ctx->hapd = hapd;

	os_memcpy(ctx->own_addr, hapd->mld->mld_addr, ETH_ALEN);
	ctx->iap_transaction_id = 0;
	ctx->iap_sequence_number = 0;
	ctx->peers = NULL;
	
	/* Create L2 packet socket for ETH_P_OUI */
	wpa_printf(MSG_INFO, "SMD OUI: Bridge is currently %s", hapd->conf->bridge);
	ctx->l2 = l2_packet_init(hapd->conf->bridge, NULL, ETH_P_OUI,
				 uhr_oui_rx_callback, ctx, 1);
	if (!ctx->l2) {
		wpa_printf(MSG_ERROR,
			   "SMD OUI: Failed to create L2 socket for interface %s",
			   hapd->conf->bridge);
		os_free(ctx);
		return NULL;
	}

	wpa_printf(MSG_INFO,
		   "SMD OUI: Initialized on interface %s (MAC " MACSTR ")",
		   hapd->conf->bridge, MAC2STR(ctx->own_addr));

	return ctx;
}


/**
 * uhr_oui_deinit - Cleanup UHR OUI transport
 */
void uhr_oui_deinit(struct uhr_oui_ctx *ctx)
{
	struct uhr_peer_entry *peer, *next;

	if (!ctx)
		return;

	wpa_printf(MSG_DEBUG, "SMD OUI: Deinitializing transport");

	if (ctx->l2) {
		l2_packet_deinit(ctx->l2);
		ctx->l2 = NULL;
	}

	/* Free peer list */
	peer = ctx->peers;
	while (peer) {
		next = peer->next;
		os_free(peer);
		peer = next;
	}

	os_free(ctx);
}


/**
 * uhr_oui_peer_exists - Check if peer is reachable (exact match or wildcard)
 */
int uhr_oui_peer_exists(struct uhr_oui_ctx *ctx, const u8 *mac_addr)
{
	return uhr_oui_get_peer(ctx, mac_addr) != NULL ||
		uhr_oui_get_wildcard_peer(ctx) != NULL;
}

/**
 * uhr_oui_send - Send SMD IAP frame via ETH_P_OUI
 */
static const u8 global_oui_smd[] = { 0x00, 0x13, 0x74, 0x00, 0x02};
int uhr_oui_send(struct uhr_oui_ctx *ctx, const u8 *dst_addr, const u8 *src_addr, u8 oui_suffix,
		 const u8 *data, size_t data_len)
{
	struct uhr_peer_entry *peer;
	u8 *payload = NULL;
	size_t payload_len;
	u8 *packet, *p;
	size_t packet_len;
	int ret;
	struct l2_ethhdr *ethhdr;

	peer = uhr_oui_get_peer(ctx, dst_addr);
	if (!peer) {
		peer = uhr_oui_get_wildcard_peer(ctx);
		if (peer)
			wpa_printf(MSG_DEBUG,
				   "SMD OUI: No exact peer for " MACSTR " — sending with wildcard key",
				   MAC2STR(dst_addr));
	}

	if (peer && peer->has_key) {
		/* AES-SIV-256: AD = [src_addr, oui_suffix] */
		const u8 *ad[2] = { src_addr, &oui_suffix };
		size_t ad_len[2] = { ETH_ALEN, 1 };

		payload_len = data_len + AES_BLOCK_SIZE;
		payload = os_malloc(payload_len);
		if (!payload) {
			wpa_printf(MSG_ERROR, "SMD OUI: OOM allocating encrypt buffer");
			return -1;
		}

		if (aes_siv_encrypt(peer->key, sizeof(peer->key),
				    data, data_len, 2, ad, ad_len,
				    payload) < 0) {
			wpa_printf(MSG_ERROR,
				   "SMD OUI: AES-SIV encrypt failed for " MACSTR,
				   MAC2STR(dst_addr));
			os_free(payload);
			return -1;
		}
	} else {
		payload = (u8 *) data;
		payload_len = data_len;
	}

	packet_len = sizeof(*ethhdr) + sizeof(global_oui_smd) + 1 + payload_len;
	packet = os_zalloc(packet_len);
	if (!packet) {
		wpa_printf(MSG_ERROR, "SMD OUI: OOM allocating packet buffer");
		if (peer && peer->has_key)
			os_free(payload);
		return -1;
	}
	p = packet;

	ethhdr = (struct l2_ethhdr *) packet;
	os_memcpy(ethhdr->h_source, src_addr, ETH_ALEN);
	os_memcpy(ethhdr->h_dest, dst_addr, ETH_ALEN);
	ethhdr->h_proto = host_to_be16(ETH_P_OUI);
	p += sizeof(*ethhdr);

	os_memcpy(p, global_oui_smd, sizeof(global_oui_smd));
	p[sizeof(global_oui_smd)] = oui_suffix;
	p += sizeof(global_oui_smd) + 1;

	os_memcpy(p, payload, payload_len);

	ret = l2_packet_send(ctx->l2, NULL, 0, packet, packet_len);
	os_free(packet);
	if (peer && peer->has_key)
		os_free(payload);
	return ret;
}


/**
 * uhr_load_partners - Load configured SMD partner APs
 * @hapd: hostapd data
 * Returns: Number of partners loaded, or -1 on error
 *
 * Loads SMD partner APs from configuration into OUI transport context.
 * Called during hostapd initialization after OUI transport is created.
 */
int uhr_load_partners(struct hostapd_data *hapd)
{
	struct smd_partner_entry *partner;
	int count = 0;

	if (!hapd->conf->smd_partners) {
		wpa_printf(MSG_WARNING, "SMD: No partners configured");
		return 0;
	}

       for (partner = hapd->conf->smd_partners; partner; partner = partner->next) {
               if (uhr_oui_add_peer(hapd->uhr_oui_ctx, partner->mac_addr,
                                    partner->key, partner->has_key) < 0) {
                       wpa_printf(MSG_ERROR,
                                  "SMD: Failed to add partner " MACSTR,
                                  MAC2STR(partner->mac_addr));
                       continue;
               }
               count++;
       }

	wpa_printf(MSG_INFO, "SMD: Loaded %d partner(s)", count);
	return count;
}
