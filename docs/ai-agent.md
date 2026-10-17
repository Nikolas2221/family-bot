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
