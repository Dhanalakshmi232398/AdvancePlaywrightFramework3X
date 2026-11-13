export const CHECKOUT_CUSTOMER_PROMPT = `
Generate fictional checkout customer data for an automated test.
Return only a JSON object with exactly these string fields:
{
  "firstName": "...",
  "lastName": "...",
  "postalCode": "..."
}
Use invented names and synthetic data; never use real people's personal data.
firstName and lastName must each be 1-50 letters, optionally with spaces, hyphens, or apostrophes.
postalCode must be exactly 5 numeric digits.
Do not use placeholders, labels, or explanatory text as values.
`.trim();
