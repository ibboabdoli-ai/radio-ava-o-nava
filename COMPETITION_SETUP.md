# Competition registration setup

The public site is hosted as static GitHub Pages. Registrations must **not** be stored in GitHub, client-side localStorage, or a public spreadsheet.

## Recommended storage: private Google Forms + Google Sheets

1. Create a Google Form titled **مسابقه رادیو آوا و نوا** with three required questions: **نام شرکت‌کننده**, **نام کاربری کلاب‌هاوس**, and **رشته مسابقه** (options: شعرخوانی / آواز / دکلمه / سایر). Google Forms automatically records submission timestamps.
2. In Google Forms > Responses, create/link a Google Sheet. Keep the form responses and spreadsheet **Restricted**, shared only with competition organizers. Do not enable publishing results publicly.
3. Publish the form and copy its responder link (https://docs.google.com/forms/...). Put the URL in `competition-config.js` as `window.RADIO_COMPETITION_FORM_URL`.
4. Test one real submission and verify the private response Sheet receives the row and no other viewer can access the Sheet.
5. Only after the form link and end-to-end test are ready, merge and deploy the website changes.

Note: the landing page collects values only as a visual preview, then opens the Google Form, where contestants must **re-enter and submit** their information. No submissions can occur directly through the landing page. Do not claim an on-site registration is complete before the Google Form confirms it. The temporary sessionStorage draft contains non-sensitive unsent values and is not a registration record; it can be removed once the Google Form is configured.
