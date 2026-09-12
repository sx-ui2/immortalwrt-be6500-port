/*
 * mqtt_test.c - Standalone MQTT test client for hostapd MQTT messaging
 *
 * Connects to an MQTT broker, subscribes to all hostapd/transmit/# topics,
 * and provides an interactive command-line interface for testing the MQTT
 * messaging pipeline with hostapd.
 *
 * All message building and parsing uses the mqtt_tlv_map.h API directly,
 * making this file a reference implementation for external applications.
 *
 *
 * -- Build -----------------------------------------------------------------------
 *
 *   gcc -Wall -I../src -DCONFIG_MQTT -o mqtt_test mqtt_test.c -lmosquitto
 *
 *   -I../src  : puts the hostapd src/ tree on the include path so that
 *               #include "utils/mqtt_feature_map.h" resolves.
 *
 *
 * -- Usage -----------------------------------------------------------------------
 *
 *   ./mqtt_test [broker_host [broker_port]]
 *
 * Interactive commands at the '>' prompt:
 *   ping     Send CMD_ID_SYS_PING; hostapd replies EVT_ID_SYS_HOSTAPD_STARTED
 *   stats    Print TX/RX message counters
 *   help     Show this list
 *   quit/q   Disconnect and exit
 *
 *
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include <errno.h>
#include <signal.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/select.h>
#include <sys/time.h>
#include <time.h>
#include <mosquitto.h>

/*
 * The two public headers provide the complete hostapd MQTT interface.
 * mqtt_feature_map.h includes mqtt_tlv_map.h automatically.
 * All message IDs, TLV types, and the full pack/parse API are available
 * after these two lines -- no other hostapd headers are needed.
 */
#define CONFIG_MQTT 1
#include "utils/mqtt_feature_map.h"

/* -- Constants ----------------------------------------------------------------- */

#define BROKER_DEFAULT_HOST  "localhost"
#define BROKER_DEFAULT_PORT  1883
#define BROKER_KEEPALIVE     60

/* -- TLV display helpers ------------------------------------------------------- */

typedef enum { FMT_HEX, FMT_MAC, FMT_U8, FMT_U16, FMT_U32, FMT_STR } tlv_fmt_t;

struct tlv_desc {
	uint16_t    idx;
	const char *name;
	tlv_fmt_t   fmt;
};

/* Descriptor tables keyed by per-message TLV index */
static const struct tlv_desc tlv_global_desc[] = {
	{ (uint16_t)TLV_GLOBAL_MSG_ID, "MSG_ID", FMT_U16 },
	{ 0, NULL, FMT_HEX }
};
static const struct tlv_desc tlv_sys_hostapd_started[] = {
	{ TLV_SYS_HOSTAPD_STARTED_VERSION,    "VERSION",    FMT_STR },
	{ TLV_SYS_HOSTAPD_STARTED_NUM_IFACES, "NUM_IFACES", FMT_U16 },
	{ 0, NULL, FMT_HEX }
};

static const struct tlv_desc *tlv_desc_for_msg(uint16_t msg_id)
{
	switch (msg_id) {
	case EVT_ID_SYS_HOSTAPD_STARTED:
		return tlv_sys_hostapd_started;
	default:
		return NULL;
	}
}

static const struct tlv_desc *find_desc(const struct tlv_desc *tbl, uint16_t idx)
{
	if (!tbl)
		return NULL;
	for (; tbl->name; tbl++) {
		if (tbl->idx == idx)
			return tbl;
	}
	return NULL;
}

static tlv_fmt_t fmt_by_len(uint16_t len)
{
	switch (len) {
	case 1:  return FMT_U8;
	case 2:  return FMT_U16;
	case 4:  return FMT_U32;
	case 6:  return FMT_MAC;
	default: return FMT_HEX;
	}
}

/* msg_id_name - return a printable label for a message ID, or NULL */
static const char *msg_id_name(uint16_t id)
{
	switch (id) {
	/* Commands */
	case CMD_ID_SYS_PING:            return "CMD_SYS_PING";
	/* Events -- SYS */
	case EVT_ID_SYS_HOSTAPD_STARTED: return "EVT_SYS_HOSTAPD_STARTED";
	case EVT_ID_SYS_HOSTAPD_STOPPED: return "EVT_SYS_HOSTAPD_STOPPED";
	default:                          return NULL;
	}
}

/* -- TLV entry printer (recursive) -------------------------------------------- */

static void print_tlv_entry(const struct mqtt_tlv_entry *e,
			     const struct tlv_desc *dtbl,
			     const char *indent, unsigned int *idx_out)
{
	uint16_t bare = MQTT_TLV_DECODE_TYPE(e->type);
	const struct tlv_desc *d;
	const char *name;
	tlv_fmt_t fmt;
	char sub[64];
	unsigned int sub_idx = 0;

	/* Look up name/format: globals first, then per-message */
	d    = MQTT_TLV_IS_GLOBAL(bare) ?
		find_desc(tlv_global_desc, bare) :
		find_desc(dtbl, bare);
	name = d ? d->name : (MQTT_TLV_IS_INNER(bare) ? "INNER" : "TLV");
	fmt  = d ? d->fmt  : fmt_by_len(e->length);

	if (idx_out)
		printf("%s[%u] ", indent, (*idx_out)++);
	else
		printf("%s    ", indent);

	if (MQTT_TLV_IS_CONTAINER(e->type)) {
		struct mqtt_tlv_entry *child;

		printf("Container %-18s (0x%04x)\n", name, bare);
		snprintf(sub, sizeof(sub), "%s  ", indent);
		dl_list_for_each(child, &e->children,
				 struct mqtt_tlv_entry, list)
			print_tlv_entry(child, dtbl, sub, &sub_idx);
		return;
	}

	printf("%-22s (0x%04x) = ", name, bare);

	switch (fmt) {
	case FMT_MAC:
		if (e->length == 6)
			printf("%02x:%02x:%02x:%02x:%02x:%02x\n",
			       e->value[0], e->value[1], e->value[2],
			       e->value[3], e->value[4], e->value[5]);
		else
			printf("<bad len %u>\n", e->length);
		break;
	case FMT_U8:
		if (e->length == 1)
			printf("%u\n", e->value[0]);
		else
			printf("<bad len %u>\n", e->length);
		break;
	case FMT_U16: {
		uint16_t v = 0;

		if (e->length == 2) {
			v = ((uint16_t)e->value[0] << 8) | e->value[1];
			printf("0x%04x (%u)\n", v, v);
		} else {
			printf("<bad len %u>\n", e->length);
		}
		break;
	}
	case FMT_U32: {
		uint32_t v = 0;

		if (e->length == 4) {
			v = ((uint32_t)e->value[0] << 24) |
			    ((uint32_t)e->value[1] << 16) |
			    ((uint32_t)e->value[2] <<  8) |
			    e->value[3];
			printf("%u\n", v);
		} else {
			printf("<bad len %u>\n", e->length);
		}
		break;
	}
	case FMT_STR: {
		size_t n = e->length < 127 ? e->length : 126;
		char tmp[128];

		memcpy(tmp, e->value, n);
		tmp[n] = '\0';
		printf("'%s'\n", tmp);
		break;
	}
	default: {
		uint16_t i;

		printf("0x");
		for (i = 0; i < e->length && i < 16; i++)
			printf("%02x", e->value[i]);
		if (e->length > 16)
			printf("...");
		printf("  (%u B)\n", e->length);
		break;
	}
	}
}

/* -- Message display ----------------------------------------------------------- */

static void display_message(const char *topic,
			     const struct mqtt_tlv_message *msg, int raw_len)
{
	struct mqtt_tlv_entry *e;
	uint16_t msg_type = mqtt_tlv_msg_type(msg);
	const struct tlv_desc *dtbl = tlv_desc_for_msg(msg_type);
	const char *id_name = msg_id_name(msg_type);
	char id_str[32];
	time_t now = time(NULL);
	struct tm *tm_inf = localtime(&now);
	char ts[16];
	unsigned int idx = 0;

	strftime(ts, sizeof(ts), "%H:%M:%S", tm_inf);

	if (id_name)
		snprintf(id_str, sizeof(id_str), "%s", id_name);
	else
		snprintf(id_str, sizeof(id_str), "0x%04x", msg_type);

	printf("\n[%s] RX  topic='%s'\n", ts, topic);
	printf("     msg_type=%-22s  payload=%d bytes\n", id_str, raw_len);

	dl_list_for_each(e, &msg->tlvs, struct mqtt_tlv_entry, list)
		print_tlv_entry(e, dtbl, "     ", &idx);
}

/* -- Message builders (using TLV API) ------------------------------------------ */

/*
 * serialize_and_free - serialise msg into buf, free msg, return byte count.
 * Returns -1 on failure.
 */
static int serialize_and_free(struct mqtt_tlv_message *msg,
			       uint8_t *buf, size_t buflen)
{
	int n;

	if (!msg)
		return -1;
	n = mqtt_tlv_serialize(msg, buf, buflen);
	mqtt_tlv_message_free(msg);
	return n;
}

/*
 * build_ping_msg - CMD_ID_SYS_PING has no payload TLVs.
 * hostapd replies with EVT_ID_SYS_HOSTAPD_STARTED.
 */
static int build_ping_msg(uint8_t *buf, size_t buflen)
{
	return serialize_and_free(mqtt_tlv_message_alloc(CMD_ID_SYS_PING),
				  buf, buflen);
}

/* -- Application state --------------------------------------------------------- */

struct test_ctx {
	struct mosquitto *mosq;
	bool              connected;
	unsigned long     tx_count;
	unsigned long     rx_count;
};

/* -- mosquitto callbacks ------------------------------------------------------- */

static void on_connect(struct mosquitto *mosq, void *obj, int rc)
{
	struct test_ctx *ctx = obj;
	uint8_t buf[16];
	int len;

	if (rc != 0) {
		fprintf(stderr, "[MQTT] Connection refused by broker (rc=%d)\n",
			rc);
		return;
	}
	ctx->connected = true;
	printf("[MQTT] Connected to broker\n");

	/* Subscribe to all events from all features */
	mosquitto_subscribe(mosq, NULL, MQTT_TOPIC_TRANSMIT "/#", 1);
	printf("[MQTT] Subscribed to " MQTT_TOPIC_TRANSMIT "/#\n");

	/* Auto-ping on connect so the user immediately sees hostapd status */
	len = build_ping_msg(buf, sizeof(buf));
	if (len > 0 &&
	    mosquitto_publish(mosq, NULL,
			      MQTT_TOPIC_RECEIVE "/" MQTT_FEATURE_SYS,
			      len, buf, 0, false) == MOSQ_ERR_SUCCESS) {
		ctx->tx_count++;
		printf("[TX ] CMD_SYS_PING -> "
		       MQTT_TOPIC_RECEIVE "/" MQTT_FEATURE_SYS
		       " (%d bytes)  [auto on connect]\n", len);
	}

	printf("> ");
	fflush(stdout);
}

static void on_disconnect(struct mosquitto *mosq, void *obj, int rc)
{
	struct test_ctx *ctx = obj;

	(void)mosq;
	ctx->connected = false;
	printf("\n[MQTT] Disconnected (rc=%d)\n> ", rc);
	fflush(stdout);
}

/*
 * on_message - receive and display an MQTT message from hostapd.
 *
 * Uses mqtt_tlv_deserialize() to parse the wire format, then calls
 * display_message() to print each TLV with its name and formatted value.
 */
static void on_message(struct mosquitto *mosq, void *obj,
		       const struct mosquitto_message *msg)
{
	struct test_ctx *ctx = obj;
	struct mqtt_tlv_message *parsed;

	(void)mosq;
	ctx->rx_count++;

	if (!msg->payload || msg->payloadlen < 6) {
		printf("\n[RX ] topic='%s' payload too short (%d B)\n> ",
		       msg->topic, msg->payloadlen);
		fflush(stdout);
		return;
	}

	parsed = mqtt_tlv_deserialize((const uint8_t *)msg->payload,
				      (size_t)msg->payloadlen);
	if (!parsed) {
		printf("\n[RX ] topic='%s' -- deserialization failed (%d B)\n> ",
		       msg->topic, msg->payloadlen);
		fflush(stdout);
		return;
	}

	display_message(msg->topic, parsed, msg->payloadlen);
	mqtt_tlv_message_free(parsed);

	printf("> ");
	fflush(stdout);
}

static void on_subscribe(struct mosquitto *mosq, void *obj, int mid,
			 int qos_count, const int *granted_qos)
{
	(void)mosq;
	(void)obj;
	printf("[MQTT] SUBACK mid=%d granted_qos=%d\n",
	       mid, qos_count > 0 ? granted_qos[0] : -1);
}

/* -- Command line -------------------------------------------------------------- */

static void print_help(void)
{
	printf("Commands:\n"
	       "  ping     Send CMD_ID_SYS_PING; hostapd replies with version\n"
	       "  stats    Print TX/RX message counters\n"
	       "  help     Show this list\n"
	       "  quit/q   Disconnect and exit\n");
}

static void do_publish(struct test_ctx *ctx, const char *label,
		       const char *topic, uint8_t *buf, int len)
{
	if (!ctx->connected) {
		fprintf(stderr, "[ERR] Not connected\n");
		return;
	}
	if (len <= 0) {
		fprintf(stderr, "[ERR] Build failed\n");
		return;
	}
	if (mosquitto_publish(ctx->mosq, NULL, topic,
			      len, buf, 0, false) != MOSQ_ERR_SUCCESS) {
		fprintf(stderr, "[ERR] Publish failed\n");
		return;
	}
	ctx->tx_count++;
	printf("[TX ] %s -> %s (%d bytes)\n", label, topic, len);
}

static void process_line(struct test_ctx *ctx, char *line)
{
	char   *p = line;
	char   *nl;
	uint8_t buf[64];
	int     len;

	while (*p == ' ' || *p == '\t')
		p++;
	if (*p == '\0' || *p == '\n') {
		printf("> ");
		fflush(stdout);
		return;
	}
	nl = strchr(p, '\n');
	if (nl)
		*nl = '\0';

	if (strcmp(p, "ping") == 0) {
		len = build_ping_msg(buf, sizeof(buf));
		do_publish(ctx, "CMD_SYS_PING",
			   MQTT_TOPIC_RECEIVE "/" MQTT_FEATURE_SYS,
			   buf, len);

	} else if (strcmp(p, "stats") == 0) {
		printf("TX: %lu  RX: %lu\n", ctx->tx_count, ctx->rx_count);

	} else if (strcmp(p, "help") == 0) {
		print_help();

	} else if (strcmp(p, "quit") == 0 || strcmp(p, "q") == 0) {
		mosquitto_disconnect(ctx->mosq);
		return;

	} else {
		printf("Unknown command '%s' -- type 'help' for a list\n", p);
	}

	printf("> ");
	fflush(stdout);
}

/* -- main ---------------------------------------------------------------------- */

static volatile int g_stop = 0;

static void sig_handler(int sig)
{
	(void)sig;
	g_stop = 1;
}

int main(int argc, char *argv[])
{
	const char     *host = (argc > 1) ? argv[1] : BROKER_DEFAULT_HOST;
	int             port = (argc > 2) ? atoi(argv[2]) : BROKER_DEFAULT_PORT;
	struct test_ctx ctx  = { 0 };
	char            client_id[64];
	int             rc;

	signal(SIGINT,  sig_handler);
	signal(SIGTERM, sig_handler);

	snprintf(client_id, sizeof(client_id), "hostapd-test-%d", getpid());

	mosquitto_lib_init();

	ctx.mosq = mosquitto_new(client_id, true, &ctx);
	if (!ctx.mosq) {
		fprintf(stderr, "[ERR] mosquitto_new failed: %s\n",
			strerror(errno));
		return 1;
	}

	mosquitto_connect_callback_set   (ctx.mosq, on_connect);
	mosquitto_disconnect_callback_set(ctx.mosq, on_disconnect);
	mosquitto_message_callback_set   (ctx.mosq, on_message);
	mosquitto_subscribe_callback_set (ctx.mosq, on_subscribe);

	printf("[MQTT] Connecting to %s:%d as '%s'...\n", host, port, client_id);

	rc = mosquitto_connect(ctx.mosq, host, port, BROKER_KEEPALIVE);
	if (rc != MOSQ_ERR_SUCCESS) {
		fprintf(stderr, "[ERR] connect failed: %s\n",
			mosquitto_strerror(rc));
		mosquitto_destroy(ctx.mosq);
		mosquitto_lib_cleanup();
		return 1;
	}

	print_help();
	printf("> ");
	fflush(stdout);

	/* Main loop: multiplex mosquitto socket + stdin */
	while (!g_stop) {
		fd_set rfds;
		int    mfd = mosquitto_socket(ctx.mosq);
		struct timeval tv = { 0, 100000 }; /* 100 ms */

		FD_ZERO(&rfds);
		FD_SET(STDIN_FILENO, &rfds);
		if (mfd >= 0)
			FD_SET(mfd, &rfds);

		if (select((mfd > STDIN_FILENO ? mfd : STDIN_FILENO) + 1,
			   &rfds, NULL, NULL, &tv) < 0) {
			if (errno == EINTR)
				continue;
			break;
		}

		mosquitto_loop(ctx.mosq, 0, 1);

		if (FD_ISSET(STDIN_FILENO, &rfds)) {
			char line[256] = { 0 };

			if (!fgets(line, sizeof(line), stdin))
				break;
			process_line(&ctx, line);
		}
	}

	printf("\n[MQTT] Disconnecting...\n");
	mosquitto_disconnect(ctx.mosq);
	mosquitto_loop(ctx.mosq, 500, 1);
	mosquitto_destroy(ctx.mosq);
	mosquitto_lib_cleanup();
	printf("TX: %lu  RX: %lu\n", ctx.tx_count, ctx.rx_count);
	return 0;
}
