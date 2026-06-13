# Cloudflare — keeping tokens out of access logs

Goal: query-string parameters of WebSocket (and any) requests — especially
`*token*`, `*access_token*`, `*auth*`, `*ticket*`, `*api_key*`, `*session*` —
must NOT be written to Cloudflare logs (Logpush / HTTP request logs / Security
Events) or forwarded to any downstream SIEM.

There are two independent layers; apply **both**.

---

## 1. Logpush field exclusion (do not ship the URI query)

Cloudflare Logpush exposes the request URI in three fields:

| Field             | Contains query string? | Action            |
| ----------------- | ---------------------- | ----------------- |
| `ClientRequestURI`| **yes** (`/path?...`)  | **exclude**       |
| `ClientRequestPath`| no (path only)        | keep (safe)       |
| `ClientRequestQuery`| **yes** (raw query)  | **exclude**       |

Edit the Logpush job so its `output_options.field_names` **omits**
`ClientRequestURI` and `ClientRequestQuery`, keeping only `ClientRequestPath`.

```bash
# Replace the field set of an existing Logpush job (HTTP requests dataset).
curl -X PUT \
  "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/logpush/jobs/${JOB_ID}" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{
    "output_options": {
      "field_names": [
        "ClientRequestPath", "ClientRequestMethod", "EdgeResponseStatus",
        "ClientIP", "RayID", "EdgeStartTimestamp", "ClientRequestHost",
        "ClientRequestProtocol", "UserAgent"
      ],
      "timestamp_format": "rfc3339"
    }
  }'
```

> Note: `ClientRequestURI` / `ClientRequestQuery` are simply absent from the
> list, so they are never emitted.

Terraform equivalent (`cloudflare_logpush_job`):

```hcl
resource "cloudflare_logpush_job" "http_requests" {
  zone_id = var.cf_zone_id
  name    = "nexa-http-requests"
  dataset = "http_requests"
  # Path only — query string deliberately excluded.
  logpull_options     = "fields=ClientRequestPath,ClientRequestMethod,EdgeResponseStatus,ClientIP,RayID,EdgeStartTimestamp,ClientRequestHost,ClientRequestProtocol,UserAgent&timestamps=rfc3339"
  destination_conf    = var.logpush_destination
}
```

## 2. Transform Rule — strip sensitive query params at the edge

Defense in depth: rewrite the URI so sensitive params never exist past the edge
(also protects origin nginx logs, browser `Referer`, and any future log sink).
Rules → Transform Rules → **Rewrite URL** → *Rewrite query string* → dynamic:

```
# Expression (when to run): all WS handshakes + anything carrying a sensitive param
(http.request.uri.path eq "/api/v1/ws")
  or any(lower(http.request.uri.args.names[*])[*] contains "token")
  or any(lower(http.request.uri.args.names[*])[*] contains "auth")
  or any(lower(http.request.uri.args.names[*])[*] contains "ticket")
  or any(lower(http.request.uri.args.names[*])[*] contains "api_key")
  or any(lower(http.request.uri.args.names[*])[*] contains "session")

# Query string rewrite (dynamic) — drop the listed keys, keep the rest:
regex_replace(http.request.uri.query,
  "(^|&)(access_token|refresh_token|token|auth|ticket|api_key|session)=[^&]*", "")
```

Since the app no longer sends a token in the URL, this rule should be a no-op in
normal operation — it exists to catch regressions and legacy clients.

## 3. Verify

```bash
# After deploy, confirm logs contain no token material:
#   - Logpush bucket / SIEM: search recent /api/v1/ws lines → must show only the path.
grep -RiE 'access_token|[?&]token=|ticket=' <logpush-export-dir>   # expect: no matches
```
