# TaskFlow Cloud

Ứng dụng quản lý công việc cá nhân với giao diện tiếng Việt, giúp theo dõi kế hoạch, thời hạn và tiến độ hoàn thành.

## Tính năng

- Đăng ký, đăng nhập, đăng xuất và duy trì phiên đăng nhập.
- Tạo, xem, chỉnh sửa và xóa công việc.
- Đặt mô tả, thời hạn và mức ưu tiên cho từng công việc.
- Đánh dấu hoàn thành hoặc mở lại công việc.
- Lọc theo trạng thái, tìm kiếm theo tên, sắp xếp và phân trang.
- Xem thống kê tổng quan, tỷ lệ hoàn thành và công việc đến hạn.
- Quản lý dữ liệu riêng cho từng tài khoản.

## Công nghệ

| Thành phần | Công nghệ                                      |
| ---------- | ---------------------------------------------- |
| Frontend   | React, TypeScript, Vite, Tailwind CSS          |
| Backend    | Node.js, Express, TypeScript                   |
| Database   | MongoDB, Mongoose                              |
| Xác thực   | Cookie session, express-session, connect-mongo |
| Đóng gói   | Docker, Docker Compose, Nginx, Caddy           |

## Yêu cầu

- **Node.js 24 LTS** và npm để chạy trực tiếp.
- **MongoDB** đang hoạt động, hoặc một URI MongoDB Atlas hợp lệ.
- **Docker và Docker Compose** nếu chạy bằng container.

## Chạy trên máy cá nhân

### 1. Tải mã nguồn và cài thư viện

```bash
git clone https://github.com/TienDat-2805/TaskFlowCloud.git
cd TaskFlowCloud
npm ci
```

> Trên PowerShell, nếu npm.ps1 bị chặn, dùng npm.cmd thay cho npm trong các lệnh bên dưới.

### 2. Tạo cấu hình môi trường

PowerShell:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Linux hoặc macOS:

```bash
test -f .env || cp .env.example .env
```

Mở `.env` và cấu hình:

- `MONGODB_URI`: URI của MongoDB local hoặc Atlas. MongoDB local phải được khởi động trước.
- `SESSION_SECRET`: chuỗi ngẫu nhiên có ít nhất 32 ký tự.
- `CLIENT_ORIGIN`: giữ `http://localhost:5173` khi chạy frontend với cấu hình mặc định.

Tạo giá trị cho `SESSION_SECRET` bằng:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Giữ mật khẩu, URI thật và secret trong môi trường riêng; không đưa chúng vào Git hoặc mã frontend. Với Atlas, cần cấp quyền database và cấu hình IP access list cho máy chạy backend.

### 3. Khởi động ứng dụng

```bash
npm run db:check
npm run dev
```

Truy cập **[http://localhost:5173](http://localhost:5173)**, chọn **Đăng ký** để tạo tài khoản và bắt đầu sử dụng.

Frontend chuyển các yêu cầu `/api` tới backend ở cổng `4000`. Dùng đúng địa chỉ `localhost:5173` để khớp với `CLIENT_ORIGIN`. Tài khoản đăng nhập ứng dụng độc lập với tài khoản database.

Dừng ứng dụng bằng `Ctrl+C`.

## Chạy bằng Docker

Docker Compose development khởi chạy frontend, backend và **MongoDB local với volume riêng**. Cấu hình này dùng MongoDB trong container thay cho URI Atlas.

Chuẩn bị `.env` và `SESSION_SECRET` như hướng dẫn trên. Dừng các tiến trình khác đang dùng cổng `5173`, sau đó chạy:

```bash
docker compose -f compose.dev.yml up --build -d
```

Truy cập **[http://localhost:5173](http://localhost:5173)**.

Xem trạng thái và log:

```bash
docker compose -f compose.dev.yml ps
docker compose -f compose.dev.yml logs -f backend
```

Dừng các container:

```bash
docker compose -f compose.dev.yml down
```

Lệnh `down` giữ dữ liệu trong volume. Chỉ thêm `-v` khi muốn xóa database local.

## Dữ liệu mẫu

Đặt `SEED_EMAIL` và `SEED_PASSWORD` trong `.env`. Mật khẩu mẫu cần ít nhất 12 ký tự và tối đa 72 byte UTF-8.

Khi chạy trực tiếp:

```bash
npm run seed
```

Khi chạy bằng Docker Compose:

```bash
docker compose -f compose.dev.yml exec backend npm run seed -w backend
```

Script tạo tài khoản và 5 công việc mẫu, không thay đổi mật khẩu hoặc công việc đã tồn tại. Đăng nhập bằng thông tin tài khoản mẫu đã cấu hình.

## Kiểm thử và build

```bash
npm run check
npm run format:check
```

`npm run check` chạy lint, kiểm tra TypeScript, kiểm thử backend/frontend và build. Backend test dùng MongoDB tạm độc lập; lần chạy đầu cần mạng để tải binary. Frontend test dùng jsdom với HTTP giả lập.

Kiểm tra luồng API khi ứng dụng đang chạy và đã có dữ liệu mẫu:

```bash
npm run smoke
```

Smoke test đăng nhập bằng tài khoản mẫu, tạo/sửa/xóa một công việc tạm rồi đăng xuất.

| Lệnh                         | Chức năng                                         |
| ---------------------------- | ------------------------------------------------- |
| `npm run dev`                | Chạy frontend và backend trong chế độ development |
| `npm run build`              | Build cả hai workspace                            |
| `npm test`                   | Chạy kiểm thử                                     |
| `npm run lint`               | Kiểm tra mã nguồn bằng ESLint                     |
| `npm run typecheck`          | Kiểm tra kiểu dữ liệu TypeScript                  |
| `npm run format`             | Định dạng mã nguồn                                |
| `npm run db:check`           | Kiểm tra kết nối MongoDB                          |
| `npm run indexes -w backend` | Bổ sung index MongoDB                             |
| `npm run start -w backend`   | Chạy backend sau khi build                        |

## Triển khai production

Cấu hình `APP_DOMAIN`, `MONGODB_URI` và `SESSION_SECRET` trong file môi trường riêng, ví dụ `.env.production`. Domain cần trỏ tới máy chủ và cổng `80/443` phải sẵn sàng.

```bash
docker compose --env-file .env.production -f compose.prod.yml config --quiet
docker compose --env-file .env.production -f compose.prod.yml up --build -d
```

Caddy xử lý HTTPS; Nginx phục vụ frontend và chuyển tiếp API tới backend. Chỉ reverse proxy công khai cổng mạng. Cấu hình production bật secure cookie và kiểm tra origin HTTPS.

## Tham khảo cấu hình

| Biến                              | Ý nghĩa                                                 |
| --------------------------------- | ------------------------------------------------------- |
| `NODE_ENV`                        | `development`, `test` hoặc `production`                 |
| `PORT`                            | Cổng backend, mặc định `4000`                           |
| `MONGODB_URI`                     | Chuỗi kết nối MongoDB                                   |
| `SESSION_SECRET`                  | Secret ngẫu nhiên, tối thiểu 32 ký tự                   |
| `CLIENT_ORIGIN`                   | Origin frontend được phép gửi yêu cầu ghi               |
| `COOKIE_SECURE`                   | `true` khi dùng HTTPS                                   |
| `TRUST_PROXY`                     | `0` khi chạy trực tiếp; `2` với Caddy → Nginx → Express |
| `LOG_LEVEL`                       | Mức log của backend                                     |
| `MONGODB_DNS_SERVERS`             | Tùy chọn: danh sách IP DNS phân cách bằng dấu phẩy      |
| `SEED_EMAIL`, `SEED_PASSWORD`     | Thông tin tài khoản mẫu                                 |
| `APP_DOMAIN`                      | Domain dùng cho production                              |
| `BACKEND_IMAGE`, `FRONTEND_IMAGE` | Image và tag triển khai                                 |
| `SMOKE_BASE_URL`                  | Tùy chọn: URL dùng cho smoke test                       |

Endpoint `/health` trả **200** khi kết nối database hoạt động và **503** khi database không sẵn sàng.
