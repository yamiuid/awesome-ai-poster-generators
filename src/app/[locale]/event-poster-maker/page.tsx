import Image from "next/image";
import { redirect } from "next/navigation";
import { PosterContentPage } from "@/components/poster-content-page";
import { PosterStudio } from "@/components/poster-studio";
import { Link } from "@/i18n/navigation";
import { POSTER_EXAMPLES } from "@/lib/domain/poster-examples";
import { type RouteParams, resolveRouteLocale } from "@/lib/i18n/route-locale";
import { pageMeta } from "@/lib/seo";

export const dynamic = "force-static";
export const metadata = pageMeta({
  title: "AI Event Poster Maker for Concerts & Festivals | Text to Poster",
  description:
    "Create event posters from a text brief. Explore concert, festival and conference designs, try example prompts, and review your event details before sharing.",
  path: "/event-poster-maker",
  localizedAlternates: false,
});

const eventExamples = ["vintage", "neon", "anime"].flatMap((style) =>
  POSTER_EXAMPLES.filter((example) => example.style === style),
);

export default async function EventPosterPage({ params }: RouteParams) {
  if ((await resolveRouteLocale(params)) !== "en")
    redirect("/event-poster-maker");
  return (
    <PosterContentPage
      path="/event-poster-maker"
      title="AI Event Poster Maker"
      intro="Turn an event brief into a poster for a live show, festival, exhibition or conference. Describe the audience, atmosphere and essential details, then compare AI-generated designs in your browser."
      studioAction="Start an event brief"
    >
      <section
        className="movie-studio-section"
        aria-label="Create your event poster online"
      >
        <PosterStudio initialStyle="vintage" examples={eventExamples} />
      </section>
      <section aria-labelledby="event-examples-heading">
        <p className="eyebrow">One event / different directions</p>
        <h2 id="event-examples-heading">Set the mood before the doors open.</h2>
        <p>
          Compare a warm screen-print music poster, a neon jazz night and an
          anime-inspired rooftop event. Use an example in the studio to load its
          brief, then choose the matching art direction and replace the event
          details. These are generated images, not editable templates.
        </p>
        <div className="examples-grid movie-direction-grid">
          {eventExamples.map((example, index) => (
            <figure
              className={`example-poster example-poster-${index + 1}`}
              key={example.style}
            >
              <Image
                className="example-poster-image"
                src={example.image}
                alt={example.alt}
                width={1024}
                height={1280}
                sizes="(max-width: 520px) 100vw, (max-width: 800px) 50vw, 33vw"
              />
              <figcaption>
                <p className="eyebrow">{example.label} / event poster</p>
                <p>{example.prompt}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section aria-labelledby="event-brief-heading">
        <h2 id="event-brief-heading">
          What to include in an event poster design brief
        </h2>
        <ul className="style-landing-list">
          <li>The event name and one clear reason to attend.</li>
          <li>
            Date, time and venue, written exactly as you want them to appear.
          </li>
          <li>
            The audience and mood: a small acoustic show, a dance festival or a
            professional conference.
          </li>
          <li>
            A short call to action such as “Book tickets” or “Free entry”.
          </li>
          <li>
            Two or three colors, a visual subject and the format where you will
            share it.
          </li>
        </ul>
        <p>
          This is an illustrative brief for a fictional event; replace the name,
          date and venue before using it.
        </p>
        <pre className="movie-prompt-example">
          <code>
            {
              "Event: Sunroom Sessions\nLive acoustic music for a small local audience\nDate: 18 July 2027, 7 pm\nVenue: Riverside Hall\nCopy: SUNROOM SESSIONS / LIVE MUSIC / BOOK TICKETS\nStyle: 1970s screen print, guitar and sun, olive and burnt orange\nFormat: portrait, large event name, clear space for date and venue"
            }
          </code>
        </pre>
      </section>
      <section aria-labelledby="event-format-heading">
        <h2 id="event-format-heading">
          Concerts, festivals and conferences need different layouts
        </h2>
        <p>
          For a concert, make the artist or event name the main message and use
          one strong music image. For a festival, keep the headline clear and
          avoid filling the first draft with a long lineup. For a conference,
          prioritize the topic, venue and registration action over decorative
          details.
        </p>
        <p>
          Use a portrait composition for a flyer or feed post, a wide
          composition for a screen, and a tall format for a story. Generate for
          the intended format rather than crop away important information
          afterward.
        </p>
        <Link className="pricing-link" href="/poster-design-ideas">
          Explore real poster examples and prompts
        </Link>
      </section>
      <section aria-labelledby="event-review-heading">
        <h2 id="event-review-heading">Check the details before publishing</h2>
        <p>
          AI can change letters, numbers and logos. Check the event name, date,
          venue, ticket price and every word in the downloaded image. Add a real
          ticket URL or QR code in an editor and test it; a generated QR-like
          image is not a working ticket link.
        </p>
        <p>
          Text to Poster downloads digital artwork. It does not print or deliver
          physical posters. For printing, check the downloaded pixel dimensions
          against your printer’s required size and resolution.
        </p>
      </section>
      <section aria-labelledby="event-faq-heading">
        <h2 id="event-faq-heading">Event poster questions</h2>
        <div className="faq-list">
          <details>
            <summary>Can I try the event poster maker free?</summary>
            <p>
              Yes. Guests can try watermarked generations. Eligible free
              accounts receive 20 welcome credits and can download without a
              watermark. Check the studio and{" "}
              <Link href="/pricing">pricing page</Link> for current limits; free
              use is limited.
            </p>
          </details>
          <details>
            <summary>Can I use a venue photo as a reference?</summary>
            <p>
              Yes. Switch to Image → Poster, upload a supported reference photo
              and describe the event. Check the studio for your account’s image
              and file limits.
            </p>
          </details>
          <details>
            <summary>Can I edit individual text layers?</summary>
            <p>
              The output is a generated image, not a layered template. Refine
              the prompt and generate again, or make precise text changes in an
              image editor.
            </p>
          </details>
        </div>
      </section>
      <section aria-labelledby="event-cta-heading">
        <h2 id="event-cta-heading">Give your next event a first impression.</h2>
        <p>
          Start with the event name, audience and atmosphere. Refine the details
          after you choose a direction.
        </p>
        <a className="solid-button" href="#studio">
          Start an event brief
        </a>
      </section>
    </PosterContentPage>
  );
}
