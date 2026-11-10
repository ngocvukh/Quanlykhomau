# Lưu trữ các script bảo trì (One-off Maintenance Scripts)

Thư mục này lưu trữ các kịch bản Node.js/Python đã sử dụng một lần trong các đợt chuyển dữ liệu và xử lý kho cũ (tháng 7 và tháng 9 năm 2026):

- `check.js`: Kiểm tra đối chiếu thùng và mẫu.
- `delete_empty_boxes.js`: Dọn các thùng rỗng không chứa mẫu.
- `fix_box_names.js`, `fix_db.js`, `fix_db2.js`: Chuẩn hóa tên thùng và dữ liệu lịch sử.
- `move_box.js`, `move_direct.js`, `move_id.js`, `move_sku.js`: Di chuyển mẫu vào thùng lưu trữ.
- `patch_qr.py`: Vá mã QR cũ.
- `recover.cjs`, `undo.cjs`: Kịch bản phục hồi/hoàn tác thao tác cũ.

*Lưu ý: Các script này không nằm trong luồng chạy của ứng dụng web.*

