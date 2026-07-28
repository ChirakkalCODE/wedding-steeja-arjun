/**
 * Questions and answers.
 *
 * `answer` carries a little inline markup (links, emphasis) and is rendered
 * with `set:html`. That is safe here and only here: every string below is
 * authored by us and checked into the repo. Nothing from a form, a URL or a
 * guest ever reaches this field.
 */
export type FaqItem = {
  id: string;
  question: string;
  /** Trusted HTML — see the note above. */
  answer: string;
};

export const FAQ: readonly FaqItem[] = [
  {
    id: 'rsvp-by',
    question: 'When should we let you know?',
    answer:
      'Please reply by 20 August 2026. We kindly ask you to tell us whether you’ll be able to join us by then — it helps us plan seating and food.',
  },
  {
    id: 'what-to-wear',
    question: 'What should we wear?',
    // Links rather than repeating the palette: one place to change a colour.
    answer:
      'Ladies: gowns in shades of peach. Aunties and elder ladies: sarees in shades of peach. Gentlemen: beige suits. We kindly ask our female guests to avoid white and cream, as those are reserved for the bride. You’ll find the exact colours <a href="#dresscode">further up the page</a>.',
  },
  {
    id: 'parking',
    question: 'Where can we park?',
    answer:
      'Parking is available right next to the venue, so it’s easy to arrive by car.',
  },
  {
    id: 'arrival',
    question: 'What time should we arrive?',
    answer:
      'Please be seated in the church by 3:10 PM — the ceremony begins shortly after. Do allow time for parking and the short walk, so you can settle in calmly before the service starts.',
  },
  {
    id: 'photos',
    question: 'Can we take photos?',
    answer:
      'We have professional photographers with us all day, so you can simply enjoy the moments. During the ceremony in the church we kindly ask that no phones or cameras are used, so everyone can be fully present. Afterwards, at the reception, please take as many photos as you like.',
  },

  // TODO — REVIEW BEFORE LAUNCH. The two questions below were not supplied by
  // the couple; they were written to cover cases the rest of the site already
  // implies (children are invited, and companions are entered by name on the
  // reply form). The substance follows from those decisions, but the wording is
  // ours and should be read over before the link is shared.
  {
    id: 'children',
    question: 'Are children welcome?',
    answer:
      'Yes — children are very welcome. Please add their names when you reply, so we can plan seating and food for them.',
  },
  {
    id: 'plus-ones',
    question: 'Can we bring someone with us?',
    answer:
      'Please add every person coming with you by name when you reply, so we can count correctly.',
  },
  // END OF QUESTIONS TO REVIEW.

  {
    id: 'help',
    question: 'Who can we ask if something is unclear?',
    answer:
      'Our brothers are happy to help with anything at all — you’ll find their numbers at the <a href="#contact">bottom of this page</a>.',
  },
];
