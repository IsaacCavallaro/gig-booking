const CALENDAR_ID = "ialdeqca146a7eggkirrh1mjcc@group.calendar.google.com";
const EVENT_TITLE_PREFIX = "Music";
const DEFAULT_LOOKAHEAD_DAYS = 90;
const NOTIFICATION_EMAIL = "isaaccavallaro@gmail.com";
const MIN_SUBMIT_SECONDS = 4;
const COOLDOWN_SECONDS = 600;

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = clean(params.action);

  if (action === "availability") {
    return availabilityResponse(params);
  }

  return textResponse("OK");
}

function doPost(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const musicType = clean(params.musicType) || "Gigs";
    const dateValue = params.date;
    const startTime = clean(params.startTime);
    const endTime = clean(params.endTime);
    const location = clean(params.location);
    const rate = clean(params.rate);
    const gearProvided = clean(params.gearProvided);
    const loadIn = clean(params.loadIn);
    const contact = clean(params.contact);
    const notes = clean(params.notes);
    const timezone = clean(params.timezone);
    const website = clean(params.website);
    const startedAt = clean(params.startedAt);

    if (!dateValue || !startTime || !endTime || !location || !rate || !gearProvided || !loadIn) {
      return textResponse("Missing required fields.");
    }

    if (website) {
      return textResponse("Rejected.");
    }

    if (!isOldEnough(startedAt)) {
      return textResponse("Rejected: submitted too quickly.");
    }

    const calendar = CalendarApp.getCalendarById(CALENDAR_ID);

    if (!calendar) {
      return textResponse("Calendar not found.");
    }

    const calendarTimeZone = calendar.getTimeZone();
    const eventStart = parseDateTimeValue(dateValue, startTime, calendarTimeZone);
    const eventEnd = parseDateTimeValue(dateValue, endTime, calendarTimeZone);

    if (eventEnd.getTime() <= eventStart.getTime()) {
      eventEnd.setDate(eventEnd.getDate() + 1);
    }

    const fingerprint = buildFingerprint({
      musicType,
      dateValue,
      startTime,
      endTime,
      location,
      rate,
      gearProvided,
      loadIn,
      contact,
    });

    if (isDuplicateSubmission(fingerprint)) {
      return textResponse("Rejected: duplicate submission.");
    }

    const description = [
      "Gig request received from website",
      "",
      `Music type: ${musicType}`,
      `Date: ${dateValue}`,
      `Start time: ${startTime}`,
      `End time: ${endTime}`,
      `Location: ${location}`,
      `Rate: ${rate}`,
      `Gear provided: ${gearProvided}`,
      `Load in: ${loadIn}`,
      `Contact: ${contact || "-"}`,
      `Timezone from browser: ${timezone || "-"}`,
      "",
      "Extra notes:",
      notes || "-",
    ].join("\n");

    const event = calendar.createEvent(
      `${EVENT_TITLE_PREFIX} (${musicType}): ${location}`,
      eventStart,
      eventEnd,
      {
        description,
        location,
      }
    );

    event.setColor(CalendarApp.EventColor.PALE_GREEN);
    rememberSubmission(fingerprint, event.getId());
    let mailStatus = "mail=ok";

    try {
      sendBookingNotification({
        musicType,
        dateValue,
        startTime,
        endTime,
        location,
        rate,
        gearProvided,
        loadIn,
        contact,
        notes,
        timezone,
        eventId: event.getId(),
      });
    } catch (mailError) {
      mailStatus = `mail=failed:${mailError.message}`;
      Logger.log(`Mail send failed: ${mailError.message}`);
    }

    return textResponse(`Created ${event.getId()} ${mailStatus}`);
  } catch (error) {
    return textResponse(`Error: ${error.message}`);
  }
}

function clean(value) {
  return String(value || "").trim();
}

function isOldEnough(startedAt) {
  const startedAtMs = Number(startedAt);

  if (!startedAtMs || Number.isNaN(startedAtMs)) {
    return false;
  }

  return Date.now() - startedAtMs >= MIN_SUBMIT_SECONDS * 1000;
}

function buildFingerprint(details) {
  const raw = [
    details.musicType,
    details.dateValue,
    details.startTime,
    details.endTime,
    clean(details.location).toLowerCase(),
    clean(details.rate).toLowerCase(),
    clean(details.gearProvided).toLowerCase(),
    clean(details.loadIn).toLowerCase(),
    clean(details.contact).toLowerCase(),
  ].join("|");

  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return bytes
    .map((byte) => {
      const normalized = byte < 0 ? byte + 256 : byte;
      return normalized.toString(16).padStart(2, "0");
    })
    .join("");
}

function isDuplicateSubmission(fingerprint) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(fingerprint);

  if (cached) {
    return true;
  }

  const props = PropertiesService.getScriptProperties();
  return props.getProperty(fingerprint) !== null;
}

function rememberSubmission(fingerprint, eventId) {
  const cache = CacheService.getScriptCache();
  cache.put(fingerprint, eventId || "1", COOLDOWN_SECONDS);

  const props = PropertiesService.getScriptProperties();
  props.setProperty(fingerprint, JSON.stringify({
    eventId: eventId || "",
    createdAt: new Date().toISOString(),
  }));
}

function sendBookingNotification(details) {
  const contactName = details.contact || "Unknown contact";
  const subject = `New booking pencilled: ${contactName} - Music (${details.musicType}) - ${details.dateValue}`;
  const body = [
    "A new booking was submitted from the website.",
    "",
    `Booker / contact: ${contactName}`,
    `Music type: ${details.musicType}`,
    `Date: ${details.dateValue}`,
    `Start time: ${details.startTime}`,
    `End time: ${details.endTime}`,
    `Location: ${details.location}`,
    `Rate: ${details.rate}`,
    `Gear provided: ${details.gearProvided}`,
    `Load in: ${details.loadIn}`,
    `Timezone from browser: ${details.timezone || "-"}`,
    "",
    "Extra notes:",
    details.notes || "-",
  ].join("\n");

  MailApp.sendEmail({
    to: NOTIFICATION_EMAIL,
    subject,
    body,
    name: "Gig Booking Site",
  });
}

function testEmail() {
  MailApp.sendEmail({
    to: NOTIFICATION_EMAIL,
    subject: "Apps Script mail test",
    body: "If you received this, MailApp is authorized and working.",
    name: "Gig Booking Site",
  });
}

function availabilityResponse(params) {
  const callback = clean(params.callback);
  const days = Number(params.days) || DEFAULT_LOOKAHEAD_DAYS;
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID);

  if (!calendar) {
    return jsonpResponse(callback, { error: "Calendar not found." });
  }

  const timezone = calendar.getTimeZone();
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + days);

  const events = calendar.getEvents(start, end);
  const bookedDates = collectBookedDates(events, timezone);

  return jsonpResponse(callback, {
    bookedDates,
    today: formatDateKey(start, timezone),
    days,
    timezone,
  });
}

function parseDateTimeValue(dateValue, timeValue, timezone) {
  const parts = String(dateValue).split("-");
  const timeParts = String(timeValue).split(":");

  if (parts.length !== 3 || timeParts.length < 2) {
    throw new Error("Invalid date.");
  }

  const year = Number(parts[0]);
  const monthIndex = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const hour = Number(timeParts[0]);
  const minute = Number(timeParts[1]);

  if ([year, monthIndex, day, hour, minute].some((value) => Number.isNaN(value))) {
    throw new Error("Invalid time.");
  }

  const baseUtc = new Date(Date.UTC(year, monthIndex, day, hour, minute));
  const offset = parseTimezoneOffset(Utilities.formatDate(baseUtc, timezone, "Z"));

  return new Date(baseUtc.getTime() - offset * 60 * 1000);
}

function parseTimezoneOffset(offsetText) {
  const match = String(offsetText).match(/^([+-])(\d{2})(\d{2})$/);

  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);

  return sign * (hours * 60 + minutes);
}

function collectBookedDates(events, timezone) {
  const booked = {};

  events.forEach((event) => {
    const startDate = atMidnight(event.getStartTime());
    const endDate = atMidnight(event.getEndTime());
    const current = new Date(startDate);
    const inclusive = event.isAllDayEvent() ? -1 : 0;

    endDate.setDate(endDate.getDate() + inclusive);

    while (current <= endDate) {
      booked[formatDateKey(current, timezone)] = true;
      current.setDate(current.getDate() + 1);
    }
  });

  return Object.keys(booked).sort();
}

function atMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateKey(date, timezone) {
  return Utilities.formatDate(date, timezone, "yyyy-MM-dd");
}

function textResponse(message) {
  return ContentService.createTextOutput(message).setMimeType(ContentService.MimeType.TEXT);
}

function jsonpResponse(callback, payload) {
  const body = callback ? `${callback}(${JSON.stringify(payload)});` : JSON.stringify(payload);
  const mimeType = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;

  return ContentService.createTextOutput(body).setMimeType(mimeType);
}
