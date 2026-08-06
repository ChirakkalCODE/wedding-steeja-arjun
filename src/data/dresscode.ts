/**
 * What to wear. Read by Dresscode.astro and nowhere else, but kept beside
 * wedding.ts so all the couple's own wording lives in one folder.
 */

export type DressGroup = {
  id: string;
  label: string;
  garment: string;
  /** Light to dark. The third entry doubles as the illustration's fill tone. */
  palette: readonly string[];
};

export const GROUPS: readonly DressGroup[] = [
  {
    id: 'ladies',
    label: 'Ladies',
    garment: 'Gowns in shades of peach',
    palette: ['#F3C6AE', '#E9AE8C', '#DE9773', '#C98263'],
  },
  {
    id: 'aunties',
    label: 'Aunties & elder ladies',
    garment: 'Sarees in shades of peach',
    palette: ['#F3C6AE', '#E9AE8C', '#DE9773', '#C98263'],
  },
  {
    id: 'gentlemen',
    label: 'Gentlemen',
    garment: 'Beige suits, or formal — white shirt and beige trousers',
    palette: ['#E5D9C3', '#D9C6A5', '#C9B393', '#B49E7C'],
  },
  // A fourth group for children is expected but the couple has not decided a
  // rule yet. Left commented rather than filled in with a guess — uncomment and
  // supply `garment` and `palette` when they have. The component, the pill tabs
  // and the panel CSS all handle a fourth entry with no further changes.
  // {
  //   id: 'children',
  //   label: 'Children',
  //   garment: '',
  //   palette: [],
  // },
];

export type AvoidColour = { hex: string; name: string };

/** Shown struck through, never copyable. */
export const AVOID: readonly AvoidColour[] = [
  { hex: '#FFFFFF', name: 'White' },
  { hex: '#F5EFE6', name: 'Cream' },
];
