create extension if not exists "pgcrypto";

create table if not exists public.boq_items (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  sub_category text not null,
  item_name text not null,
  unit text not null default 'lump_sum',
  quantity numeric not null default 1,
  estimated_rate numeric not null,
  estimated_cost numeric not null,
  actual_rate numeric,
  actual_cost numeric,
  vendor text,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed')),
  notes text not null default '',
  created_at timestamp with time zone not null default now()
);

alter table public.boq_items enable row level security;

drop policy if exists "Authenticated full access on boq_items" on public.boq_items;
create policy "Authenticated full access on boq_items"
  on public.boq_items
  for all
  to authenticated
  using (true)
  with check (true);

insert into public.boq_items (
  category, sub_category, item_name, unit, quantity, estimated_rate, estimated_cost, status, notes
)
select
  t.category,
  t.sub_category,
  t.item_name,
  'lump_sum',
  1,
  t.cost,
  t.cost,
  'planned',
  ''
from (
  values
    ('Flooring', 'Tiles', 'Porcelain tiles main areas', 3000000),
    ('Flooring', 'Marble', 'Stairs + feature marble', 1000000),
    ('Flooring', 'Rooms', 'Bedroom flooring', 1000000),
    ('Woodwork', 'Kitchen', 'Kitchen cabinets', 3500000),
    ('Woodwork', 'Wardrobes', 'Bedroom wardrobes', 2500000),
    ('Woodwork', 'Doors', 'Doors', 2000000),
    ('Woodwork', 'Panels', 'Media walls & panels', 2000000),
    ('Kitchen', 'Countertops', 'Quartz counters', 1000000),
    ('Kitchen', 'Hardware', 'Blum + fittings', 1000000),
    ('Kitchen', 'Appliances', 'Hob hood oven', 1500000),
    ('Kitchen', 'Finishing', 'Accessories', 1500000),
    ('Bathrooms', 'Tiles', 'Bathroom tiles', 1000000),
    ('Bathrooms', 'Fittings', 'Sanitary fittings', 700000),
    ('Bathrooms', 'Glass', 'Shower cabins', 500000),
    ('Electrical', 'Wiring', 'Full wiring', 700000),
    ('Electrical', 'Switches', 'Switches', 400000),
    ('Electrical', 'Panels', 'DB panels', 400000),
    ('Lighting', 'Chandelier', 'Main chandelier', 500000),
    ('Lighting', 'Lights', 'Indoor lighting', 500000),
    ('Lighting', 'Outdoor', 'Outdoor lighting', 200000),
    ('Paint', 'Paint', 'Full house paint', 800000),
    ('Paint', 'Feature', 'Feature walls', 700000),
    ('Aluminum', 'Windows', 'Windows', 1000000),
    ('Aluminum', 'Railings', 'Glass railings', 400000),
    ('Elevation', 'Front', 'Front elevation', 2000000),
    ('Elevation', 'Gate', 'Main gate', 1000000),
    ('Elevation', 'Outdoor', 'Outdoor finishing', 1000000),
    ('Furniture', 'Living', 'Sofas + tables', 1500000),
    ('Furniture', 'Dining', 'Dining table', 500000),
    ('Furniture', 'Bedrooms', 'Beds + side tables', 1500000),
    ('Furniture', 'Mattress', 'Mattresses', 500000),
    ('Furniture', 'Misc', 'Extra furniture', 1000000),
    ('Curtains', 'All', 'Full house curtains', 1000000),
    ('Decor', 'Art', 'Wall art', 300000),
    ('Decor', 'Mirrors', 'Mirrors', 300000),
    ('Decor', 'Accessories', 'Decor items', 400000),
    ('Appliances', 'AC', 'AC units', 1200000),
    ('Appliances', 'Other', 'Extra appliances', 300000),
    ('Landscaping', 'Outdoor', 'Plants & setup', 500000)
) as t(category, sub_category, item_name, cost)
where not exists (
  select 1 from public.boq_items existing
  where existing.category = t.category
    and existing.sub_category = t.sub_category
    and existing.item_name = t.item_name
);
