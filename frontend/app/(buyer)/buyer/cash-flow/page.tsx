'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { Plus, Trash2, TrendingUp, AlertCircle, Calendar } from 'lucide-react'
import { toast } from 'react-hot-toast'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { TopBar } from '@/components/shared/Sidebar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/Pagination'
import { optimizerApi } from '@/lib/api-hooks'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { OptimizerResult } from '@/types'

interface OptimizerFormData {
  currentCash:  number
  dailyInflows: { date: string; amount: number }[]
}

export default function CashFlowPage() {
  const [result, setResult]   = useState<OptimizerResult | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, control, handleSubmit, formState: { errors } } =
    useForm<OptimizerFormData>({
      defaultValues: { currentCash: 0, dailyInflows: [] },
    })

  const { fields, append, remove } = useFieldArray({ control, name: 'dailyInflows' })

  const onSubmit = async (data: OptimizerFormData) => {
    setLoading(true)
    try {
      const res = await optimizerApi.run(
        data.currentCash * 100,   // rupees → paise
        data.dailyInflows.map((d) => ({ date: d.date, amount: d.amount * 100 }))
      )
      setResult(res.data.data)
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Optimizer failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Prepare chart data (sample every 3rd day to keep chart readable)
  const chartData = result?.projectedCashBalance
    .filter((_, i) => i % 3 === 0 || i === 0)
    .map((d) => ({
      date:    formatDate(d.date).slice(0, 6),   // "14 Apr"
      balance: Math.round(d.balance / 100),        // paise → rupees
    })) ?? []

  return (
    <div>
      <TopBar
        title="Cash Flow Optimizer"
        subtitle="Get an AI-powered payment schedule that minimises penalties while keeping your cash healthy."
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Input panel */}
        <div className="xl:col-span-1">
          <Card>
            <CardHeader><CardTitle>Your cash position</CardTitle></CardHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <Input
                label="Current cash balance (₹)"
                type="number"
                placeholder="500000"
                hint="Your available cash today, in rupees"
                error={errors.currentCash?.message}
                required
                {...register('currentCash', { valueAsNumber: true })}
              />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700">Expected inflows</p>
                  <Button
                    type="button" variant="ghost" size="sm"
                    iconLeft={<Plus className="w-3.5 h-3.5" />}
                    onClick={() => append({ date: '', amount: 0 })}
                  >
                    Add
                  </Button>
                </div>

                {fields.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">
                    No inflows added. The optimizer will work with your current balance only.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {fields.map((field, i) => (
                      <div key={field.id} className="flex gap-2 items-start">
                        <Input
                          type="date"
                          className="flex-1"
                          {...register(`dailyInflows.${i}.date`)}
                        />
                        <Input
                          type="number"
                          placeholder="₹ amount"
                          className="flex-1"
                          {...register(`dailyInflows.${i}.amount`, { valueAsNumber: true })}
                        />
                        <button
                          type="button"
                          onClick={() => remove(i)}
                          className="mt-0 h-9 w-9 flex items-center justify-center text-gray-400 hover:text-red-500 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button type="submit" loading={loading} className="w-full"
                iconLeft={<TrendingUp className="w-4 h-4" />}>
                Optimise my payments
              </Button>
            </form>
          </Card>
        </div>

        {/* Results */}
        <div className="xl:col-span-2 space-y-5">
          {!result ? (
            <div className="h-72 flex items-center justify-center">
              <EmptyState
                icon={<TrendingUp className="w-5 h-5" />}
                title="Run the optimizer"
                description="Enter your cash balance and expected inflows, then click optimise."
              />
            </div>
          ) : (
            <>
              {/* Alerts */}
              {result.alerts.length > 0 && (
                <div className="space-y-2">
                  {result.alerts.map((alert, i) => (
                    <div key={i} className={cn(
                      'flex items-start gap-2.5 p-3 rounded-lg text-sm',
                      alert.urgency === 'high'   ? 'bg-red-50 text-red-700 border border-red-100' :
                      alert.urgency === 'medium' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                      'bg-gray-50 text-gray-600 border border-gray-100'
                    )}>
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      {alert.message}
                    </div>
                  ))}
                </div>
              )}

              {/* Cash balance chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Projected Cash Balance</CardTitle>
                  <span className="text-xs text-gray-400">Next 90 days</span>
                </CardHeader>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#9CA3AF' }}
                        tickLine={false} axisLine={false}
                        tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`}
                        width={55}
                      />
                      <Tooltip
                        formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Balance']}
                        labelStyle={{ fontSize: 11 }}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <ReferenceLine y={0} stroke="#EF4444" strokeDasharray="4 2" strokeWidth={1} />
                      <Line
                        type="monotone" dataKey="balance"
                        stroke="#4F46E5" strokeWidth={2}
                        dot={false} activeDot={{ r: 4, fill: '#4F46E5' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Payment schedule */}
              {result.paymentSchedule.length > 0 ? (
                <Card padding="none">
                  <CardHeader className="px-5 pt-5">
                    <CardTitle>Recommended Payment Schedule</CardTitle>
                    <span className="text-xs text-gray-400">
                      {result.paymentSchedule.length} payment{result.paymentSchedule.length !== 1 ? 's' : ''}
                    </span>
                  </CardHeader>
                  <Table>
                    <TableHead>
                      <tr>
                        <Th>Date</Th>
                        <Th>Supplier</Th>
                        <Th>Amount</Th>
                        <Th>Reason</Th>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {result.paymentSchedule.map((s, i) => (
                        <TableRow key={i}>
                          <Td className="font-medium">
                            <div className="flex items-center gap-1.5 text-gray-700">
                              <Calendar className="w-3.5 h-3.5 text-gray-400" />
                              {formatDate(s.date)}
                            </div>
                          </Td>
                          <Td className="font-medium text-gray-900">{s.supplierName}</Td>
                          <Td className="font-mono font-semibold text-indigo-700">
                            {formatCurrency(s.amountToPay)}
                          </Td>
                          <Td className="text-gray-500 max-w-[280px] whitespace-normal text-xs">
                            {s.reason}
                          </Td>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              ) : (
                <EmptyState
                  icon={<TrendingUp className="w-5 h-5" />}
                  title="No payments to schedule"
                  description="You have no outstanding purchase orders, or all are already paid."
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}