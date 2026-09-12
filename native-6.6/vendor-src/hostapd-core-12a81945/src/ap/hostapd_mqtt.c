/*
 * hostapd_mqtt.c - hostapd-specific MQTT command/event handling
 *
 * Implements the message and connection-state callbacks registered with
 * mqtt_eloop, the per-feature command dispatchers, and the global MQTT
 * connection lifecycle.  See hostapd_mqtt.h for the module boundary
 * rationale.
 *
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "utils/includes.h"

#include "utils/common.h"
#include "utils/mqtt_eloop.h"
#include "utils/mqtt_feature_map.h"
#include "hostapd.h"
#include "hostapd_mqtt.h"
#include "hostapd_if/hostapd_if.h"
#include "hostapd_if/hostapd_if_mqtt.h"

/*
 * hostapd_mqtt_handle_sys_ping - respond to CMD_ID_SYS_PING.
 *
 * System-wide ping — no BSS context needed.  Counts all BSSes across all
 * interfaces and replies with EVT_ID_SYS_HOSTAPD_STARTED on
 * hostapd/transmit/SYS.
 */
static void
hostapd_mqtt_handle_sys_ping(struct hapd_interfaces *interfaces)
{
	struct mqtt_tlv_message *resp;
	char    topic[64];
	uint8_t buf[256];
	uint16_t num_ifaces = 0;
	size_t  i;
	int     len;

	for (i = 0; i < interfaces->count; i++)
		num_ifaces += (uint16_t)interfaces->iface[i]->num_bss;

	wpa_printf(MSG_DEBUG,
		   "MQTT CMD: handling CMD_ID_SYS_PING, num_ifaces=%u",
		   num_ifaces);

	resp = mqtt_tlv_message_alloc(EVT_ID_SYS_HOSTAPD_STARTED);
	if (!resp) {
		wpa_printf(MSG_ERROR, "MQTT CMD: alloc failed for ping response");
		return;
	}

	mqtt_tlv_add_string(resp, TLV_SYS_HOSTAPD_STARTED_VERSION, "hostapd-2.10");
	mqtt_tlv_add_u16(resp, TLV_SYS_HOSTAPD_STARTED_NUM_IFACES, num_ifaces);

	mqtt_build_transmit_topic(MQTT_FEATURE_SYS, topic, sizeof(topic));
	len = mqtt_tlv_serialize(resp, buf, sizeof(buf));
	if (len > 0) {
		wpa_printf(MSG_INFO,
			   "MQTT CMD: ping response %d bytes -> topic='%s'",
			   len, topic);
		mqtt_eloop_publish(interfaces->mqtt_ctx, topic, buf, len, 0, false);
	} else {
		wpa_printf(MSG_WARNING,
			   "MQTT CMD: ping response serialization failed");
	}
	mqtt_tlv_message_free(resp);
}

/*
 * Per-feature CMD dispatchers.
 *
 * Each feature owns its own switch statement.  The main callback
 * (hostapd_mqtt_msg_cb) routes by MQTT_MSG_FEATURE(msg_type) and calls the
 * appropriate dispatcher.  Adding a new feature requires:
 *   1. A new static dispatcher function here.
 *   2. A new case in hostapd_mqtt_msg_cb().
 */

static void
hostapd_mqtt_sys_cmd(struct hapd_interfaces *interfaces,
		     uint16_t msg_type,
		     struct mqtt_tlv_message *msg)
{
	(void)msg; /* CMD_ID_SYS_PING carries no payload TLVs */
	switch (msg_type) {
	case CMD_ID_SYS_PING:
		hostapd_mqtt_handle_sys_ping(interfaces);
		break;
	default:
		wpa_printf(MSG_DEBUG,
			   "MQTT SYS: unhandled msg_type=0x%04x", msg_type);
		break;
	}
}

/*
 * hostapd_mqtt_msg_cb - incoming MQTT message dispatcher.
 *
 * Registered with mqtt_eloop_init() as the message callback.  Receives
 * hapd_interfaces as userdata and routes by MQTT_MSG_FEATURE(msg_type) to
 * the appropriate per-feature dispatcher.
 *
 * The interface/BSS context is NOT resolved here.  CMD_ID_SYS_PING is
 * system-wide and needs no BSS.  A future command that targets a specific
 * BSS should resolve it from an interface-name TLV carried in the message,
 * inside that command's own handler.
 */
static void
hostapd_mqtt_msg_cb(const char *topic, const void *payload, int payloadlen,
		    void *userdata)
{
	struct hapd_interfaces  *interfaces = userdata;
	struct mqtt_tlv_message *msg;
	const char              *feature;
	uint16_t                 msg_type;

	if (!payload || payloadlen < 6) {
		wpa_printf(MSG_WARNING,
			   "MQTT RX: payload too short (%d B), discarding",
			   payloadlen);
		return;
	}

	feature = mqtt_feature_from_topic(topic);
	if (!feature) {
		wpa_printf(MSG_WARNING,
			   "MQTT RX: unrecognised topic '%s', discarding", topic);
		return;
	}

	msg = mqtt_tlv_deserialize((const uint8_t *)payload, (size_t)payloadlen);
	if (!msg) {
		wpa_printf(MSG_WARNING,
			   "MQTT RX: TLV deserialization failed for topic '%s'",
			   topic);
		return;
	}

	msg_type = mqtt_tlv_msg_type(msg);

	wpa_printf(MSG_DEBUG, "MQTT RX: msg_type=0x%04x feature=%s",
		   msg_type, feature);

	if (mqtt_feature_validate_cmd(feature, msg_type) < 0) {
		wpa_printf(MSG_WARNING,
			   "MQTT RX: msg_type=0x%04x not valid for feature=%s, "
			   "discarding", msg_type, feature);
		goto done;
	}

	if (mqtt_msg_validate_if_policy(msg_type, msg) < 0) {
		wpa_printf(MSG_WARNING,
			   "MQTT RX: msg_type=0x%04x failed policy validation",
			   msg_type);
		goto done;
	}

	/* Route to the per-feature handler by feature nibble */
	switch (MQTT_MSG_FEATURE(msg_type)) {
	case MQTT_FEAT_SYS:
		hostapd_mqtt_sys_cmd(interfaces, msg_type, msg);
		break;
	case MQTT_FEAT_HOSTAPD_IF:
		hostapd_mqtt_hif_cmd(interfaces, msg_type, msg);
		break;
	default:
		wpa_printf(MSG_DEBUG,
			   "MQTT RX: no handler for feature %u msg_type=0x%04x",
			   MQTT_MSG_FEATURE(msg_type), msg_type);
		break;
	}

done:
	mqtt_tlv_message_free(msg);
}

/*
 * hostapd_mqtt_state_cb - MQTT connection state change notification.
 *
 * On connect, publishes EVT_ID_SYS_HOSTAPD_STARTED so any already-subscribed
 * clients immediately know the daemon is live.
 *
 * userdata is hapd_interfaces (the global process context), matching what
 * was passed to mqtt_eloop_init().
 */
static void
hostapd_mqtt_state_cb(bool connected, void *userdata)
{
	struct hapd_interfaces  *interfaces = userdata;
	struct mqtt_tlv_message *msg;
	char    topic[64];
	uint8_t buf[256];
	uint16_t num_ifaces = 0;
	size_t  i, j;
	int     len;

	if (connected) {
		for (i = 0; i < interfaces->count; i++)
			num_ifaces += (uint16_t)interfaces->iface[i]->num_bss;

		wpa_printf(MSG_INFO,
			   "MQTT: connected to broker, publishing STARTED event "
			   "(num_ifaces=%u)", num_ifaces);

		msg = mqtt_tlv_message_alloc(EVT_ID_SYS_HOSTAPD_STARTED);
		if (!msg)
			return;

		mqtt_tlv_add_string(msg, TLV_SYS_HOSTAPD_STARTED_VERSION,
				    "hostapd-2.10");
		mqtt_tlv_add_u16(msg, TLV_SYS_HOSTAPD_STARTED_NUM_IFACES,
				 num_ifaces);

		mqtt_build_transmit_topic(MQTT_FEATURE_SYS, topic, sizeof(topic));
		len = mqtt_tlv_serialize(msg, buf, sizeof(buf));
		if (len > 0) {
			wpa_printf(MSG_DEBUG,
				   "MQTT: publishing EVT_ID_SYS_HOSTAPD_STARTED "
				   "(%d bytes) on '%s'", len, topic);
			mqtt_eloop_publish(interfaces->mqtt_ctx, topic, buf,
					   len, 0, false);
		}
		mqtt_tlv_message_free(msg);

		for (i = 0; i < interfaces->count; i++) {
			struct hostapd_iface *iface;

			iface = interfaces->iface[i];
			if (!iface)
				continue;

			for (j = 0; j < iface->num_bss; j++) {
				if (!iface->bss[j])
					continue;
				hostapd_if_interface_create(iface->bss[j]);
			}
		}
	} else {
		wpa_printf(MSG_WARNING, "MQTT: disconnected from broker");
	}
}

void hostapd_mqtt_init(struct hostapd_iface *iface)
{
	char client_id[64];
	const char *host;
	int port;

	if (!iface->conf->mqtt_enabled || iface->interfaces->mqtt_ctx)
		return;

	host = iface->conf->mqtt_broker_host ?
	       iface->conf->mqtt_broker_host : "localhost";
	port = iface->conf->mqtt_broker_port ?
	       iface->conf->mqtt_broker_port : 1883;

	os_snprintf(client_id, sizeof(client_id), "hostapd-%d", getpid());

	iface->interfaces->mqtt_ctx = mqtt_eloop_init(
		host, port, client_id, 60,
		hostapd_mqtt_msg_cb,
		hostapd_mqtt_state_cb,
		iface->interfaces);   /* global userdata, not per-BSS */

	if (!iface->interfaces->mqtt_ctx) {
		wpa_printf(MSG_ERROR,
			   "MQTT: mqtt_eloop_init failed (broker=%s:%d)",
			   host, port);
		return;
	}

	mqtt_eloop_subscribe(iface->interfaces->mqtt_ctx,
			     MQTT_TOPIC_RECEIVE "/#", 1);
	mqtt_eloop_connect(iface->interfaces->mqtt_ctx);
	wpa_printf(MSG_INFO, "MQTT: global context initialised (broker=%s:%d)",
		   host, port);
}

void hostapd_mqtt_deinit(struct hapd_interfaces *interfaces)
{
	if (!interfaces->mqtt_ctx)
		return;
	mqtt_eloop_deinit(interfaces->mqtt_ctx);
	interfaces->mqtt_ctx = NULL;
}
