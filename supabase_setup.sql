-- 1. Bảng profiles (Thông tin bổ sung người dùng)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    employee_code TEXT UNIQUE,
    department TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Bật RLS cho profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cho phép tất cả mọi người đọc profile" ON profiles
    FOR SELECT USING (true);

CREATE POLICY "Người dùng tự cập nhật profile của mình" ON profiles
    FOR UPDATE USING (auth.uid() = id);

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
    type TEXT NOT NULL CHECK (type IN ('import', 'export', 'take_request', 'take_approve')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
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
