# Icecast public stats setup (Radio Ava o Nava)

Status: prepared in GitHub; NOT YET ENABLED ON CLOUDFLARE OR THE RADIO PC.

## What the site expects
- Public URL: `https://live.ibboabdoli.com/radio-stats.xsl`
- Refresh: every 10 seconds; unknown after 30 seconds without verified data
- Body: `{"live":true,"listeners":1,"startedAt":"2026-11-13T18:09:13+0000"}`
- OFFLINE: `{"live":false,"listeners":0,"startedAt":null}`
- Uses only mount `/stream`; no administration credentials or internal server details.

## Safe installation on the radio PC
1. Find Icecast `webroot` in the local `icecast.xml`. Common Windows path: `C:\Program Files\Icecast\web`.
2. Copy the repo file `radio-stats.xsl` into the configured Icecast `webroot`. Do not edit existing Icecast files.
3. On the radio PC verify `http://127.0.0.1:8000/radio-stats.xsl` returns only three JSON keys above.

## Cloudflare (requires separate verification/approval)
Current Block expression (reported earlier):
```
(http.host eq "live.ibboabdoli.com" and http.request.uri.path ne "/stream")
```
After local verification, change ONLY that same Block expression to:
```
(http.host eq "live.ibboabdoli.com" and http.request.uri.path ne "/stream" and http.request.uri.path ne "/radio-stats.xsl")
```
This leaves `/admin`, `/status-json.xsl` and all other Icecast paths blocked; it permits the narrowly scoped public XSL stats endpoint. The page must not rely on a general WAF bypass.

## Acceptance checks
1. Public stats URL yields JSON with only `live`, `listeners`, and `startedAt` (and appropriate CORS response headers).
2. Public `/admin` and `/status-json.xsl` remain denied.
3. Source connected: LIVE, exact listeners, live duration based on `stream_start_iso8601`.
4. Source disconnected but Icecast online: OFFLINE with zero listeners.
5. Icecast/Tunnel unreachable, blocked or CORS issue: unknown, never false OFFLINE.
6. Test at least once on a real iPhone and desktop. No claim of final deployment before those checks pass.

## Rollback
Revert the Cloudflare Block expression to the original value (allow only `/stream`). The radio stream continues normally; the site falls back to unknown stats. The custom XSL file can remain local or be deleted later.
