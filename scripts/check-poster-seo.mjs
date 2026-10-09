import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { load } from "cheerio";

// Run after pnpm build. Validate the crawlable HTML, not just source strings.
const contentPages = [
  ["event-poster-maker", "AI Event Poster Maker"],
  ["how-to-make-a-poster", "How to Make a Poster with AI"],
  ["poster-design-ideas", "Poster Design Ideas"],
];
for (const [slug, heading] of contentPages) {
  const $ = load(await readFile(`.next/server/app/en/${slug}.html`, "utf8"));
  assert.equal($("h1").length, 1, `${slug}: one H1`);
  assert.ok($("h1").text().includes(heading), `${slug}: topic heading`);
  assert.ok(
    $("title").text().includes("Text to Poster"),
    `${slug}: branded title`,
  );
  assert.ok(
    $("meta[name=description]").attr("content")?.length > 100,
    `${slug}: description`,
  );
  assert.equal(
    $("link[rel=canonical]").attr("href"),
    `https://texttoposter.com/${slug}`,
  );
  assert.equal(
    $("link[hreflang]").length,
    0,
    `${slug}: no untranslated alternates`,
  );
  assert.equal($("a[href='/']").length > 0, true, `${slug}: home link`);
  for (const script of $("script[type='application/ld+json']").toArray()) {
    JSON.parse($(script).text());
  }
  for (const image of $("article img").toArray()) {
    assert.ok($(image).attr("alt"), `${slug}: artwork alt text`);
    assert.ok(
      $(image).attr("width") && $(image).attr("height"),
      `${slug}: sized artwork`,
    );
  }
}
const home = load(await readFile(".next/server/app/en.html", "utf8"));
assert.ok(home("title").text().startsWith("AI Poster Maker"));
assert.ok(home("h1").text().includes("AI Poster Maker"));
for (const [slug] of contentPages) {
  assert.ok(home(`a[href='/${slug}']`).length, `home links to ${slug}`);
}
const movie = load(
  await readFile(".next/server/app/en/movie-poster-maker.html", "utf8"),
);
assert.ok(movie("title").text().includes("AI Movie Poster Maker"));
assert.equal(movie(".breadcrumbs a").first().text(), "Text to Poster");
const sitemap = await readFile(".next/server/app/sitemap.xml.body", "utf8");
for (const [slug] of contentPages) {
  assert.ok(sitemap.includes(`<loc>https://texttoposter.com/${slug}</loc>`));
  assert.ok(
    !sitemap.includes(`/es/${slug}`),
    `${slug}: English only in sitemap`,
  );
}
console.log(
  "Poster SEO checks passed: homepage, movie page, three content pages and sitemap.",
);
