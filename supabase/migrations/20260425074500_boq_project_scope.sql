alter table public.boq_items
  add column if not exists project_id uuid references public.projects(id) on delete cascade;

create index if not exists idx_boq_items_project_id on public.boq_items(project_id);

do $$
begin
  if exists (select 1 from public.projects limit 1) then
    update public.boq_items b
    set project_id = p.id
    from (
      select id
      from public.projects
      order by created_at asc
      limit 1
    ) p
    where b.project_id is null;
  end if;
end $$;

insert into public.boq_items (
  project_id, category, sub_category, item_name, unit, quantity, estimated_rate, estimated_cost, status, notes
)
select
  p.id,
  t.category,
  t.sub_category,
  t.item_name,
  'lump_sum',
  1,
  t.cost,
  t.cost,
  'planned',
  ''
from public.projects p
cross join (
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
  select 1
  from public.boq_items existing
  where existing.project_id = p.id
    and existing.category = t.category
    and existing.sub_category = t.sub_category
    and existing.item_name = t.item_name
);
