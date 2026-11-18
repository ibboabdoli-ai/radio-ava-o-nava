# Radio Ava o Nava — public content management

The live `/v2/` site reads `v2/shows.json`. Edit public details here only through an authorized GitHub account, ideally in a reviewed pull request. No login tokens, private responses or registration spreadsheets belong in this repository.

## Next radio program

`schedule.weekdays` is `[6,0,1,2,3]` (Saturday through Wednesday). `hour` and `minute` are Tehran-local wall-clock times. All Sweden and UK times are calculated using real IANA time-zone rules.

`program.title` and `schedule.description` are the safe general-purpose program title and description. For different **confirmed** daily program names, set `schedule.dayPrograms` using day numbers, for example:

```json
"dayPrograms": {
  "6": "نام تأییدشده برنامه شنبه"
}
```

Keep the object empty until specific titles are confirmed. The website will display the general radio title, correct date, three time zones, and the countdown.

## Competition

`competition` stores **only public, organizer-approved metadata**:

- `title`: event name.
- `registrationDeadline`: `YYYY-MM-DD` or `null` if not announced; treated as a *date label*, not a promise that the form will close automatically at midnight.
- `rules`: array of officially approved rules; keep `[]` until announced.
- `publicParticipantsCount`: a verified nonnegative integer only **if organizers authorize publication**; otherwise `null`.
- `winners`: approved public display names only after explicit permission or public announcement; otherwise `[]`.

The registration form is linked from `links.contest` and writes to a **private Google Sheet**, not this GitHub repository. The public web page cannot automatically read that sheet, and changes to `publicParticipantsCount` are not automatic. Never insert participant handles, phone numbers, emails, spreadsheet URLs, or row-level registration data in public JSON.

When no official value is provided, the website truthfully displays “هنوز اعلام نشده” or equivalent. Do not invent dates, policies, winners or participant totals.

## Archive recordings

`recordings` contains public HTTPS R2 audio URLs and program labels. Their order determines display order (newest first). Each entry has a unique `id`.

The website obtains a file's duration **on demand after its audio metadata loads**, not by downloading multiple large recordings in the background. Durations are remembered locally on each visitor's device (only numerical file durations, not personal information).

## Validation

```sh
node --test v2/tests/smoke.test.mjs
node --test v2/tests/media-health.test.mjs
```

The media check verifies remote URLs and HTTP HEAD; it does not prove audible playback on all devices. Before a final release, check the website at a desktop width and a narrow mobile width, then play every recording once on real devices.
