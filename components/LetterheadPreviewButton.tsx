"use client";

// Opens a sample PDF in the letterhead colourway currently ticked in the picker,
// so Lorna can see a colour before committing to it — no need to finalise a plan.
// Reads the selected radio live, so it previews the selection even before Save.
export default function LetterheadPreviewButton() {
  function preview() {
    const el = document.querySelector<HTMLInputElement>('input[name="letterhead_template"]:checked');
    const template = el?.value ?? "classic-gold";
    window.open(`/api/letterhead-preview?template=${encodeURIComponent(template)}`, "_blank", "noopener");
  }
  return (
    <button type="button" className="btn--sm" onClick={preview} style={{ justifySelf: "start", width: "fit-content" }}>
      Preview selected letterhead ↗
    </button>
  );
}
