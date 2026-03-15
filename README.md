# Giá vàng & Tỷ giá

Ứng dụng Next.js lấy và hiển thị:

- **Giá vàng** từ 2022 đến nay:
  - Historical: [FreeGoldAPI](https://freegoldapi.com/) (USD/oz)
  - Live (nếu có): [Kitco](https://www.kitco.com/charts/gold)
- **Tỷ giá**: [Vietcombank](https://www.vietcombank.com.vn/vi-VN/KHCN/Cong-cu-Tien-ich/Ty-gia) (API XML)

## Chạy

```bash
cd gia-vang-app
npm install
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

## API nội bộ

- `GET /api/gold` – Trả về dữ liệu giá vàng (historical từ 2022 + live Kitco nếu parse được).
- `GET /api/exchange-rate` – Trả về tỷ giá Vietcombank (XML → JSON).

## Lưu ý

- Vietcombank XML đôi khi trả 500 hoặc chỉ cho phép từ IP Việt Nam; nếu không lấy được, app vẫn chạy và hiển thị thông báo.
- Dữ liệu historical vàng từ FreeGoldAPI (cập nhật hàng ngày), không phải real-time từ Kitco.
