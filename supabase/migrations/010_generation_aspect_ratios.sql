alter table public.generations
  drop constraint if exists generations_aspect_ratio_check;

alter table public.generations
  add constraint generations_aspect_ratio_check check (
    aspect_ratio in (
      '1:1', '4:5', '3:4', '2:3', '9:16', '16:9', '4:3', '3:2'
    )
  );
