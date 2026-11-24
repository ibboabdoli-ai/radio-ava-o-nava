# Staging listener accounts

The music library uses two independent sign-in methods. Club members continue using the existing membership code and listener session. Google users have an identity tied to Google's immutable subject identifier and a separate session. This does not create a club membership or grant access to club points, admin features, or the radio queue. Matching names or email addresses never link the two accounts.

Playlists start private. Public playlists can be opened by link. The database holds the playlist's name, owner, privacy flag, and references to existing songs. No audio file is copied.

## Staging package

Run node library-accounts/prepare-staging.mjs with the existing radio-reference-layout path and a fresh candidate directory. The script copies the staging bundle and adds the account routes and the new library route without editing the original layout. Apply only 0021_library_accounts.sql against the staging D1 database before enabling the candidate. Compare the current staging version and configuration before a rollout, including current static assets and variables. The production site's assets and database are outside this package.

For Google sign-in, create a Web application OAuth client and register this exact redirect URI.

https://ava-radio-staging.ibbo-abdoli.workers.dev/api/library/auth/google/callback

Store LIBRARY_GOOGLE_CLIENT_ID and LIBRARY_GOOGLE_CLIENT_SECRET as staging Worker secrets. Add designated users to the Google OAuth test audience if the consent screen is in testing. The UI remains usable for club members while these secrets are absent.
