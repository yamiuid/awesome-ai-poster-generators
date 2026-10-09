import Image from "next/image";
import { redirect } from "next/navigation";
import { PosterContentPage } from "@/components/poster-content-page";
import { Link } from "@/i18n/navigation";
import { type RouteParams, resolveRouteLocale } from "@/lib/i18n/route-locale";
import { pageMeta } from "@/lib/seo";

export const dynamic = "force-static";
export const metadata = pageMeta({
  title: "How to Make a Poster with AI: A Practical Guide | Text to Poster",
  description:
    "Learn how to make a poster with AI: write a brief, choose a style and format, compare results, check the text, and download. Includes a real example prompt.",
  path: "/how-to-make-a-poster",
  localizedAlternates: false,
});

export default async function PosterTutorialPage({ params }: RouteParams) {
  if ((await resolveRouteLocale(params)) !== "en")
    redirect("/how-to-make-a-poster");
  return (
    <PosterContentPage
      path="/how-to-make-a-poster"
      title="How to Make a Poster with AI"
      intro="Start with one message, describe its visual direction, and generate a first draft. This guide shows how to use Text to Poster, with an existing live-music poster as an example and a checklist for reviewing your download."
    >
      <section aria-labelledby="brief-heading">
        <h2 id="brief-heading">1. Write the message before the image</h2>
        <p>
          Decide who the poster is for and what they should remember or do.
          Include a short headline, one subject, a mood and a small color
          palette. For an event, add the exact date and venue; for a film, add
          the title, genre and a key scene.
        </p>
        <p>A suggested brief for a live-music poster like our example is:</p>
        <pre className="movie-prompt-example">
          <code>
            Live music session, 1970s screen print, sun, guitar, olive and burnt
            orange.
          </code>
        </pre>
        <p>
          For your own version, replace the music session with your subject and
          name the headline you need. Avoid a long paragraph of small copy: it
          is harder to read and harder for AI to render accurately.
        </p>
      </section>
      <section aria-labelledby="format-heading">
        <h2 id="format-heading">2. Choose an art direction and aspect ratio</h2>
        <p>
          Open the{" "}
          <Link href="/?style=vintage#studio">
            AI poster maker in Vintage style
          </Link>
          . Enter your brief, choose the art direction and set the aspect ratio
          for the final placement. A portrait poster suits a flyer or feed
          image; a wide image suits a screen. Select the available quality and
          output settings within your account’s limits.
        </p>
        <p>
          If you want an existing photo to guide the artwork, switch to Image →
          Poster and attach the reference. A reference guides generation; it
          does not turn the result into an editable document.
        </p>
      </section>
      <section aria-labelledby="compare-heading">
        <h2 id="compare-heading">3. Generate and compare the composition</h2>
        <p>
          Generate a first draft. If you request several results, compare the
          main subject, headline contrast and empty space. The example below
          uses warm colors, a guitar and a sun to make the music theme
          recognizable.
        </p>
        <figure className="example-poster">
          <Image
            className="example-poster-image"
            src="/examples/vintage-sunroom-sessions.webp"
            alt="Sunroom Sessions live-music poster with orange lettering, a yellow sun and an olive guitar on textured paper."
            width={1024}
            height={1280}
            sizes="(max-width: 800px) 100vw, 48rem"
          />
          <figcaption>
            <p>
              Existing live-music example. Your result will vary, even when you
              reuse the same brief.
            </p>
          </figcaption>
        </figure>
        <p>
          If the composition is crowded, refine one instruction at a time: “one
          main shape”, “larger headline” or “more empty space”. Generate again
          and compare. Each generation uses the allowance or credits shown in
          the studio.
        </p>
      </section>
      <section aria-labelledby="review-heading">
        <h2 id="review-heading">4. Review every word and detail</h2>
        <ul className="style-landing-list">
          <li>
            Read the title and small copy at full size; AI can misspell words.
          </li>
          <li>Check names, dates, prices, venue details and any logos.</li>
          <li>Preview at the size people will see on their phone or screen.</li>
          <li>Add real links or QR codes in an editor and test them.</li>
          <li>Use references you have permission to use.</li>
        </ul>
        <p>
          The result is an image, not a set of editable text layers. Use an
          image editor when you need exact typography or final production
          changes.
        </p>
      </section>
      <section aria-labelledby="download-heading">
        <h2 id="download-heading">5. Download for the intended use</h2>
        <p>
          Download the selected poster from the studio. Guest previews are
          watermarked; account downloads and higher resolutions depend on your
          plan. Keep a local copy if you need it beyond your history’s retention
          period.
        </p>
        <p>
          For print, ask your printer for the required pixel dimensions, bleed
          and color settings. A larger export does not guarantee it meets every
          print size. Text to Poster provides digital files and does not handle
          physical printing.
        </p>
        <Link className="solid-button" href="/?style=vintage#studio">
          Make your first poster
        </Link>
      </section>
    </PosterContentPage>
  );
}
