# Tài liệu Đặc tả Yêu cầu Nghiệp vụ (Yeucau.md)
## Dự án: Webapp Quản lý Kho Lưu Thuốc Lá Mẫu (Supabase + Firebase Hosting)

Tài liệu này lưu trữ toàn bộ các thông tin đặc tả nghiệp vụ, kiến trúc kỹ thuật và quy trình hoạt động đã được thống nhất cho ứng dụng quản lý kho lưu thuốc lá mẫu.

---

## 1. Tổng Quan Dự Án & Vai Trò Người Dùng

*   **Mục tiêu**: Quản lý kho lưu thuốc lá mẫu do bộ phận QC lấy mẫu và bàn giao. Hệ thống hoạt động hoàn toàn miễn phí duy trì, độ bảo mật và an toàn dữ liệu cao.
*   **Dữ liệu**: Dữ liệu sản phẩm gốc được đồng bộ từ file danh sách có sẵn `Danh sach.xlsx` (khoảng 351 sản phẩm). Hệ thống hỗ trợ thêm mới sản phẩm trực tiếp trên giao diện. Chỉ lưu trữ thông tin dạng ký tự (Text), không lưu hình ảnh.
*   **Người dùng hệ thống**:
    *   **Thủ kho (Admin)**: Quản lý toàn bộ kho, quản lý danh mục sản phẩm, thực hiện nhập kho, xuất kho, phê duyệt yêu cầu lấy mẫu, đóng thùng mẫu khi quá tải, in mã QR, nhận báo cáo hủy mẫu hàng tuần.
    *   **Nhân viên (Staff)**: Chỉ có quyền truy cập vào màn hình Tìm kiếm để tra cứu vị trí mẫu thuốc lá và gửi yêu cầu đăng ký lấy mẫu.

---

## 2. Thiết Kế Cơ Sở Dữ Liệu (Database Schema)

Hệ thống sử dụng các bảng SQL PostgreSQL trên Supabase để liên kết dữ liệu chặt chẽ:

### 2.1. Bảng `profiles` (Người dùng & Phân quyền)
Liên kết 1-1 với hệ thống tài khoản mặc định của Supabase (`auth.users`).

| Tên trường (Column) | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Primary Key, FK `auth.users` | ID định danh tài khoản từ hệ thống Auth |
| `full_name` | Text | Not Null | Họ và tên người dùng |
| `employee_code` | Text | Unique | Mã nhân viên |
| `department` | Text | - | Phòng ban làm việc |
| `role` | Text | Not Null | Vai trò: `admin` (Thủ kho) hoặc `staff` (Nhân viên) |
| `created_at` | Timestamp | Default: now() | Ngày tạo tài khoản |

### 2.2. Bảng `products` (Danh mục sản phẩm gốc)
Lưu danh sách 351 sản phẩm gốc được cấu hình từ file `Danh sach.xlsx` và các sản phẩm mới do Thủ kho thêm vào.

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Primary Key | ID định danh sản phẩm |
| `product_name` | Text | Unique, Not Null | Tên sản phẩm thuốc lá (Ví dụ: "555 Slim", "American Remote"...) |
| `warning_code` | Text | - | Mã cảnh báo sức khỏe (Ví dụ: "EEC HW", "HK Health Warning"...) |
| `is_export` | Boolean | Default: false | Trạng thái xuất khẩu (True: hàng xuất khẩu, False: nội địa) |
| `format` | Text | - | Định dạng điếu (Kingsize, Slim, SuperSlim/SSL, Semi, Demi) |
| `created_at` | Timestamp | Default: now() | Ngày tạo |

### 2.3. Bảng `samples` (Lô mẫu thuốc lá trong kho)
Lưu trữ thông tin chi tiết từng đợt mẫu được nhập vào kho. Đơn vị tính cơ bản là **Bao (Pack)**. (1 Cây = 10 Bao).

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Primary Key | ID định danh lô mẫu |
| `sku` | Text | Unique, Not Null | Mã định danh mẫu dùng để tạo mã QR |
| `product_id` | UUID | FK `products.id`, Not Null | Liên kết sang danh mục sản phẩm gốc để lấy thông tin sản phẩm |
| `order_number` | Text | - | Số đơn hàng (bắt buộc nhập nếu sản phẩm liên kết có `is_export = true`) |
| `blend_batch` | Text | Not Null | Ký hiệu Mẻ sợi |
| `blend_date` | Date | Not Null | Ngày sản xuất sợi |
| `packaging_date` | Date | Not Null | Ngày sản xuất bao (Mốc tính hạn 12 tháng) |
| `sampling_time` | Timestamp | Not Null | Thời gian QC thực hiện lấy mẫu |
| `shelf` | Integer | Nullable (1-6) | Kệ lưu trữ (Null nếu mẫu đã đóng vào thùng lưu trữ) |
| `slot` | Integer | Nullable (1-5) | Ô lưu trữ (Null nếu mẫu đã đóng vào thùng. Ô 5 là ô lẻ) |
| `column_number` | Integer | Nullable (1-8) | Cột trong ô kệ (Null nếu mẫu đã đóng vào thùng. Kingsize/SSL/Slim/Semi: 1-6; Demi: 1-8) |
| `box_id` | UUID | Nullable, FK `boxes.id` | Liên kết đến Thùng lưu trữ (nếu đã đóng thùng khi quá tải) |
| `total_qty` | Integer | Not Null, >= 0 | Số lượng bao mẫu nhập kho ban đầu |
| `available_qty` | Integer | Not Null, >= 0 | Số lượng bao mẫu còn lại khả dụng trong kho |
| `entry_date` | Date | Default: now() | Ngày nhập kho lưu thực tế |
| `status` | Text | Default: 'stored' | Trạng thái: `stored` (kệ), `boxed` (đóng thùng), `destroyed` (đã hủy) |
| `created_at` | Timestamp | Default: now() | Ngày tạo bản ghi |
| `updated_at` | Timestamp | Default: now() | Ngày cập nhật gần nhất |

### 2.4. Bảng `boxes` (Thùng lưu trữ mẫu khi quá tải kệ)
Lưu trữ thông tin các thùng chứa mẫu được đóng gói khi kệ kho bị vượt quá sức chứa.

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Primary Key | ID định danh thùng |
| `box_name` | Text | Unique, Not Null | Tên thùng đặt theo tháng đóng (Ví dụ: "Thùng 06/2026") |
| `created_at` | Timestamp | Default: now() | Ngày đóng thùng |
| `status` | Text | Default: 'stored' | Trạng thái thùng: `stored` (đang lưu), `destroyed` (đã hủy toàn bộ mẫu bên trong) |

### 2.5. Bảng `transactions` (Lịch sử giao dịch Xuất/Nhập/Lấy mẫu)

| Tên trường | Kiểu dữ liệu | Ràng buộc | Mô tả |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Primary Key | ID giao dịch |
| `sample_id` | UUID | FK `samples.id`, Cascade | Liên kết tới lô mẫu |
| `user_id` | UUID | FK `profiles.id` | Người đăng ký lấy mẫu hoặc thủ kho xử lý nhập/xuất |
| `type` | Text | Not Null | Loại giao dịch: `import` (Nhập), `export` (Xuất), `take_request` (Nhân viên đăng ký lấy), `take_approve` (Thủ kho duyệt cấp) |
| `quantity` | Integer | Not Null, > 0 | Số lượng bao giao dịch |
| `status` | Text | - | Trạng thái phiếu: `pending` (chờ cấp), `approved` (đã cấp), `cancelled` (đã hủy yêu cầu) |
| `note` | Text | - | Lý do lấy mẫu hoặc ghi chú xuất nhập |
| `created_at` | Timestamp | Default: now() | Thời gian giao dịch |

---

## 3. Đặc Tả Quy Trình Nghiệp Vụ (Workflows)

### 3.1. Cấu Trúc Kệ Kho & Quy Tắc Xếp Cột Vật Lý (Column-level Storage)
*   **Cấu trúc vật lý**: Kho gồm **6 Kệ (Shelf)**, mỗi Kệ có **5 Ô (Slot)**.
*   **Quy tắc phân chia cột trong Ô (cho Ô 1, 2, 3, 4 chứa các Cây thuốc lá nguyên)**:
    Mỗi ô chứa một số lượng cột nhất định tùy theo định dạng điếu của sản phẩm. **Đặc biệt: Mỗi cột chỉ chứa duy nhất 1 sản phẩm (1 mã sản phẩm/lô mẫu cụ thể, không xếp chồng các sản phẩm khác nhau lên cùng một cột).**
    Chiều cao tối đa (số cây xếp chồng chồng lên nhau trong 1 cột thẳng đứng) của mỗi cột được quy định như sau:
    *   **Kingsize**: Ô gồm **6 cột** (đánh số 1-6). Mỗi cột chứa tối đa **7 cây** xếp chồng lên nhau (Tổng tối đa cả ô: 42 cây / 420 bao).
    *   **SuperSlim / SSL**: Ô gồm **6 cột** (đánh số 1-6). Mỗi cột chứa tối đa **10 cây** xếp chồng lên nhau (Tổng tối đa cả ô: 60 cây / 600 bao).
    *   **Semi**: Ô gồm **6 cột** (đánh số 1-6). Mỗi cột chứa tối đa **7 cây** xếp chồng lên nhau (Tổng tối đa cả ô: 42 cây / 420 bao).
    *   **Demi**: Ô gồm **8 cột** (đánh số 1-8). Mỗi cột chứa tối đa **7 cây** xếp chồng lên nhau (Tổng tối đa cả ô: 56 cây / 560 bao).
    *   **Slim**: Ô gồm **6 cột** (đánh số 1-6). Mỗi cột chứa tối đa **10 cây** xếp chồng lên nhau (Tổng tối đa cả ô: 60 cây / 600 bao).
*   **Quy tắc kiểm soát sức chứa cột**:
    Khi Thủ kho xếp một lô mẫu vào `(Kệ, Ô, Cột)`:
    1.  Hệ thống kiểm tra xem Cột đó đã có sản phẩm khác chưa. Nếu có sản phẩm khác $\rightarrow$ Báo lỗi (Mỗi cột chỉ chứa duy nhất 1 sản phẩm).
    2.  Nếu cột trống hoặc chứa cùng sản phẩm đó, hệ thống kiểm tra tổng số lượng xếp chồng. Nếu số cây nhập thêm + số cây hiện có vượt quá chiều cao tối đa của cột (ví dụ: > 7 cây với Kingsize) $\rightarrow$ Hệ thống cảnh báo cột đã đầy và yêu cầu chọn cột khác hoặc thực hiện đóng thùng mẫu cũ để lấy chỗ.
*   **Quy tắc ô lẻ (Ô 5)**:
    *   Ô 5 của mỗi kệ là **Ô chứa hàng lẻ (Loose Slot)**.
    *   Khi nhân viên đăng ký lấy mẫu lẻ (ví dụ: lấy 3 bao từ 1 cây 10 bao), thủ kho bóc cây thuốc ra giao 3 bao cho nhân viên, và chuyển **7 bao còn lại** vào **Ô 5 của kệ đó**. Ô 5 không áp dụng giới hạn cứng theo số cột xếp chồng của cây nguyên mà dùng để gom toàn bộ bao lẻ của kệ tương ứng.

### 3.2. Quản Lý Thời Hạn Lưu Trữ Mẫu (12 Tháng từ ngày sản xuất bao)
*   Hạn lưu trữ tối đa của thuốc lá mẫu là **12 tháng tính từ Ngày sản xuất bao (packaging_date)**.
*   **Báo cáo hủy mẫu định kỳ**:
    *   Hàng tuần, hệ thống sẽ tự động chạy một tiến trình (Cron Job / Edge Function) để quét các mẫu có tuổi thọ tính từ `packaging_date` vượt quá 12 tháng.
    *   Hệ thống tự động biên soạn và gửi một email đến Thủ kho kèm file **PDF danh sách mẫu quá hạn**.
    *   Thủ kho dùng file PDF này để làm việc với các bộ phận liên quan và tiến hành thủ tục hủy mẫu vật lý, sau đó xác nhận "Đã hủy" trên hệ thống để đổi trạng thái mẫu thành `destroyed`.

### 3.3. Quy Trình Tìm Kiếm & Đăng Ký Lấy Mẫu Của Nhân Viên
*   Giao diện của Nhân viên lấy mẫu được thiết kế tối giản, chỉ có thanh tìm kiếm với 2 trường thông tin:
    1.  **Tên sản phẩm (Bắt buộc)**: Lựa chọn hoặc gõ tìm kiếm theo danh mục tên sản phẩm trong bảng `products`.
    2.  **Tháng sản xuất (Không bắt buộc)**: Chọn tháng/năm sản xuất (dựa trên `packaging_date`). Nếu điền, hệ thống sẽ lọc chính xác mẫu của tháng đó.
*   **Kết quả tìm kiếm**:
    *   If mẫu nằm trên kệ: Hiển thị vị trí dạng "Kệ X - Ô Y - Cột Z" và số lượng còn lại.
    *   Nếu mẫu đã được đóng thùng do quá tải kệ: Hiển thị vị trí dạng **"Lưu trữ ở Thùng MM/YYYY"**.
*   **Yêu cầu lấy mẫu**: Nhân viên bấm đăng ký lấy mẫu $\rightarrow$ Nhập số lượng bao $\rightarrow$ Trạng thái gửi lên là "Chờ cấp mẫu".

### 3.4. Quản Lý Danh Mục Sản Phẩm (Product Catalog Management)
*   Thủ kho có một trang quản trị danh mục sản phẩm (sửa đổi trực tiếp bảng `products`).
*   Thủ kho có thể thêm mới một loại sản phẩm mới bằng cách nhập đủ 4 thông tin:
    1.  **Tên sản phẩm** (Tên SP)
    2.  **Mã cảnh báo** (Warning Code)
    3.  **Hàng xuất khẩu** (Đánh dấu Yes/No tương đương True/False)
    4.  **Định dạng điếu** (Chọn 1 trong các tùy chọn: Kingsize, Slim, SuperSlim, Semi, Demi)
*   Sản phẩm mới thêm sẽ lập tức xuất hiện trong danh sách tìm kiếm khi nhập kho lưu hoặc khi nhân viên tra cứu.

### 3.5. Quy trình Nhập Kho & Thuật Toán Đề Xuất Vị Trí Lưu Mẫu
1.  Khi nhập kho, Thủ kho chọn sản phẩm từ danh mục `products`. Hệ thống tự điền: Tên sản phẩm, Mã cảnh báo, Định dạng điếu và kiểm tra xem có phải hàng xuất khẩu không.
2.  Nếu là hàng xuất khẩu, yêu cầu nhập thêm **Số đơn hàng**.
3.  Nhập các thông tin QC khác: Mẻ sợi, Ngày sản xuất sợi, Ngày sản xuất bao, Thời gian lấy mẫu, Số lượng nhập (tính theo bao).
4.  **Thuật toán đề xuất vị trí lưu mẫu tự động**:
    Khi thủ kho chuẩn bị xếp mẫu vào kệ, hệ thống sẽ tự động tính toán và gợi ý vị trí lưu tối ưu nhất dựa trên các ưu tiên sau:
    *   **Ưu tiên 1 (Cùng loại - Còn chỗ)**: Tìm kiếm các cột trong kho (Kệ 1-6, Ô 1-4) *đang chứa cùng loại sản phẩm này* và *chưa xếp chồng đầy* (chiều cao cột hiện tại < chiều cao tối đa của định dạng đó). Nếu tìm thấy, hệ thống sẽ gợi ý cột này đầu tiên để gom sản phẩm cùng loại vào chung một cột.
    *   **Ưu tiên 2 (Cột trống cùng định dạng)**: Nếu không có cột nào đang chứa sản phẩm đó còn chỗ, hệ thống tìm các ô kệ *đã có chứa các sản phẩm cùng định dạng điếu* (ví dụ: cùng chứa hàng Kingsize) và chọn một cột còn đang trống trong ô đó để đặt mẫu.
    *   **Ưu tiên 3 (Cột trống bất kỳ từ dưới lên)**: Nếu không tìm thấy các trường hợp trên, hệ thống sẽ tìm kiếm cột trống bất kỳ trong kho, ưu tiên các kệ thấp trước (từ Kệ 1 lên Kệ 6, Ô 1 lên Ô 4, Cột 1 lên Cột 6/8) để thủ kho dễ dàng thao tác vật lý.
    *   *Trường hợp hết chỗ*: Hệ thống hiển thị thông báo kho đã đầy và hướng dẫn thủ kho thực hiện quy trình đóng thùng mẫu cũ để lấy chỗ.
5.  Thủ kho có thể đồng ý với vị trí gợi ý hoặc tự chọn vị trí khác bằng tay.
6.  Hệ thống ghi nhận, tạo mã SKU duy nhất và xuất ra một **Mã QR** chứa thông tin chi tiết lô mẫu.
7.  Thủ kho in mã QR ra dán lên cây thuốc và đưa vào vị trí đã thống nhất.

### 3.6. Quy Trình Đóng Thùng Khi Vượt Quá Sức Chứa (Overcapacity Workflow)
*   Khi ô kho / cột kho bị vượt quá sức chứa vật lý:
    1. Hệ thống hỗ trợ thủ kho tổng hợp danh sách các mẫu có **Ngày sản xuất bao (`packaging_date`) xa nhất (cũ nhất)** trên các kệ.
    2. Thủ kho chọn các mẫu này để thực hiện quy trình "Đóng thùng".
    3. Hệ thống yêu cầu chỉ định tên thùng theo định dạng tháng đóng (ví dụ: `Thùng 06/2026`).
    4. Hệ thống cập nhật trường `shelf = Null`, `slot = Null`, `column_number = Null`, và `box_id = ID Thùng`, đồng thời chuyển trạng thái của các mẫu này thành `boxed`.
    5. Hệ thống xuất ra file **PDF danh sách mẫu đóng thùng** để thủ kho in ra dán lên mặt ngoài của thùng giấy vật lý.
    6. Các mẫu đã đóng thùng vẫn được tìm kiếm bình thường bởi nhân viên (kết quả hiển thị vị trí ở "Thùng MM/YYYY") cho đến khi hết hạn 12 tháng và được hủy.
