import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
type AccountState = Awaited<ReturnType<BrowserContext['storageState']>>;
const test = base.extend<object, { accountState: AccountState }>({
  accountState: [
    async ({ browser }, provide) => {
      const context = await browser.newContext();
      const response = await context.request.post('http://localhost:5174/api/auth/register', {
        headers: { Origin: 'http://localhost:5174' },
        data: {
          name: 'Người kiểm thử',
          email: 'browser-' + crypto.randomUUID() + '@example.com',
          password: 'Browser-Test-Only!42',
        },
      });
      expect(response.status()).toBe(201);
      await provide(await context.storageState());
      await context.close();
    },
    { scope: 'worker' },
  ],
  storageState: async ({ accountState }, provide) => {
    await provide(accountState);
  },
});
const origin = 'http://localhost:5174';
async function create(page: Page, values: object = {}) {
  const result = await page.request.post('/api/tasks', {
    headers: { Origin: origin },
    data: { title: 'Công việc kiểm thử', ...values },
  });
  expect(result.status()).toBe(201);
  return (await result.json()).data;
}
test.beforeEach(async ({ page }) => {
  const active = await page.request.get('/api/tasks?limit=100');
  for (const task of (await active.json()).data) {
    expect(
      (
        await page.request.delete('/api/tasks/' + task.id, {
          headers: { Origin: origin },
          data: { expectedRevision: task.revision },
        })
      ).status(),
    ).toBe(204);
  }
  const trash = await page.request.get('/api/tasks/trash?limit=100');
  for (const task of (await trash.json()).data)
    expect(
      (
        await page.request.delete('/api/tasks/' + task.id + '/permanent', {
          headers: { Origin: origin },
          data: { expectedRevision: task.revision },
        })
      ).status(),
    ).toBe(204);
});
test('dashboard quick add and statistic deep links', async ({ page }, info) => {
  await create(page, {
    title: 'Hoàn thiện báo cáo Cloud',
    status: 'in_progress',
    priority: 'high',
  });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Điều gì cần xử lý hôm nay?' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Tên công việc tạo nhanh' }).fill('Kiểm thử Quick Add');
  await page.getByRole('textbox', { name: 'Tên công việc tạo nhanh' }).press('Enter');
  await expect(page.getByRole('link', { name: 'Kiểm thử Quick Add', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('dashboard.png'), fullPage: true });
  await page.locator('a.stat-card').nth(2).click();
  await expect(page).toHaveURL(/status=in_progress/);
  await expect(
    page.getByRole('link', { name: 'Hoàn thiện báo cáo Cloud', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('contextual create, date-only deadline and custom dirty confirmation', async ({
  page,
}, info) => {
  await page.goto('/tasks?priority=high');
  await page.getByRole('link', { name: 'Tạo công việc', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Tạo công việc mới' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Tên công việc *').fill('Deadline theo ngày');
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: 'Bỏ thay đổi chưa lưu?' })).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Hủy' }).click();
  await expect(dialog.getByLabel('Tên công việc *')).toHaveValue('Deadline theo ngày');
  await dialog.getByRole('button', { name: 'Chỉ ngày' }).click();
  await dialog.getByLabel('Ngày hết hạn', { exact: true }).fill('2026-12-25');
  await dialog.getByLabel('Múi giờ', { exact: true }).fill('Asia/Ho_Chi_Minh');
  await dialog.getByRole('button', { name: 'Cao', exact: true }).click();
  await page.screenshot({ path: info.outputPath('task-form.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Tạo công việc', exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\?priority=high$/);
  await expect(page.getByRole('link', { name: 'Deadline theo ngày', exact: true })).toBeVisible();
  const result = await page.request.get(
    '/api/tasks?search=' + encodeURIComponent('Deadline theo ngày'),
  );
  expect((await result.json()).data[0]).toMatchObject({
    dueMode: 'date',
    dueDate: '2026-12-25',
    dueAt: '2026-12-25T16:59:59.999Z',
  });
});
test('direct form route and back navigation preserve unsaved input', async ({ page }) => {
  await page.goto('/tasks');
  await page.getByRole('link', { name: 'Tạo công việc đầu tiên', exact: true }).click();
  await page.getByLabel('Tên công việc *').fill('Chưa lưu');
  await page.goBack();
  await expect(page.getByRole('alertdialog', { name: 'Bỏ thay đổi chưa lưu?' })).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Hủy' }).click();
  await expect(page.getByLabel('Tên công việc *')).toHaveValue('Chưa lưu');
  await page.getByRole('dialog').getByRole('button', { name: 'Hủy', exact: true }).click();
  await page.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await page.goto('/tasks/new');
  await expect(page.getByRole('heading', { name: 'Tạo công việc mới' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('quick status update and Undo use the returned revision', async ({ page }) => {
  const task = await create(page);
  await page.goto('/tasks');
  await page.getByRole('checkbox', { name: 'Hoàn thành: ' + task.title }).click();
  await expect(page.getByRole('checkbox', { name: 'Hoàn thành: ' + task.title })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Hoàn tác', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Hoàn thành: ' + task.title })).not.toBeChecked();
  const result = await page.request.get('/api/tasks/' + task.id);
  expect((await result.json()).data).toMatchObject({
    status: 'pending',
    completedAt: null,
    revision: 2,
  });
});
test('stale form preserves input until explicit conflict reload', async ({ page }, info) => {
  const task = await create(page);
  await page.goto('/tasks/' + task.id + '/edit');
  await page.getByLabel('Tên công việc *').fill('Tên chưa lưu trong biểu mẫu');
  const remote = await page.request.patch('/api/tasks/' + task.id, {
    headers: { Origin: origin },
    data: { title: 'Bản cập nhật ở nơi khác', expectedRevision: 0 },
  });
  expect(remote.status()).toBe(200);
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(page.getByText('Công việc đã thay đổi ở nơi khác', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Tên công việc *')).toHaveValue('Tên chưa lưu trong biểu mẫu');
  await page.screenshot({ path: info.outputPath('conflict.png'), fullPage: true });
  await page.getByRole('button', { name: 'Tải lại dữ liệu', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Tải lại dữ liệu', exact: true })
    .click();
  await expect(page.getByLabel('Tên công việc *')).toHaveValue('Bản cập nhật ở nơi khác');
});
test('soft delete, restore, history and typed permanent confirmation', async ({ page }, info) => {
  const task = await create(page, { title: 'Kiểm tra thống kê cũ', status: 'in_progress' });
  await page.goto('/tasks/' + task.id);
  await expect(page.getByRole('heading', { name: 'Lịch sử hoạt động' })).toBeVisible();
  await page.getByRole('button', { name: 'Chuyển vào thùng rác', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Chuyển vào thùng rác' }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await page.goto('/trash');
  await expect(page.getByRole('heading', { name: task.title })).toBeVisible();
  await page.screenshot({ path: info.outputPath('trash.png'), fullPage: true });
  await page.getByRole('button', { name: 'Khôi phục', exact: true }).click();
  await expect(page.getByRole('heading', { name: task.title })).toHaveCount(0);
  await page.goto('/tasks/' + task.id);
  await expect(page.getByText('Khôi phục công việc', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('detail.png'), fullPage: true });
  await page.getByRole('button', { name: 'Chuyển vào thùng rác', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Chuyển vào thùng rác' }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await page.goto('/trash');
  await page.getByRole('button', { name: 'Xóa vĩnh viễn', exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('button', { name: 'Xóa vĩnh viễn', exact: true })).toBeDisabled();
  await confirm.getByLabel('Nhập tên công việc để xác nhận').fill(task.title);
  await confirm.getByRole('button', { name: 'Xóa vĩnh viễn', exact: true }).click();
  await expect(page.getByRole('heading', { name: task.title })).toHaveCount(0);
});
test('debounced search combines filters and follows Back/Forward URLs', async ({ page }, info) => {
  await create(page, { title: 'Báo cáo Cloud', priority: 'high', status: 'in_progress' });
  await create(page, { title: 'Docker', priority: 'low' });
  await page.goto('/tasks');
  const mobile = info.project.name === 'mobile';
  if (mobile) {
    await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
    await page
      .getByLabel('Lọc trạng thái', { exact: true })
      .filter({ visible: true })
      .selectOption('in_progress');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/tasks$/);
    await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  }
  await page
    .getByLabel('Lọc trạng thái', { exact: true })
    .filter({ visible: true })
    .selectOption('in_progress');
  await page
    .getByLabel('Lọc ưu tiên', { exact: true })
    .filter({ visible: true })
    .selectOption('high');
  if (mobile) await page.getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
  await page.getByRole('textbox', { name: 'Tìm công việc', exact: true }).fill('Báo cáo');
  await expect(page).toHaveURL(/search=/);
  await expect(page.getByRole('link', { name: 'Báo cáo Cloud', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Docker', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('task-list.png'), fullPage: true });
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Tìm công việc', exact: true })).toHaveValue('');
  await page.goForward();
  await expect(page.getByRole('textbox', { name: 'Tìm công việc', exact: true })).toHaveValue(
    'Báo cáo',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('quick edit updates one row while another remains available', async ({ page }, info) => {
  const first = await create(page, { title: 'Công việc A' });
  await create(page, { title: 'Công việc B' });
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/tasks/' + first.id, async (route) => {
    if (route.request().method() === 'PATCH') await gate;
    await route.continue();
  });
  await page.goto('/tasks');
  await page.getByRole('checkbox', { name: 'Hoàn thành: Công việc A' }).click();
  await expect(page.getByRole('checkbox', { name: 'Hoàn thành: Công việc A' })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Hoàn thành: Công việc B' })).toBeEnabled();
  release();
  await expect(page.getByRole('checkbox', { name: 'Hoàn thành: Công việc A' })).toBeChecked();
  await page.getByRole('button', { name: 'Sửa nhanh: Công việc B', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sửa nhanh công việc' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Sửa nhanh: Công việc B', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Sửa nhanh: Công việc B', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cao', exact: true }).click();
  await dialog.getByRole('button', { name: 'Chỉ ngày', exact: true }).click();
  await dialog.getByLabel('Ngày hết hạn', { exact: true }).fill('2026-12-26');
  await page.screenshot({ path: info.outputPath('quick-edit.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(dialog).toHaveCount(0);
  const result = await page.request.get('/api/tasks?search=' + encodeURIComponent('Công việc B'));
  expect((await result.json()).data[0]).toMatchObject({
    priority: 'high',
    dueMode: 'date',
    dueDate: '2026-12-26',
    revision: 1,
  });
});
test('Undo never overwrites a newer concurrent update', async ({ page }) => {
  const task = await create(page);
  await page.goto('/tasks');
  await page.getByRole('checkbox', { name: 'Hoàn thành: ' + task.title }).click();
  await expect(page.getByRole('button', { name: 'Hoàn tác', exact: true })).toBeVisible();
  const remote = await page.request.patch('/api/tasks/' + task.id, {
    headers: { Origin: origin },
    data: { priority: 'high', expectedRevision: 1 },
  });
  expect(remote.status()).toBe(200);
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(
    page.getByText('Công việc đã thay đổi. Hãy tải lại trước khi chỉnh sửa.', { exact: true }),
  ).toBeVisible();
  const result = await page.request.get('/api/tasks/' + task.id);
  expect((await result.json()).data).toMatchObject({
    status: 'completed',
    priority: 'high',
    revision: 2,
  });
});

test('Quick Add keeps input on failure and prevents same-frame double submission', async ({
  page,
}) => {
  let first = true;
  await page.route('**/api/tasks', async (route) => {
    if (route.request().method() === 'POST' && first) {
      first = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Thử lại sau' } }),
      });
    } else await route.continue();
  });
  await page.goto('/tasks');
  const input = page.getByRole('textbox', { name: 'Tên công việc tạo nhanh' });
  await input.fill('Không tạo trùng');
  await input.press('Enter');
  await expect(page.getByText('Thử lại sau', { exact: true })).toBeVisible();
  await expect(input).toHaveValue('Không tạo trùng');
  await page.getByRole('form', { name: 'Tạo nhanh công việc' }).evaluate((element) => {
    const form = element as HTMLFormElement;
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page.getByRole('link', { name: 'Không tạo trùng', exact: true })).toBeVisible();
  const result = await page.request.get(
    '/api/tasks?search=' + encodeURIComponent('Không tạo trùng'),
  );
  expect((await result.json()).pagination.total).toBe(1);
});

test('capability errors never fall back to destructive legacy semantics', async ({ page }) => {
  const task = await create(page);
  let fail = true;
  await page.route('**/api/features', async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'UNAVAILABLE', message: 'Chưa lấy được cấu hình máy chủ.' },
        }),
      });
    else await route.continue();
  });
  await page.goto('/tasks/' + task.id);
  await expect(
    page.getByRole('heading', { name: 'Chưa thể xác định tính năng đang hỗ trợ' }),
  ).toBeVisible();
  await expect(page.getByText(/xóa vĩnh viễn/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Xóa', exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.getByRole('heading', { name: task.title })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Chuyển vào thùng rác', exact: true }),
  ).toBeVisible();
});
test('Quick Add supports priority and deadlines, view action and input refocus', async ({
  page,
}, info) => {
  await page.goto('/tasks');
  const input = page.getByRole('textbox', { name: 'Tên công việc tạo nhanh' });
  await input.fill('Việc có deadline nhanh');
  await expect(page.getByLabel('Ưu tiên tạo nhanh', { exact: true })).toBeVisible();
  await page.getByLabel('Ưu tiên tạo nhanh', { exact: true }).selectOption('high');
  await page.getByRole('button', { name: 'Thời hạn tạo nhanh', exact: true }).click();
  const deadline = page.getByRole('dialog', { name: 'Thời hạn tạo nhanh' });
  await deadline.getByRole('button', { name: 'Chỉ ngày', exact: true }).click();
  await deadline.getByLabel('Ngày hết hạn', { exact: true }).fill('2026-12-27');
  await deadline.getByLabel('Múi giờ', { exact: true }).fill('Asia/Ho_Chi_Minh');
  await deadline.getByRole('button', { name: 'Áp dụng thời hạn', exact: true }).click();
  expect((await (await page.request.get('/api/tasks')).json()).pagination.total).toBe(0);
  await input.press('Enter');
  await expect(
    page.getByRole('link', { name: 'Việc có deadline nhanh', exact: true }),
  ).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  const task = (await (await page.request.get('/api/tasks')).json()).data[0];
  expect(task).toMatchObject({
    priority: 'high',
    dueMode: 'date',
    dueDate: '2026-12-27',
    dueAt: '2026-12-27T16:59:59.999Z',
  });
  await page.screenshot({ path: info.outputPath('quick-add-deadline.png'), fullPage: true });
  await page.getByRole('button', { name: 'Xem công việc', exact: true }).click();
  await expect(page).toHaveURL('/tasks/' + task.id);
});
test('desktop quick edit leaves other rows interactive; mobile uses a sheet', async ({
  page,
}, info) => {
  const first = await create(page, { title: 'Dòng vẫn tương tác' });
  await create(page, { title: 'Popover đang mở' });
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'Sửa nhanh: Popover đang mở', exact: true }).click();
  const popover = page.getByRole('dialog', { name: 'Sửa nhanh công việc' });
  await expect(popover).toBeVisible();
  if (info.project.name === 'desktop') {
    await expect(page.locator('.popover-backdrop')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Hoàn thành: Dòng vẫn tương tác' }).click();
    await expect(popover).toHaveCount(0);
    await expect(
      page.getByRole('checkbox', { name: 'Hoàn thành: Dòng vẫn tương tác' }),
    ).toBeChecked();
    expect((await (await page.request.get('/api/tasks/' + first.id)).json()).data.status).toBe(
      'completed',
    );
  } else {
    await expect(page.locator('.popover-backdrop')).toBeVisible();
    const box = await popover.boundingBox();
    expect(Math.abs(box!.y + box!.height - page.viewportSize()!.height)).toBeLessThan(3);
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
  }
});
test('dashboard keeps all five categories and separate today/overdue lists on mobile too', async ({
  page,
}, info) => {
  const today = await page.evaluate(() => ({
    date: new Intl.DateTimeFormat('sv-SE').format(new Date()),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }));
  await create(page, { title: 'Đến hạn trong ngày', due: { mode: 'date', ...today } });
  await create(page, {
    title: 'Công việc trễ hạn',
    dueAt: new Date(Date.now() - 60_000).toISOString(),
  });
  await page.goto('/dashboard');
  await expect(page.locator('a.stat-card')).toHaveCount(5);
  for (const card of await page.locator('a.stat-card').all()) await expect(card).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Đến hạn hôm nay', exact: true })
      .getByRole('link', { name: 'Đến hạn trong ngày', exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Công việc quá hạn', exact: true })
      .getByRole('link', { name: 'Công việc trễ hạn', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('dashboard-deadline-groups.png'), fullPage: true });
  await page.locator('a.stat-card').nth(1).click();
  await expect(page).toHaveURL(/status=pending/);
});
test('advanced form focuses the first invalid field', async ({ page }) => {
  await page.goto('/tasks/new');
  await page.getByRole('button', { name: 'Tạo công việc', exact: true }).click();
  await expect(page.getByLabel('Tên công việc *')).toBeFocused();
  await page.getByLabel('Tên công việc *').fill('Form cần ngày hợp lệ');
  await page.getByRole('button', { name: 'Chỉ ngày', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo công việc', exact: true }).click();
  await expect(page.getByLabel('Ngày hết hạn', { exact: true })).toBeFocused();
});
test('visible timer and BFCache refresh time-derived data; hidden tabs do not poll', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-25T16:59:50Z') });
  let stage = 0;
  let requests = 0;
  await page.route('**/api/dashboard/summary?*', async (route) => {
    requests++;
    await route.fulfill({
      json: {
        data: {
          total: 3,
          pending: 3,
          inProgress: 0,
          completed: 0,
          remaining: 3,
          overdue: stage,
          dueToday: 0,
          upcomingCount: 0,
          withoutDeadline: 0,
          completionRate: 0,
          attention: [],
          upcoming: [],
          today: [],
          overdueTasks: [],
        },
      },
    });
  });
  await page.goto('/dashboard');
  const overdue = page.locator('a.stat-card').last().locator('strong');
  await expect(overdue).toHaveText('0');
  stage = 1;
  await page.clock.runFor(31_000);
  await expect(overdue).toHaveText('1');
  await expect(page.locator('.today')).toContainText('26 tháng 10');
  await page.evaluate(() =>
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }),
  );
  const before = requests;
  stage = 2;
  await page.clock.runFor(31_000);
  expect(requests).toBe(before);
  await expect(overdue).toHaveText('1');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(overdue).toHaveText('2');
  await page
    .locator('.sidebar-nav a[href="/tasks"], .bottom-nav a[href="/tasks"]')
    .filter({ visible: true })
    .click();
  const live = await create(page, { title: 'Xuất hiện sau đồng hồ' });
  await page.clock.runFor(31_000);
  await expect(page.getByRole('link', { name: live.title, exact: true })).toBeVisible();
});

test('failed capability refresh preserves an open dirty form and blocks workflow controls until retry', async ({
  page,
}) => {
  const task = await create(page);
  let fail = false;
  await page.route('**/api/features', async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', message: 'Tạm lỗi cấu hình' } },
      });
    else await route.continue();
  });
  await page.goto('/tasks/' + task.id + '/edit');
  await page.getByLabel('Tên công việc *').fill('Nội dung chưa lưu vẫn còn');
  await page.clock.install();
  await page.clock.runFor(61_000);
  fail = true;
  const failedResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/features') && response.status() === 503,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await failedResponse;
  await page.clock.runFor(2000);
  await expect(
    page.getByText('Chưa thể cập nhật cấu hình tính năng. Các thao tác xóa đang tạm khóa.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Tên công việc *')).toHaveValue('Nội dung chưa lưu vẫn còn');
  await expect(page.getByRole('button', { name: 'Đang làm', exact: true })).toBeDisabled();
  fail = false;
  await page.getByRole('button', { name: 'Thử lại cấu hình', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đang làm', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Tên công việc *')).toHaveValue('Nội dung chưa lưu vẫn còn');
});
