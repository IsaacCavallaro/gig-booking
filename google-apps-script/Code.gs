const SYNC_MAP_PREFIX = "SYNC_MAP_";

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = clean(params.action);

  if (action === "availability") {
    return availabilityResponse(params);
  }

  if (action === "sync") {
    return textResponse(syncAvailability());
  }

  return textResponse("OK");
}

function doPost(e) {
  try {
    const config = getConfig();
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

    if (!isOldEnough(startedAt, config.minSubmitSeconds)) {
      return textResponse("Rejected: submitted too quickly.");
    }

    const privateCalendar = getCalendarOrThrow(config.privateCalendarId, "Private calendar not found.");
    const publicCalendar = getCalendarOrThrow(config.publicCalendarId, "Public calendar not found.");
    const eventTimes = buildTimedRange(dateValue, startTime, endTime, privateCalendar.getTimeZone());

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

    const privateEvent = privateCalendar.createEvent(
      `${config.eventTitlePrefix} (${musicType}): ${location}`,
      eventTimes.start,
      eventTimes.end,
      {
        description: buildPrivateEventDescription({
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
        }),
        location,
      }
    );

    privateEvent.setColor(CalendarApp.EventColor.PALE_GREEN);

    const publicEvent = upsertPublicBlockForSourceEvent(privateEvent, publicCalendar, config);
    rememberSubmission(fingerprint, privateEvent.getId(), config.cooldownSeconds);

    let mailStatus = "mail=ok";

    try {
      sendBookingNotification({
        notificationEmail: config.notificationEmail,
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
        privateEventId: privateEvent.getId(),
        publicEventId: publicEvent ? publicEvent.getId() : "",
      });
    } catch (mailError) {
      mailStatus = `mail=failed:${mailError.message}`;
      Logger.log(`Mail send failed: ${mailError.message}`);
    }

    return textResponse(`Created private=${privateEvent.getId()} public=${publicEvent.getId()} ${mailStatus}`);
  } catch (error) {
    return textResponse(`Error: ${error.message}`);
  }
}

function clean(value) {
  return String(value || "").trim();
}

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  const privateCalendarId = clean(props.getProperty("PRIVATE_CALENDAR_ID"));
  const publicCalendarId =
    clean(props.getProperty("PUBLIC_CALENDAR_ID")) ||
    clean(props.getProperty("CALENDAR_ID"));
  const eventTitlePrefix = clean(props.getProperty("EVENT_TITLE_PREFIX")) || "Music";
  const publicEventTitle = clean(props.getProperty("PUBLIC_EVENT_TITLE")) || "Booked / On Hold";
  const notificationEmail = clean(props.getProperty("NOTIFICATION_EMAIL"));
  const defaultLookaheadDays = getNumberProperty(props, "DEFAULT_LOOKAHEAD_DAYS", 90);
  const minSubmitSeconds = getNumberProperty(props, "MIN_SUBMIT_SECONDS", 4);
  const cooldownSeconds = getNumberProperty(props, "COOLDOWN_SECONDS", 600);
  const syncLookaheadDays = getNumberProperty(props, "SYNC_LOOKAHEAD_DAYS", 180);
  const syncPastDays = getNumberProperty(props, "SYNC_PAST_DAYS", 2);

  if (!privateCalendarId) {
    throw new Error("Missing script property: PRIVATE_CALENDAR_ID");
  }

  if (!publicCalendarId) {
    throw new Error("Missing script property: PUBLIC_CALENDAR_ID");
  }

  if (!notificationEmail) {
    throw new Error("Missing script property: NOTIFICATION_EMAIL");
  }

  return {
    privateCalendarId,
    publicCalendarId,
    eventTitlePrefix,
    publicEventTitle,
    notificationEmail,
    defaultLookaheadDays,
    minSubmitSeconds,
    cooldownSeconds,
    syncLookaheadDays,
    syncPastDays,
  };
}

function getNumberProperty(props, key, fallback) {
  const raw = clean(props.getProperty(key));
  const value = Number(raw);

  if (!raw || Number.isNaN(value) || value < 0) {
    return fallback;
  }

  return value;
}

function getCalendarOrThrow(calendarId, message) {
  const calendar = CalendarApp.getCalendarById(calendarId);

  if (!calendar) {
    throw new Error(message);
  }

  return calendar;
}

function buildTimedRange(dateValue, startTime, endTime, timezone) {
  const start = parseDateTimeValue(dateValue, startTime, timezone);
  const end = parseDateTimeValue(dateValue, endTime, timezone);

  if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
}

function buildPrivateEventDescription(details) {
  return [
    "Gig request received from website",
    "",
    `Music type: ${details.musicType}`,
    `Date: ${details.dateValue}`,
    `Start time: ${details.startTime}`,
    `End time: ${details.endTime}`,
    `Location: ${details.location}`,
    `Rate: ${details.rate}`,
    `Gear provided: ${details.gearProvided}`,
    `Load in: ${details.loadIn}`,
    `Contact: ${details.contact || "-"}`,
    `Timezone from browser: ${details.timezone || "-"}`,
    "",
    "Extra notes:",
    details.notes || "-",
  ].join("\n");
}

function buildPublicBlockDescription() {
  return "Availability blocker synced from private calendar.";
}

function isOldEnough(startedAt, minSubmitSeconds) {
  const startedAtMs = Number(startedAt);

  if (!startedAtMs || Number.isNaN(startedAtMs)) {
    return false;
  }

  return Date.now() - startedAtMs >= minSubmitSeconds * 1000;
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

  return digestHex(raw);
}

function digestHex(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value);

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

function rememberSubmission(fingerprint, eventId, cooldownSeconds) {
  const cache = CacheService.getScriptCache();
  cache.put(fingerprint, eventId || "1", cooldownSeconds);

  const props = PropertiesService.getScriptProperties();
  props.setProperty(
    fingerprint,
    JSON.stringify({
      eventId: eventId || "",
      createdAt: new Date().toISOString(),
    })
  );
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
    `Private calendar event ID: ${details.privateEventId || "-"}`,
    `Public blocker event ID: ${details.publicEventId || "-"}`,
    "",
    "Extra notes:",
    details.notes || "-",
  ].join("\n");

  MailApp.sendEmail({
    to: details.notificationEmail,
    subject,
    body,
    name: "Gig Booking Site",
  });
}

function testEmail() {
  const config = getConfig();

  MailApp.sendEmail({
    to: config.notificationEmail,
    subject: "Apps Script mail test",
    body: "If you received this, MailApp is authorized and working.",
    name: "Gig Booking Site",
  });
}

function availabilityResponse(params) {
  const config = getConfig();
  const callback = clean(params.callback);
  const days = Number(params.days) || config.defaultLookaheadDays;
  const calendar = getCalendarOrThrow(config.publicCalendarId, "Public calendar not found.");
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

function syncAvailability() {
  const config = getConfig();
  const privateCalendar = getCalendarOrThrow(config.privateCalendarId, "Private calendar not found.");
  const publicCalendar = getCalendarOrThrow(config.publicCalendarId, "Public calendar not found.");
  const start = atMidnight(new Date());
  start.setDate(start.getDate() - config.syncPastDays);

  const end = new Date(start);
  end.setDate(end.getDate() + config.syncLookaheadDays);

  const sourceEvents = privateCalendar.getEvents(start, end);
  const activeSourceIds = {};
  let upserted = 0;

  sourceEvents.forEach((sourceEvent) => {
    if (!shouldSyncSourceEvent(sourceEvent, config)) {
      return;
    }

    upsertPublicBlockForSourceEvent(sourceEvent, publicCalendar, config);
    activeSourceIds[sourceEvent.getId()] = true;
    upserted += 1;
  });

  const removed = cleanupOrphanedPublicBlocks(publicCalendar, activeSourceIds);

  const summary = `Synced ${upserted} source events and removed ${removed} orphaned blockers.`;
  Logger.log(summary);
  return summary;
}

function shouldSyncSourceEvent(sourceEvent, config) {
  if (sourceEvent.getTitle() === config.publicEventTitle) {
    return false;
  }

  return true;
}

function upsertPublicBlockForSourceEvent(sourceEvent, publicCalendar, config) {
  const publicDescription = buildPublicBlockDescription();
  const existing = getMappedPublicEvent(publicCalendar, sourceEvent.getId());

  if (sourceEvent.isAllDayEvent()) {
    return upsertAllDayPublicBlock(existing, sourceEvent, publicCalendar, config, publicDescription);
  }

  return upsertTimedPublicBlock(existing, sourceEvent, publicCalendar, config, publicDescription);
}

function upsertTimedPublicBlock(existing, sourceEvent, publicCalendar, config, description) {
  if (existing && existing.isAllDayEvent()) {
    existing.deleteEvent();
    clearSyncMapping(sourceEvent.getId());
    existing = null;
  }

  const start = sourceEvent.getStartTime();
  const end = sourceEvent.getEndTime();

  if (!existing) {
    const created = publicCalendar.createEvent(config.publicEventTitle, start, end, {
      description,
    });
    created.setColor(CalendarApp.EventColor.PALE_GREEN);
    setSyncMapping(sourceEvent.getId(), created.getId());
    return created;
  }

  existing.setTitle(config.publicEventTitle);
  existing.setDescription(description);
  existing.setTime(start, end);
  existing.setColor(CalendarApp.EventColor.PALE_GREEN);
  return existing;
}

function upsertAllDayPublicBlock(existing, sourceEvent, publicCalendar, config, description) {
  if (existing && !existing.isAllDayEvent()) {
    existing.deleteEvent();
    clearSyncMapping(sourceEvent.getId());
    existing = null;
  }

  const start = atMidnight(sourceEvent.getStartTime());
  const end = atMidnight(sourceEvent.getEndTime());

  if (!existing) {
    const created = publicCalendar.createAllDayEvent(config.publicEventTitle, start, end, {
      description,
    });
    created.setColor(CalendarApp.EventColor.PALE_GREEN);
    setSyncMapping(sourceEvent.getId(), created.getId());
    return created;
  }

  existing.setTitle(config.publicEventTitle);
  existing.setDescription(description);
  existing.setAllDayDates(start, end);
  existing.setColor(CalendarApp.EventColor.PALE_GREEN);
  return existing;
}

function cleanupOrphanedPublicBlocks(publicCalendar, activeSourceIds) {
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  let removed = 0;

  Object.keys(allProps).forEach((key) => {
    if (!key.startsWith(SYNC_MAP_PREFIX)) {
      return;
    }

    let parsed;

    try {
      parsed = JSON.parse(allProps[key]);
    } catch (error) {
      props.deleteProperty(key);
      return;
    }

    if (activeSourceIds[parsed.sourceEventId]) {
      return;
    }

    const publicEvent = parsed.publicEventId
      ? publicCalendar.getEventById(parsed.publicEventId)
      : null;

    if (publicEvent) {
      publicEvent.deleteEvent();
      removed += 1;
    }

    props.deleteProperty(key);
  });

  return removed;
}

function getMappedPublicEvent(publicCalendar, sourceEventId) {
  const props = PropertiesService.getScriptProperties();
  const key = syncMapKey(sourceEventId);
  const raw = props.getProperty(key);

  if (!raw) {
    return null;
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    props.deleteProperty(key);
    return null;
  }

  const publicEvent = parsed.publicEventId
    ? publicCalendar.getEventById(parsed.publicEventId)
    : null;

  if (!publicEvent) {
    props.deleteProperty(key);
    return null;
  }

  return publicEvent;
}

function setSyncMapping(sourceEventId, publicEventId) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(
    syncMapKey(sourceEventId),
    JSON.stringify({
      sourceEventId,
      publicEventId,
      updatedAt: new Date().toISOString(),
    })
  );
}

function clearSyncMapping(sourceEventId) {
  PropertiesService.getScriptProperties().deleteProperty(syncMapKey(sourceEventId));
}

function syncMapKey(sourceEventId) {
  return `${SYNC_MAP_PREFIX}${digestHex(sourceEventId)}`;
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

function printSetupInstructions() {
  Logger.log("Add these Script Properties:");
  Logger.log("PRIVATE_CALENDAR_ID=your-private-source-calendar@gmail.com");
  Logger.log("PUBLIC_CALENDAR_ID=your-public-availability-calendar@group.calendar.google.com");
  Logger.log("EVENT_TITLE_PREFIX=Music");
  Logger.log("PUBLIC_EVENT_TITLE=Booked / On Hold");
  Logger.log("NOTIFICATION_EMAIL=you@example.com");
  Logger.log("DEFAULT_LOOKAHEAD_DAYS=90");
  Logger.log("MIN_SUBMIT_SECONDS=4");
  Logger.log("COOLDOWN_SECONDS=600");
  Logger.log("SYNC_LOOKAHEAD_DAYS=180");
  Logger.log("SYNC_PAST_DAYS=2");
}
