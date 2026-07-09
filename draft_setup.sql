-- Create table for bulk import drafts
CREATE TABLE IF NOT EXISTS public.bulk_import_drafts (
    id TEXT PRIMARY KEY, -- device_id or unique identifier
    rows_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    tray_number TEXT NOT NULL DEFAULT '1',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.bulk_import_drafts ENABLE ROW LEVEL SECURITY;

-- Create policies (Allow all operations for client anon access)
DROP POLICY IF EXISTS "Allow public select" ON public.bulk_import_drafts;
CREATE POLICY "Allow public select" ON public.bulk_import_drafts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert" ON public.bulk_import_drafts;
CREATE POLICY "Allow public insert" ON public.bulk_import_drafts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update" ON public.bulk_import_drafts;
CREATE POLICY "Allow public update" ON public.bulk_import_drafts FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public delete" ON public.bulk_import_drafts;
CREATE POLICY "Allow public delete" ON public.bulk_import_drafts FOR DELETE USING (true);
