/**
 * The people a guest can actually ring. This is the section elderly guests will
 * use on a phone, so the numbers are plain text in the markup and the links are
 * ordinary hrefs — no obfuscation, no script-assembled addresses. A screen
 * reader or an old browser gets a working link, which matters more here than
 * making life slightly harder for a scraper.
 */
export type Contact = {
  name: string;
  /** E.164, no spaces or punctuation — this is what goes in tel: and wa.me. */
  phone: string;
  /** Grouped for reading aloud and for copying by hand. */
  display: string;
  whatsapp: boolean;
  /** Rendered as a small pill; only shown when set. */
  note?: string;
  /**
   * Unset for now. When the couple says who handles travel, the church and the
   * reception, filling this in is a data edit — the card already renders it.
   */
  role?: string;
};

export const CONTACTS: readonly Contact[] = [
  { name: 'Nizar', phone: '+916282185195', display: '+91 6282 185 195', whatsapp: true },
  { name: 'Amal', phone: '+919446049344', display: '+91 94460 49344', whatsapp: true },
  { name: 'Adam', phone: '+918113984805', display: '+91 81139 84805', whatsapp: true },
  {
    name: 'Stajin',
    phone: '+41765334165',
    display: '+41 76 533 41 65',
    whatsapp: true,
    // Kept in the card itself rather than tucked away at the end: for guests
    // flying from Switzerland this is the number they want first.
    note: 'Switzerland',
  },
];

/** Straight apostrophe on purpose — this travels through a URL into a chat box. */
const OPENING_MESSAGE = "Hello, I have a question about Steeja & Arjun's wedding.";

/** wa.me wants the digits alone: no plus, no spaces. */
export function whatsappLink(contact: Contact): string {
  return `https://wa.me/${contact.phone.replace(/\D/g, '')}?text=${encodeURIComponent(OPENING_MESSAGE)}`;
}
