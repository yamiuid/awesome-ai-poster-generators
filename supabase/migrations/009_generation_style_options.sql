alter table public.generations
  drop constraint if exists generations_style_check;

alter table public.generations
  add constraint generations_style_check check (
    style in (
      'auto', 'movie', 'minimal', 'anime', 'business', 'vintage', 'neon',
      'swiss', 'typography', 'collage', 'photography', 'illustration', 'surreal',
      'fashion', 'brutalist', 'art_deco', 'y2k'
    )
  );
