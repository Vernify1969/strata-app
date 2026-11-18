import { sendDueAlerts } from "./documents.js";
import { captureExpiringHolds, moneySettings, releaseJobPayments } from "./payments.js";

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

function urgentJob(job) {
  return job.urgency === "urgent" || job.urgency === "after_hours" || job.urgency === "emergency";
}

export async function watchDeposits(db, mail, config, now = new Date()) {
  const settings = moneySettings(db, config);
  const jobs = db.prepare("SELECT * FROM jobs WHERE needs_prepay = 1 AND stage = 'approved' AND deposit_due_at != ''").all();
  let reminded = 0;
  let lapsed = 0;
  for (const job of jobs) {
    const paid = db.prepare("SELECT 1 AS ok FROM payments WHERE job_id = ? AND status = 'succeeded'").get(job.id);
    if (paid) continue;
    const due = Date.parse(job.deposit_due_at);
    const hours = urgentJob(job) ? settings.urgentDepositHours : settings.depositHours;
    const halfway = due - (hours * 3600 * 1000) / 2;
    if (!job.deposit_reminded_at && now.getTime() >= halfway && now.getTime() < due) {
      const manager = db.prepare("SELECT email FROM users WHERE id = ?").get(job.created_by);
      if (manager?.email) {
        await mail.send({
          to: manager.email,
          subject: "The deposit is still unpaid",
          text: `The deposit for "${job.title}" is still unpaid. Pay it before ${job.deposit_due_at} or the approval will lapse. No fee has been charged.`
        });
      }
      db.prepare("UPDATE jobs SET deposit_reminded_at = ? WHERE id = ?").run(now.toISOString(), job.id);
      reminded += 1;
    }
    if (now.getTime() >= due) {
      if (job.awarded_quote_id) db.prepare("UPDATE quotes SET status = 'open' WHERE id = ?").run(job.awarded_quote_id);
      const contractor = db.prepare("SELECT email FROM users WHERE id = ?").get(job.contractor_user_id);
      db.prepare(`UPDATE jobs SET stage = 'open', approved_cents = NULL, awarded_quote_id = NULL, contractor_user_id = NULL,
        needs_prepay = 0, pay_after = 1, deposit_due_at = '', deposit_reminded_at = '' WHERE id = ?`).run(job.id);
      db.prepare("INSERT INTO job_events (job_id, at, actor_name, body) VALUES (?, ?, ?, ?)").run(
        job.id, now.toISOString(), "TaskSpeck Strata", "The deposit was not paid in time. The approval has lapsed. No fee was charged."
      );
      if (contractor?.email) {
        await mail.send({
          to: contractor.email,
          subject: "The approval has lapsed",
          text: `The manager did not pay the deposit for "${job.title}" in time. You are free. No fee was charged and no money moved.`
        });
      }
      lapsed += 1;
    }
  }
  return { reminded, lapsed };
}

export async function runMaintenance(db, mail, config, now = new Date()) {
  const alerts = await sendDueAlerts(db, mail, todayIn("Australia/Melbourne", now));
  const released = await releaseExpiredReviews(db, config, now);
  const deposits = await watchDeposits(db, mail, config, now);
  const captures = await captureExpiringHolds(db, config, now);
  return { alerts, released, deposits, captures };
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
