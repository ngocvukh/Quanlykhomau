# LỘ TRÌNH CHI TIẾT TÁCH FRONTEND (VERCEL) & BACKEND (SUPABASE)
> **Mục tiêu:** Tách biệt giao diện (FE) và xử lý nghiệp vụ kho (BE), tối ưu tốc độ tải trang, thu gọn `src/App.jsx` (~14.868 dòng) mà **TUYỆT ĐỐI KHÔNG ẢNH HƯỞNG ĐẾN WEB ĐANG CHẠY**.
> **Dành cho AI Agent (Flash 3.8):** Thực hiện tuần tự từng Task nhỏ bên dưới. Xong mỗi Task phải đánh dấu `[x]`, chạy `npm run build` kiểm tra 0 lỗi, và dừng lại chờ người dùng kiểm tra ở Local.

---

## ⚠️ QUY TẮC BẮT BUỘC CHO FLASH 3.8 (ĐỌC KỸ TRƯỚC KHI CODE)

1. **Quy tắc CRLF trên Windows:** Khi dùng script sửa `src/App.jsx`, BẮT BUỘC đọc file $\rightarrow$ `.replace(/\r\n/g, '\n')` $\rightarrow$ xử lý thay thế $\rightarrow$ `.replace(/\n/g, '\r\n')` trước khi ghi lại.
2. **Quy tắc Không làm gián đoạn Web hiện hữu (Fallback 100%):**
   - Mọi hàm gọi Supabase RPC mới ở Frontend BẮT BUỘC phải viết trong khối `try { await supabase.rpc(...) } catch / if (rpcError) { ...chạy lại logic query cũ... }`.
   - Nhờ vậy, dù người dùng chưa kịp chạy file SQL trên Supabase thì web vẫn hoạt động bình thường 100% bằng logic cũ.
3. **Quy tắc Bảo toàn nghiệp vụ ngầm:**
   - Giữ nguyên quy tắc **Ô lẻ 5**: Khi `newQty % 10 !== 0` và `newQty > 0` từ Ô 1–4 $\rightarrow$ tự động chuyển sang `slot = 5, column_number = 1`.
   - Giữ nguyên chuỗi **`[RESTORE:shelf|slot|column|box_id|status]`** trong `transactions.note` khi duyệt cấp mẫu để không làm hỏng nút **Hoàn tác / Khôi phục**.
   - Giữ nguyên chế độ `isDemoMode`.
4. **Quy tắc Git:** Tuyệt đối **KHÔNG** tự ý `git commit` hay `git push` khi người dùng chưa test ở local và chưa ra lệnh **"Up Git"**.

---

## GIAI ĐOẠN 1: TỐI ƯU TỐC ĐỘ TẢI TRANG & TÁCH HÀM TIỆN ÍCH THUẦN TÚY (RỦI RO = 0%)
*Mục tiêu: Giảm gần 50% dung lượng tải trang ban đầu và rút gọn các hàm không dính tới React State ra khỏi `src/App.jsx`.*

### Task 1.1: Xóa import tĩnh `html2pdf.js` để giảm nửa dung lượng bundle ban đầu
- [x] **Bước 1.1.1:** Mở `src/App.jsx`, xóa dòng 3: `import html2pdf from 'html2pdf.js';`.
- [x] **Bước 1.1.2:** Tại hàm in phiếu dọn kho (khoảng dòng 2320, nơi gọi `html2pdf().from(element)`), thêm `async` cho hàm chứa nó (nếu chưa có) và thêm dòng tải động ngay trước khi gọi:
  ```js
  const html2pdf = (await import('html2pdf.js')).default;
  ```
  *(Lưu ý: ở dòng ~6901 đã dùng `await import('html2pdf.js')` sẵn rồi, chỉ cần sửa nốt chỗ dòng 2321).*
- [x] **Bước 1.1.3:** Chạy `npm run build` $\rightarrow$ Kiểm tra cảnh báo `[INEFFECTIVE_DYNAMIC_IMPORT] html2pdf.js` đã biến mất và file `dist/assets/index-*.js` đã tách riêng chunk `html2pdf`.

### Task 1.2: Tách bộ nhận diện thiết bị & Fingerprint sang `src/utils/deviceUtils.js`
- [x] **Bước 1.2.1:** Tạo file `src/utils/deviceUtils.js`.
- [x] **Bước 1.2.2:** Chuyển các hàm thuần túy từ `src/App.jsx` (dòng 74 đến dòng 268) sang `src/utils/deviceUtils.js` và `export` chúng:
  - `getIphoneModel`
  - `getIpadModel`
  - `getDeviceDescription`
  - `getDisplayDeviceName`
  - `formatCompactDeviceName`
  - `generateDeviceId`
- [x] **Bước 1.2.3:** Trong `src/App.jsx`, import các hàm trên từ `./utils/deviceUtils` và xóa phần khai báo cũ trong `src/App.jsx`.
- [x] **Bước 1.2.4:** Chạy `npm run build` kiểm tra 0 lỗi.

### Task 1.3: Tách các hàm Format, Giải mã `SINGAPOREZ`, Tạo QR SVG sang `src/utils/formatters.js`
- [x] **Bước 1.3.1:** Tạo file `src/utils/formatters.js`.
- [x] **Bước 1.3.2:** Chuyển các hằng số và hàm từ `src/App.jsx` (dòng 35–72 và dòng 270–453) sang `src/utils/formatters.js` và `export` chúng:
  - `UNKNOWN_REQUESTER`, `parseRequestNote`, `getRequesterLabel`
  - `escapeHtml`
  - `SLOT_MAX_WIDTH_MM`, `FORMAT_CAPACITIES`, `getFormatSpec`
  - `generateQrSvgMarkup` *(nhớ `import QRCode from 'qrcode';` ở đầu file `formatters.js`)*
  - `liveFormatDate`, `autoFormatDate`, `autoFormatTime`
  - `formatBlendBatch`, `formatSamplingBox`, `formatLocation`
  - `decodeExportProductionCode`
- [x] **Bước 1.3.3:** Trong `src/App.jsx`, import lại đầy đủ các hàm/hằng số trên từ `./utils/formatters`.
- [x] **Bước 1.3.4:** Chạy `npm run build` kiểm tra 0 lỗi. Báo người dùng test thử trang web ở local.

---

## GIAI ĐOẠN 2: TẠO TẦNG API SERVICE (`src/services/`)
*Mục tiêu: Gom các truy vấn Supabase rời rạc vào thư mục `src/services/` để giao diện không còn gọi trực tiếp SQL phức tạp.*

### Task 2.1: Tạo `src/services/visitorService.js` (Quản lý Thiết bị & Nhật ký tra cứu)
- [x] **Bước 2.1.1:** Tạo file `src/services/visitorService.js` chứa các hàm gọi Supabase:
  - `fetchProfilesAndVisitors()` (gộp `profiles`, `search_logs`, `visitor_resets` và tự động dọn `orphanResetIds`).
  - `blockVisitorDevice(devId)`
  - `unblockVisitorDevice(devId)`
  - `resetVisitorDeviceName(targetDevId)`
  - `renameVisitorDevice(targetDevId, oldName, newName)`
  - `unlinkVisitorDevice(devId)` *(chỉ update `search_logs.device_id = null` và xóa `visitor_resets`, giữ nguyên 100% lịch sử tra cứu & lấy mẫu)*.
- [x] **Bước 2.1.2:** Thay thế phần gọi `supabase.from(...)` trong các hàm `fetchUsersAndVisitors`, `handleBlockVisitor`, `handleUnblockVisitor`, `handleResetVisitor`, `handleDeleteSavedVisitor` ở `src/App.jsx` bằng lời gọi sang `visitorService`.
- [x] **Bước 2.1.3:** Chạy `npm run build` kiểm tra 0 lỗi.

### Task 2.2: Tạo `src/services/warehouseService.js` (Truy vấn Dữ liệu Kho)
- [x] **Bước 2.2.1:** Tạo file `src/services/warehouseService.js` chứa các hàm:
  - `fetchAllWarehouseData()` (tải song song `products`, `boxes`, `samples`, `transactions`, `slot_configs`, `destruction_logs`, `destruction_reports`).
  - `syncLooseShelfCheckedState()` và `saveLooseShelfCheckedState(checkedMap)` (đồng bộ trạng thái kiểm tra Kệ lẻ 5 với id `'global-checked-loose-samples'`).
- [x] **Bước 2.2.2:** Kết nối `src/App.jsx` sử dụng `warehouseService.js`.
- [x] **Bước 2.2.3:** Chạy `npm run build` kiểm tra 0 lỗi.

---

## GIAI ĐOẠN 3: ĐƯA NGHIỆP VỤ TỒN KHO VÀO SUPABASE BACKEND (RPC STORED PROCEDURES)
*Mục tiêu: Đảm bảo các thao tác trừ kho, hoàn tác, đóng thùng chạy trong 1 Transaction nguyên khối trên Supabase, chống lệch kho khi rớt mạng hoặc nhiều người bấm cùng lúc.*

### Task 3.1: Viết file SQL tạo 3 hàm RPC trên Supabase (`database/supabase_rpc_functions.sql`)
- [x] **Bước 3.1.1:** Tạo file `database/supabase_rpc_functions.sql` (chỉ thêm hàm mới, không sửa/xóa bảng cũ):
  1. **`public.rpc_approve_take_request(p_tx_id UUID, p_custom_qty INT, p_admin_id UUID)`**:
     - Kiểm tra quyền `public.is_admin()`.
     - Khóa dòng mẫu `SELECT * FROM public.samples WHERE id = v_sample_id FOR UPDATE` (chống 2 người duyệt trùng lúc).
     - Kiểm tra `p_custom_qty <= available_qty`.
     - Tính `v_new_qty = available_qty - p_custom_qty`.
     - Áp dụng **Quy tắc Ô lẻ 5**: Nếu `shelf IS NOT NULL AND slot <= 4 AND (v_new_qty % 10) <> 0 AND v_new_qty > 0` $\rightarrow$ `v_next_slot := 5; v_next_col := 1`.
     - Nếu `v_new_qty = 0` và không còn đơn `pending` nào khác của cùng mẫu $\rightarrow$ `shelf := NULL; slot := NULL; column_number := NULL; status := 'destroyed'`.
     - Cập nhật bảng `samples`, cập nhật dòng `transactions` gốc sang `'approved'`, và insert dòng `take_approve` kèm đầy đủ thẻ `[RESTORE:shelf|slot|col|box_id|status]` y hệt dòng 5299 của `src/App.jsx`.
  2. **`public.rpc_revert_take_request(p_tx_id UUID, p_admin_id UUID)`**:
     - Kiểm tra quyền `public.is_admin()`.
     - Đọc thẻ `[RESTORE:...]` từ giao dịch `take_approve` tương ứng, khôi phục lại `available_qty`, `shelf`, `slot`, `column_number`, `box_id`, `status` cho bảng `samples`.
     - Xóa dòng `take_approve`, thêm dòng `take_revert`, và đổi trạng thái yêu cầu gốc về `'pending'`.
  3. **`public.rpc_pack_samples_to_box(p_box_name TEXT, p_alt_box_name TEXT, p_sample_ids UUID[])`**:
     - Kiểm tra quyền `public.is_admin()`.
     - Tìm hoặc tạo mới thùng trong bảng `boxes`.
     - Cập nhật toàn bộ mẫu trong `p_sample_ids`: `shelf = NULL, slot = NULL, column_number = NULL, box_id = v_box_id, status = 'boxed'`.
     - Trả về thông tin thùng vừa đóng gói.
- [x] **Bước 3.1.2:** Kiểm tra kỹ cú pháp SQL và thêm `SECURITY DEFINER SET search_path = public` cho cả 3 hàm.

### Task 3.2: Tích hợp gọi RPC có Fallback an toàn vào `src/App.jsx`
- [x] **Bước 3.2.1:** Trong hàm `handleApproveRequest` (`src/App.jsx` dòng ~5174):
  - Gọi `const { data, error: rpcErr } = await supabase.rpc('rpc_approve_take_request', { ... })`.
  - **Cơ chế Fallback:** Nếu `rpcErr` báo hàm chưa tồn tại trên Supabase (`PGRST202` / `function ... does not exist`), tự động chạy tiếp đoạn code update tuần tự cũ. Nhờ vậy web hiện hữu không bao giờ lỗi!
- [x] **Bước 3.2.2:** Tương tự, tích hợp `rpc_revert_take_request` (có Fallback) vào hàm hoàn tác giao dịch (dòng ~5440).
- [x] **Bước 3.2.3:** Tích hợp `rpc_pack_samples_to_box` (có Fallback) vào hàm đóng thùng `handleOvercapacityBoxing` (dòng ~5565).
- [x] **Bước 3.2.4:** Chạy `npm run build` kiểm tra 0 lỗi.

---

## GIAI ĐOẠN 4: TÁCH CÁC TAB QUẢN TRỊ ĐỘC LẬP RA COMPONENT RIÊNG
*Mục tiêu: Giảm kích thước `src/App.jsx` và dùng `React.lazy` để nhân viên tra cứu trên điện thoại không phải tải code của trang Quản trị.*

### Task 4.1: Lazy-load 3 Component lớn đã có sẵn (`WarehouseAudit`, `MonthlyAnalytics`, `BentoDashboard`)
- [x] **Bước 4.1.1:** Trong `src/App.jsx` (dòng 14–16), chuyển `WarehouseAudit` và `MonthlyAnalytics` sang `React.lazy(() => import(...))` và bọc trong `<React.Suspense fallback={...}>` tại nơi render.
- [x] **Bước 4.1.2:** Chạy `npm run build` $\rightarrow$ Kiểm tra Vite đã tách `WarehouseAudit` (404 kB) và `MonthlyAnalytics` (46 kB) thành các file `.js` riêng biệt trong `dist/assets/`, giảm kích thước bundle chính `index-*.js` từ 1.982 kB xuống 1.532 kB!

### Task 4.2: Tách Tab "Nhật Ký Tra Cứu Nhân Viên" (`activeTab === 'search_logs'`) sang `src/components/SearchLogsTab.jsx`
- [x] **Bước 4.2.1:** Tạo file `src/components/SearchLogsTab.jsx`, bê nguyên phần JSX của `activeTab === 'search_logs'` (khoảng 475 dòng trong `src/App.jsx`) sang và truyền đủ props.
- [x] **Bước 4.2.2:** Giữ nguyên 100% style, màu sắc, nút bấm, bộ lọc ngày và phân trang.
- [x] **Bước 4.2.3:** Chạy `npm run build` kiểm tra 0 lỗi.

### Task 4.3: Tách Tab "Quản Lý Tài Khoản & Khách" (`activeTab === 'users'`) sang `src/components/UserVisitorManagerTab.jsx`
- [x] **Bước 4.3.1:** Tạo file `src/components/UserVisitorManagerTab.jsx`, chuyển phần JSX của `activeTab === 'users'` (khoảng 634 dòng trong `src/App.jsx`) sang và truyền đủ props.
- [x] **Bước 4.3.2:** Giữ nguyên 100% các thao tác: Sửa tài khoản, Đổi tên khách, Khai lại tên, Chặn/Gỡ chặn, Xóa thiết bị (giữ nguyên lịch sử), Mở xem lịch sử khách/nhân sự.
- [x] **Bước 4.3.3:** Chạy `npm run build` kiểm tra 0 lỗi.

---

## BẢNG THEO DÕI TIẾN ĐỘ TỔNG HỢP

| Mã Task | Nội dung công việc | Độ an toàn | Trạng thái |
| :--- | :--- | :---: | :---: |
| **Task 1.1** | Tải động `html2pdf.js` (giảm ~50% bundle ban đầu) | 🟢 Tuyệt đối | `[x]` Đã xong |
| **Task 1.2** | Tách `src/utils/deviceUtils.js` | 🟢 Tuyệt đối | `[x]` Đã xong |
| **Task 1.3** | Tách `src/utils/formatters.js` | 🟢 Tuyệt đối | `[x]` Đã xong |
| **Task 2.1** | Tạo `src/services/visitorService.js` | 🟢 Tuyệt đối | `[x]` Đã xong |
| **Task 2.2** | Tạo `src/services/warehouseService.js` | 🟢 Tuyệt đối | `[x]` Đã xong |
| **Task 3.1** | Viết 3 hàm Backend RPC trong `database/supabase_rpc_functions.sql` | 🟢 Tuyệt đối | `[x]` Đã xong |
| **Task 3.2** | Gắn RPC vào `App.jsx` kèm cơ chế **Fallback tự động** | 🟢 Tuyệt đối | `[x]` Đã xong |
| **Task 4.1** | `React.lazy` cho `WarehouseAudit` & `MonthlyAnalytics` | 🟢 Tuyệt đối | `[x]` Đã xong |
| **Task 4.2** | Tách Component `SearchLogsTab.jsx` | 🟢 Tuyệt đối | `[x]` Đã xong |
| **Task 4.3** | Tách Component `UserVisitorManagerTab.jsx` | 🟢 Tuyệt đối | `[x]` Đã xong |

