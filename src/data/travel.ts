/**
 * Travel and accommodation.
 *
 * Nothing in this file may be guessed. Distances, drive times, taxi fares,
 * flight routes and visa timelines all change, and a wrong one sends a guest to
 * the wrong place or the wrong desk. Anything the couple has not supplied stays
 * a TODO and simply does not render.
 */

export type PriceBand = 'budget' | 'mid' | 'upscale';

export type Hotel = {
  name: string;
  area: string;
  /** Optional: omitted from the card entirely rather than rendered empty. */
  distanceNote?: string;
  priceBand: PriceBand;
  link?: string;
  phone?: string;
};

export const AIRPORT = {
  code: 'COK',
  name: 'Cochin International Airport',
  area: 'Nedumbassery',
  note: 'The reception venue is in Nedumbassery, right by the airport.',
} as const;

/**
 * TODO: the couple has not sent recommendations yet. While this is empty the
 * section renders one quiet placeholder card in the grid, so the block keeps
 * its shape instead of collapsing.
 *
 * Shape when filled:
 *   { name, area, distanceNote, priceBand: 'budget' | 'mid' | 'upscale',
 *     link, phone }
 */
export const HOTELS: readonly Hotel[] = [];

/** Shown in place of the grid until HOTELS has entries. */
export const HOTELS_PENDING =
  'Hotel recommendations are on their way — please check back closer to the date.';

export const PRICE_BAND_LABEL: Record<PriceBand, string> = {
  budget: 'Budget',
  mid: 'Mid-range',
  upscale: 'Upscale',
};

/**
 * The official portal, linked rather than summarised. Requirements, processing
 * times and fees change without notice; freezing any of them into this page
 * would be worse than saying nothing.
 */
export const EVISA_URL = 'https://indianvisaonline.gov.in';
