import { expect, test } from '@playwright/test'

test('runs the deterministic emergency storyline and exposes analysis', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '城智演' })).toBeVisible()
  await expect(page.getByTestId('city-map')).toBeVisible()
  await expect(page.getByText('滨江智慧物流园火情')).toBeVisible()

  await page.getByTestId('step-button').click()
  await expect(page.getByText(/已派往现场/).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: '协同任务队列' })).toBeVisible()

  await page.getByTestId('operations-tab-tasks').click()
  await page.getByRole('tab', { name: /算法/ }).click()
  await page.getByTestId('compare-button').click()
  await expect(page.getByTestId('compare-table')).toBeVisible()
  await expect(page.getByTestId('compare-table')).toContainText('A*')
  await expect(page.getByTestId('compare-table')).toContainText('Dijkstra')
})

test('starts the scripted demo and automatically replans after a road interruption', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('demo-button').click()
  await expect(page.getByText(/标准剧情运行中/)).toBeVisible()
  await expect(page.getByText(/动态重规划/).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('toast')).toBeVisible()
})

test('saves the current scenario to the local library', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '场景', exact: true }).click()
  await expect(page.getByTestId('scenario-modal')).toBeVisible()
  await page.getByTestId('save-scenario-button').click()
  await expect(page.getByTestId('toast')).toContainText('场景已保存到本机浏览器')
  await expect(page.getByText('本机场景库')).toBeVisible()
})
