import { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class AdminDashboardController {
  async overview({}: HttpContext) {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setUTCHours(0, 0, 0, 0)
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    const monthAgo = new Date(now.getTime() - 30 * 86400000)

    const [totals, signups, activeUsers, dailySignups] = await Promise.all([
      db
        .rawQuery(
          `SELECT
            (SELECT count(*)::int FROM users) AS total_users,
            (SELECT count(*)::int FROM organizations) AS total_orgs,
            (SELECT count(*)::int FROM workspaces) AS total_workspaces`
        )
        .then((r) => r.rows[0]),

      db
        .rawQuery(
          `SELECT
            count(*) FILTER (WHERE created_at >= ?)::int AS today,
            count(*) FILTER (WHERE created_at >= ?)::int AS this_week,
            count(*) FILTER (WHERE created_at >= ?)::int AS this_month
          FROM users`,
          [todayStart.toISOString(), weekAgo.toISOString(), monthAgo.toISOString()]
        )
        .then((r) => r.rows[0]),

      db
        .rawQuery(
          `SELECT
            count(DISTINCT user_id) FILTER (WHERE created_at >= ?)::int AS today,
            count(DISTINCT user_id) FILTER (WHERE created_at >= ?)::int AS this_week,
            count(DISTINCT user_id) FILTER (WHERE created_at >= ?)::int AS this_month
          FROM tasks`,
          [todayStart.toISOString(), weekAgo.toISOString(), monthAgo.toISOString()]
        )
        .then((r) => r.rows[0]),

      db
        .rawQuery(
          `SELECT date(created_at AT TIME ZONE 'UTC') AS day, count(*)::int AS count
          FROM users
          WHERE created_at >= ?
          GROUP BY day
          ORDER BY day`,
          [monthAgo.toISOString()]
        )
        .then((r) => r.rows),
    ])

    return {
      totals: {
        users: totals.total_users,
        organizations: totals.total_orgs,
        workspaces: totals.total_workspaces,
      },
      signups: {
        today: signups.today,
        thisWeek: signups.this_week,
        thisMonth: signups.this_month,
      },
      activeUsers: {
        today: activeUsers.today,
        thisWeek: activeUsers.this_week,
        thisMonth: activeUsers.this_month,
      },
      dailySignups: dailySignups.map((r: { day: string; count: number }) => ({
        day: r.day,
        count: r.count,
      })),
    }
  }

  async usage({}: HttpContext) {
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setUTCHours(0, 0, 0, 0)
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    const monthAgo = new Date(now.getTime() - 30 * 86400000)

    const [taskCounts, statusBreakdown, recentErrors, topUsers, dailyTasks] = await Promise.all([
      db
        .rawQuery(
          `SELECT
            count(*) FILTER (WHERE created_at >= ?)::int AS today,
            count(*) FILTER (WHERE created_at >= ?)::int AS this_week,
            count(*) FILTER (WHERE created_at >= ?)::int AS this_month,
            count(*)::int AS total
          FROM tasks`,
          [todayStart.toISOString(), weekAgo.toISOString(), monthAgo.toISOString()]
        )
        .then((r) => r.rows[0]),

      db
        .rawQuery(
          `SELECT status, count(*)::int AS count
          FROM tasks
          WHERE created_at >= ?
          GROUP BY status
          ORDER BY count DESC`,
          [monthAgo.toISOString()]
        )
        .then((r) => r.rows),

      db
        .rawQuery(
          `SELECT t.id, t.title, t.description, t.created_at,
                  u.email AS user_email, u.name AS user_name
          FROM tasks t
          JOIN users u ON u.id = t.user_id
          WHERE t.status = 'error'
          ORDER BY t.created_at DESC
          LIMIT 20`
        )
        .then((r) => r.rows),

      db
        .rawQuery(
          `SELECT u.id, u.email, u.name, count(t.id)::int AS task_count
          FROM users u
          JOIN tasks t ON t.user_id = u.id
          WHERE t.created_at >= ?
          GROUP BY u.id, u.email, u.name
          ORDER BY task_count DESC
          LIMIT 10`,
          [monthAgo.toISOString()]
        )
        .then((r) => r.rows),

      db
        .rawQuery(
          `SELECT date(created_at AT TIME ZONE 'UTC') AS day, count(*)::int AS count
          FROM tasks
          WHERE created_at >= ?
          GROUP BY day
          ORDER BY day`,
          [monthAgo.toISOString()]
        )
        .then((r) => r.rows),
    ])

    const totalMonth = statusBreakdown.reduce((sum: number, r: { count: number }) => sum + r.count, 0) || 1
    const errorCount = statusBreakdown.find((r: { status: string }) => r.status === 'error')?.count || 0

    return {
      tasks: {
        today: taskCounts.today,
        thisWeek: taskCounts.this_week,
        thisMonth: taskCounts.this_month,
        total: taskCounts.total,
      },
      statusBreakdown: statusBreakdown.map((r: { status: string; count: number }) => ({
        status: r.status,
        count: r.count,
      })),
      errorRate: Math.round((errorCount / totalMonth) * 1000) / 10,
      recentErrors: recentErrors.map(
        (r: {
          id: string
          title: string
          description: string
          created_at: string
          user_email: string
          user_name: string
        }) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          createdAt: r.created_at,
          userEmail: r.user_email,
          userName: r.user_name,
        })
      ),
      topUsers: topUsers.map((r: { id: string; email: string; name: string; task_count: number }) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        taskCount: r.task_count,
      })),
      dailyTasks: dailyTasks.map((r: { day: string; count: number }) => ({
        day: r.day,
        count: r.count,
      })),
    }
  }

  async cost({}: HttpContext) {
    const [orgUsage, totalSpend] = await Promise.all([
      db
        .rawQuery(
          `SELECT
            o.id, o.name,
            o.weekly_limit_cents, o.monthly_limit_cents,
            (SELECT total_cost_cents FROM organization_usage_periods
             WHERE organization_id = o.id AND period_type = 'weekly_7d'
             ORDER BY period_start_utc DESC LIMIT 1) AS weekly_spend,
            (SELECT total_cost_cents FROM organization_usage_periods
             WHERE organization_id = o.id AND period_type = 'monthly_billing_cycle'
             ORDER BY period_start_utc DESC LIMIT 1) AS monthly_spend,
            (SELECT synced_at FROM organization_usage_periods
             WHERE organization_id = o.id
             ORDER BY synced_at DESC LIMIT 1) AS last_synced
          FROM organizations o
          ORDER BY o.name`
        )
        .then((r) => r.rows),

      db
        .rawQuery(
          `SELECT
            coalesce(sum(total_cost_cents) FILTER (WHERE period_type = 'weekly_7d'), 0)::int AS total_weekly,
            coalesce(sum(total_cost_cents) FILTER (WHERE period_type = 'monthly_billing_cycle'), 0)::int AS total_monthly
          FROM organization_usage_periods
          WHERE period_start_utc = (
            SELECT max(period_start_utc) FROM organization_usage_periods oup2
            WHERE oup2.period_type = organization_usage_periods.period_type
              AND oup2.organization_id = organization_usage_periods.organization_id
          )`
        )
        .then((r) => r.rows[0]),
    ])

    return {
      totalSpend: {
        weeklyCents: totalSpend?.total_weekly ?? 0,
        monthlyCents: totalSpend?.total_monthly ?? 0,
      },
      organizations: orgUsage.map(
        (r: {
          id: string
          name: string
          weekly_limit_cents: number
          monthly_limit_cents: number
          weekly_spend: number | null
          monthly_spend: number | null
          last_synced: string | null
        }) => ({
          id: r.id,
          name: r.name,
          weeklyLimitCents: r.weekly_limit_cents,
          monthlyLimitCents: r.monthly_limit_cents,
          weeklySpendCents: r.weekly_spend ?? 0,
          monthlySpendCents: r.monthly_spend ?? 0,
          weeklyPercent: r.weekly_limit_cents
            ? Math.round(((r.weekly_spend ?? 0) / r.weekly_limit_cents) * 1000) / 10
            : 0,
          monthlyPercent: r.monthly_limit_cents
            ? Math.round(((r.monthly_spend ?? 0) / r.monthly_limit_cents) * 1000) / 10
            : 0,
          lastSynced: r.last_synced,
        })
      ),
    }
  }
}
