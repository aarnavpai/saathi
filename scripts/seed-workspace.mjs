#!/usr/bin/env node
// Seeds ./workspace with a believable personal file system for the demo.
// Text files are written directly; PDFs and the Hindi notice are rendered with
// ImageMagick (pango) and slightly rotated + noised so they look like scans,
// which is what Sarvam Vision (Doc AI) is for.
//
//   node scripts/seed-workspace.mjs           # create missing files
//   node scripts/seed-workspace.mjs --reset   # wipe workspace + DB first

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(process.env.WORKSPACE_DIR ?? "workspace");
const reset = process.argv.includes("--reset");

if (reset) {
  fs.rmSync(ROOT, { recursive: true, force: true });
  for (const f of ["saathi.db", "saathi.db-wal", "saathi.db-shm"]) {
    fs.rmSync(path.resolve("data", f), { force: true });
  }
  console.log("reset workspace and database");
}

function write(rel, content) {
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs)) return;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${content.trim()}\n`);
  console.log("  +", rel);
}

// Render pango markup to a "scanned" PNG or PDF.
function scan(rel, markup, { font = "Noto Sans 15", rotate = 0.35 } = {}) {
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs)) return;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saathi-"));
  const src = path.join(tmp, "page.pango");
  fs.writeFileSync(src, `<span font="${font}">${markup}</span>`);
  execFileSync("magick", [
    "-size",
    "1100x",
    "-background",
    "white",
    `pango:@${src}`,
    "-bordercolor",
    "white",
    "-border",
    "80",
    "-background",
    "#fbfaf6",
    "-rotate",
    String(rotate),
    "-attenuate",
    "0.25",
    "+noise",
    "Gaussian",
    "-colorspace",
    "Gray",
    "-quality",
    "85",
    abs,
  ]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("  +", rel, "(scanned)");
}

console.log(`seeding ${ROOT}`);

// ---------------------------------------------------------------- Documents

scan(
  "Documents/rent-agreement-2025.pdf",
  `<span size="x-large" weight="bold">RENTAL AGREEMENT</span>

This Rental Agreement is made at Bengaluru on <b>1st November 2025</b> between
<b>Mr. Rajesh Kulkarni</b> ("Owner"), residing at 14, 6th Cross, Jayanagar, Bengaluru 560041,
and <b>the Tenant</b>, for the residential premises at
<b>Flat 302, Lakeview Residency, 12th Main, Indiranagar, Bengaluru 560038</b>.

<b>1. Term.</b> 11 (eleven) months commencing 01-11-2025, renewable by mutual consent.

<b>2. Rent.</b> Monthly rent of <b>Rs. 28,000/- (Rupees Twenty-Eight Thousand only)</b>,
payable on or before the <b>5th of every month</b> by bank transfer.

<b>3. Security Deposit.</b> The Tenant has paid an interest-free refundable deposit of
<b>Rs. 1,40,000/- (Rupees One Lakh Forty Thousand only)</b>, refundable within 15 days of
vacating, after deducting unpaid dues and damages beyond normal wear and tear.

<b>4. Revision.</b> Upon renewal, rent may be revised by a maximum of <b>5% (five percent)</b>,
with one month's written notice to the Tenant.

<b>5. Maintenance.</b> Society maintenance charges of Rs. 3,500/- per month are payable by the Tenant.
Major repairs (plumbing, electrical wiring, structural) are the Owner's responsibility.

<b>6. Notice Period.</b> Either party may terminate with <b>two (2) months'</b> written notice.

<b>7. Restrictions.</b> No subletting. Pets allowed with prior consent. No structural alterations.

Signed:  ______________ (Owner)          ______________ (Tenant)
Witness: Anil Deshpande, Suresh Nair`,
);

scan(
  "Documents/flight-ticket-6E6213.pdf",
  `<span size="x-large" weight="bold">IndiGo  ·  E-Ticket / Itinerary</span>

<b>PNR:</b> K7QZ4M        <b>Booking date:</b> 02 Oct 2026        <b>Status:</b> CONFIRMED

<b>Flight 6E 6213</b>   Bengaluru (BLR) T1  →  Goa Mopa (GOX)
<b>Date:</b> Saturday, 31 Oct 2026
<b>Departure:</b> 06:15        <b>Arrival:</b> 07:35        <b>Duration:</b> 1h 20m

<b>Passengers</b>
  1. Primary passenger     Seat 14C     15 kg check-in + 7 kg cabin
  2. Karthik Rao           Seat 14D     15 kg check-in + 7 kg cabin

<b>Fare summary</b>
  Base fare (2 adults)          Rs. 7,840
  Taxes &amp; fees                    Rs. 1,912
  Seat selection                  Rs.   700
  <b>Total paid                     Rs. 10,452</b>

Return: 6E 6214, Mon 02 Nov 2026, GOX 20:10 → BLR 21:25

Web check-in opens 48 hours before departure. Gate closes 25 minutes before departure.`,
  { rotate: -0.4 },
);

scan(
  "Documents/society-notice.png",
  `<span size="xx-large" weight="bold">लेकव्यू रेजीडेंसी वेलफेयर एसोसिएशन</span>
<span size="large">सूचना  ·  दिनांक 15 अक्टूबर 2026</span>

सभी निवासियों को सूचित किया जाता है कि:

<b>1. पानी की आपूर्ति बंद:</b> मंगलवार, 20 अक्टूबर को सुबह 10 बजे से शाम 4 बजे तक
पानी की टंकी की सफाई के कारण पानी की आपूर्ति बंद रहेगी। कृपया पहले से पानी भर कर रखें।

<b>2. रखरखाव शुल्क:</b> अक्टूबर माह का रखरखाव शुल्क ₹3,500 है, जिसे <b>25 अक्टूबर</b> तक
जमा करना अनिवार्य है। देरी पर ₹200 का विलंब शुल्क लगेगा।

<b>3. दिवाली उत्सव:</b> 7 नवंबर, शनिवार शाम 7 बजे क्लबहाउस में दिवाली मिलन समारोह।
प्रत्येक फ्लैट से ₹500 का योगदान अपेक्षित है। रंगोली प्रतियोगिता भी होगी।

<b>4. पार्किंग:</b> आगंतुकों के वाहन केवल बेसमेंट 2 में खड़े करें।

सचिव, एल.आर.डब्ल्यू.ए.
संपर्क: 98450 66778`,
  { font: "Noto Sans Devanagari 16", rotate: 0.6 },
);

// ---------------------------------------------------------------- Finance

scan(
  "Finance/salary-slip-sep-2026.pdf",
  `<span size="x-large" weight="bold">TechWave Solutions Pvt. Ltd.</span>
Payslip for the month of <b>September 2026</b>

Employee ID: TW-2291        Designation: Software Engineer II        Department: Platform
PAN: XXXXX1234X             Bank A/c: XXXXXXXX4471 (HDFC)            Days paid: 30

<b>Earnings</b>                                 <b>Deductions</b>
Basic Salary          Rs. 62,500           Provident Fund         Rs.  7,500
House Rent Allowance  Rs. 31,250           Professional Tax       Rs.    200
Special Allowance     Rs. 38,750           Income Tax (TDS)       Rs. 18,430
Internet Reimb.       Rs.  1,500           Group Health Ins.      Rs.    850

<b>Gross Earnings       Rs. 1,34,000</b>        <b>Total Deductions       Rs. 26,980</b>

<span size="large"><b>NET PAY: Rs. 1,07,020</b></span>  (Rupees One Lakh Seven Thousand Twenty only)

This is a computer-generated payslip and does not require a signature.`,
);

write(
  "Finance/expenses-oct-2026.csv",
  `date,category,description,amount_inr
2026-10-01,rent,October rent to Rajesh Kulkarni,28000
2026-10-01,utilities,BESCOM electricity,1840
2026-10-02,travel,Goa flights 6E 6213/6214 (2 pax),10452
2026-10-03,groceries,BigBasket weekly,2310
2026-10-05,subscriptions,Spotify + YouTube Premium,328
2026-10-06,food,Dinner at Toit with team,2150
2026-10-08,health,Pharmacy - Maa's medicines,1260
2026-10-09,groceries,Zepto,890
2026-10-11,shopping,Diwali kurta (Fabindia),3499
2026-10-12,utilities,Airtel fiber,1178
2026-10-13,food,Swiggy,640
2026-10-14,transport,Namma Metro card recharge,1000
2026-10-15,groceries,BigBasket weekly,2675
2026-10-16,maintenance,Society maintenance October,3500`,
);

// ---------------------------------------------------------------- Work

write(
  "Work/meeting-notes-2026-10-14.md",
  `# Platform sync — 14 Oct 2026

Attendees: Priya (manager), me, Arjun, Neha

## Decisions
- Migrate the notification service to the new queue by **Nov 15**.
- Freeze the old REST v1 endpoints after the Diwali release.

## Action items
- [ ] Me: write the migration RFC and share by **Oct 21**
- [ ] Arjun: load-test the new queue at 5k msg/s
- [ ] Neha: update the on-call runbook
- [ ] Priya: get budget approval for the extra staging cluster

## Notes
Priya wants a short demo of the RFC prototype in sprint planning.`,
);

write(
  "Work/q4-roadmap.md",
  `# Q4 2026 roadmap (Platform)

| Month | Goal | Owner |
|---|---|---|
| October | Queue migration RFC, Diwali release | me, Priya |
| November | Notification service on new queue (Nov 15), v1 freeze | Arjun, me |
| December | Cost review, staging cluster cleanup | Neha |

Risks: holiday season traffic spike, staging cluster budget not yet approved.`,
);

write(
  "Work/hackathon-pitch.md",
  `# Saathi — vibeathon pitch

**One line:** a voice-first personal assistant that actually lives in your files, mail and calendar — in your language.

Demo script:
1. "What's in my documents?" → folder pops out
2. Hindi: "society notice mein kya likha hai?" → Sarvam Vision reads a scanned Hindi notice
3. "Landlord ne rent badhane ka mail bheja hai, agreement mein kya likha hai?" → cross-references email + PDF clause
4. "Draft a reply saying 5% is fine" → email card → "send it"
5. "Add the plumber visit to my calendar"`,
);

// ---------------------------------------------------------------- Notes

write(
  "Notes/todo.md",
  `# To do

- [ ] Reply to landlord about rent revision
- [ ] Book Diwali train tickets home (Pune) — Maa asked
- [ ] Pay society maintenance before the 25th
- [ ] Migration RFC draft (due Oct 21)
- [ ] Web check-in for Goa flight (opens Oct 29)
- [x] Buy Diwali kurta
- [ ] Renew bike insurance (expires Nov 3)`,
);

write(
  "Notes/goa-trip-plan.md",
  `# Goa trip — 31 Oct to 2 Nov

With Karthik. Flights booked (6E 6213 out, 6E 6214 back).

## Stay
Shortlist in Assagao: Casa Anjo (₹6,200/night), The Tamarind (₹4,800/night). Not booked yet!

## Plan
- Sat: land, scooter rental, Anjuna sunset, dinner at Gunpowder
- Sun: Chapora fort, Thalassa, flea market
- Mon: Fontainhas walk, Panjim, flight back 20:10

## Budget
Flights ₹10,452 (paid). Target total ₹25k each.`,
);

write(
  "Notes/books-to-read.md",
  `# Books

- The Ministry of Utmost Happiness — Arundhati Roy
- Gödel, Escher, Bach (still on chapter 3…)
- Raag Darbari — Shrilal Shukla (Hindi)
- Designing Data-Intensive Applications, 2nd ed.`,
);

// ---------------------------------------------------------------- Personal

write(
  "Personal/dal-makhani-recipe.md",
  `# Dal Makhani (Maa style)

**Serves 4 · 8 hr soak + 1.5 hr cook**

## Saamagri
- 1 cup sabut urad dal + 1/4 cup rajma, raat bhar bhigo ke
- 2 tbsp butter, 2 tbsp ghee, 1/2 cup fresh cream
- 1 cup tomato puree, 1 tbsp adrak-lehsun paste
- 1 tsp kashmiri lal mirch, 1/2 tsp garam masala, 1 tsp kasuri methi
- Namak swaad anusaar

## Vidhi
1. Dal aur rajma ko 5 cup paani ke saath 6-7 seeti tak pressure cook karo.
2. Kadhai mein ghee + butter garam karo, adrak-lehsun paste 1 minute bhuno.
3. Tomato puree, mirch daal ke tel chhodne tak pakao (8-10 min).
4. Dal milao, halki aanch pe kam se kam 45 minute pakao — beech beech mein masher se dabao.
5. Cream, garam masala, kasuri methi daal ke 5 minute aur. Upar se makhan!

> Maa ka secret: raat bhar dum pe chhod do, agle din aur achhi lagti hai.`,
);

write(
  "Personal/maa-ki-dawai.txt",
  `माँ की दवाइयाँ (डॉ. समीर जोशी, 2 अक्टूबर 2026)

सुबह खाली पेट:  थायरोनॉर्म 50 mcg — 1 गोली
नाश्ते के बाद:   टेल्मा 40 — 1 गोली (बीपी)
                 शेलकैल 500 — 1 गोली (कैल्शियम)
रात खाने के बाद: अटोर्वा 10 — 1 गोली (कोलेस्ट्रॉल)

अगली जाँच: 2 नवंबर — खून की जाँच (थायरॉइड, लिपिड प्रोफाइल) खाली पेट।
दवा ख़त्म होने वाली है: टेल्मा 40 (5 गोलियाँ बचीं)`,
);

write(
  "Personal/diwali-gift-list.md",
  `# Diwali gifts

| For | Idea | Budget | Status |
|---|---|---|---|
| Maa | Kanjeevaram silk saree | ₹8,000 | shortlisted |
| Papa | Kindle Paperwhite | ₹14,000 | — |
| Didi | Silver jhumkas | ₹3,500 | bought |
| Karthik | Goa trip covers it :) | — | — |
| Society secretary | Dry fruits box | ₹1,200 | — |`,
);

console.log("done");
