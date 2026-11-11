import test from "node:test";
import assert from "node:assert/strict";
import { approvalFor, depositCents, feeOfCents, gstInCents, invoiceDecision, reviewEndsAt } from "../src/rules.js";

const tiers = [
  { limitCents: 99900, quotes: 1 },
  { limitCents: 499900, quotes: 2 },
  { limitCents: 3000000, quotes: 3 }
];

test("the fee, the GST and the payout add up to the price in cents", () => {
  for (const gstOnFee of [false, true]) {
    for (let cents = 1; cents <= 300000; cents += 1) {
      const split = feeOfCents(cents, 15, gstOnFee);
      assert.equal(split.fee + split.gst + split.net, cents);
    }
  }
  assert.deepEqual(feeOfCents(10), { fee: 2, gst: 0, net: 8 });
  assert.deepEqual(feeOfCents(250), { fee: 38, gst: 0, net: 212 });
  assert.equal(gstInCents(22000), 2000);
});

test("a higher total needs the quotes for that budget, and fewer quotes need a reason", () => {
  const low = approvalFor({ world: "common", role: "building_manager", urgency: "standard", priceCents: 150000, tiers, quoteCount: 1 });
  assert.equal(low.need, 2);
  assert.equal(low.ok, false);
  const withReason = approvalFor({ world: "common", role: "building_manager", urgency: "standard", priceCents: 150000, tiers, quoteCount: 1, fewerReason: "Only one licensed plumber answered" });
  assert.equal(withReason.ok, false);
  assert.equal(withReason.missing.includes("OC Manager approval"), true);
  const ready = approvalFor({ world: "common", role: "building_manager", urgency: "standard", priceCents: 150000, tiers, quoteCount: 2, approvals: { oc: true } });
  assert.equal(ready.ok, true);
  const emergency = approvalFor({ world: "common", role: "building_manager", urgency: "emergency", priceCents: 150000, emLimitCents: 200000, tiers, quoteCount: 1 });
  assert.equal(emergency.name, "Emergency approval");
  assert.equal(emergency.ok, true);
});

test("an invoice above the approved total is not payable", () => {
  const held = invoiceDecision({ invoiceCents: 110000, approvedCents: 100000, paidCents: 0 });
  assert.equal(held.hold, true);
  assert.equal(held.dueCents, 0);
  const ok = invoiceDecision({ invoiceCents: 100000, approvedCents: 100000, paidCents: 25000 });
  assert.equal(ok.hold, false);
  assert.equal(ok.dueCents, 75000);
  assert.equal(depositCents(33333, 25), 8333);
});

test("a review that lands on a weekend stays open until 5 pm on the next working day", () => {
  const fridayEvening = Date.parse("2026-06-05T07:00:00.000Z");
  const holidays = ["2026-06-08"];
  const end = reviewEndsAt(fridayEvening, holidays, "Australia/Melbourne");
  assert.equal(end.extended, true);
  assert.equal(end.localDay, "2026-06-09");
});
