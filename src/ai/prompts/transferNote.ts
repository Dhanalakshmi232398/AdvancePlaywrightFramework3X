export const TRANSFER_NOTE_PROMPT = `
Generate a short, fictional note for a Travel-category bank transfer.
Return only a JSON object with exactly this string field:
{
  "note": "..."
}
The note must be 1-60 characters, suitable for a transfer note field.
Do not include real personal, account, or payment-card information.
Do not use placeholders, labels, or explanatory text as the note.
`.trim();
