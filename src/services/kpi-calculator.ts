/**
 * KPI Calculator Service
 *
 * Calculates Key Performance Indicators for the Executive Dashboard:
 * 1. New clients acquired (weekly)
 * 2. Visits completion rate
 * 3. Loans released (monthly)
 * 4. Underserved municipalities
 * 5. Top/bottom performing agents
 */

import { pool } from '../db/index.js';

/**
 * KPI value with trend information
 */
export interface KPIValue {
  value: number;
  trend: 'up' | 'down' | 'neutral';
  trendPercentage: number;
  status: 'good' | 'warning' | 'critical';
}

/**
 * Agent performance data
 */
export interface AgentPerformance {
  userId: string;
  firstName: string;
  lastName: string;
  role: string;
  completedTouchpoints: number;
  uniqueClients: number;
  rank: number;
}

/**
 * KPI thresholds for traffic light indicators
 */
export interface KPIThresholds {
  newClientsWeekly: { warning: number; critical: number };
  completionRate: { warning: number; critical: number };
  loansReleased: { warning: number; critical: number };
  underservedMunicipalities: { warning: number; critical: number };
}

/**
 * Default KPI thresholds
 */
const DEFAULT_THRESHOLDS: KPIThresholds = {
  newClientsWeekly: { warning: 10, critical: 5 },
  completionRate: { warning: 70, critical: 50 },
  loansReleased: { warning: 60, critical: 40 },
  underservedMunicipalities: { warning: 20, critical: 50 },
};

/**
 * KPI Calculator Service
 */
export class KpiCalculatorService {
  /**
   * Calculate all KPIs for the Executive Dashboard
   */
  async calculateAllKPIs(
    startDate?: string,
    endDate?: string
  ): Promise<{
    newClientsAcquired: KPIValue;
    visitsCompletionRate: KPIValue;
    loansReleased: KPIValue;
    underservedMunicipalities: KPIValue;
    topPerformingAgents: AgentPerformance[];
    bottomPerformingAgents: AgentPerformance[];
  }> {
    const [newClients, completionRate, loansReleased, underservedMunicipalities, agents] =
      await Promise.all([
        this.calculateNewClientsAcquired(startDate, endDate),
        this.calculateVisitsCompletionRate(startDate, endDate),
        this.calculateLoansReleased(startDate, endDate),
        this.calculateUnderservedMunicipalities(),
        this.calculateAgentPerformance(startDate, endDate),
      ]);

    // Sort agents by completed touchpoints
    agents.sort((a, b) => b.completedTouchpoints - a.completedTouchpoints);

    const topAgents = agents.slice(0, 10).map((agent, index) => ({
      ...agent,
      rank: index + 1,
    }));

    const bottomAgents = agents.slice(-10).reverse().map((agent, index) => ({
      ...agent,
      rank: agents.length - index,
    }));

    return {
      newClientsAcquired: newClients,
      visitsCompletionRate: completionRate,
      loansReleased: loansReleased,
      underservedMunicipalities,
      topPerformingAgents: topAgents,
      bottomPerformingAgents: bottomAgents,
    };
  }

  /**
   * Calculate new clients acquired (weekly)
   */
  async calculateNewClientsAcquired(
    startDate?: string,
    endDate?: string
  ): Promise<KPIValue> {
    const params: any[] = [];
    let paramIndex = 1;

    // Default to last 4 weeks if no date range provided
    const endDateValue = endDate || new Date().toISOString().split('T')[0];
    const startDateValue =
      startDate ||
      new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    params.push(startDateValue, endDateValue);
    paramIndex += 2;

    // Current period
    const currentResult = await pool.query(
      `
      SELECT
        COUNT(*) as count
      FROM clients
      WHERE DATE(created_at) >= $1
        AND DATE(created_at) <= $2
      `,
      params
    );

    // Previous period (same duration, shifted back)
    const previousStart = new Date(
      new Date(startDateValue).getTime() - 28 * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .split('T')[0];
    const previousEnd = startDateValue;

    const previousResult = await pool.query(
      `
      SELECT
        COUNT(*) as count
      FROM clients
      WHERE DATE(created_at) >= $1
        AND DATE(created_at) <= $2
      `,
      [previousStart, previousEnd]
    );

    const currentValue = currentResult.rows[0].count;
    const previousValue = previousResult.rows[0].count;

    // Calculate trend
    const trendPercentage =
      previousValue > 0
        ? ((currentValue - previousValue) / previousValue) * 100
        : 0;

    const trend: 'up' | 'down' | 'neutral' =
      trendPercentage > 5 ? 'up' : trendPercentage < -5 ? 'down' : 'neutral';

    // Determine status based on thresholds
    let status: 'good' | 'warning' | 'critical' = 'good';
    if (currentValue < DEFAULT_THRESHOLDS.newClientsWeekly.critical) {
      status = 'critical';
    } else if (currentValue < DEFAULT_THRESHOLDS.newClientsWeekly.warning) {
      status = 'warning';
    }

    return {
      value: currentValue,
      trend,
      trendPercentage: Math.round(trendPercentage),
      status,
    };
  }

  /**
   * Calculate visits completion rate
   */
  async calculateVisitsCompletionRate(
    startDate?: string,
    endDate?: string
  ): Promise<KPIValue> {
    const params: any[] = [];
    let paramIndex = 1;

    // Default to last 7 days if no date range provided
    const endDateValue = endDate || new Date().toISOString().split('T')[0];
    const startDateValue =
      startDate ||
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    params.push(startDateValue, endDateValue);
    paramIndex += 2;

    const result = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'Completed') as completed,
        COUNT(*) as total,
        ROUND(COUNT(*) FILTER (WHERE status = 'Completed')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as rate
      FROM touchpoints
      WHERE DATE(date) >= $1
        AND DATE(date) <= $2
      `,
      params
    );

    const row = result.rows[0];
    const currentValue = row.rate || 0;

    // Previous period for trend
    const previousStart = new Date(
      new Date(startDateValue).getTime() - 7 * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .split('T')[0];
    const previousEnd = startDateValue;

    const previousResult = await pool.query(
      `
      SELECT
        ROUND(COUNT(*) FILTER (WHERE status = 'Completed')::numeric / NULLIF(COUNT(*), 0) * 100, 2) as rate
      FROM touchpoints
      WHERE DATE(date) >= $1
        AND DATE(date) <= $2
      `,
      [previousStart, previousEnd]
    );

    const previousValue = previousResult.rows[0].rate || 0;

    // Calculate trend
    const trendPercentage =
      previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;

    const trend: 'up' | 'down' | 'neutral' =
      trendPercentage > 5 ? 'up' : trendPercentage < -5 ? 'down' : 'neutral';

    // Determine status based on thresholds
    let status: 'good' | 'warning' | 'critical' = 'good';
    if (currentValue < DEFAULT_THRESHOLDS.completionRate.critical) {
      status = 'critical';
    } else if (currentValue < DEFAULT_THRESHOLDS.completionRate.warning) {
      status = 'warning';
    }

    return {
      value: currentValue,
      trend,
      trendPercentage: Math.round(trendPercentage),
      status,
    };
  }

  /**
   * Calculate loans released (monthly)
   */
  async calculateLoansReleased(
    startDate?: string,
    endDate?: string
  ): Promise<KPIValue> {
    const params: any[] = [];
    let paramIndex = 1;

    // Default to current month if no date range provided
    const now = new Date();
    const endDateValue =
      endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const startDateValue =
      startDate ||
      new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    params.push(startDateValue, endDateValue);
    paramIndex += 2;

    const result = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE loan_released = true) as released,
        COUNT(*) as total,
        ROUND(COUNT(*) FILTER (WHERE loan_released = true)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as rate
      FROM clients
      WHERE DATE(created_at) >= $1
        AND DATE(created_at) <= $2
      `,
      params
    );

    const row = result.rows[0];
    const currentValue = row.rate || 0;

    // Previous month for trend
    const previousStart = new Date(
      new Date(startDateValue).getTime() - 30 * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .split('T')[0];
    const previousEnd = startDateValue;

    const previousResult = await pool.query(
      `
      SELECT
        ROUND(COUNT(*) FILTER (WHERE loan_released = true)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as rate
      FROM clients
      WHERE DATE(created_at) >= $1
        AND DATE(created_at) <= $2
      `,
      [previousStart, previousEnd]
    );

    const previousValue = previousResult.rows[0].rate || 0;

    // Calculate trend
    const trendPercentage =
      previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;

    const trend: 'up' | 'down' | 'neutral' =
      trendPercentage > 5 ? 'up' : trendPercentage < -5 ? 'down' : 'neutral';

    // Determine status based on thresholds
    let status: 'good' | 'warning' | 'critical' = 'good';
    if (currentValue < DEFAULT_THRESHOLDS.loansReleased.critical) {
      status = 'critical';
    } else if (currentValue < DEFAULT_THRESHOLDS.loansReleased.warning) {
      status = 'warning';
    }

    return {
      value: currentValue,
      trend,
      trendPercentage: Math.round(trendPercentage),
      status,
    };
  }

  /**
   * Calculate underserved municipalities
   */
  async calculateUnderservedMunicipalities(): Promise<KPIValue> {
    const result = await pool.query(
      `
      SELECT
        COUNT(*) as count
      FROM (
        SELECT DISTINCT
          c.municipality,
          c.province
        FROM clients c
        LEFT JOIN user_locations ul ON c.municipality = ul.municipality AND c.province = ul.province
        WHERE ul.user_id IS NULL
      ) as underserved
      `
    );

    const currentValue = result.rows[0].count;

    // Get total municipalities for context
    const totalResult = await pool.query(
      `
      SELECT COUNT(DISTINCT municipality) as count
      FROM clients
      `
    );

    const totalMunicipalities = totalResult.rows[0].count;

    // Calculate percentage of underserved municipalities
    const percentage =
      totalMunicipalities > 0
        ? (currentValue / totalMunicipalities) * 100
        : 0;

    // Determine status based on thresholds
    let status: 'good' | 'warning' | 'critical' = 'good';
    if (percentage > DEFAULT_THRESHOLDS.underservedMunicipalities.critical) {
      status = 'critical';
    } else if (percentage > DEFAULT_THRESHOLDS.underservedMunicipalities.warning) {
      status = 'warning';
    }

    return {
      value: currentValue,
      trend: 'neutral', // No trend calculation for this metric
      trendPercentage: 0,
      status,
    };
  }

  /**
   * Calculate agent performance
   */
  async calculateAgentPerformance(
    startDate?: string,
    endDate?: string
  ): Promise<AgentPerformance[]> {
    const params: any[] = [];
    let paramIndex = 1;

    // Default to last 30 days if no date range provided
    const endDateValue = endDate || new Date().toISOString().split('T')[0];
    const startDateValue =
      startDate ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    params.push(startDateValue, endDateValue);
    paramIndex += 2;

    const result = await pool.query(
      `
      SELECT
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.role,
        COUNT(t.id) FILTER (WHERE t.status = 'Completed') as completed_touchpoints,
        COUNT(DISTINCT t.client_id) as unique_clients
      FROM users u
      LEFT JOIN touchpoints t ON u.id = t.user_id
      WHERE DATE(t.date) >= $1
        AND DATE(t.date) <= $2
        AND u.role IN ('caravan', 'tele', 'assistant_area_manager', 'area_manager')
      GROUP BY u.id, u.first_name, u.last_name, u.role
      HAVING COUNT(t.id) > 0
      ORDER BY completed_touchpoints DESC
      `,
      params
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      completedTouchpoints: row.completed_touchpoints,
      uniqueClients: row.unique_clients,
      rank: 0, // Will be calculated by caller
    }));
  }

  /**
   * Get KPI thresholds (can be customized via database in the future)
   */
  async getKPIThresholds(): Promise<KPIThresholds> {
    // In the future, this could be loaded from a database table
    // For now, return default thresholds
    return DEFAULT_THRESHOLDS;
  }
}

/**
 * Export singleton instance
 */
export const kpiCalculatorService = new KpiCalculatorService();
