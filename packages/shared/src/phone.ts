// Egyptian mobile numbers, stored in one form: 01xxxxxxxxx (11 digits).
// Accepts +20, 0020, spaces and dashes.
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/[\s\-()]/g, '');
  // Arabic-Indic digits to Latin digits
  digits = digits.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  if (digits.startsWith('+20')) digits = '0' + digits.slice(3);
  else if (digits.startsWith('0020')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('20') && digits.length === 12) digits = '0' + digits.slice(2);
  return /^01[0125]\d{8}$/.test(digits) ? digits : null;
}

// For logs: 010****5678 (docs/technical/04-security.md)
export function maskPhone(phone: string): string {
  if (phone.length < 7) return '****';
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}
