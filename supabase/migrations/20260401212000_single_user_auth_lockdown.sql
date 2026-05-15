-- Require authenticated access across the app so the tracker behaves like
-- a normal single-user login app instead of relying on client-side gating.

DO $$
DECLARE
  table_name TEXT;
  policy_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'projects',
    'material_purchases',
    'contractors',
    'payment_log',
    'project_budgets',
    'progress_entries',
    'contractor_schedules'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Enable all access for authenticated users', table_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Enable all on contractor_schedules', table_name);

      policy_name := 'Authenticated full access on ' || table_name;
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        policy_name,
        table_name
      );
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  bucket_name TEXT;
BEGIN
  UPDATE storage.buckets
  SET public = false
  WHERE id IN ('invoices', 'contractor-docs', 'site-photos');

  FOREACH bucket_name IN ARRAY ARRAY['invoices', 'contractor-docs', 'site-photos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Public read ' || bucket_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Anon insert ' || bucket_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Anon update ' || bucket_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Anon delete ' || bucket_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Authenticated read ' || bucket_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Authenticated insert ' || bucket_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Authenticated update ' || bucket_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'Authenticated delete ' || bucket_name);

    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %L)',
      'Authenticated read ' || bucket_name,
      bucket_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L)',
      'Authenticated insert ' || bucket_name,
      bucket_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L) WITH CHECK (bucket_id = %L)',
      'Authenticated update ' || bucket_name,
      bucket_name,
      bucket_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L)',
      'Authenticated delete ' || bucket_name,
      bucket_name
    );
  END LOOP;
END $$;
