import type { PosterExample } from "./poster-examples";

export const PRACTICAL_POSTER_IDEAS = [
  {
    id: "weekend-sale",
    label: "Weekend sale",
    style: "business",
    prompt:
      'Create a vertical 4:5 retail sale poster. Use a bold cobalt blue and warm cream palette, oversized clean typography and a simple paper shopping bag illustration. Render only this exact copy: "WEEKEND SALE", "UP TO 30% OFF", "FRIDAY–SUNDAY", and "SHOP IN STORE". Make the discount the focal point, with generous margins and a clear call to action. Flat, full-bleed finished poster; no frame, mockup, watermark or extra text.',
    image: "/examples/ideas/weekend-sale.webp",
    alt: "Weekend sale poster with oversized cobalt blue discount typography and a shopping bag illustration on cream.",
  },
  {
    id: "coffee-special",
    label: "Coffee shop special",
    style: "vintage",
    prompt:
      'Create a vertical 4:5 coffee shop poster announcing a seasonal drink. Use warm terracotta, cream and espresso brown, a beautifully lit iced latte with a swirl of caramel, and restrained editorial typography. Render only this exact copy: "HELLO, CARAMEL", "ICED CARAMEL LATTE", "YOUR NEW AFTERNOON FAVOURITE", and "TRY IT TODAY". Make the drink prominent and the headline easy to read. Flat, full-bleed finished poster; no frame, mockup, watermark or extra text.',
    image: "/examples/ideas/coffee-special.webp",
    alt: "Caramel iced latte poster with terracotta headline and a large drink photograph on cream.",
  },
  {
    id: "now-hiring",
    label: "Now hiring",
    style: "minimal",
    prompt:
      'Create a vertical 4:5 recruitment poster for a neighbourhood cafe. Use a crisp forest green and ivory palette, bold approachable typography, and a small line illustration of a coffee cup. Render only this exact copy: "WE ARE HIRING", "BARISTAS & CAFE TEAM", "PART-TIME & FULL-TIME", "FRIENDLY TEAM • FLEXIBLE SHIFTS", and "APPLY IN STORE". Prioritise the hiring headline, followed by roles and a clear application action. Flat, full-bleed finished poster; no frame, mockup, watermark or extra text.',
    image: "/examples/ideas/now-hiring.webp",
    alt: "Forest green and ivory cafe recruitment poster advertising barista and cafe team roles.",
  },
  {
    id: "community-market",
    label: "Community market",
    style: "vintage",
    prompt:
      'Create a vertical 4:5 community fundraising market poster. Use sunny yellow, leafy green and warm cream with cheerful hand-cut illustrations of plants, handmade crafts and market stalls. Render only this exact copy: "COMMUNITY MARKET", "LOCAL MAKERS • GOOD FOOD • GREAT CAUSES", "SATURDAY 12 JUNE", "10 AM–4 PM", "RIVERSIDE PARK", and "FREE ENTRY". Keep the date, time and location legible and grouped together. Flat, full-bleed finished poster; no frame, mockup, watermark or extra text.',
    image: "/examples/ideas/community-market.webp",
    alt: "Yellow and green community market poster with illustrated stalls, plants and handmade crafts.",
  },
  {
    id: "fitness-class",
    label: "Fitness trial class",
    style: "business",
    prompt:
      'Create a vertical 4:5 fitness studio poster promoting a free beginner class. Use energetic orange and charcoal, a dynamic photograph of an adult doing a bodyweight lunge, and bold contemporary typography. Render only this exact copy: "START STRONG", "FREE BEGINNER FITNESS CLASS", "SATURDAY • 9 AM", "ALL LEVELS WELCOME", and "BOOK YOUR SPOT". Keep the subject clear of the text and make the free class offer and booking action prominent. Flat, full-bleed finished poster; no frame, mockup, watermark or extra text.',
    image: "/examples/ideas/fitness-class.webp",
    alt: "Orange and charcoal fitness trial poster with an adult performing a lunge and a beginner class invitation.",
  },
  {
    id: "small-business-workshop",
    label: "Small business workshop",
    style: "minimal",
    prompt:
      'Create a vertical 4:5 educational workshop poster for small business owners. Use deep navy, light blue and ivory with a tidy geometric illustration of a laptop, a calendar and an upward chart. Render only this exact copy: "GROW YOUR SMALL BUSINESS", "A PRACTICAL MARKETING WORKSHOP", "THURSDAY 17 JUNE • 6 PM", "CITY LIBRARY", and "RESERVE YOUR SEAT". Use a strong headline, clear information hierarchy and ample whitespace. Flat, full-bleed finished poster; no frame, mockup, watermark or extra text.',
    image: "/examples/ideas/small-business-workshop.webp",
    alt: "Navy and light blue small business workshop poster with geometric laptop, calendar and growth chart illustrations.",
  },
] as const satisfies readonly (PosterExample & { readonly id: string })[];
