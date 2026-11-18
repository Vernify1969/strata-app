import { sendDueAlerts } from "./documents.js";
import { releaseJobPayments } from "./payments.js";

const THREE_HOURS = 3 * 60 * 60 * 1000;

function todayIn(timeZone, now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function releaseExpiredReviews(db, config, now = new Date()) {
  const due = db.prepare(`SELECT * FROM jobs
    WHERE stage IN ('review0', 'review1') AND review_ends_at != '' AND review_ends_at <= ?`).all(now.toISOString());
  let released = 0;
  for (const job of due) {
    await releaseJobPayments(db, config, job);
    db.prepare("UPDATE jobs SET stage = 'released' WHERE id = ?").run(job.id);
    db.prepare("INSERT INTO job_events (job_id, at, actor_name, body) VALUES (?, ?, ?, ?)").run(
      job.id, now.toISOString(), "TaskSpeck Strata",
      "The review window ended with no manager action, so the held payment was released."
    );
    released += 1;
  }
  return released;
}

export async function runMaintenance(db, mail, config, now = new Date()) {
  const alerts = await sendDueAlerts(db, mail, todayIn("Australia/Melbourne", now));
  const released = await releaseExpiredReviews(db, config, now);
  return { alerts, released };
}

export function startMaintenance({ db, mail, config }) {
  const run = () => {
    runMaintenance(db, mail, config).catch(err => {
      console.error("The daily check failed:", err instanceof Error ? err.message : "unknown error");
    });
  };
  run();
  const timer = setInterval(run, THREE_HOURS);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}

// TODO(owner): unpaid deposit expiry is not built. Nick has not decided it yet.
