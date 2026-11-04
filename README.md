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

## Workflow v0.2 và nâng cấp dữ liệu

Các tính năng v0.2 gồm ba trạng thái, Quick Add, deadline theo ngày/múi giờ, bộ lọc kết hợp, sửa nhanh, Undo trong 7 giây, lịch sử hoạt động và thùng rác.

`TASKFLOW_V02_ENABLED` và `REQUIRE_TASK_REVISION` mặc định là `false`. Khi tắt workflow, API giữ hành vi xóa trực tiếp của v0.1 và không nhận trạng thái `in_progress`. Frontend lấy khả năng hỗ trợ từ `/api/features`.

Trước khi bật tính năng trên database đã có dữ liệu:

1. Dừng các tiến trình ghi dữ liệu, tạo backup và thử khôi phục backup trên một database riêng.
2. Kiểm tra `MONGODB_URI` đang trỏ đúng database cần nâng cấp. Chạy báo cáo chỉ đọc:

   ```bash
   npm run migrate:v02 -w backend -- --dry-run
   ```

3. Xử lý hết `anomalies` nếu có. Sau khi có backup đã kiểm chứng, thay `TEN_DATABASE` bằng tên database thực tế:

   ```bash
   npm run migrate:v02 -w backend -- --apply --confirm-database TEN_DATABASE --backup-confirmed
   ```

   Với Atlas hoặc hostname khác localhost, thêm `--allow-remote`. Cờ `--backup-confirmed` là xác nhận của người vận hành; script không tự tạo backup.

4. Migration chỉ bổ sung field còn thiếu, giữ timestamp cũ và không tạo lịch sử quá khứ. Sau kiểm tra dữ liệu, script cài TTL cho task đã xóa và hết hạn; TTL không bảo đảm chạy đúng từng giây.
5. Triển khai frontend/backend cùng phiên bản; đặt hai biến sau trong môi trường backend và khởi động lại:

   ```dotenv
   TASKFLOW_V02_ENABLED=true
   REQUIRE_TASK_REVISION=true
   ```

   Với Docker development, chạy lại `docker compose -f compose.dev.yml up --build -d` để nhận cấu hình.

Database mới chưa có task cũng chạy migration trước khi bật workflow để cài TTL. Trong Docker development, dùng `docker compose -f compose.dev.yml exec backend npm run migrate:v02 -w backend -- --dry-run`; lệnh apply tương tự với đúng tên database. Hostname `mongo` trong Compose cần `--allow-remote`.

Khi rollback, dừng ghi, khôi phục backup vào database riêng, kiểm chứng rồi chuyển URI và cặp image frontend/backend về phiên bản tương ứng. Chỉ tắt feature flag không chuyển đổi task `in_progress` và không khôi phục dữ liệu đã bị TTL xóa. Tránh chạy backend v0.1 trên dữ liệu workflow chưa được chuyển đổi.

### API workflow

Các endpoint dùng phiên cookie đăng nhập. Yêu cầu ghi cần `Origin` khớp `CLIENT_ORIGIN` và JSON. Mỗi tài khoản chỉ truy cập task của chính mình.

| Endpoint                               | Chức năng                                                       |
| -------------------------------------- | --------------------------------------------------------------- |
| `GET /api/features`                    | Khả năng hỗ trợ workflow và yêu cầu revision                    |
| `GET /api/tasks`                       | Lọc trạng thái/ưu tiên/thời hạn, tìm kiếm, sắp xếp, phân trang  |
| `GET /api/tasks/:id`                   | Chi tiết task đang hoạt động và lịch sử gần nhất                |
| `PATCH /api/tasks/:id`                 | Cập nhật kèm `expectedRevision` hoặc `If-Match: "v7"`           |
| `DELETE /api/tasks/:id`                | Chuyển vào thùng rác khi bật workflow                           |
| `GET /api/tasks/trash`                 | Danh sách task đã xóa                                           |
| `GET /api/tasks/trash/:id`             | Chi tiết và lịch sử task trong thùng rác                        |
| `POST /api/tasks/:id/restore`          | Khôi phục task chưa hết hạn, kèm revision                       |
| `DELETE /api/tasks/:id/permanent`      | Xóa vĩnh viễn task trong thùng rác, kèm revision                |
| `GET /api/tasks/:id/activity?limit=50` | Lịch sử task đang hoạt động, mới nhất trước, tối đa 100 sự kiện |

Query list hỗ trợ `status=all|active|pending|in_progress|completed`, `priority=all|low|medium|high`, `due=all|overdue|today|upcoming|no_due`, `search`, `sort`, `timeZone`, `page`, `limit`. Sort gồm `createdAt_desc`, `title_asc`, `dueAt_asc`, `dueAt_desc`, `priority_desc`, `attention`. Khoảng ngày tính theo múi giờ IANA, mặc định UTC. `upcoming` bắt đầu ngày mai và kéo dài 7 ngày lịch. Các điều kiện lọc kết hợp theo AND.

Deadline gửi một trong ba dạng:

```json
{ "due": { "mode": "none" } }
{ "due": { "mode": "date", "date": "2026-12-25", "timeZone": "Asia/Ho_Chi_Minh" } }
{ "due": { "mode": "datetime", "at": "2026-12-25T17:00:00+07:00" } }
```

`dueAt` cũ vẫn được hỗ trợ; không gửi đồng thời với `due`. API trả revision mới và ETag sau cập nhật. Revision cũ trả `409 TASK_CONFLICT`, task không thuộc tài khoản trả `404`. PATCH không thay đổi dữ liệu giữ nguyên revision và lịch sử.

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

## Kiểm thử trình duyệt

```bash
npx playwright install chromium
npm run e2e -w frontend
```

Bộ kiểm thử tự khởi chạy ứng dụng ở cổng 5174, API ở 4011 và MongoDB tạm độc lập, không dùng database trong `.env`. Nó kiểm tra desktop 1440px/mobile 390px, form theo ngữ cảnh, dirty confirm, bộ lọc Back/Forward, Undo/409 và thùng rác. Kết quả và ảnh nằm trong `test-results/`, được bỏ qua bởi Git. Máy chạy test cần các cổng này trống.

## Xác minh nâng cấp bằng Docker Compose

Cần Docker đang chạy và Compose từ 2.24.4. Chạy từ thư mục repository:

```bash
npm run verify:compose -w backend
npm run verify:compose -w backend -- --production
```

Mỗi lệnh tạo project Compose, database, tài khoản và volume riêng, dùng cổng local trống; không lấy URI hoặc secret từ `.env`. Bộ kiểm tra thực hiện backup bằng `mongodump`, restore sang database khác bằng `mongorestore`, so sánh dữ liệu/index, migration dry-run/apply/idempotence rồi mới bật hai cờ workflow trên database test.

Sau đó kiểm tra đăng nhập, deadline theo ngày, sửa trạng thái, 409, phân quyền hai tài khoản, thùng rác/khôi phục/xóa vĩnh viễn, persistence sau restart, health 503/200 và log không chứa credential/cookie. Script dọn container, volume, network và cấu hình tạm khi kết thúc. Báo cáo chỉ chứa tên bước và kết quả trong `test-results/compose-development.json` hoặc `test-results/compose-production.json`, được bỏ qua bởi Git.

Chế độ `--production` kiểm tra image production qua Nginx trên HTTP local với cấu hình test. Nó không kiểm chứng Caddy/HTTPS, chứng chỉ, AWS hoặc database Atlas thật. Trước khi bật workflow trên database đang dùng, vẫn thực hiện backup, kiểm tra restore và các bước migration ở phần nâng cấp dữ liệu.

## Triển khai production

Cấu hình `APP_DOMAIN`, `MONGODB_URI` và `SESSION_SECRET` trong file môi trường riêng, ví dụ `.env.production`. Domain cần trỏ tới máy chủ và cổng `80/443` phải sẵn sàng.

```bash
docker compose --env-file .env.production -f compose.prod.yml config --quiet
docker compose --env-file .env.production -f compose.prod.yml up --build -d
```

Caddy xử lý HTTPS; Nginx phục vụ frontend và chuyển tiếp API tới backend. Chỉ reverse proxy công khai cổng mạng. Cấu hình production bật secure cookie và kiểm tra origin HTTPS.

## CI/CD với GHCR và EC2

Workflow `CI` kiểm tra pull request và các lần push lên `main`. Sau khi toàn bộ CI thành công cho một lần push lên `main`, workflow `CD` build image production cho backend/frontend, hỗ trợ `linux/amd64` và `linux/arm64`, rồi publish lên GitHub Container Registry:

```text
ghcr.io/<owner>/<repository>/backend:sha-<commit>
ghcr.io/<owner>/<repository>/frontend:sha-<commit>
```

Tên owner/repository được chuyển thành chữ thường. Deploy sử dụng **digest SHA-256** của từng image và kiểm tra nhãn revision khớp commit đã qua CI. Workflow bỏ qua PR, CI thất bại và commit đã bị `main` vượt qua. Các lần CD chạy tuần tự; một lần deploy đang chạy không bị lần push mới tự động hủy.

### Chuẩn bị EC2 và mốc rollback

EC2 cần Docker, Compose từ 2.24.4, Python 3.9 trở lên và tài khoản SSH có quyền chạy Docker. Domain HTTPS và kết nối database phải hoạt động. CD không khởi động/dừng EC2, chạy migration, seed dữ liệu hay thay đổi feature flags. Khi EC2 đang stop, giữ `CD_ENABLED=false`; việc publish image vẫn hoạt động.

Trên EC2, chuẩn bị thư mục deploy do tài khoản SSH quản lý, ví dụ `/opt/taskflowcloud`. Đặt bản sao cấu hình runtime hiện có tại `/opt/taskflowcloud/.env.production`, với quyền `600`. File này chứa `APP_DOMAIN`, `MONGODB_URI`, `SESSION_SECRET` và các cờ workflow đang dùng. Mỗi release chỉ ghi đè cặp image qua biến môi trường của tiến trình Compose; secret tiếp tục được đọc từ file trên máy chủ.

Với ứng dụng đã triển khai thủ công, bật EC2 và xác nhận ứng dụng chạy bình thường trước. Dùng script từ checkout có hỗ trợ CD để ghi nhận **commit và cấu hình thực sự đang chạy**:

```bash
python3 /path/to/cd-checkout/infra/deploy/deploy.py adopt \
  --source /path/to/running-checkout \
  --root /opt/taskflowcloud \
  --project taskflow-cloud \
  --url https://app.example.com \
  --revision <full-running-commit-sha>
```

Thay các đường dẫn, domain và SHA trước khi chạy. `--project` phải trùng Compose project đang chạy; có thể xem bằng `docker compose ls`. Đây là điều kiện để giữ đúng container và volume Caddy hiện có. `--source` phải chứa `compose.prod.yml` và `infra/caddy/Caddyfile` của bản đang chạy. Script lưu image ID hiện có, sao chép hai file cấu hình và kiểm tra HTTPS/frontend/API; không thay container hoặc ghi dữ liệu ứng dụng. Nếu baseline đã tồn tại, lệnh từ chối ghi đè.

Thư mục deploy lưu `state.json` (bản hiện tại/trước đó), `releases/` (cấu hình theo commit), `incoming/` (bundle nhận từ CD) và `.deploy.lock` khi có thao tác đang chạy. Các file này thuộc máy chủ; giữ lại image và release cũ để rollback. Nếu một tiến trình bị dừng cưỡng bức và để lại lock, kiểm tra không còn deploy đang chạy trước khi xóa thư mục lock rỗng.

### Cấu hình GitHub

Tạo GitHub Environment tên **`production`**, giới hạn deployment branch về `main`; có thể thêm required reviewers nếu muốn duyệt trước mỗi lần deploy. Thêm các **Environment secrets**:

| Secret               | Nội dung                                                        |
| -------------------- | --------------------------------------------------------------- |
| `DEPLOY_HOST`        | Public DNS hoặc IPv4 của EC2                                    |
| `DEPLOY_USER`        | Tài khoản Linux dùng để chạy Docker                             |
| `DEPLOY_SSH_KEY`     | Nội dung private key SSH được phép truy cập EC2                 |
| `DEPLOY_KNOWN_HOSTS` | Dòng host key đã xác minh cho hostname/IP và cổng SSH tương ứng |

Xác minh fingerprint SSH qua kết nối quản trị tin cậy trước khi lưu known hosts. Workflow bắt buộc kiểm tra host key và chỉ lưu key tạm trên runner. Không thêm private key hoặc runtime env vào repository.

Thêm các **Environment variables** trong `production`:

| Variable         | Giá trị                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `DEPLOY_URL`     | HTTPS origin, ví dụ `https://app.example.com`                          |
| `DEPLOY_PATH`    | Thư mục chứa `.env.production` và state; mặc định `/opt/taskflowcloud` |
| `DEPLOY_PROJECT` | Compose project hiện có; mặc định `taskflow-cloud`                     |
| `DEPLOY_PORT`    | Cổng SSH; mặc định `22`                                                |

Thêm **Repository variable** `CD_ENABLED=true` khi baseline, quyền pull image và kết nối SSH đã sẵn sàng. Mặc định chưa có biến này thì CD chỉ publish image, job deploy bị skip. Vì điều kiện job được xét trước khi nạp Environment, đặt `CD_ENABLED` ở cấp repository, không đặt trong Environment.

Runner phải kết nối được tới SSH của EC2 theo Security Group hiện có. Nếu chỉ cho phép IP cố định hoặc mạng nội bộ, có thể cấu hình **Repository variable** `DEPLOY_RUNNER` bằng nhãn runner Linux riêng có đường mạng phù hợp. Mặc định là runner GitHub-hosted `ubuntu-24.04`.

Publish dùng `GITHUB_TOKEN` do Actions cấp và quyền `packages: write`; không cần thêm token publish riêng. Package GHCR mới tạo mặc định private: sau lần publish đầu, chọn visibility phù hợp trong package settings. Với package private, đăng nhập GHCR **trên EC2 bằng cùng tài khoản SSH** với token classic chỉ có quyền `read:packages`, dùng `docker login --password-stdin`. CD không chuyển token registry hoặc database secret qua SSH. Tham khảo [cấu hình Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

Sau khi cấu hình xong, bật EC2 và push một commit lên `main`, hoặc chạy lại workflow CD của commit mới nhất đã qua CI. Kiểm tra cả hai job `publish` và `deploy`: CD màu xanh nhưng job deploy bị skip chỉ xác nhận image đã publish. Summary của job deploy thành công ghi commit đã được kiểm tra qua HTTPS.

### Health check và rollback

Deploy pull đủ hai image, xác minh revision, chạy Compose bằng `--no-build --pull never --wait`, rồi kiểm tra công khai:

- `/health` trả `200`, trạng thái `ok` và database `connected`.
- `/` trả frontend có application root.
- `/api/auth/me` trả `401` khi chưa đăng nhập, xác nhận API được chuyển tiếp đúng.

Các kiểm tra không tạo tài khoản hoặc sửa database. Nếu cập nhật container hoặc smoke check thất bại, script khôi phục cấu hình/image của bản trước và kiểm tra lại; job vẫn báo lỗi để người vận hành biết release mới không thành công. Nếu rollback cũng lỗi, giữ trạng thái đã ghi trước đó để đối chiếu và báo cần kiểm tra máy chủ. Trạng thái release chỉ cập nhật sau khi health đạt, bằng một lần ghi file atomic.

Rollback thủ công về bản tốt trước đó:

```bash
python3 /path/to/cd-checkout/infra/deploy/deploy.py rollback \
  --root /opt/taskflowcloud \
  --project taskflow-cloud \
  --url https://app.example.com
```

Rollback container không hoàn tác migration database; các thay đổi schema cần kế hoạch backup/restore riêng. Kiểm tra logic deploy/rollback tại local bằng `python -m unittest discover -s infra/deploy -p 'test_*.py'`; CI cũng chạy bộ kiểm tra này.

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
| `TASKFLOW_V02_ENABLED`            | Bật workflow v0.2 sau migration (mặc định false)        |
| `REQUIRE_TASK_REVISION`           | Yêu cầu revision khi sửa/xóa/khôi phục (mặc định false) |
| `LOG_LEVEL`                       | Mức log của backend                                     |
| `MONGODB_DNS_SERVERS`             | Tùy chọn: danh sách IP DNS phân cách bằng dấu phẩy      |
| `SEED_EMAIL`, `SEED_PASSWORD`     | Thông tin tài khoản mẫu                                 |
| `APP_DOMAIN`                      | Domain dùng cho production                              |
| `BACKEND_IMAGE`, `FRONTEND_IMAGE` | Image và tag triển khai                                 |
| `SMOKE_BASE_URL`                  | Tùy chọn: URL dùng cho smoke test                       |

Endpoint `/health` trả **200** khi kết nối database hoạt động và **503** khi database không sẵn sàng.
