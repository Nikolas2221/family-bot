# Conversational replies

Discord mentions use the configured AI provider for general questions. Conversation
history holds up to three exchanges per guild/channel/user, expires after 15 minutes,
and is lost on restart. It does not authorize actions or carry tool confirmations.
Capabilities questions also use the model, with the supported feature list as facts.

Private notifications for application decisions, discipline, ranks, blacklist and
AFK warnings request a fresh AI introduction on every send. Exact event details
remain unchanged below it. If generation fails or exceeds eight seconds, delivery
uses the existing factual notification. Bulk warnings retain their approved preview
text; they are not silently regenerated after confirmation. Other DM flows are not
changed by this integration.

# Web search

Set TAVILY_API_KEY in Railway Variables, then redeploy. Keep the key out of chat
and Git. API usage is subject to the provider's account limits and billing.
API reference: https://help.tavily.com/articles/4840311948-tavily-search-api

Mention requests containing explicit search phrases or freshness markers such as
news, weather and current prices (Russian) trigger Tavily search. This is a
keyword-based first integration, not autonomous browsing. Only the current public
question is sent, not server context or conversation history. Requests containing
Discord IDs/mentions or obvious credential markers are skipped. Do not put private
information into public search questions; heuristic filtering is not exhaustive.

Up to three HTTPS sources are appended to replies. Search excerpts are untrusted
context, not action instructions. Missing credentials or provider errors are reported
to the model without invented search results. Search is currently integrated into
the general Discord mention path, not Telegram or all slash commands.

Example: @KLAIZ BOT поищи в интернете последние новости Discord

# One recovery check after a network migration

After an operator-confirmed region/network migration, set DISCORD_NETWORK_CHANGE_ID
to a unique label for that migration, for example amsterdam-2026-10-17. This is an
operator authorization; the bot additionally checks observed public IPv4 against
the previously saved address before allowing a recovery request.
Apply it only to the migrated service, never to the old running instance.

At startup the bot obtains public IPv4 from https://api.ipify.org?format=json
(https://www.ipify.org/), with a five-second timeout and without Discord credentials.
The validated address is saved with the restriction state; raw IPs are not logged.
Deploy this version BEFORE migrating so the old address is recorded. With legacy
state that contains no address, the bot records a baseline but does not infer a
change or skip the deadline. Lookup failure or conflicting primary/backup IPs also
fail closed. A lookup failure never blocks ordinary login after the deadline.

While a saved restriction is active, an unused label AND a changed observed IPv4
authorize one gateway check. Neither a marker alone nor an IP change alone suffices.
The label is consumed on disk before the request. HTTP 200 clears the old deadline;
429, network errors and other failures retain or extend the pause. A restart cannot
reuse a consumed label. Do not rotate labels to keep retrying a blocked network.
Remove the variable after recovery. Up to 64 labels are retained; further probes
then require operator review, not automatic pruning. Keep the state and backup.

This measures the address observed by ipify, not the source IP seen by Discord.
Destination-dependent NAT, multiple outbound addresses and IPv6 can differ; the
subsequent Discord request is the actual availability check. Do not rotate regions
or labels to evade restrictions. Only one IP lookup is made per process startup.

# Discord connection restrictions

## Preventive REST limits

All requests through the main Discord client's REST transport have additional
conservative protection: SDK global budget 8 requests/second, dispatch spacing
150ms, maximum four in flight and maximum 64 pending. Admission waits expire after
eight seconds; aborted requests never reach the network. Ordinary Discord route
limits still take precedence and remain managed by discord.js.

HTTP 403/404 temporarily suppress repeated requests to the same method/resource for
10 minutes (permission changes can take that long to be noticed). HTTP 401 with bot
authentication stops further requests for the process; check credentials before
restart. Webhook-only authentication failures suppress that resource, not the bot.
Forty invalid responses within ten minutes trigger a persisted 15-minute pause.
Shared-scope 429s do not count towards this threshold, matching Discord guidance:
https://docs.discord.com/developers/topics/rate-limits

These are local safety budgets, not claims about Discord's published limits.
Ordinary mention questions skip server storage, analytics and profiles entirely.
Only explicitly server-scoped questions collect context; profiles are limited to
requested users, with at most three missing profiles fetched individually.
Explicit activity reports and bulk-action eligibility still load the full list.
Locally suppressed work fails instead of silently executing later; workflows may
need a manual retry or their existing delivery queue. Gateway traffic, other
processes and the hosting provider's shared IP are outside this REST protection.

## AI request failures and redundant events

General mention replies now preserve provider failure categories instead of hiding
all failures behind an empty reply. No auto-retry loop is added. OpenRouter uses a
2048-token output budget with low reasoning effort, at most two in-flight requests,
and a cooldown on 429/503 (respecting Retry-After). The request deadline also covers
response JSON parsing. HTTP 200 error envelopes and empty content are diagnosed.
This cannot guarantee availability of an external free model. API guidance:
https://openrouter.ai/docs/api/reference/errors-and-debugging
https://openrouter.ai/docs/guides/best-practices/reasoning-tokens

Web questions send one final answer, without a separate search announcement.
Direct bot questions do not also run custom phrase replies or soft-conflict chatter;
moderation guards still run. Repeated channel/role events debounce server-map writes
per guild rather than scheduling an independent snapshot on every event.

Before login the bot checks the Discord gateway endpoint once. HTTP 429 pauses
login according to Retry-After (seconds or HTTP date), with JSON retry_after as a
fallback. Missing or invalid values use a conservative one-minute delay. Network
errors and server failures also delay retries; HTTP 401 stops startup rather than
repeatedly using invalid credentials. HTTP 403 delays retry for 15 minutes.

The deadline is stored in DATA_FILE + .discord-rate-limit.json with a backup.
Keep this file on the persistent Railway volume. A restart or deploy does not
reset the deadline. Both damaged copies stop startup rather than erase the pause.
No token or response body is stored in this file or restriction logs.

Global and HTML Cloudflare 429 responses received through discord.js also save
the deadline and pause the shared REST queue. Ordinary route limits remain under
discord.js management. Already in-flight requests cannot be recalled.
The 120-second startup watchdog is disabled while waiting for a restriction.
This honors restrictions, not bypasses them, and cannot remove an existing block.

Readiness /healthz stays 503 until Discord connects. A deployment health-check
deadline shorter than the restriction may make Railway mark the deploy failed;
do not repeatedly redeploy to clear a restriction. The persisted deadline remains
in effect on the next start. Supervisor restart policy must allow recovery.
