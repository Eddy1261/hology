// Tutorial artwork — component-only module (node:test never loads this).
// Order matches TUTORIAL_SLIDES.

import slide1 from "../assets/tutorial/slide-1-connect.svg";
import slide2 from "../assets/tutorial/slide-2-software.svg";
import slide3 from "../assets/tutorial/slide-3-capabilities.svg";
import slide4 from "../assets/tutorial/slide-4-help.svg";
import slide5 from "../assets/tutorial/slide-5-ready.svg";

export const TUTORIAL_ARTWORK: string[] = [slide1, slide2, slide3, slide4, slide5];
