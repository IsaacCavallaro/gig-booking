const config = {
  title: "Check dates. Book fast.",
  intro:
    "If the date looks free, send the details through and I will pencil it in.",
  publicCalendarEmbedUrl:
    "https://calendar.google.com/calendar/embed?src=ialdeqca146a7eggkirrh1mjcc%40group.calendar.google.com&ctz=Australia%2FBrisbane",
  publicCalendarPageUrl:
    "https://calendar.google.com/calendar/u/0?cid=aWFsZGVxY2ExNDZhN2VnZ2tpcnJoMW1qY2NAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbQ",
  appsScriptWebAppUrl:
    "https://script.google.com/macros/s/AKfycbyUa3s3tvGno_AN38NvSSEPkqgnc9rvBVA7tojoPYJudOwHVrY2tccAUs1KL23-HzaQ/exec",
  musicTypes: [
    "Gigs",
    "Studio",
    "Rehearsal",
    "Teaching",
    "Other",
  ],
  links: [
    {
      label: "Drumming playlist 01",
      href: "https://youtube.com/playlist?list=PL_8ivkkFZ1zmoe2qx8dbGPfVy7ZP7q12y&si=M76VVkCVm__7Q1IK",
    },
    {
      label: "Drumming playlist 02",
      href: "https://youtube.com/playlist?list=PL_8ivkkFZ1zkivblrHKO9-zk4ai1O0L-r&si=SEW47Cl4z-hAc9W5",
    },
    {
      label: "Original music playlist",
      href: "https://youtube.com/playlist?list=PL_8ivkkFZ1zk04m7xzOuOB3AmPwNmMVkb&si=5iyFNOd8SOu_8RdV",
    },
  ],
};

const titleElement = document.getElementById("page-title");
const introElement = document.getElementById("page-intro");
const calendarEmbed = document.getElementById("calendar-embed");
const calendarLink = document.getElementById("calendar-link");
const calendarShell = document.getElementById("calendar-shell");
const calendarNote = document.getElementById("calendar-note");
const linksList = document.getElementById("links-list");
const bookingForm = document.getElementById("booking-form");
const musicTypeSelect = document.getElementById("music-type-select");
const timezoneInput = document.getElementById("timezone-input");
const startedAtInput = document.getElementById("started-at-input");
const submitButton = document.getElementById("submit-button");
const statusElement = document.getElementById("form-status");
const submissionFrame = document.querySelector('iframe[name="submission-frame"]');

let pendingSubmission = false;

titleElement.textContent = config.title;
introElement.textContent = config.intro;
timezoneInput.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
startedAtInput.value = String(Date.now());

if (config.publicCalendarPageUrl) {
  calendarLink.href = config.publicCalendarPageUrl;
  calendarLink.target = "_blank";
  calendarLink.rel = "noreferrer";
} else {
  calendarLink.href = "#availability";
}

if (config.publicCalendarEmbedUrl) {
  calendarEmbed.src = config.publicCalendarEmbedUrl;
  calendarNote.hidden = true;
} else {
  calendarShell.hidden = true;
  calendarNote.hidden = false;
}

config.musicTypes.forEach((type) => {
  const option = document.createElement("option");
  option.value = type;
  option.textContent = type;
  musicTypeSelect.appendChild(option);
});

config.links.forEach((link) => {
  const item = document.createElement("a");
  item.className = "resource-link";
  item.href = link.href;
  item.target = "_blank";
  item.rel = "noreferrer";
  item.textContent = link.label;
  linksList.appendChild(item);
});

function setStatus(message, state) {
  statusElement.textContent = message;
  statusElement.dataset.state = state;
}

function refreshCalendarEmbed() {
  if (!config.publicCalendarEmbedUrl) {
    return;
  }

  const refreshedUrl = new URL(config.publicCalendarEmbedUrl);
  refreshedUrl.searchParams.set("refresh", String(Date.now()));
  calendarEmbed.src = refreshedUrl.toString();
}

submissionFrame.addEventListener("load", () => {
  if (!pendingSubmission) {
    return;
  }

  pendingSubmission = false;
  submitButton.disabled = false;
  submitButton.textContent = "Create pencilled event";
  setStatus("Booking submitted. The calendar is refreshing now.", "success");
  bookingForm.reset();
  timezoneInput.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  startedAtInput.value = String(Date.now());

  window.setTimeout(() => {
    refreshCalendarEmbed();
    setStatus("Booking submitted and calendar refreshed.", "success");
  }, 600);
});

bookingForm.addEventListener("submit", (event) => {
  if (!config.appsScriptWebAppUrl) {
    event.preventDefault();
    setStatus(
      "Add your deployed Google Apps Script web app URL in app.js before using the form.",
      "error"
    );
    return;
  }

  bookingForm.action = config.appsScriptWebAppUrl;
  pendingSubmission = true;
  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  setStatus("Submitting booking and creating calendar event...", "");

  window.setTimeout(() => {
    if (!pendingSubmission) {
      return;
    }

    pendingSubmission = false;
    submitButton.disabled = false;
    submitButton.textContent = "Create pencilled event";
    setStatus(
      "The submission may have gone through, but the site did not get a confirmation response. Check the calendar and try again if needed.",
      "error"
    );
    startedAtInput.value = String(Date.now());
  }, 12000);
});
