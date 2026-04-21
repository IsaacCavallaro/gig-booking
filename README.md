# Gig Booking

Minimal gig booking site for GitHub Pages with Google Calendar for availability and Google Apps Script for event creation.

## Problem statement

Gig offers usually arrive through SMS, WhatsApp, Messenger, Instagram, or email. The problem is not getting the first enquiry. The problem is the repeated back and forth after that:

- are you free on this date?
- where is it?
- what is the rate?
- what gear is provided?
- what time is load in?

This project gives you one link to send to bookers so they can check availability and submit the core details in one pass. That removes the slow message loop and pencils the date into your calendar immediately.

## What this solves

- Gives bookers a single booking link instead of a fragmented message thread.
- Uses your public Google Calendar as the availability source of truth.
- Lets the booker submit the key details in one form.
- Creates a timed `Music (...)` placeholder event automatically in Google Calendar.
- Sends you an email notification for each accepted submission.
- Keeps the whole setup simple, lightweight, and free for normal personal use.

## What the site does

1. The booker opens the page.
2. They check the embedded Google Calendar.
3. They submit:
   - music type
   - date
   - start time
   - end time
   - location
   - rate
   - gear provided
   - load in
   - optional contact
   - optional notes
4. Google Apps Script creates a timed placeholder event in the target calendar.
5. You receive an email notification with the submitted details.

If the bandleader or organiser wants to own the final invite, they can still create and send a separate Google Calendar invite later. This flow is only for pencilling the date in fast so it does not get double booked.

## Architecture

This uses the simplest free architecture that still allows calendar writes.

### Frontend

- GitHub Pages
- plain HTML, CSS, and JavaScript
- embedded public Google Calendar
- form submission directly to Google Apps Script

### Backend

- Google Apps Script web app
- CalendarApp for event creation
- MailApp for notification emails
- basic anti-bot checks before event creation

### Why this split exists

GitHub Pages is static hosting only. It can serve the website, but it cannot securely create Google Calendar events by itself. Google Apps Script is the minimal Google-native backend that can receive the form submission, write to Google Calendar, and send an email.

## Free architecture summary

- Website hosting: GitHub Pages
- Availability display: public Google Calendar embed
- Event creation: Google Apps Script web app
- Email notification: Google Apps Script via MailApp
- Running cost: effectively free within normal GitHub Pages and Google account quotas

## Repository structure

- `index.html`
  Main booking page markup.
- `styles.css`
  Minimal CLI-style monochrome visual design and responsive layout.
- `app.js`
  Frontend configuration, calendar wiring, form handling, and UI feedback.
- `google-apps-script/Code.gs`
  Google Apps Script backend that creates the event, sends the email, and applies anti-bot rules.

## Current configuration

The project is currently wired to this Google Calendar ID:

- `ialdeqca146a7eggkirrh1mjcc@group.calendar.google.com`

The frontend is already configured with:

- the public calendar embed URL
- the public calendar page URL
- the deployed Apps Script `/exec` URL
- music type options
- playlist links shown at the bottom of the page

## Local development

```bash
cd /Users/isaaccavallaro/Development/personal/gig-booking
python3 -m http.server 4311 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:4311/
```

## Deploying the website with GitHub Pages

1. Push this repository to GitHub.
2. Open the repository settings.
3. Go to `Pages`.
4. Set the source to deploy from the main branch.
5. Use the repository root as the publish directory.
6. Save the settings and wait for the Pages build to finish.

Because the frontend is static, there is no build step required.

## Google Apps Script setup

1. Open Google Apps Script.
2. Create a standalone project.
3. Paste in `google-apps-script/Code.gs`.
4. Save the script.
5. Review the constants at the top:
   - `CALENDAR_ID`
   - `EVENT_TITLE_PREFIX`
   - `NOTIFICATION_EMAIL`
   - anti-bot values such as `MIN_SUBMIT_SECONDS` and `COOLDOWN_SECONDS`
6. Deploy the project as a web app:
   - Execute as: `Me`
   - Who has access: `Anyone`
7. Copy the deployed `/exec` URL.
8. Paste that URL into `app.js` as `appsScriptWebAppUrl`.
9. Redeploy the Apps Script whenever the backend code changes.

## Frontend configuration

Update `app.js` if you want to change:

- page title
- intro copy
- calendar embed URL
- public calendar link
- Apps Script endpoint
- music type dropdown values
- footer playlist and social links

## Anti-bot protections

The current backend includes a simple baseline protection layer:

- hidden honeypot field
- minimum time-on-form check using `startedAt`
- submission fingerprinting
- cooldown and duplicate blocking

This is intentionally lightweight. It is enough to reduce low-effort spam and repeated accidental submissions without adding visible friction for real users.

Important caveat:

- duplicate protection is currently strict
- identical submissions may be rejected after the first accepted request

That is good for reducing spam, but it can also block a legitimate retry if someone submits the exact same details again.

## Limitations

- The availability view is still the native Google Calendar embed.
- Browser date pickers are partially browser-controlled, so full styling is limited.
- Backend changes require a new Apps Script deployment version.
- Anti-bot protection is intentionally simple, not enterprise-grade.
- This creates placeholder events, not a full booking approval workflow.

## Why this is useful

This project is deliberately narrow. It does not try to replace your calendar, your messaging apps, or your booking workflow. It solves one specific problem well:

- a booker can see if a date looks free
- they can send the key details once
- the date is pencilled into your calendar immediately

That is enough to reduce admin overhead and avoid double booking without paying for a booking platform or maintaining a custom backend.
