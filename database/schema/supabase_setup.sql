-- 1. Bảng profiles (Thông tin bổ sung người dùng)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT NOT NULL,
    employee_code TEXT UNIQUE,
    department TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email IS DISTINCT FROM u.email);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
$$;

-- Bật RLS cho profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cho phép tất cả mọi người đọc profile" ON profiles;
DROP POLICY IF EXISTS "Người dùng tự cập nhật profile của mình" ON profiles;
DROP POLICY IF EXISTS "Users view own profile or admin views all" ON profiles;
DROP POLICY IF EXISTS "Only admin inserts profiles" ON profiles;
DROP POLICY IF EXISTS "Only admin updates profiles" ON profiles;
DROP POLICY IF EXISTS "Only admin deletes profiles" ON profiles;

CREATE POLICY "Users view own profile or admin views all" ON profiles
    FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Only admin inserts profiles" ON profiles
    FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "Only admin updates profiles" ON profiles
    FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Only admin deletes profiles" ON profiles
    FOR DELETE USING (public.is_admin());

-- 2. Bảng products (Danh mục sản phẩm gốc)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name TEXT NOT NULL,
    warning_code TEXT,
    is_export BOOLEAN NOT NULL DEFAULT false,
    format TEXT CHECK (format IN ('Slim', 'Semi', 'Kingsize', 'SuperSlim', 'Demi')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (product_name, warning_code)
);

-- Bật RLS cho products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tất cả mọi người được đọc danh mục sản phẩm" ON products
    FOR SELECT USING (true);

CREATE POLICY "Chỉ Admin/Thủ kho được thêm/sửa sản phẩm" ON products
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- 3. Bảng boxes (Thùng lưu trữ mẫu khi quá tải kệ)
CREATE TABLE IF NOT EXISTS boxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    box_name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status TEXT NOT NULL DEFAULT 'stored' CHECK (status IN ('stored', 'destroyed'))
);

-- Bật RLS cho boxes
ALTER TABLE boxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cho phép tất cả mọi người đọc thông tin Thùng" ON boxes
    FOR SELECT USING (true);

CREATE POLICY "Chỉ Admin/Thủ kho được quản lý Thùng" ON boxes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- 4. Bảng samples (Thông tin lô mẫu thuốc lá)
CREATE TABLE IF NOT EXISTS samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT UNIQUE NOT NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    order_number TEXT,
    blend_batch TEXT NOT NULL,
    blend_date DATE NOT NULL,
    packaging_date DATE NOT NULL,
    sampling_time TIMESTAMP WITH TIME ZONE NOT NULL,
    shelf INTEGER CHECK (shelf BETWEEN 1 AND 6),
    slot INTEGER CHECK (slot BETWEEN 1 AND 5),
    column_number INTEGER CHECK (column_number BETWEEN 1 AND 8),
    box_id UUID REFERENCES boxes(id) ON DELETE SET NULL,
    total_qty INTEGER NOT NULL CHECK (total_qty >= 0),
    available_qty INTEGER NOT NULL CHECK (available_qty >= 0),
    entry_date DATE DEFAULT CURRENT_DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'stored' CHECK (status IN ('stored', 'boxed', 'destroyed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT check_location CHECK (
        (shelf IS NOT NULL AND slot IS NOT NULL AND column_number IS NOT NULL AND box_id IS NULL) OR
        (shelf IS NULL AND slot IS NULL AND column_number IS NULL AND box_id IS NOT NULL) OR
        (shelf IS NULL AND slot IS NULL AND column_number IS NULL AND box_id IS NULL AND status = 'destroyed')
    )
);

-- Bật RLS cho samples
ALTER TABLE samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cho phép tất cả mọi người đọc thông tin Mẫu" ON samples
    FOR SELECT USING (true);

CREATE POLICY "Chỉ Admin/Thủ kho được thao tác sửa đổi Mẫu" ON samples
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- 5. Bảng transactions (Lịch sử giao dịch)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sample_id UUID NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id),
    type TEXT NOT NULL CHECK (type IN ('import', 'export', 'take_request', 'take_approve', 'inventory_adjust', 'take_revert', 'move')),
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    status TEXT CHECK (status IN ('pending', 'approved', 'cancelled')),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bật RLS cho transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cho phép tất cả mọi người đọc lịch sử giao dịch" ON transactions
    FOR SELECT USING (true);

CREATE POLICY "Mọi người tự tạo giao dịch yêu cầu của mình hoặc Admin duyệt tất cả" ON transactions
    FOR INSERT WITH CHECK (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Chỉ Admin được cập nhật trạng thái duyệt giao dịch" ON transactions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- T├íi tß║ío to├án bß╗Ö seed data sß║ún phß║⌐m tß╗½ Danh sach.xlsx
-- Unique key: (product_name, warning_code)
DELETE FROM products;

INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('555 Slim', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Albond Filters Cigarette', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Albond Menthol Cigarette', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('American Remote', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Ark Royal Full Flavor Soft Pack', 'JHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ASIAONE Double Blast Blueberry Mint', 'HK Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ASIAONE Full Flavor', 'HK Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ASIAONE Red', 'HK Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ASIAONE Single Blast Mint', 'HK Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Balck Menthol', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Blue', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Blue Japanese', 'HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta FF', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Full Flavor', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Full Flavor', 'US Health Warning (AR code)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Lights', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Lights', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Menthol', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Menthol', 'US Health Warning (AR code)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Menthol', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Menthol', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Menthol Round Corner', 'EEC Health Warning (AR Code)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta MT', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Red', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Red', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Red Round Corner', 'EEC Health Warning (AR Code)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Superslims Full Flavor', 'Japanese HW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Superslims Lights', 'Japanese HW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Superslims Menthol', 'Japanese HW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Switch', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Vanilla', 'US Health Warning (FL)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Vanilla', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Vanilla', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('B├ío Leopard Slim Cam Bß║íc H├á', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('B├ío Leopard Slim D├óu', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Black Fox Chocolate', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Black Fox Mango', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Black Fox Raspberry', 'Japanese Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Black Fox Strawberry', 'Japanese Health Warning (FL)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Black Fox Strawberry', 'Japanese Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Black Fox Vanilla', 'Japanese Health Warning (FL)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Black Fox Vanilla', 'Japanese Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Blast Round Corner Pack', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Blast Round Corner Pack', 'Khmer HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Blast Round Corner Pack', 'Trinidad HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Blast Round Corner Pack', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Blast Round Corner Pack', 'Khmer HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Chill Autumn Kingsize', 'Japanese HW Round Corner', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Chill Autumn Super Slims', 'Japanese HW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Chill Autumn Super Slims', 'Khmer PHW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Cool Mint Super Slims', 'Japanese HW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Cool Summer King Size', 'Japanese HW Round Corner', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Lemon Blast', 'Japanese HW Round Corner', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Menthol Blast Super Slim', 'Japanese HW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Tanghulu Lemon Blast Round Corner', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Tanghulu Yogurt Blast Round Corner', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Boulevard FF', 'US', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Boulevard MT', 'US', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Brooklyn Blue', 'Australia HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Brooklyn Gold', 'Australia HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Brooklyn Red', 'Australia HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Brown Owl (Superslims)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Black MT', 'AMPHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Blackberry Super Slims', 'US Healthy Warning', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Blast', 'Khmer HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Blast', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Blast', 'Amaran Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Blast', 'JHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Blast', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Double Blast', 'Amaran Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Double Blast', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Double Blast', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon FF', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon FF', 'USHW with Embossing Grid for Labuan', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon FF Revo pack', 'Pictorial Health Warning 07', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Full Flavor', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Full Flavor', 'Khmer Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Full Flavor', '3D Foil Japanese Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Full Flavor Round Corner', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Full Flavor Round Corner', 'Sabah', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Full Flavor Round Corner', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Full Flavor Round Corner', 'US Health Warning for Sabah', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Lights', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Lights', 'USHW with Embossing Grid for Labuan', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Lights', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Lights Round Corner', 'US HW for Sabah', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Lights Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Lights Round Corner Pack', 'Pictorial Health Warning 07', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Lights Round Corner Pack', 'Sabah', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Menthol', '3D Foil Japanese Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Menthol', 'Khmer Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Menthol Round Corner', 'Sabah', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Menthol Round Corner', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Menthol Round Corner', 'US Health Warning for Sabah', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Menthol Round Corner', 'US HW for Myanmar', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon MT', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon MT', 'USHW with Embossing Grid for Labuan', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon MT', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon MT Revo pack', 'Pictorial Health Warning 07', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Signature CSMF Full Flavor', 'Picture HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Signature Full Flavor (PV2 Blend)-Revo', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Signature Resever Full Flavor Revo Pack', 'Picture HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Signature Revo Pack Menthol', 'Picture HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Spice', 'Indonesia USHW (nake wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Spice', 'Malaysia USHW (nake wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Strawberry Super Slims', 'US Healthy Warning', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla', 'Khmer HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla', 'Malaysia Health Warning (RM7)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla', 'Malaysia PHW with RM7', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla', 'New Design US HW (Nake Wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla Slims', 'Vietnamese HW', FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla Slims', NULL, TRUE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla Super Slims', 'US Healthy Warning', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla VN', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Chienmen Super Slim', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cleveland Blitz Blue', 'Australian HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cleveland Blue', 'Australian HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cleveland Gold', 'Australian HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cleveland Menthol', 'Australian HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cleveland Red', 'Australian HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cranes (Super slim N├óu)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cranes (Super Slim VN)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cranes (Super slim)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('D&B Full flavor', 'Phillipines Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('D&B Full Flavor Revo Pack', 'Phillipines HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('D&B Lights', 'Phillipines Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('D&B Lights Revo Pack', 'Phillipines HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('D&B Menthol', 'Phillipines Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('D&B Menthol Revo Pack', 'Phillipines HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('DEER (Super Slim ΓÇô Trß║»ng)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('DEER (Super Slim ΓÇô V├áng)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('DEER (Super Slim ΓÇô Xanh)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('DEER (Super Slim ─Éen)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('─É├┤ng ─É├┤ (Bao kingsize hß╗Öp vu├┤ng)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('─É├┤ng ─É├┤ Slim VN', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Dusk FF', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Everest', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Everest Virginia', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Galaxy Full Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Galaxy Menthol Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Giangson (20s Super Slim Gold)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Giangson New (20s Super Slim Gold)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Giangson New (20s Super Slim Red)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Goddess Cigarette (Super Slim) Black', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Goddess Cigarette (Super Slim) Gold', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Goddess Cigarette (Super Slim) Red', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Goddess Cigarette (Super Slim) White', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Gold Lion', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Gold Lion Virginia (─æiß║┐u d├ái)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Hawk FF Round Corner Pack', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Hawk FF Round Corner Pack (ME2 BLEND)', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Hawk Lights Round Corner Pack (ME2 BLEND)', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Hawk MT Round Corner Pack', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Hawk MT Round Corner Pack (ME2 BLEND)', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Hawk X-Menthol Round Corner Pack', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Hawk X-Treme (Full Flavor) Round Corner Pack', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('IoN Full Flavor', 'Amaran PHW 11', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Ion Full Flavor', 'Trinidad Text Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ION Full Flavor (ME2 Blend)', 'Trinidad HW SET A', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ION Full Flavor (Zon Blend)', 'Trinidad HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('King Street Blue', 'Australia Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('King Street Gold', 'Australia Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('KTC (SuperSlims ─Éß╗Å ├⌐p kim)', NULL, FALSE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('KTC (SuperSlims V├áng ├⌐p kim)', NULL, FALSE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Lee Blast Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Lee FF Pack (Stamp Version)', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Lee Full Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Lee Menthol Pack (Stamp Version)', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Lee Premium Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('LEE PREMIUM PACK (STAMP VERSION)', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Long Smoke Super Slim Red', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('LUCAS Super Slim Cigarette', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Luck Star 5mg', 'Taiwan HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Luck Star 7mg', 'Taiwan HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('LUKY (Super Slim ─Éen)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('LUKY (Super Slim V├áng ├⌐p kim)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('LUKY (Super Slim)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('M&R Full flavor', 'Phillipines Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('M&R Super Slims Full Flavor', 'US HW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('MARQ Premium', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Mudan Super Slim Gold', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Mudan Super Slim Red', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Mudan Super Slim White', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Nha Trang Khatoco', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Nha Trang Tourist (Bao mß╗üm)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('NYX Blast', 'Amaran Pictorial HW Round Corner', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Nyx Exclusive FF Round Pack', 'Amaran Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Nyx MT Round Pack', 'Amaran Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('NYX Special Edition Full Flavor', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Oppa Full Flavor Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Oppa Light Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Oppa Menthol Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Paradox FF', 'Amaran Pictorial HW (with MDNP Stamps)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Paradox FF Kingsize', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Paradox FF Premium Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Paradox MT', 'Amaran Pictorial HW (with MDNP Stamps)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Paradox MT', 'US HW (no Stamps)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Paradox MT Premium Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Parkway Blue', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Parkway Full Flavor', 'PHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Parkway Gold', 'Trinidad Text Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Parkway Gold (ME2 Blend)', 'Trinidad HW SET A', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Parkway Gold (Zon Blend)', 'Trinidad HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Parkway Green (Zon Blend)', 'Trinidad HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Parkway Menthol', 'PHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Pheasant Super Slims', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('PONAGAR (Super Slim V├áng ├⌐p kim)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Ponagar (Super Slim)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Prince (Bao kingsize xanh)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Prince (─æiß║┐u d├ái)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Prince Khatoco', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('QI Yogurt Blast', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('QI Yogurt Honeydew Double Blast', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('QI Yogurt Orange Double Blast', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave FF', 'Amaran HW(without stamps)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave FF', 'Amaran Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave FF', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave FF Soft Pack', 'Amaran PHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Gold FF (Kitset)', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Gold Full Flavor', 'EEC Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Gold Menthol', 'EEC Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Gold Menthol (Kitset)', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Ice Blast', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Ice Blast', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Ice Blast', 'US HW (Nake wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Menthol Soft Pack', 'Amaran PHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave MT', 'Amaran HW(without stamps)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave MT', 'Amaran Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave MT', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Rasberry Slim', 'US HW', TRUE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Slim Blue VN', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Slim Blue VN (c├│ phong c├óy)', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Slim FF VN', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Slim MT VN', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Strawberry Slim', 'US HW', TRUE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Vanilla Slim', 'US HW', TRUE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush Cigarillos Round Corner', 'PHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush FF Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush FF Round Corner Pack', 'Naked Wrap', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush FF Round Corner Pack', 'Pictorial HW7', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush Lights Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush Lights Round Corner Pack', 'Nake Wrap', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush Lights Round Corner Pack', 'Pictorial HW7', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush Menthol Round Corner Pack', 'PHW with Tax stamps', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush MT Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush MT Round Corner Pack', 'Naked Wrap', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush MT Round Corner Pack', 'Pictorial HW7', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('San Sheng San Shi', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Santara Green Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Santara Green Soft Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Santara Grey Soft Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Santara Red Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('SEA BIRD (Bao hß╗Öp v├áng)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Sea Bird Kingsize', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Sea Bird Menthol Bao mß╗üm', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('SEA BIRD Menthol Fresh Bao hß╗Öp', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Sea Bird V├áng', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Silver Lotus Cigarette (Super Slim)', 'Peacock HMD', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Silver Lotus Super Slim (V├áng ├⌐p kim)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Silver Lotus Super Slim (Xanh)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Silver Lotus Super Slim (Xanh) VN', NULL, FALSE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('State Express Prestige Slim', NULL, TRUE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Taipan Blast', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Taipan Boss Double Dice', 'JHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Taipan Boss Single Dice', 'JHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Th─âng Long 5 sao bao cß╗⌐ng', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Th─âng Long bao cß╗⌐ng', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara D-Blend Full Flavor Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara D-Blend New Design Full Flavor AMP Round Corner', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara Green Round Corner Pack US HW', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara Menthol New Design with AMPHW Round Corner', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara Menthol Round Corner Pack with AMPHW', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara NP6 Full Flavor with AMPHW Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara Red Round Corner Pack US HW', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara TMF Full Flavor with AMPHW Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('TORA Cigarillos Round Corner', 'Taiwan Free Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tora Green Duty Free Health Warning Round Corner', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('TORA Navy Blue Round Corner', 'Duty Free Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('TORA Navy Blue Round Corner', 'Taiwan Free Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('TORA Original Round Corner', 'Duty Free Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('TORA Original Round Corner', 'Taiwan Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tora Red Duty Free Health Warning Round Corner', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('TRß║ªM H╞»╞áNG THI├èN NHI├èN (─Éß╗Å)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('TRß║ªM H╞»╞áNG THI├èN NHI├èN (Trß║»ng)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Viking Blast Blue Berry', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Viking Blast Red Wine', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Viking Blast Round Corner', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('War Horse (─Éß╗Å)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('War Horse (N├óu)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('War Horse (Xanh)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('War Horse Blueberry Menthol', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('White Bear 7G', 'US HW', TRUE, 'Demi') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('White Bear AAA', 'US HW', TRUE, 'Demi') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('White Horse', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('White Horse Blaze', NULL, FALSE, 'Semi') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('White Horse Demi', NULL, FALSE, 'Demi') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('White Horse Gold', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('White Horse Slim VN', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Wifi Blast Round Corner Pack', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('WIN Blue', 'HK Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Win Blue Lights', 'Hong Kong HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Win Double Blast Kingsize', 'Hong Kong HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Win Green Menthol', 'Hong Kong HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Win Red Full Flavor', 'Hong Kong HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('WIN Red HK Health Warning', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('WIN Single Blast King Size', 'Hong Kong Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Yett (─æiß║┐u d├ái)', NULL, FALSE, 'Semi') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('YETT (trß║»ng)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('YETT (v├áng)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('YETT DEMI MENTHOL', NULL, FALSE, 'Demi') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Yett demi xanh', NULL, FALSE, 'Demi') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('YETT KINGSIZE XANH', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Yett Slims', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Blast Menthol', 'Trinidad Health Warning Set A (Nake Wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Blast Menthol', 'Trinidad Health Warning Set B (Nake Wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Exclusive Blast', 'Amaran Picture Health Warning Round Corner', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Exclusive Blast', 'Trinidad Health Warning Round Corner', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Exclusive Blast', 'Trinidad Health Warning Set A (Nake Wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Exclusive Blast', 'Trinidad Health Warning Set B (Nake Wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King FF', 'Trinidad Text Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Vanilla', 'T&T HW Set B', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Vanilla', 'Trinidad Health Warning Set A (Nake Wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Blast', 'T&T Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing FF', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing FF', 'Trinidad Health Warning Set A', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing FF', 'Trinidad Health Warning Set B', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing FF', 'Trinidad Text Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing FF', 'Trinidad HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing FF (Diet)', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing FF (ME2 Blend)', 'Trinidad HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Full Flavor', 'Guyana Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Full Flavor (ME2 Blend)', 'Grenada Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Full Flavor (ME2 Blend)', 'Guyana Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Menthol', 'Trinidad HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Menthol', 'Trinidad HW Set A', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Menthol', 'Trinidad HW Set B', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zonking MT', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Premium Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zouk', 'Khmer HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zouk Chocolate', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zouk Churchill', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zouk Mango', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZOUK Raspberry', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZOUK RED', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zouk Red', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZOUK Spice', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zouk White', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zouk White', 'Khmer HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;

-- Giai đoạn chèn dữ liệu mẫu gốc từ Danhsach.xlsx
-- Unique key: (product_name, warning_code)
DELETE FROM products;

-- Dữ liệu hạt giống cho bảng products
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('555 Slim', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Albond Filters Cigarette', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Albond Menthol Cigarette', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('American Remote', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Ark Royal Full Flavor Soft Pack', 'JHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ASIAONE Double Blast Blueberry Mint', 'HK Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ASIAONE Full Flavor', 'HK Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ASIAONE Red', 'HK Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ASIAONE Single Blast Mint', 'HK Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Balck Menthol', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Blue', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Blue Japanese', 'HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta FF', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Full Flavor', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Full Flavor', 'US Health Warning (AR code)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Lights', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Lights', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Menthol', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Menthol', 'US Health Warning (AR code)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Menthol', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Menthol', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Menthol Round Corner', 'EEC Health Warning (AR Code)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta MT', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Red', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Red', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Red Round Corner', 'EEC Health Warning (AR Code)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Superslims Full Flavor', 'Japanese HW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Superslims Lights', 'Japanese HW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Superslims Menthol', 'Japanese HW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Switch', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Vanilla', 'US Health Warning (FL)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Vanilla', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Atlanta Vanilla', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Báo Leopard Slim Cam Bạc Hà', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Báo Leopard Slim Dâu', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Black Fox Chocolate', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Black Fox Mango', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Black Fox Raspberry', 'Japanese Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Black Fox Strawberry', 'Japanese Health Warning (FL)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Black Fox Strawberry', 'Japanese Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Black Fox Vanilla', 'Japanese Health Warning (FL)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Black Fox Vanilla', 'Japanese Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Blast Round Corner Pack', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Blast Round Corner Pack', 'Khmer HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Blast Round Corner Pack', 'Trinidad HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Blast Round Corner Pack', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Blast Round Corner Pack', 'Khmer HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Chill Autumn Kingsize', 'Japanese HW Round Corner', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Chill Autumn Super Slims', 'Japanese HW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Chill Autumn Super Slims', 'Khmer PHW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Cool Mint Super Slims', 'Japanese HW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Cool Summer King Size', 'Japanese HW Round Corner', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Lemon Blast', 'Japanese HW Round Corner', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Menthol Blast Super Slim', 'Japanese HW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Tanghulu Lemon Blast Round Corner', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Blue Ice Tanghulu Yogurt Blast Round Corner', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Boulevard FF', 'US', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Boulevard MT', 'US', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Brooklyn Blue', 'Australia HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Brooklyn Gold', 'Australia HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Brooklyn Red', 'Australia HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Brown Owl (Superslims)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Black MT', 'AMPHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Blackberry Super Slims', 'US Healthy Warning', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Blast', 'Khmer HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Blast', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Blast', 'Amaran Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Blast', 'JHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Blast', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Double Blast', 'Amaran Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Double Blast', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Double Blast', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon FF', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon FF', 'USHW with Embossing Grid for Labuan', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon FF Revo pack', 'Pictorial Health Warning 07', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Full Flavor', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Full Flavor', 'Khmer Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Full Flavor', '3D Foil Japanese Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Full Flavor Round Corner', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Full Flavor Round Corner', 'Sabah', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Full Flavor Round Corner', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Full Flavor Round Corner', 'US Health Warning for Sabah', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Lights', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Lights', 'USHW with Embossing Grid for Labuan', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Lights', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Lights Round Corner', 'US HW for Sabah', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Lights Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Lights Round Corner Pack', 'Pictorial Health Warning 07', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Lights Round Corner Pack', 'Sabah', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Menthol', '3D Foil Japanese Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Menthol', 'Khmer Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Menthol Round Corner', 'Sabah', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Menthol Round Corner', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Menthol Round Corner', 'US Health Warning for Sabah', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Menthol Round Corner', 'US HW for Myanmar', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon MT', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon MT', 'USHW with Embossing Grid for Labuan', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon MT', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon MT Revo pack', 'Pictorial Health Warning 07', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Signature CSMF Full Flavor', 'Picture HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Signature Full Flavor (PV2 Blend)-Revo', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Signature Resever Full Flavor Revo Pack', 'Picture HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Signature Revo Pack Menthol', 'Picture HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Spice', 'Indonesia USHW (nake wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Spice', 'Malaysia USHW (nake wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Strawberry Super Slims', 'US Healthy Warning', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla', 'Khmer HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla', 'Malaysia Health Warning (RM7)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla', 'Malaysia PHW with RM7', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla', 'New Design US HW (Nake Wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla Slims', 'Vietnamese HW', FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla Slims', NULL, TRUE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla Super Slims', 'US Healthy Warning', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Canyon Vanilla VN', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Chienmen Super Slim', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cleveland Blitz Blue', 'Australian HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cleveland Blue', 'Australian HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cleveland Gold', 'Australian HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cleveland Menthol', 'Australian HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cleveland Red', 'Australian HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cranes (Super slim Nâu)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cranes (Super Slim VN)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Cranes (Super slim)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('D&B Full flavor', 'Phillipines Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('D&B Full Flavor Revo Pack', 'Phillipines HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('D&B Lights', 'Phillipines Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('D&B Lights Revo Pack', 'Phillipines HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('D&B Menthol', 'Phillipines Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('D&B Menthol Revo Pack', 'Phillipines HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('DEER (Super Slim – Trắng)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('DEER (Super Slim – Vàng)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('DEER (Super Slim – Xanh)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('DEER (Super Slim Đen)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Đông Đô (Bao kingsize hộp vuông)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Đông Đô Slim VN', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Dusk FF', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Everest', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Everest Virginia', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Galaxy Full Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Galaxy Menthol Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Giangson (20s Super Slim Gold)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Giangson New (20s Super Slim Gold)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Giangson New (20s Super Slim Red)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Goddess Cigarette (Super Slim) Black', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Goddess Cigarette (Super Slim) Gold', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Goddess Cigarette (Super Slim) Red', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Goddess Cigarette (Super Slim) White', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Gold Lion', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Gold Lion Virginia (điếu dài)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Hawk FF Round Corner Pack', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Hawk FF Round Corner Pack (ME2 BLEND)', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Hawk Lights Round Corner Pack (ME2 BLEND)', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Hawk MT Round Corner Pack', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Hawk MT Round Corner Pack (ME2 BLEND)', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Hawk X-Menthol Round Corner Pack', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Hawk X-Treme (Full Flavor) Round Corner Pack', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('IoN Full Flavor', 'Amaran PHW 11', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Ion Full Flavor', 'Trinidad Text Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ION Full Flavor (ME2 Blend)', 'Trinidad HW SET A', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ION Full Flavor (Zon Blend)', 'Trinidad HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('King Street Blue', 'Australia Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('King Street Gold', 'Australia Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('KTC (SuperSlims Đỏ ép kim)', NULL, FALSE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('KTC (SuperSlims Vàng ép kim)', NULL, FALSE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Lee Blast Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Lee FF Pack (Stamp Version)', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Lee Full Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Lee Menthol Pack (Stamp Version)', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Lee Premium Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('LEE PREMIUM PACK (STAMP VERSION)', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Long Smoke Super Slim Red', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('LUCAS Super Slim Cigarette', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Luck Star 5mg', 'Taiwan HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Luck Star 7mg', 'Taiwan HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('LUKY (Super Slim Đen)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('LUKY (Super Slim Vàng ép kim)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('LUKY (Super Slim)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('M&R Full flavor', 'Phillipines Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('M&R Super Slims Full Flavor', 'US HW', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('MARQ Premium', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Mudan Super Slim Gold', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Mudan Super Slim Red', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Mudan Super Slim White', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Nha Trang Khatoco', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Nha Trang Tourist (Bao mềm)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('NYX Blast', 'Amaran Pictorial HW Round Corner', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Nyx Exclusive FF Round Pack', 'Amaran Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Nyx MT Round Pack', 'Amaran Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('NYX Special Edition Full Flavor', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Oppa Full Flavor Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Oppa Light Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Oppa Menthol Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Paradox FF', 'Amaran Pictorial HW (with MDNP Stamps)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Paradox FF Kingsize', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Paradox FF Premium Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Paradox MT', 'Amaran Pictorial HW (with MDNP Stamps)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Paradox MT', 'US HW (no Stamps)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Paradox MT Premium Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Parkway Blue', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Parkway Full Flavor', 'PHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Parkway Gold', 'Trinidad Text Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Parkway Gold (ME2 Blend)', 'Trinidad HW SET A', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Parkway Gold (Zon Blend)', 'Trinidad HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Parkway Green (Zon Blend)', 'Trinidad HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Parkway Menthol', 'PHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Pheasant Super Slims', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('PONAGAR (Super Slim Vàng ép kim)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Ponagar (Super Slim)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Prince (Bao kingsize xanh)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Prince (điếu dài)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Prince Khatoco', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('QI Yogurt Blast', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('QI Yogurt Honeydew Double Blast', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('QI Yogurt Orange Double Blast', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave FF', 'Amaran HW(without stamps)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave FF', 'Amaran Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave FF', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave FF Soft Pack', 'Amaran PHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Gold FF (Kitset)', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Gold Full Flavor', 'EEC Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Gold Menthol', 'EEC Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Gold Menthol (Kitset)', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Ice Blast', 'US Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Ice Blast', 'US HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Ice Blast', 'US HW (Nake wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Menthol Soft Pack', 'Amaran PHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave MT', 'Amaran HW(without stamps)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave MT', 'Amaran Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave MT', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Rasberry Slim', 'US HW', TRUE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Slim Blue VN', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Slim Blue VN (có phong cây)', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Slim FF VN', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Slim MT VN', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Strawberry Slim', 'US HW', TRUE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rave Vanilla Slim', 'US HW', TRUE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush Cigarillos Round Corner', 'PHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush FF Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush FF Round Corner Pack', 'Naked Wrap', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush FF Round Corner Pack', 'Pictorial HW7', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush Lights Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush Lights Round Corner Pack', 'Nake Wrap', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush Lights Round Corner Pack', 'Pictorial HW7', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush Menthol Round Corner Pack', 'PHW with Tax stamps', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush MT Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush MT Round Corner Pack', 'Naked Wrap', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Rush MT Round Corner Pack', 'Pictorial HW7', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('San Sheng San Shi', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Santara Green Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Santara Green Soft Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Santara Grey Soft Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Santara Red Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('SEA BIRD (Bao hộp vàng)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Sea Bird Kingsize', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Sea Bird Menthol Bao mềm', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('SEA BIRD Menthol Fresh Bao hộp', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Sea Bird Vàng', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Silver Lotus Cigarette (Super Slim)', 'Peacock HMD', TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Silver Lotus Super Slim (Vàng ép kim)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Silver Lotus Super Slim (Xanh)', NULL, TRUE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Silver Lotus Super Slim (Xanh) VN', NULL, FALSE, 'SuperSlim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('State Express Prestige Slim', NULL, TRUE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Taipan Blast', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Taipan Boss Double Dice', 'JHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Taipan Boss Single Dice', 'JHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Thăng Long 5 sao bao cứng', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Thăng Long bao cứng', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara D-Blend Full Flavor Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara D-Blend New Design Full Flavor AMP Round Corner', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara Green Round Corner Pack US HW', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara Menthol New Design with AMPHW Round Corner', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara Menthol Round Corner Pack with AMPHW', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara NP6 Full Flavor with AMPHW Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara Red Round Corner Pack US HW', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tiara TMF Full Flavor with AMPHW Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('TORA Cigarillos Round Corner', 'Taiwan Free Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tora Green Duty Free Health Warning Round Corner', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('TORA Navy Blue Round Corner', 'Duty Free Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('TORA Navy Blue Round Corner', 'Taiwan Free Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('TORA Original Round Corner', 'Duty Free Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('TORA Original Round Corner', 'Taiwan Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Tora Red Duty Free Health Warning Round Corner', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('TRẦM HƯƠNG THIÊN NHIÊN (Đỏ)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('TRẦM HƯƠNG THIÊN NHIÊN (Trắng)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Viking Blast Blue Berry', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Viking Blast Red Wine', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Viking Blast Round Corner', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('War Horse (Đỏ)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('War Horse (Nâu)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('War Horse (Xanh)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('War Horse Blueberry Menthol', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('White Bear 7G', 'US HW', TRUE, 'Demi') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('White Bear AAA', 'US HW', TRUE, 'Demi') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('White Horse', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('White Horse Blaze', NULL, FALSE, 'Semi') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('White Horse Demi', NULL, FALSE, 'Demi') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('White Horse Gold', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('White Horse Slim VN', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Wifi Blast Round Corner Pack', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('WIN Blue', 'HK Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Win Blue Lights', 'Hong Kong HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Win Double Blast Kingsize', 'Hong Kong HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Win Green Menthol', 'Hong Kong HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Win Red Full Flavor', 'Hong Kong HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('WIN Red HK Health Warning', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('WIN Single Blast King Size', 'Hong Kong Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Yett (điếu dài)', NULL, FALSE, 'Semi') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('YETT (trắng)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('YETT (vàng)', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('YETT DEMI MENTHOL', NULL, FALSE, 'Demi') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Yett demi xanh', NULL, FALSE, 'Demi') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('YETT KINGSIZE XANH', NULL, FALSE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Yett Slims', NULL, FALSE, 'Slim') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Blast Menthol', 'Trinidad Health Warning Set A (Nake Wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Blast Menthol', 'Trinidad Health Warning Set B (Nake Wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Exclusive Blast', 'Amaran Picture Health Warning Round Corner', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Exclusive Blast', 'Trinidad Health Warning Round Corner', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Exclusive Blast', 'Trinidad Health Warning Set A (Nake Wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Exclusive Blast', 'Trinidad Health Warning Set B (Nake Wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King FF', 'Trinidad Text Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Vanilla', 'T&T HW Set B', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zon King Vanilla', 'Trinidad Health Warning Set A (Nake Wrap)', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Blast', 'T&T Pictorial HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing FF', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing FF', 'Trinidad Health Warning Set A', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing FF', 'Trinidad Health Warning Set B', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing FF', 'Trinidad Text Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing FF', 'Trinidad HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing FF (Diet)', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing FF (ME2 Blend)', 'Trinidad HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Full Flavor', 'Guyana Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Full Flavor (ME2 Blend)', 'Grenada Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Full Flavor (ME2 Blend)', 'Guyana Health Warning', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Menthol', 'Trinidad HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Menthol', 'Trinidad HW Set A', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Menthol', 'Trinidad HW Set B', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zonking MT', 'EEC HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZonKing Premium Round Corner Pack', NULL, TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zouk', 'Khmer HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zouk Chocolate', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zouk Churchill', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zouk Mango', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZOUK Raspberry', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZOUK RED', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zouk Red', 'USHW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('ZOUK Spice', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zouk White', 'Japanese HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;
INSERT INTO products (product_name, warning_code, is_export, format) VALUES ('Zouk White', 'Khmer HW', TRUE, 'Kingsize') ON CONFLICT (product_name, warning_code) DO NOTHING;

-- 6. Bảng loose_pack_audits (Lịch sử kiểm tra & cập nhật riêng cho Ô 5 - Hàng lẻ)
CREATE TABLE IF NOT EXISTS public.loose_pack_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sample_id UUID REFERENCES public.samples(id) ON DELETE CASCADE,
    sku TEXT,
    product_name TEXT NOT NULL,
    blend_batch TEXT,
    packaging_date DATE,
    shelf INTEGER NOT NULL CHECK (shelf BETWEEN 1 AND 6),
    slot INTEGER NOT NULL DEFAULT 5,
    action_type TEXT NOT NULL CHECK (action_type IN ('check', 'uncheck', 'adjust_qty', 'deplete', 'restore', 'reset_slot')),
    old_qty INTEGER,
    new_qty INTEGER,
    actor_name TEXT,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.loose_pack_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read loose_pack_audits" ON public.loose_pack_audits
    FOR SELECT USING (public.is_admin());

CREATE POLICY "Allow admin manage loose_pack_audits" ON public.loose_pack_audits
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 7. Hàm kiểm tra quyền Admin an toàn & Hệ thống Audit Logs tự động
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
$$;

CREATE TABLE IF NOT EXISTS public.warehouse_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    actor_id UUID,
    actor_name TEXT,
    actor_role TEXT,
    reason TEXT,
    old_data JSONB,
    new_data JSONB,
    changed_fields TEXT[] NOT NULL DEFAULT '{}',
    summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_warehouse_audit_logs_created_at
    ON public.warehouse_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_audit_logs_table_record
    ON public.warehouse_audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_audit_logs_actor_id
    ON public.warehouse_audit_logs (actor_id);

CREATE OR REPLACE FUNCTION public.fn_audit_warehouse_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_name TEXT;
  v_actor_role TEXT;
  v_old JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new JSONB := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_ref JSONB := COALESCE(v_new, v_old);
  v_record_id TEXT;
  v_changed_fields TEXT[] := '{}';
  v_summary TEXT := '';
  v_product_name TEXT;
  v_sku TEXT;
BEGIN
  IF v_actor_id IS NOT NULL THEN
    SELECT p.full_name, p.role
    INTO v_actor_name, v_actor_role
    FROM public.profiles p
    WHERE p.id = v_actor_id;
  END IF;

  v_actor_name := COALESCE(
    NULLIF(trim(v_actor_name), ''),
    CASE WHEN v_actor_id IS NULL THEN 'Hệ thống' ELSE 'Không rõ' END
  );
  v_actor_role := COALESCE(
    v_actor_role,
    CASE WHEN v_actor_id IS NULL THEN 'system' ELSE 'unknown' END
  );

  v_record_id := COALESCE(
    v_ref->>'id',
    CASE
      WHEN TG_TABLE_NAME = 'slot_configs' THEN concat_ws('-', v_ref->>'shelf', v_ref->>'slot', v_ref->>'column_number')
      ELSE NULL
    END,
    'unknown'
  );

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(array_agg(t.k ORDER BY t.k), '{}')
    INTO v_changed_fields
    FROM jsonb_object_keys(v_old || v_new) AS t(k)
    WHERE t.k <> 'updated_at'
      AND (v_old -> t.k) IS DISTINCT FROM (v_new -> t.k);

    IF array_length(v_changed_fields, 1) IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'samples' THEN
    v_sku := v_ref->>'sku';
    IF (v_ref->>'product_id') IS NOT NULL THEN
      SELECT pr.product_name INTO v_product_name
      FROM public.products pr
      WHERE pr.id = (v_ref->>'product_id')::UUID;
    END IF;

    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'Thêm mẫu ' || COALESCE(v_product_name, 'Không rõ') || COALESCE(' (SKU: ' || v_sku || ')', '') || ' - SL: ' || COALESCE(v_ref->>'available_qty', '0')
      WHEN 'UPDATE' THEN 'Cập nhật mẫu ' || COALESCE(v_product_name, 'Không rõ') || COALESCE(' (SKU: ' || v_sku || ')', '') || ' [' || array_to_string(v_changed_fields, ', ') || ']'
      WHEN 'DELETE' THEN 'Xóa mẫu ' || COALESCE(v_product_name, 'Không rõ') || COALESCE(' (SKU: ' || v_sku || ')', '')
    END;
  ELSIF TG_TABLE_NAME = 'transactions' THEN
    IF (v_ref->>'sample_id') IS NOT NULL THEN
      SELECT s.sku, pr.product_name
      INTO v_sku, v_product_name
      FROM public.samples s
      LEFT JOIN public.products pr ON pr.id = s.product_id
      WHERE s.id = (v_ref->>'sample_id')::UUID;
    END IF;

    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'Tạo giao dịch (' || COALESCE(v_ref->>'type', '') || ') ' || COALESCE(v_product_name, 'Mẫu') || COALESCE(' (SKU: ' || v_sku || ')', '') || ' - SL: ' || COALESCE(v_ref->>'quantity', '0')
      WHEN 'UPDATE' THEN 'Cập nhật giao dịch (' || COALESCE(v_ref->>'type', '') || ') ' || COALESCE(v_product_name, 'Mẫu') || COALESCE(' (SKU: ' || v_sku || ')', '') || ' [' || array_to_string(v_changed_fields, ', ') || ']'
      WHEN 'DELETE' THEN 'Xóa giao dịch (' || COALESCE(v_ref->>'type', '') || ') ' || COALESCE(v_product_name, 'Mẫu') || COALESCE(' (SKU: ' || v_sku || ')', '')
    END;
  ELSIF TG_TABLE_NAME = 'boxes' THEN
    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'Tạo thùng ' || COALESCE(v_ref->>'box_name', v_record_id)
      WHEN 'UPDATE' THEN 'Cập nhật thùng ' || COALESCE(v_ref->>'box_name', v_record_id) || ' [' || array_to_string(v_changed_fields, ', ') || ']'
      WHEN 'DELETE' THEN 'Xóa thùng ' || COALESCE(v_ref->>'box_name', v_record_id)
    END;
  ELSIF TG_TABLE_NAME = 'products' THEN
    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'Thêm sản phẩm ' || COALESCE(v_ref->>'product_name', v_record_id)
      WHEN 'UPDATE' THEN 'Cập nhật sản phẩm ' || COALESCE(v_ref->>'product_name', v_record_id) || ' [' || array_to_string(v_changed_fields, ', ') || ']'
      WHEN 'DELETE' THEN 'Xóa sản phẩm ' || COALESCE(v_ref->>'product_name', v_record_id)
    END;
  ELSIF TG_TABLE_NAME = 'slot_configs' THEN
    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'Cấu hình ô Kệ ' || COALESCE(v_ref->>'shelf', '?') || ' - Ô ' || COALESCE(v_ref->>'slot', '?')
      WHEN 'UPDATE' THEN 'Cập nhật cấu hình Kệ ' || COALESCE(v_ref->>'shelf', '?') || ' - Ô ' || COALESCE(v_ref->>'slot', '?') || ' [' || array_to_string(v_changed_fields, ', ') || ']'
      WHEN 'DELETE' THEN 'Xóa cấu hình Kệ ' || COALESCE(v_ref->>'shelf', '?') || ' - Ô ' || COALESCE(v_ref->>'slot', '?')
    END;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'Cấp tài khoản ' || COALESCE(NULLIF(trim(v_ref->>'full_name'), ''), v_ref->>'email', v_record_id)
        || COALESCE(' (' || NULLIF(trim(v_ref->>'email'), '') || ')', '')
        || ' - Vai trò: ' || COALESCE(v_ref->>'role', 'staff')
      WHEN 'UPDATE' THEN 'Cập nhật tài khoản ' || COALESCE(NULLIF(trim(v_ref->>'full_name'), ''), v_ref->>'email', v_record_id)
        || ' [' || array_to_string(v_changed_fields, ', ') || ']'
      WHEN 'DELETE' THEN 'Xóa tài khoản ' || COALESCE(NULLIF(trim(v_ref->>'full_name'), ''), v_ref->>'email', v_record_id)
        || COALESCE(' (' || NULLIF(trim(v_ref->>'email'), '') || ')', '')
    END;
  ELSE
    v_summary := TG_OP || ' ' || TG_TABLE_NAME || ' (' || v_record_id || ')';
  END IF;

  IF to_regclass('public.warehouse_audit_logs') IS NOT NULL THEN
    INSERT INTO public.warehouse_audit_logs (
      table_name, record_id, action, actor_id, actor_name, actor_role,
      old_data, new_data, changed_fields, summary
    ) VALUES (
      TG_TABLE_NAME, v_record_id, TG_OP, v_actor_id, v_actor_name, v_actor_role,
      v_old, v_new, v_changed_fields, v_summary
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  tbl TEXT;
  audited_tables TEXT[] := ARRAY['samples', 'boxes', 'products', 'slot_configs', 'transactions', 'profiles'];
BEGIN
  FOREACH tbl IN ARRAY audited_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', tbl, tbl);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_audit_warehouse_changes()',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_set_audit_reason(
  p_table_name TEXT,
  p_record_id TEXT,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Chỉ Admin mới được phép cập nhật lý do audit';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN false;
  END IF;

  SELECT id INTO v_target_id
  FROM public.warehouse_audit_logs
  WHERE table_name = p_table_name
    AND record_id = p_record_id
    AND actor_id = auth.uid()
    AND reason IS NULL
    AND created_at >= timezone('utc'::text, now()) - INTERVAL '60 seconds'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_target_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.warehouse_audit_logs
  SET reason = trim(p_reason)
  WHERE id = v_target_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_set_audit_reason(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_set_audit_reason(TEXT, TEXT, TEXT) TO authenticated;

ALTER TABLE public.warehouse_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read warehouse_audit_logs" ON public.warehouse_audit_logs;
CREATE POLICY "Admin read warehouse_audit_logs" ON public.warehouse_audit_logs
    FOR SELECT USING (public.is_admin());

REVOKE ALL ON public.warehouse_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.warehouse_audit_logs TO authenticated, service_role;

-- 8. RPC quản trị tài khoản & đồng bộ email
CREATE OR REPLACE FUNCTION public.rpc_admin_provision_profile(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_employee_code TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'staff'
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_email TEXT;
  v_email TEXT;
  v_full_name TEXT;
  v_employee_code TEXT;
  v_department TEXT;
  v_role TEXT;
  v_profile public.profiles;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Chỉ Admin mới được phép cấp tài khoản';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu user_id của tài khoản';
  END IF;

  SELECT u.email INTO v_auth_email
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản xác thực tương ứng';
  END IF;

  v_full_name := NULLIF(trim(p_full_name), '');
  IF v_full_name IS NULL THEN
    RAISE EXCEPTION 'Họ và tên không được để trống';
  END IF;

  v_role := COALESCE(NULLIF(trim(lower(p_role)), ''), 'staff');
  IF v_role NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'Vai trò không hợp lệ (chỉ chấp nhận admin hoặc staff)';
  END IF;

  v_email := COALESCE(NULLIF(trim(lower(p_email)), ''), v_auth_email);
  v_employee_code := NULLIF(trim(p_employee_code), '');
  v_department := NULLIF(trim(p_department), '');

  INSERT INTO public.profiles (
    id, email, full_name, employee_code, department, role, is_active, updated_at
  ) VALUES (
    p_user_id, v_email, v_full_name, v_employee_code, v_department, v_role, true, timezone('utc'::text, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    employee_code = EXCLUDED.employee_code,
    department = EXCLUDED.department,
    role = EXCLUDED.role,
    updated_at = timezone('utc'::text, now())
  RETURNING * INTO v_profile;

  BEGIN
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, timezone('utc'::text, now()))
    WHERE id = p_user_id AND email_confirmed_at IS NULL;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_provision_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_provision_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_account(
  p_target_id UUID,
  p_full_name TEXT,
  p_employee_code TEXT,
  p_department TEXT,
  p_role TEXT,
  p_is_active BOOLEAN
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.profiles;
  v_updated public.profiles;
  v_full_name TEXT;
  v_employee_code TEXT;
  v_department TEXT;
  v_role TEXT;
  v_is_active BOOLEAN;
  v_active_admin_count INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Chỉ Admin mới được phép cập nhật tài khoản';
  END IF;

  IF p_target_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã tài khoản cần cập nhật';
  END IF;

  SELECT * INTO v_existing
  FROM public.profiles
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ tài khoản';
  END IF;

  v_full_name := COALESCE(NULLIF(trim(p_full_name), ''), v_existing.full_name);
  v_employee_code := NULLIF(trim(p_employee_code), '');
  v_department := NULLIF(trim(p_department), '');
  v_role := COALESCE(NULLIF(trim(lower(p_role)), ''), v_existing.role);
  v_is_active := COALESCE(p_is_active, v_existing.is_active);

  IF v_role NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'Vai trò không hợp lệ (chỉ chấp nhận admin hoặc staff)';
  END IF;

  IF p_target_id = auth.uid() AND v_is_active = false THEN
    RAISE EXCEPTION 'Không thể tự khóa tài khoản của chính mình';
  END IF;

  IF p_target_id = auth.uid() AND v_existing.role = 'admin' AND v_role <> 'admin' THEN
    RAISE EXCEPTION 'Không thể tự hạ quyền Admin của chính mình';
  END IF;

  IF v_existing.role = 'admin' AND v_existing.is_active = true AND (v_role <> 'admin' OR v_is_active = false) THEN
    SELECT count(*) INTO v_active_admin_count
    FROM public.profiles
    WHERE role = 'admin'
      AND is_active = true
      AND id <> p_target_id;

    IF v_active_admin_count = 0 THEN
      RAISE EXCEPTION 'Không thể khóa hoặc hạ quyền Admin đang hoạt động cuối cùng trong hệ thống';
    END IF;
  END IF;

  UPDATE public.profiles
  SET full_name = v_full_name,
      employee_code = v_employee_code,
      department = v_department,
      role = v_role,
      is_active = v_is_active,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_target_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_update_account(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_account(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_admin_delete_account(
  p_target_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.profiles;
  v_remaining_admin_count INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Chỉ Admin mới được phép xóa tài khoản';
  END IF;

  IF p_target_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu mã tài khoản cần xóa';
  END IF;

  IF p_target_id = auth.uid() THEN
    RAISE EXCEPTION 'Không thể tự xóa tài khoản của chính mình';
  END IF;

  SELECT * INTO v_existing
  FROM public.profiles
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ tài khoản cần xóa';
  END IF;

  IF v_existing.role = 'admin' THEN
    SELECT count(*) INTO v_remaining_admin_count
    FROM public.profiles
    WHERE role = 'admin'
      AND is_active = true
      AND id <> p_target_id;

    IF v_remaining_admin_count = 0 THEN
      RAISE EXCEPTION 'Không thể xóa Admin đang hoạt động cuối cùng trong hệ thống';
    END IF;
  END IF;

  DELETE FROM auth.users WHERE id = p_target_id;
  DELETE FROM public.profiles WHERE id = p_target_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_admin_delete_account(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_delete_account(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_sync_my_email()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Cần đăng nhập để đồng bộ email';
  END IF;

  SELECT u.email INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản xác thực';
  END IF;

  UPDATE public.profiles
  SET email = v_email,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_uid
    AND email IS DISTINCT FROM v_email;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_sync_my_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_sync_my_email() TO authenticated;

NOTIFY pgrst, 'reload schema';
