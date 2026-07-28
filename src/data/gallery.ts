import type { ImageMetadata } from 'astro';

// Derived 1920px masters, never the originals — see scripts/prepare-media.mjs.
import epk03357 from '../assets/photos/gallery/EPK03357.jpg';
import epk03505 from '../assets/photos/gallery/EPK03505.jpg';
import epk03516 from '../assets/photos/gallery/EPK03516.jpg';
import epk03533 from '../assets/photos/gallery/EPK03533.jpg';
import epw00926 from '../assets/photos/gallery/EPW00926.jpg';
import epw01498 from '../assets/photos/gallery/EPW01498.jpg';
import epw09695 from '../assets/photos/gallery/EPW09695.jpg';
import epw09924 from '../assets/photos/gallery/EPW09924.jpg';

export type GalleryPhoto = {
  src: ImageMetadata;
  /** What is happening in the frame. Never "wedding photo". */
  alt: string;
  orientation: 'portrait' | 'landscape';
};

/**
 * Adding a photo later is one line here and nothing else: the grid, the
 * lightbox and the reveal stagger are all driven off this array.
 *
 * The set mixes black and white with colour and portrait with landscape on
 * purpose. Nothing below normalises that.
 */
export const PHOTOS: readonly GalleryPhoto[] = [
  {
    src: epw09695,
    alt: 'Steeja and Arjun sitting on a ledge in front of an ochre wall painted with a large white bird, both looking off to one side.',
    orientation: 'portrait',
  },
  {
    src: epk03357,
    alt: "Looking down from above at the hem of Steeja's red checked dress and her white trainers on the ledge, beside a faded figure painted on the wall below.",
    orientation: 'landscape',
  },
  {
    src: epw00926,
    alt: 'Steeja laughing with her head tipped back as Arjun leans in close, lit warmly against the dark.',
    orientation: 'portrait',
  },
  {
    src: epk03505,
    alt: 'Black and white: a street lamp burning above a narrow lane at night, with Steeja and Arjun standing close together beneath it, foreheads almost touching.',
    orientation: 'portrait',
  },
  {
    src: epw01498,
    alt: 'On a lamplit street after dark, Steeja lifts her arm and turns towards Arjun, who holds her hand as she spins.',
    orientation: 'portrait',
  },
  {
    src: epk03516,
    alt: 'Black and white close-up of the two of them in the dark, her head tipped back mid-laugh against his shoulder, her hand resting on his chest.',
    orientation: 'portrait',
  },
  {
    src: epw09924,
    alt: 'Steeja walking along a low ledge with her arms out for balance in front of the yellow wall, Arjun reaching up behind her.',
    orientation: 'portrait',
  },
  {
    src: epk03533,
    alt: 'Black and white: Arjun throws a fist into the air mid-laugh while Steeja grins beside him.',
    orientation: 'portrait',
  },
];
