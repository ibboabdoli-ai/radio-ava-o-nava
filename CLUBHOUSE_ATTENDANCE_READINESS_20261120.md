# Clubhouse attendance source gate — 20 November 2026

## Decision

Automatic Clubhouse attendance remains **disabled**. Offline tests establish the bot's local behavior and the radio platform's accounting rules, but do not establish that Clubhouse 26.11.12 accepts the private API calls or exposes a complete, stable participant-presence source. No real Clubhouse account, room or message was used. Do not use room messages, display names, `num_all`, or a speaker-only list as proof of presence.

## Evidence reviewed

- The local bot `develop` and remote `origin/develop` both point to `e792273c1fe6570a096eb27b8b5ae0056ac408fc`. Its existing local changes were preserved and the original repository was not pushed. `ClubApiService` calls `/join_channel`, `/leave_channel`, `/get_channel`, `/get_channel_messages`, `/active_ping`, and speaker endpoints. The adapter returns normalized room metadata and messages, **not** a participant roster or join/leave stream. `ChannelResponse` types `num_all` and `num_speakers` but no participant identities. The current transport advertises app version `23.02.07` / build `2029`; the supplied IPA manifest says `26.11.12` / build `4726`. This mismatch is a compatibility risk, not proof of failure.
- The supplied local IPA has a valid ZIP container and manifest, but its Mach-O executable has `cryptid=1`; static inspection did not establish current endpoint behavior. The IPA was not changed or decrypted.
- Local `.env` has Clubhouse network, Clubhouse message sending, and paid AI disabled. The loopback MongoDB credential, bot and room collections each contain **zero records**. No separate test account is provisioned in this bot. The local launcher forces all three outbound gates off.
- The radio staging Worker has `ATTENDANCE_OBSERVER_ENABLED=false`. Its internal attendance endpoint returned 503 for a synthetic observation, and read-only D1 inspection showed zero attendance observations and zero rows written. The privileged observer token is not set for live scoring. Existing D1 triggers award one point per complete verified minute, deduplicate observation IDs, break a session on `left` or a gap over 75 seconds, and record an auditable ledger. These are accounting properties under synthetic input, not proof that input is trustworthy.
- [Clubhouse's current Terms of Service](https://tos.clubhouse.com/) describe anonymous listening that may hide a listener's identity from other participants and room administrators. They also describe a license for ordinary human use and restrictions on large-scale or commercial data collection. This creates a product and account-risk review gate for automated observation, especially for a radio service. An ordinary room roster cannot be assumed to identify anonymous listeners.

## Test results

| Check | Result |
| --- | --- |
| Bot TypeScript | Passed with Node.js 22.23.1 and project pnpm 10 |
| Bot Windows build | Passed |
| Full bot suite | 32 files, 286/286 tests passed against local MongoDB/mocks |
| Clubhouse adapter, transport, resilience and network-safety subset | 4 files, 42/42 tests passed; no Clubhouse network |
| Radio backend authentication, observer, points and concurrency | 18/18 tests passed |
| SQLite migration tests | 6/6 passed |
| Real staging API safety check | `/health` 200 with observer disabled; synthetic `POST /api/internal/attendance` 503; D1 observations 0 and rows written 0 |

## Controlled live test gate

Before any Clubhouse connection, the owner must identify a **separate test bot account**, an owner-controlled test room ID, and a second consenting test listener who can join silently. Credentials must be provisioned through secure local tooling into the encrypted bot credential store; do not put them in chat, Git, reports or console logs. If obtaining a credential requires bypassing access controls, stop. Confirm that the planned private-API use is permitted by Clubhouse's terms or obtain permission from Clubhouse.

Request explicit approval for only these actions: connect the separate test account; join the named test room; perform a small, bounded number of room/participant reads; compare a silent visible listener before and after join/leave and reconnect; leave and disconnect. Do not send messages, invite speakers, moderate users, inspect other rooms, or enable attendance scoring. Redact raw participant data from logs; retain only test-account IDs and aggregate diagnostic results with consent.

The test passes for **visible, identifiable** listeners only if the same stable user ID appears in a complete roster or genuine join/leave events while silent, disappears after leaving, reappears after return, and observations stop on disconnect. A chat message, speaker list, room count, placeholder avatar, or stale snapshot fails the gate. Anonymous listeners may remain unidentifiable by design. Only after this evidence and a separate approval should an observer bridge and scoped staging token be implemented and tested with synthetic accounts; real-user scoring requires another approval.

## Current blockers

No test account credential or designated test room exists in the local bot. The current app's private API compatibility and participant source are unverified; a roster contract is absent from the adapter. Account restrictions, private-API instability, anonymous listening, user consent, privacy retention and Clubhouse terms require review. PR #28 remains Draft, production and attendance scoring remain unchanged.
