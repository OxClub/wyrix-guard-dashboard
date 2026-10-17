import { jsPDF } from "jspdf";
import type { ReportSnapshot } from "./types";
import { accuracyLabel, fmtDate } from "./format";

/** Builds the recovery report PDF. Owner claims and app-verified records are kept visibly separate. */
export function buildReportPdf(s: ReportSnapshot): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = 48;
  const line = (text: string, size = 10, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size);
    for (const l of doc.splitTextToSize(text, 500) as string[]) {
      if (y > 780) { doc.addPage(); y = 48; }
      doc.text(l, 48, y); y += size + 5;
    }
  };
  line("WYRIX GUARD - Device Recovery Report", 16, true);
  line(`Generated: ${fmtDate(s.generated_at)}`);
  line("This is an owner-generated summary from app records. It is NOT an official police or telecom document.", 9);
  y += 8;
  line("A. Owner claims (entered by the account holder, not verified)", 12, true);
  line(`Device name: ${s.owner_claims.device_name}`);
  line(`IMEI (owner-entered): ${s.owner_claims.imei ?? "not provided"}`);
  if (s.owner_claims.note) line(`Note: ${s.owner_claims.note}`);
  y += 8;
  line("B. Verified app records (reported by the enrolled device to WYRIX GUARD)", 12, true);
  const v = s.verified_records;
  line(`Device key fingerprint: ${v.device_key_fingerprint}`);
  line(`Enrolled with owner consent at: ${fmtDate(v.enrolled_with_consent_at)}`);
  line(`Last sync: ${fmtDate(v.last_sync_at)}`);
  if (v.last_location) {
    line(`Last confirmed location: ${v.last_location.latitude.toFixed(6)}, ${v.last_location.longitude.toFixed(6)}`);
    line(`Accuracy: ${accuracyLabel(v.last_location.accuracy_m).text}; recorded ${fmtDate(v.last_location.recorded_at)}`);
    line(`Map: https://www.openstreetmap.org/?mlat=${v.last_location.latitude}&mlon=${v.last_location.longitude}#map=17/${v.last_location.latitude}/${v.last_location.longitude}`, 8);
  } else line("Last confirmed location: none recorded");
  y += 8;
  line("Recent security events", 12, true);
  if (!v.recent_events.length) line("None recorded");
  v.recent_events.forEach((e) => line(`${fmtDate(e.occurred_at)} - ${e.type}`));
  y += 8;
  line("Limits: location may be out of date or approximate. The phone cannot be located by IMEI alone; to block a stolen phone contact your operator and your national registry (e.g. CEIR / Sanchar Saathi in India).", 9);
  return doc.output("blob");
}
